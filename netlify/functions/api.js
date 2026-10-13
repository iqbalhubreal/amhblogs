'use strict';
/**
 * AMH Blogs — single Netlify Function that powers the whole API.
 *   Public : /api/topics, /api/posts, /api/posts/:slug, /api/media/:id
 *   Auth   : /api/login, /api/logout, /api/me
 *   Admin  : /api/admin/*   (needs the session cookie)
 *
 * Secrets (Netlify → Site settings → Environment variables):
 *   TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, GEMINI_API_KEY, ADMIN_PASSWORD, SESSION_SECRET
 * Optional: GEMINI_MODEL (default gemini-3.6-flash), GEMINI_THINKING (default medium)
 */
const crypto = require('crypto');
const { createClient } = require('@libsql/client/web');

const LANGS = {
  en: 'English', hi: 'Hindi', es: 'Spanish', ar: 'Arabic', fr: 'French', bn: 'Bengali',
  pt: 'Portuguese', ru: 'Russian', ur: 'Urdu', id: 'Indonesian', de: 'German', ja: 'Japanese',
};
const MAX_MEDIA_BYTES = 1500000;      // hard cap (the browser already aims for < 250 KB)
const MEDIA_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const AUDIO_MIMES = ['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/aac', 'audio/x-m4a', 'audio/wav', 'audio/x-wav'];
const SESSION_MS = 7 * 24 * 3600 * 1000;

/* ───────────────────────── helpers ───────────────────────── */
function httpErr(status, message) { const e = new Error(message); e.status = status; return e; }

function respond(status, data, extra = {}) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
    body: JSON.stringify(data),
  };
}

let db = null;
function getDb() {
  if (!db) {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) throw httpErr(500, 'TURSO_DATABASE_URL is not set');
    db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  }
  return db;
}
async function all(sql, args = []) {
  const rs = await getDb().execute({ sql, args });
  return rs.rows.map((r) => { const o = {}; rs.columns.forEach((c, i) => { o[c] = r[i]; }); return o; });
}
async function one(sql, args = []) { return (await all(sql, args))[0] || null; }
async function run(sql, args = []) { return getDb().execute({ sql, args }); }

let ready = null;
function init() {
  if (!ready) {
    ready = (async () => {
      const d = getDb();
      await d.batch([
        `CREATE TABLE IF NOT EXISTS topics(
           id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL,
           sort INTEGER DEFAULT 0, names TEXT DEFAULT '{}')`,
        `CREATE TABLE IF NOT EXISTS posts(
           id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL,
           excerpt TEXT DEFAULT '', content TEXT DEFAULT '', cover TEXT DEFAULT '', topic_id INTEGER,
           lang TEXT DEFAULT 'en', status TEXT DEFAULT 'draft', words INTEGER DEFAULT 0,
           created_at INTEGER, updated_at INTEGER, published_at INTEGER)`,
        `CREATE TABLE IF NOT EXISTS translations(
           post_id INTEGER NOT NULL, lang TEXT NOT NULL, title TEXT, excerpt TEXT, content TEXT,
           updated_at INTEGER, PRIMARY KEY(post_id, lang))`,
        `CREATE TABLE IF NOT EXISTS media(
           id TEXT PRIMARY KEY, mime TEXT NOT NULL, b64 TEXT NOT NULL, size INTEGER, created_at INTEGER)`,
        'CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT)',
        'CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status, published_at)',
        'CREATE INDEX IF NOT EXISTS idx_posts_topic ON posts(topic_id)',
      ], 'write');
      const c = await one('SELECT COUNT(*) AS n FROM topics');
      if (!Number(c.n)) await run('INSERT INTO topics(name, slug, sort) VALUES(?,?,0)', ['General', 'general']);
    })();
    ready.catch(() => { ready = null; });
  }
  return ready;
}

function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}
async function uniqueSlug(table, base, ignoreId) {
  let slug = slugify(base) || 'post';
  let n = 1;
  for (;;) {
    const candidate = n === 1 ? slug : `${slug}-${n}`;
    const row = await one(`SELECT id FROM ${table} WHERE slug = ?`, [candidate]);
    if (!row || (ignoreId && Number(row.id) === Number(ignoreId))) return candidate;
    n += 1;
  }
}

function stripTags(html) {
  return String(html || '')
    .replace(/<\/(p|h[1-6]|li|div|blockquote|tr|pre|ul|ol)>|<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}
function countWords(html) {
  const t = stripTags(html);
  const latin = (t.match(/[\p{L}\p{N}]+/gu) || []).length;
  const cjk = (t.match(/[぀-ヿ一-鿿]/g) || []).length;
  return Math.max(0, latin - cjk + Math.round(cjk / 2));
}

/** Strips scripts / inline handlers / javascript: URLs. Allows https iframes (YouTube, PDFs, …). */
function sanitize(html) {
  let h = String(html || '');
  h = h.replace(/<\s*(script|style|object|embed|form|meta|link|base|template)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  h = h.replace(/<\s*\/?\s*(script|style|object|embed|form|meta|link|base|template)\b[^>]*>/gi, '');
  h = h.replace(/\s(on[a-z]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  h = h.replace(/\ssrcdoc\s*=\s*("[^"]*"|'[^']*')/gi, '');
  h = h.replace(/\b(href|src|xlink:href|action|formaction)\s*=\s*(["'])\s*(javascript|vbscript|data:text)[^"']*\2/gi, '$1="#"');
  h = h.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>|<iframe\b[^>]*\/>/gi, (m) => {
    const src = (m.match(/\ssrc\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
    return /^https:\/\//i.test(src) ? m : '';
  });
  return h;
}

async function storeMedia(mime, b64) {
  const size = Math.floor((b64.length * 3) / 4);
  const audio = AUDIO_MIMES.includes(mime);
  if (!audio && !MEDIA_MIMES.includes(mime)) throw httpErr(400, 'Only PNG, JPEG, WebP, GIF images or audio files can be stored');
  if (size > (audio ? MAX_AUDIO_BYTES : MAX_MEDIA_BYTES)) {
    throw httpErr(413, audio ? 'Audio is too large to store here (3.5 MB max). Use the Uploader and paste the link instead.' : 'Image is too large even after compression');
  }
  const id = crypto.randomBytes(9).toString('base64url');
  await run('INSERT INTO media(id, mime, b64, size, created_at) VALUES(?,?,?,?,?)', [id, mime, b64, size, Date.now()]);
  return { id, size };
}

/** sanitize + move any pasted data: images into the media table */
async function processContent(html) {
  let h = sanitize(html);
  const re = /src=(["'])data:(image\/(?:png|jpe?g|webp|gif));base64,([A-Za-z0-9+/=]+)\1/gi;
  for (const m of [...h.matchAll(re)]) {
    try {
      const { id } = await storeMedia(m[2].replace('jpg', 'jpeg'), m[3]);
      h = h.replace(m[0], `src="/api/media/${id}"`);
    } catch (_) { /* leave it inline if it can't be stored */ }
  }
  return h;
}

function mediaIdsIn(...texts) {
  const ids = new Set();
  for (const t of texts) for (const m of String(t || '').matchAll(/\/api\/media\/([A-Za-z0-9_-]{6,})/g)) ids.add(m[1]);
  return [...ids];
}
async function cleanupMedia(ids) {
  for (const id of ids) {
    const like = `%/api/media/${id}%`;
    const used = await one(
      `SELECT (SELECT COUNT(*) FROM posts WHERE content LIKE ?1 OR cover LIKE ?1) +
              (SELECT COUNT(*) FROM translations WHERE content LIKE ?1) AS n`, [like]);
    if (!Number(used.n)) await run('DELETE FROM media WHERE id = ?', [id]);
  }
}

/* ───────────────────────── auth ───────────────────────── */
function sign(payload) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw httpErr(500, 'SESSION_SECRET is not set');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${crypto.createHmac('sha256', secret).update(body).digest('base64url')}`;
}
function verify(token) {
  try {
    const [body, sig] = String(token).split('.');
    const expect = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(body).digest('base64url');
    const a = Buffer.from(sig || ''); const b = Buffer.from(expect);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > Date.now() ? p : null;
  } catch (_) { return null; }
}
function isAdmin(event) {
  const cookie = event.headers.cookie || event.headers.Cookie || '';
  const m = cookie.match(/(?:^|;\s*)ib_session=([^;]+)/);
  return !!(m && verify(m[1]));
}
function safeEqual(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

/* ───────────────────────── Gemini translation ───────────────────────── */
/** opts.model / opts.thinking come from the admin panel's "Translation Options"; env vars are the fallback. */
async function gemini(systemText, userText, schema, opts = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw httpErr(500, 'GEMINI_API_KEY is not set');
  const model = (/^[A-Za-z0-9._-]{3,80}$/.test(opts.model || '') ? opts.model : '') || process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  let level = opts.thinking || process.env.GEMINI_THINKING || 'medium';
  if (level === 'none') level = 'minimal';            // the admin menu calls this "Minimal (None)"
  if (!['minimal', 'low', 'medium', 'high'].includes(level)) level = 'medium';

  async function call(withThinking) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 24000);
    const generationConfig = { temperature: 0.3, responseMimeType: 'application/json', responseSchema: schema };
    if (withThinking) generationConfig.thinkingConfig = { thinkingLevel: level };
    let r;
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        signal: ctrl.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemText }] },
          contents: [{ role: 'user', parts: [{ text: userText }] }],
          generationConfig,
        }),
      });
    } catch (e) {
      throw httpErr(504, e.name === 'AbortError' ? 'Gemini took too long (try a shorter post or raise the function timeout)' : `Gemini request failed: ${e.message}`);
    } finally { clearTimeout(timer); }
    return { res: r, data: await r.json().catch(() => ({})) };
  }

  let { res, data } = await call(true);
  // If the chosen model rejects the thinking setting, retry once without it instead of failing.
  if (!res.ok && res.status === 400 && /think/i.test((data.error && data.error.message) || '')) ({ res, data } = await call(false));
  if (!res.ok) throw httpErr(502, `Gemini (${model}): ${(data.error && data.error.message) || res.statusText}`);
  const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
  const text = parts.filter((p) => !p.thought && p.text).map((p) => p.text).join('').trim()
    .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(text); } catch (_) { throw httpErr(502, 'Gemini returned an unreadable answer — try again'); }
}

/** split HTML into pieces (~4500 chars) at top-level block boundaries so they can be translated in parallel */
function chunkHtml(html, max = 4500) {
  const parts = String(html || '').split(/(?<=<\/(?:p|h[1-6]|ul|ol|blockquote|pre|table|div|figure)>|<hr\s*\/?>)/i);
  const out = []; let cur = '';
  for (const piece of parts) {
    if (cur && cur.length + piece.length > max) { out.push(cur); cur = ''; }
    cur += piece;
  }
  if (cur) out.push(cur);
  return out.length ? out : [''];
}

/** The instructions Gemini gets. {{language}} is replaced with the target language. Editable from the admin panel. */
const DEFAULT_PROMPT = `You are a professional translator. Translate the blog content into {{language}}.
Rules:
- Keep every HTML tag, attribute, URL, class, style, src and href EXACTLY as is. Translate only the visible text, plus alt and title attribute values.
- Do not translate or alter the contents of <code> and <pre> blocks.
- STRICT RULE: Do not transliterate any technical keywords, project names, or key film terms (like "wide shot", "close-up", "pan", "tilt"). These terms MUST remain in their original English form using English characters. Absolutely NO phonetic spelling in the target language script.
- Keep proper nouns, brand names and numbers. Use natural, fluent {{language}}, not word-for-word.`;
const MAX_PROMPT = 4000;

async function getPrompt() {
  const row = await one("SELECT value FROM settings WHERE key = 'translate_prompt'");
  return row && row.value && String(row.value).trim() ? String(row.value) : DEFAULT_PROMPT;
}

async function translatePost(post, lang, opts = {}) {
  const name = LANGS[lang];
  const base = String(opts.prompt || DEFAULT_PROMPT);
  // The JSON-output line is always added by the server so an edited prompt can never break the response format.
  const system = `${base.split('{{language}}').join(name)}${base.includes('{{language}}') ? '' : `\n\nTarget language: ${name}.`}\n- Return JSON with the keys "title", "excerpt" and "content".`;
  const schema = { type: 'OBJECT', properties: { title: { type: 'STRING' }, excerpt: { type: 'STRING' }, content: { type: 'STRING' } }, required: ['title', 'excerpt', 'content'] };
  const chunks = chunkHtml(post.content);
  if (chunks.length > 12) throw httpErr(413, 'This post is too long to translate in one go. Split it into two posts.');
  // chunk 0 also carries title + excerpt; the rest only carry content. All run at the same time.
  const results = await Promise.all(chunks.map((c, i) => gemini(system,
    JSON.stringify({ title: i === 0 ? post.title : '', excerpt: i === 0 ? (post.excerpt || '') : '', content: c }), schema, opts)));
  const first = results[0];
  return {
    title: String(first.title || post.title).slice(0, 300),
    excerpt: String(first.excerpt || '').slice(0, 600),
    content: sanitize(results.map((r) => r.content || '').join('')),
  };
}

async function translateTopics(topics, lang, opts = {}) {
  const name = LANGS[lang];
  const out = await gemini(
    `Translate these blog topic names into ${name}. Keep them short. Return JSON {"names": [...]} with the same number of items in the same order.`,
    JSON.stringify(topics.map((t) => t.name)),
    { type: 'OBJECT', properties: { names: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['names'] }, opts);
  if (!Array.isArray(out.names) || out.names.length !== topics.length) throw httpErr(502, 'Gemini returned the wrong number of topic names');
  return out.names;
}

/* ───────────────────────── request handler ───────────────────────── */
function parseBody(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  try { return JSON.parse(raw); } catch (_) { throw httpErr(400, 'Invalid JSON body'); }
}

const POST_FIELDS = 'p.id, p.slug, p.title, p.excerpt, p.cover, p.lang, p.words, p.created_at, p.published_at, p.updated_at, p.status';

exports.handler = async (event) => {
  try {
    const method = event.httpMethod;
    const path = event.path.replace(/^\/\.netlify\/functions\/api/, '').replace(/^\/api/, '') || '/';
    const seg = path.split('/').filter(Boolean).map(decodeURIComponent);
    const qs = event.queryStringParameters || {};
    const lang = LANGS[qs.lang] ? qs.lang : '';

    /* health works even if the DB is not configured yet */
    if (seg[0] === 'admin' && seg[1] === 'health' && method === 'GET') {
      if (!isAdmin(event)) throw httpErr(401, 'Not signed in');
      const env = Object.fromEntries(['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'GEMINI_API_KEY', 'ADMIN_PASSWORD', 'SESSION_SECRET'].map((k) => [k, !!process.env[k]]));
      let dbOk = false; let counts = null; let dbError = '';
      try { await init(); dbOk = true; counts = await one('SELECT (SELECT COUNT(*) FROM posts) AS posts, (SELECT COUNT(*) FROM topics) AS topics, (SELECT COUNT(*) FROM media) AS media, (SELECT COALESCE(SUM(size),0) FROM media) AS media_bytes'); } catch (e) { dbError = e.message; }
      return respond(200, { env, dbOk, dbError, counts, model: process.env.GEMINI_MODEL || 'gemini-3.6-flash', thinking: process.env.GEMINI_THINKING || 'medium' });
    }

    /* ── auth ── */
    if (seg[0] === 'login' && method === 'POST') {
      const { password } = parseBody(event);
      if (!process.env.ADMIN_PASSWORD) throw httpErr(500, 'ADMIN_PASSWORD is not set');
      if (!password || !safeEqual(password, process.env.ADMIN_PASSWORD)) {
        await new Promise((r) => setTimeout(r, 900));
        throw httpErr(401, 'Wrong password');
      }
      const token = sign({ exp: Date.now() + SESSION_MS });
      return respond(200, { ok: true }, { 'Set-Cookie': `ib_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_MS / 1000}` });
    }
    if (seg[0] === 'logout' && method === 'POST') {
      return respond(200, { ok: true }, { 'Set-Cookie': 'ib_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0' });
    }
    if (seg[0] === 'me') return respond(200, { admin: isAdmin(event) });

    await init();

    /* ── public: media ── */
    if (seg[0] === 'media' && seg[1] && method === 'GET') {
      const m = await one('SELECT mime, b64 FROM media WHERE id = ?', [seg[1]]);
      if (!m) throw httpErr(404, 'Not found');
      const headers = { 'Content-Type': m.mime, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' };
      const rangeHdr = event.headers.range || event.headers.Range || '';
      const rm = rangeHdr.match(/bytes=(\d*)-(\d*)/);
      if (rm && (rm[1] || rm[2])) {            // Safari needs byte ranges to play / seek audio
        const buf = Buffer.from(m.b64, 'base64'); const total = buf.length;
        const start = rm[1] ? parseInt(rm[1], 10) : Math.max(0, total - parseInt(rm[2], 10));
        const end = rm[1] && rm[2] ? Math.min(parseInt(rm[2], 10), total - 1) : total - 1;
        if (start > end || start >= total) return { statusCode: 416, headers: { 'Content-Range': `bytes */${total}` }, body: '' };
        return { statusCode: 206, isBase64Encoded: true, body: buf.subarray(start, end + 1).toString('base64'), headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${total}` } };
      }
      return { statusCode: 200, isBase64Encoded: true, body: m.b64, headers };
    }

    /* ── public: topics ── */
    if (seg[0] === 'topics' && method === 'GET') {
      const rows = await all(`SELECT t.id, t.name, t.slug, t.names,
        (SELECT COUNT(*) FROM posts p WHERE p.topic_id = t.id AND p.status = 'published') AS count
        FROM topics t ORDER BY t.sort, t.name`);
      return respond(200, {
        topics: rows.map((t) => {
          let names = {}; try { names = JSON.parse(t.names || '{}'); } catch (_) { /* ignore */ }
          return { id: t.id, slug: t.slug, count: Number(t.count), name: (lang && names[lang]) || t.name };
        }),
      }, { 'Cache-Control': 'public, max-age=30' });
    }

    /* ── public: post list ── */
    if (seg[0] === 'posts' && !seg[1] && method === 'GET') {
      const limit = Math.min(30, Math.max(1, parseInt(qs.limit, 10) || 12));
      const page = Math.max(1, parseInt(qs.page, 10) || 1);
      const where = ["p.status = 'published'"]; const wargs = [];
      if (qs.topic) { where.push('t.slug = ?'); wargs.push(qs.topic); }
      if (qs.q) {
        const like = `%${String(qs.q).slice(0, 80)}%`;
        where.push('(p.title LIKE ? OR p.excerpt LIKE ? OR p.content LIKE ? OR EXISTS(SELECT 1 FROM translations s WHERE s.post_id = p.id AND s.lang = ? AND (s.title LIKE ? OR s.content LIKE ?)))');
        wargs.push(like, like, like, lang || 'en', like, like);
      }
      const from = `FROM posts p LEFT JOIN topics t ON t.id = p.topic_id LEFT JOIN translations x ON x.post_id = p.id AND x.lang = ? WHERE ${where.join(' AND ')}`;
      const total = await one(`SELECT COUNT(*) AS n ${from}`, [lang || '-', ...wargs]);
      const rows = await all(`SELECT ${POST_FIELDS}, t.name AS topic_name, t.slug AS topic_slug, x.title AS t_title, x.excerpt AS t_excerpt
        ${from} ORDER BY COALESCE(p.published_at, p.created_at) DESC LIMIT ? OFFSET ?`, [lang || '-', ...wargs, limit, (page - 1) * limit]);
      return respond(200, {
        total: Number(total.n), page, limit,
        posts: rows.map((r) => ({
          id: r.id, slug: r.slug, cover: r.cover, lang: r.lang, words: r.words,
          title: r.t_title || r.title, excerpt: r.t_excerpt || r.excerpt, translated: !!r.t_title,
          date: r.published_at || r.created_at, topic_name: r.topic_name, topic_slug: r.topic_slug,
        })),
      }, { 'Cache-Control': 'public, max-age=15' });
    }

    /* ── public: one post ── */
    if (seg[0] === 'posts' && seg[1] && method === 'GET') {
      const admin = isAdmin(event);
      const p = await one(`SELECT ${POST_FIELDS}, p.content, t.name AS topic_name, t.slug AS topic_slug
        FROM posts p LEFT JOIN topics t ON t.id = p.topic_id WHERE p.slug = ?`, [seg[1]]);
      if (!p || (p.status !== 'published' && !admin)) throw httpErr(404, 'Post not found');
      const trs = await all('SELECT lang FROM translations WHERE post_id = ?', [p.id]);
      let out = { title: p.title, excerpt: p.excerpt, content: p.content, translated: false };
      if (lang && lang !== p.lang) {
        const tr = await one('SELECT title, excerpt, content FROM translations WHERE post_id = ? AND lang = ?', [p.id, lang]);
        if (tr) out = { ...tr, translated: true };
      }
      return respond(200, {
        post: {
          id: p.id, slug: p.slug, cover: p.cover, lang: p.lang, words: p.words, status: p.status,
          date: p.published_at || p.created_at, topic_name: p.topic_name, topic_slug: p.topic_slug, ...out,
        },
        available: [p.lang, ...trs.map((t) => t.lang)],
      }, { 'Cache-Control': admin ? 'no-store' : 'public, max-age=15' });
    }

    /* ───────────── everything below needs the admin cookie ───────────── */
    if (seg[0] !== 'admin') throw httpErr(404, 'Unknown endpoint');
    if (!isAdmin(event)) throw httpErr(401, 'Not signed in');
    const body = ['POST', 'PUT', 'PATCH'].includes(method) ? parseBody(event) : {};
    const res = seg[1];
    const id = seg[2];

    /* posts */
    if (res === 'posts') {
      if (method === 'GET' && !id) {
        const rows = await all(`SELECT ${POST_FIELDS}, t.name AS topic_name,
          (SELECT GROUP_CONCAT(lang) FROM translations s WHERE s.post_id = p.id) AS langs
          FROM posts p LEFT JOIN topics t ON t.id = p.topic_id ORDER BY p.updated_at DESC`);
        return respond(200, { posts: rows });
      }
      if (method === 'GET' && id) {
        const p = await one('SELECT * FROM posts WHERE id = ?', [id]);
        if (!p) throw httpErr(404, 'Post not found');
        const trs = await all('SELECT lang, updated_at FROM translations WHERE post_id = ?', [id]);
        return respond(200, { post: p, translations: trs });
      }
      if (method === 'POST' || method === 'PUT') {
        const title = String(body.title || '').trim();
        if (!title) throw httpErr(400, 'Title is required');
        const content = await processContent(body.content);
        const status = body.status === 'published' ? 'published' : 'draft';
        const srcLang = LANGS[body.lang] ? body.lang : 'en';
        const topic = body.topic_id ? Number(body.topic_id) : null;
        const excerpt = String(body.excerpt || '').trim() || stripTags(content).slice(0, 180);
        const cover = String(body.cover || '').trim();
        const now = Date.now();
        if (method === 'POST') {
          const slug = await uniqueSlug('posts', body.slug || title);
          const r = await run(`INSERT INTO posts(slug, title, excerpt, content, cover, topic_id, lang, status, words, created_at, updated_at, published_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, [slug, title, excerpt, content, cover, topic, srcLang, status, countWords(content), now, now, status === 'published' ? now : null]);
          return respond(201, { id: Number(r.lastInsertRowid), slug });
        }
        const old = await one('SELECT * FROM posts WHERE id = ?', [id]);
        if (!old) throw httpErr(404, 'Post not found');
        const slug = await uniqueSlug('posts', body.slug || old.slug || title, id);
        const published = status === 'published' ? (old.published_at || now) : old.published_at;
        await run(`UPDATE posts SET slug=?, title=?, excerpt=?, content=?, cover=?, topic_id=?, lang=?, status=?, words=?, updated_at=?, published_at=? WHERE id=?`,
          [slug, title, excerpt, content, cover, topic, srcLang, status, countWords(content), now, published, id]);
        cleanupMedia(mediaIdsIn(old.content, old.cover).filter((m) => !mediaIdsIn(content, cover).includes(m))).catch(() => {});
        return respond(200, { id: Number(id), slug });
      }
      if (method === 'DELETE' && id) {
        const old = await one('SELECT content, cover FROM posts WHERE id = ?', [id]);
        const trs = await all('SELECT content FROM translations WHERE post_id = ?', [id]);
        await run('DELETE FROM translations WHERE post_id = ?', [id]);
        await run('DELETE FROM posts WHERE id = ?', [id]);
        if (old) await cleanupMedia(mediaIdsIn(old.content, old.cover, ...trs.map((t) => t.content)));
        return respond(200, { ok: true });
      }
    }

    /* topics */
    if (res === 'topics') {
      if (method === 'POST' && id === 'reorder') {
        const ids = Array.isArray(body.ids) ? body.ids : [];
        for (let i = 0; i < ids.length; i += 1) await run('UPDATE topics SET sort = ? WHERE id = ?', [i, ids[i]]);
        return respond(200, { ok: true });
      }
      if (method === 'POST' && !id) {
        const name = String(body.name || '').trim();
        if (!name) throw httpErr(400, 'Name is required');
        const slug = await uniqueSlug('topics', name);
        const max = await one('SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM topics');
        const r = await run('INSERT INTO topics(name, slug, sort) VALUES(?,?,?)', [name, slug, Number(max.n)]);
        return respond(201, { id: Number(r.lastInsertRowid), slug });
      }
      if (method === 'PUT' && id) {
        const name = String(body.name || '').trim();
        if (!name) throw httpErr(400, 'Name is required');
        await run('UPDATE topics SET name = ?, names = ? WHERE id = ?', [name, '{}', id]);
        return respond(200, { ok: true });
      }
      if (method === 'DELETE' && id) {
        await run('UPDATE posts SET topic_id = NULL WHERE topic_id = ?', [id]);
        await run('DELETE FROM topics WHERE id = ?', [id]);
        return respond(200, { ok: true });
      }
    }

    /* media */
    if (res === 'media') {
      if (method === 'GET') {
        return respond(200, { media: await all('SELECT id, mime, size, created_at FROM media ORDER BY created_at DESC LIMIT 300') });
      }
      if (method === 'POST') {
        const m = String(body.data || '').match(/^data:([\w/+.-]+);base64,(.+)$/);
        const mime = m ? m[1] : body.mime;
        const b64 = m ? m[2] : body.data;
        if (!b64 || !/^[A-Za-z0-9+/=]+$/.test(b64)) throw httpErr(400, 'No file data');
        const { id: mid, size } = await storeMedia(mime, b64);
        return respond(201, { id: mid, url: `/api/media/${mid}`, size });
      }
      if (method === 'DELETE' && id) {
        await run('DELETE FROM media WHERE id = ?', [id]);
        return respond(200, { ok: true });
      }
    }

    /* translation prompt (editable from the admin panel) */
    if (res === 'translate-prompt') {
      if (method === 'GET') {
        const prompt = await getPrompt();
        return respond(200, { prompt, defaultPrompt: DEFAULT_PROMPT, isDefault: prompt === DEFAULT_PROMPT, max: MAX_PROMPT }, { 'Cache-Control': 'no-store' });
      }
      if (method === 'PUT') {
        const text = typeof body.prompt === 'string' ? body.prompt.trim() : '';
        if (text.length > MAX_PROMPT) throw httpErr(400, `The prompt is too long (max ${MAX_PROMPT} characters)`);
        if (!text || text === DEFAULT_PROMPT.trim()) await run("DELETE FROM settings WHERE key = 'translate_prompt'");
        else await run("INSERT INTO settings(key, value) VALUES('translate_prompt', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [text]);
        return respond(200, { ok: true, isDefault: !text || text === DEFAULT_PROMPT.trim() });
      }
    }

    /* translations */
    if (res === 'translate' && method === 'POST') {
      if (!LANGS[body.lang]) throw httpErr(400, 'Unknown language');
      const gopts = { model: body.model, thinking: body.thinking };
      if (body.type === 'topics') {
        const topics = await all('SELECT id, name, names FROM topics ORDER BY sort');
        if (!topics.length) return respond(200, { ok: true });
        const names = await translateTopics(topics, body.lang, gopts);
        for (let i = 0; i < topics.length; i += 1) {
          let map = {}; try { map = JSON.parse(topics[i].names || '{}'); } catch (_) { /* ignore */ }
          map[body.lang] = names[i];
          await run('UPDATE topics SET names = ? WHERE id = ?', [JSON.stringify(map), topics[i].id]);
        }
        return respond(200, { ok: true });
      }
      const p = await one('SELECT id, title, excerpt, content, lang FROM posts WHERE id = ?', [body.postId]);
      if (!p) throw httpErr(404, 'Post not found');
      if (p.lang === body.lang) throw httpErr(400, 'That is already the original language of this post');
      const tr = await translatePost(p, body.lang, { ...gopts, prompt: await getPrompt() });
      await run(`INSERT INTO translations(post_id, lang, title, excerpt, content, updated_at) VALUES(?,?,?,?,?,?)
        ON CONFLICT(post_id, lang) DO UPDATE SET title=excluded.title, excerpt=excluded.excerpt, content=excluded.content, updated_at=excluded.updated_at`,
        [p.id, body.lang, tr.title, tr.excerpt, tr.content, Date.now()]);
      return respond(200, { ok: true, title: tr.title });
    }
    if (res === 'translations' && method === 'DELETE' && id && seg[3]) {
      await run('DELETE FROM translations WHERE post_id = ? AND lang = ?', [id, seg[3]]);
      return respond(200, { ok: true });
    }

    throw httpErr(404, 'Unknown endpoint');
  } catch (e) {
    if (!e.status) console.error(e);
    return respond(e.status || 500, { error: e.status ? e.message : 'Server error — check the Netlify function logs' });
  }
};
