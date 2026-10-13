/* AMH Blogs — admin panel */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const UPLOADER_URL = 'https://uploadercloud.netlify.app/';

  /* ───────── shared UI (also used by editor.js / drawpad.js) ───────── */
  const AdminUI = window.AdminUI = {
    toast(msg, isErr) {
      const el = $('#toast'); el.textContent = msg; el.classList.toggle('err', !!isErr); el.classList.add('show');
      clearTimeout(AdminUI._t); AdminUI._t = setTimeout(() => el.classList.remove('show'), isErr ? 4500 : 2600);
    },
    modal({ title, body, actions = [], wide, full, onClose, noFooter }) {
      const back = document.createElement('div'); back.className = 'modal-back';
      const box = document.createElement('div'); box.className = 'modal' + (wide ? ' wide' : '') + (full ? ' full' : '');
      box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', title);
      box.innerHTML = `<div class="modal-head"><h3>${esc(title)}</h3><button class="x" aria-label="Close">×</button></div><div class="modal-body"></div><div class="modal-foot"></div>`;
      const mb = $('.modal-body', box); if (typeof body === 'string') mb.innerHTML = body; else mb.appendChild(body);
      const foot = $('.modal-foot', box);
      const api = { el: box, body: mb, close() { if (api.closed) return; api.closed = true; back.remove(); document.removeEventListener('keydown', onKey); if (onClose) onClose(); } };
      const onKey = (e) => { if (e.key === 'Escape') { const all = document.querySelectorAll('.modal-back'); if (all[all.length - 1] === back) api.close(); } };
      document.addEventListener('keydown', onKey);
      actions.forEach((a) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'btn' + (a.primary ? ' primary' : '') + (a.danger ? ' danger' : ''); b.textContent = a.label;
        b.onclick = async () => { const r = await a.onClick(b); if (r !== false) api.close(); };
        foot.appendChild(b);
      });
      if (noFooter) foot.remove();
      $('.x', box).onclick = api.close;
      back.addEventListener('mousedown', (e) => { if (e.target === back) api.close(); });
      back.appendChild(box); $('#modalRoot').appendChild(back);
      const first = mb.querySelector('input,select,textarea'); if (first) setTimeout(() => first.focus(), 30);
      return api;
    },
    /** small form dialog → resolves with {name: value} or null */
    askForm(title, fields, submitLabel = 'OK') {
      return new Promise((resolve) => {
        const form = document.createElement('form');
        form.innerHTML = fields.map((f) => {
          if (f.type === 'checkbox') return `<div class="field"><label class="check"><input type="checkbox" name="${f.name}" ${f.value ? 'checked' : ''}> ${esc(f.label)}</label></div>`;
          return `<div class="field"><label>${esc(f.label)}</label><input type="${f.type || 'text'}" name="${f.name}" value="${esc(f.value == null ? '' : f.value)}" placeholder="${esc(f.placeholder || '')}" ${f.required ? 'required' : ''}>${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</div>`;
        }).join('') + '<button type="submit" hidden></button>';
        let done = false;
        const collect = () => { const o = {}; fields.forEach((f) => { const i = form.elements[f.name]; o[f.name] = f.type === 'checkbox' ? i.checked : i.value; }); return o; };
        const m = AdminUI.modal({ title, body: form, onClose: () => { if (!done) resolve(null); }, actions: [{ label: submitLabel, primary: true, onClick: () => { if (!form.reportValidity()) return false; done = true; resolve(collect()); } }] });
        form.addEventListener('submit', (e) => { e.preventDefault(); if (!form.reportValidity()) return; done = true; resolve(collect()); m.close(); });
      });
    },
    confirm(title, text, label = 'Delete') {
      return new Promise((resolve) => {
        let done = false;
        AdminUI.modal({ title, body: `<p style="margin:0">${esc(text)}</p>`, onClose: () => { if (!done) resolve(false); }, actions: [{ label, danger: true, onClick: () => { done = true; resolve(true); } }] });
      });
    }
  };

  /* ───────── api ───────── */
  async function api(path, method = 'GET', body) {
    const r = await fetch('/api/' + path, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401 && path !== 'login') { showLogin(); throw new Error('Please sign in again'); }
    if (!r.ok) throw new Error(d.error || 'Something went wrong (' + r.status + ')');
    return d;
  }
  const fmtDate = (ts) => (ts ? new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '');
  const LN = Object.fromEntries(LANGS.map((l) => [l.code, l]));
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } } };
  const main = $('#main');

  /* ───────── login ───────── */
  function showLogin() { $('#app').hidden = true; $('#login').hidden = false; setTimeout(() => $('#loginPw').focus(), 50); }
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#loginBtn'); btn.disabled = true; $('#loginErr').textContent = '';
    try { await api('login', 'POST', { password: $('#loginPw').value }); $('#loginPw').value = ''; await start(); }
    catch (err) { $('#loginErr').textContent = err.message; }
    btn.disabled = false;
  });
  $('#logoutBtn').addEventListener('click', async () => { try { await api('logout', 'POST'); } catch (e) { /* ignore */ } showLogin(); });
  $('#themeBtn').addEventListener('click', () => { const n = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', n); store.set('ib_theme', n); });

  /* mobile nav */
  $('#navBtn').addEventListener('click', () => document.body.classList.toggle('nav-open'));
  $('#navScrim').addEventListener('click', () => document.body.classList.remove('nav-open'));

  /* uploader */
  $('#uploaderBtn').addEventListener('click', () => {
    document.body.classList.remove('nav-open');
    const wrap = document.createElement('div'); wrap.className = 'modal-body flush';
    wrap.innerHTML = `<iframe class="uframe" src="${UPLOADER_URL}" title="Uploader" allow="clipboard-write; fullscreen"></iframe>
      <div class="uhint">Upload your video, PDF, audio or large image here, copy the link it gives you, then paste it in the editor (Video / PDF / Audio / Image buttons).
      Page blank? <a href="${UPLOADER_URL}" target="_blank" rel="noopener">Open the uploader in a new tab ↗</a></div>`;
    const m = AdminUI.modal({ title: 'Uploader', body: wrap.outerHTML, full: true, noFooter: true });
    m.body.className = 'modal-body flush';
  });

  /* ───────── router ───────── */
  let leaveGuard = null;
  window.addEventListener('hashchange', () => { if (leaveGuard && !confirm('You have unsaved changes. Leave this page?')) { history.back(); return; } leaveGuard = null; route(); });
  window.addEventListener('beforeunload', (e) => { if (leaveGuard) { e.preventDefault(); e.returnValue = ''; } });

  function route() {
    document.body.classList.remove('nav-open');
    const h = (location.hash || '#/posts').slice(2).split('/');
    let key = h[0] || 'posts';
    if (key === 'post') key = h[1] === 'new' ? 'new' : 'posts';
    document.querySelectorAll('.nav-links a').forEach((a) => a.classList.toggle('active', a.dataset.r === key));
    $('#mbarTitle').textContent = { posts: 'Posts', new: 'New post', topics: 'Topics', media: 'Media', health: 'Setup check' }[key] || 'Admin';
    main.innerHTML = '<div class="empty"><span class="spin"></span></div>';
    window.scrollTo(0, 0);
    const run = { posts: pagePosts, topics: pageTopics, media: pageMedia, health: pageHealth }[h[0] || 'posts'];
    if (h[0] === 'post') return pageEditor(h[1] === 'new' ? null : h[1]);
    (run || pagePosts)().catch((e) => { main.innerHTML = `<div class="empty">${esc(e.message)}</div>`; });
  }

  /* ───────── posts list ───────── */
  async function pagePosts() {
    const [{ posts }, { topics }] = await Promise.all([api('admin/posts'), api('topics')]);
    main.innerHTML = `
      <div class="page-head"><div><h1>Posts</h1><p class="sub">${posts.length} total · ${posts.filter((p) => p.status === 'published').length} published</p></div><a class="btn primary" href="#/post/new">+ New post</a></div>
      <div class="toolbar"><input type="search" id="q" placeholder="Search posts…"><select id="st"><option value="">All statuses</option><option value="published">Published</option><option value="draft">Drafts</option></select><select id="tp"><option value="">All topics</option>${topics.map((t) => `<option value="${esc(t.name)}">${esc(t.name)}</option>`).join('')}</select></div>
      <div class="list" id="list"></div>`;
    const draw = () => {
      const q = $('#q').value.toLowerCase(), st = $('#st').value, tp = $('#tp').value;
      const rows = posts.filter((p) => (!q || p.title.toLowerCase().includes(q)) && (!st || p.status === st) && (!tp || p.topic_name === tp));
      $('#list').innerHTML = rows.length ? rows.map((p) => `
        <div class="row">
          <div><a class="row-title" href="#/post/${p.id}">${esc(p.title)}</a>
            <div class="row-meta"><span class="badge ${p.status === 'published' ? 'live' : 'draft'}">${p.status === 'published' ? 'Published' : 'Draft'}</span>
              ${p.topic_name ? `<span>${esc(p.topic_name)}</span>` : ''}<span>${esc(LN[p.lang] ? LN[p.lang].name : p.lang)}</span><span>${p.words} words</span><span>Edited ${fmtDate(p.updated_at)}</span>
              ${p.langs ? `<span>+${p.langs.split(',').length} translations</span>` : ''}</div></div>
          <div class="row-actions"><a class="btn sm" href="/post/${esc(p.slug)}" target="_blank" rel="noopener">View</a><a class="btn sm" href="#/post/${p.id}">Edit</a><button class="btn sm danger" data-del="${p.id}">Delete</button></div>
        </div>`).join('') : '<div class="empty">No posts found. <a href="#/post/new">Write your first post →</a></div>';
      document.querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => {
        const p = posts.find((x) => x.id == b.dataset.del);
        if (!(await AdminUI.confirm('Delete post?', `“${p.title}” and all its translations will be removed permanently.`))) return;
        try { await api('admin/posts/' + p.id, 'DELETE'); posts.splice(posts.indexOf(p), 1); draw(); AdminUI.toast('Post deleted'); } catch (e) { AdminUI.toast(e.message, true); }
      }; });
    };
    ['q', 'st', 'tp'].forEach((id) => $('#' + id).addEventListener('input', draw)); draw();
  }

  /* ───────── post editor ───────── */
  async function pageEditor(id) {
    const [{ topics }, existing] = await Promise.all([api('topics'), id ? api('admin/posts/' + id) : Promise.resolve(null)]);
    const post = existing ? existing.post : { title: '', slug: '', excerpt: '', content: '', cover: '', topic_id: null, lang: store.get('ib_srclang') || 'en', status: 'draft' };
    let trs = existing ? existing.translations : [];
    let dirty = false, saving = false, curId = id ? Number(id) : null;
    const mark = () => { dirty = true; leaveGuard = true; };

    main.innerHTML = `
      <div class="page-head"><div><h1>${id ? 'Edit post' : 'New post'}</h1></div><a class="btn" href="#/posts">← All posts</a></div>
      <div class="ed-grid">
        <div><input class="ed-title" id="title" placeholder="Post title" maxlength="200" aria-label="Title"><div id="rte"></div></div>
        <aside class="side">
          <div class="card"><h3>Publish</h3>
            <div class="field"><label>Status</label><select id="status"><option value="draft">Draft (hidden)</option><option value="published">Published</option></select></div>
            <div class="save-row"><button class="btn primary" id="save">Save</button><a class="btn" id="viewBtn" target="_blank" rel="noopener" hidden>View ↗</a></div></div>
          <div class="card"><h3>Details</h3>
            <div class="field"><label>Topic</label><select id="topic"><option value="">No topic</option>${topics.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></div>
            <div class="field"><label>Language you are writing in</label><select id="lang">${LANGS.map((l) => `<option value="${l.code}">${esc(l.name)}</option>`).join('')}</select></div>
            <div class="field"><label>Short summary</label><textarea id="excerpt" maxlength="300" placeholder="Shown on cards and in search results. Leave empty to auto-fill."></textarea></div>
            <div class="field" style="margin:0"><label>URL name</label><input type="text" id="slug" placeholder="auto-from-title"></div></div>
          <div class="card"><h3>Cover image</h3>
            <div class="cover-box" id="coverBox">No cover</div>
            <div class="save-row"><button class="btn sm" id="coverUp">Upload</button><button class="btn sm" id="coverLink">Link</button><button class="btn sm danger" id="coverRm">Remove</button></div></div>
          <div class="card"><h3>Translation Options</h3>
            <div class="field"><label>Model</label><select id="model"><option value="gemini-3.8-flash">Gemini 3.8 Flash</option><option value="gemini-3.7-flash">Gemini 3.7 Flash</option><option value="gemini-3.5-flash">Gemini 3.5 Flash</option><option value="gemini-3.1-pro-preview">Gemini 3.1 Pro Preview</option><option value="gemini-3.1-flash-lite">Gemini 3.1 Flash-Lite</option><option value="gemini-3-flash-preview">Gemini 3 Flash Preview</option></select></div>
            <div class="field"><label>Thinking Level</label><select id="thinking"><option value="none">Minimal (None)</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div>
            <button type="button" class="btn sm" id="editPrompt" title="See and change the instructions Gemini follows when translating">Edit translation prompt</button>
          </div>
          <div class="card"><h3>Translations (Gemini)</h3><div id="trBox"></div></div>
        </aside>
      </div>`;

    $('#title').value = post.title; $('#status').value = post.status; $('#topic').value = post.topic_id || '';
    $('#lang').value = post.lang; $('#excerpt').value = post.excerpt || ''; $('#slug').value = post.slug || '';
    let cover = post.cover || '';
    const drawCover = () => { $('#coverBox').innerHTML = cover ? `<img src="${esc(cover)}" alt="">` : 'No cover'; $('#coverRm').hidden = !cover; };
    drawCover();
    const rte = RichEditor.create($('#rte'), { onChange: mark });
    rte.setHTML(post.content || ''); dirty = false; leaveGuard = null;
    ['title', 'status', 'topic', 'lang', 'excerpt', 'slug', 'model', 'thinking'].forEach((k) => $('#' + k).addEventListener('input', mark));
    $('#editPrompt').onclick = async () => {
      let info;
      try { info = await api('admin/translate-prompt'); } catch (e) { AdminUI.toast(e.message, true); return; }
      const wrap = document.createElement('div');
      wrap.innerHTML = `<div class="field" style="margin:0"><label>Instructions sent to Gemini for every translation</label>
        <textarea id="promptText" rows="14" maxlength="${info.max}" style="width:100%;font-family:inherit;line-height:1.5"></textarea>
        <small>Write <code>{{language}}</code> where the target language should go. The reply format (title, excerpt, content) is added automatically, so you can't break it. Applies to all new translations; existing ones stay until you press Redo.</small></div>`;
      const ta = $('#promptText', wrap); ta.value = info.prompt;
      AdminUI.modal({
        title: 'Translation prompt', body: wrap, wide: true,
        actions: [
          { label: 'Reset to default', danger: true, onClick: () => { ta.value = info.defaultPrompt; return false; } },
          { label: 'Save prompt', primary: true, onClick: async () => {
            try { const r = await api('admin/translate-prompt', 'PUT', { prompt: ta.value }); AdminUI.toast(r.isDefault ? 'Prompt reset to default' : 'Prompt saved'); } catch (e) { AdminUI.toast(e.message, true); return false; }
          } },
        ],
      });
    };
    const syncView = () => { const a = $('#viewBtn'); if (curId) { a.hidden = false; a.href = '/post/' + encodeURIComponent($('#slug').value || post.slug); } };
    syncView();

    $('#coverUp').onclick = async () => { const [f] = await Media.pick(false); if (!f) return; try { AdminUI.toast('Compressing…'); const r = await Media.upload(f); cover = r.url; drawCover(); mark(); AdminUI.toast(r.message, r.over); } catch (e) { AdminUI.toast(e.message, true); } };
    $('#coverLink').onclick = async () => { const v = await AdminUI.askForm('Cover image link', [{ name: 'url', label: 'Image link', type: 'url', value: cover, required: true, placeholder: 'https://…' }], 'Use image'); if (v) { cover = v.url.trim(); drawCover(); mark(); } };
    $('#coverRm').onclick = () => { cover = ''; drawCover(); mark(); };

    async function save(silent) {
      if (saving) return false;
      const title = $('#title').value.trim();
      if (!title) { AdminUI.toast('Please add a title first', true); $('#title').focus(); return false; }
      saving = true; $('#save').disabled = true;
      const payload = { title, content: rte.getHTML(), status: $('#status').value, topic_id: $('#topic').value || null, lang: $('#lang').value, excerpt: $('#excerpt').value, slug: $('#slug').value.trim(), cover };
      try {
        const r = curId ? await api('admin/posts/' + curId, 'PUT', payload) : await api('admin/posts', 'POST', payload);
        if (!curId) { curId = r.id; history.replaceState(null, '', '#/post/' + curId); }
        $('#slug').value = r.slug; post.slug = r.slug; post.lang = payload.lang; store.set('ib_srclang', payload.lang);
        dirty = false; leaveGuard = null; syncView(); drawTr();
        if (!silent) AdminUI.toast(payload.status === 'published' ? 'Saved & published' : 'Draft saved');
        return true;
      } catch (e) { AdminUI.toast(e.message, true); return false; } finally { saving = false; $('#save').disabled = false; }
    }
    $('#save').onclick = () => save();
    document.addEventListener('keydown', function onK(e) {
      if (!document.body.contains($('#save'))) { document.removeEventListener('keydown', onK); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    });

    /* translations */
    const status = {};            // lang -> 'busy' | error string
    function drawTr() {
      const src = $('#lang').value; const have = Object.fromEntries(trs.map((t) => [t.lang, t]));
      $('#trBox').innerHTML = !curId ? '<p class="muted" style="margin:0;font-size:.88rem">Save the post first, then translate it into 11 languages with one click.</p>' : `
        <div class="tr-list">${LANGS.filter((l) => l.code !== src).map((l) => {
          const s = status[l.code]; const has = have[l.code];
          const right = s === 'busy' ? '<span class="spin"></span>' : (s ? `<span class="err" title="${esc(s)}">${esc(s)}</span>` : has ? `<span class="ok">✓ ${fmtDate(has.updated_at)}</span><button class="x" data-rm="${l.code}" title="Delete translation">×</button>` : '');
          return `<div class="tr-item"><span>${esc(l.name)}</span><span class="st ${has && !s ? 'ok' : s && s !== 'busy' ? 'err' : ''}">${right}</span><button class="btn sm" data-tr="${l.code}" ${s === 'busy' ? 'disabled' : ''}>${has ? 'Redo' : 'Translate'}</button></div>`;
        }).join('')}</div>
        <div class="save-row"><button class="btn sm" id="trAll">Translate all</button><button class="btn sm" id="trTopics" title="Translate the sidebar topic names">Topic names</button></div>
        <small class="muted" style="display:block;margin-top:10px">Translations use the saved version of the post. Save first if you just edited it.</small>`;
      $('#trBox').querySelectorAll('[data-tr]').forEach((b) => { b.onclick = () => doTr(b.dataset.tr); });
      $('#trBox').querySelectorAll('[data-rm]').forEach((b) => { b.onclick = async () => { try { await api(`admin/translations/${curId}/${b.dataset.rm}`, 'DELETE'); trs = trs.filter((t) => t.lang !== b.dataset.rm); drawTr(); } catch (e) { AdminUI.toast(e.message, true); } }; });
      const all = $('#trAll'); if (all) all.onclick = async () => { for (const l of LANGS) { if (l.code !== $('#lang').value) await doTr(l.code, true); } AdminUI.toast('Translations finished'); };
      const tt = $('#trTopics'); if (tt) tt.onclick = async () => {
        tt.disabled = true;
        try { for (const l of LANGS) { if (l.code !== 'en') await api('admin/translate', 'POST', { type: 'topics', lang: l.code }); } AdminUI.toast('Topic names translated'); } catch (e) { AdminUI.toast(e.message, true); }
        tt.disabled = false;
      };
    }
    async function doTr(lang, quiet) {
      if (dirty && !(await save(true))) return;
      status[lang] = 'busy'; drawTr();
      try {
        await api('admin/translate', 'POST', { postId: curId, lang, model: $('#model').value, thinking: $('#thinking').value });
        const d = await api('admin/posts/' + curId); trs = d.translations; delete status[lang];
        if (!quiet) AdminUI.toast(`Translated to ${LN[lang].name}`);
      } catch (e) { status[lang] = e.message.slice(0, 80); if (!quiet) AdminUI.toast(e.message, true); }
      drawTr();
    }
    $('#lang').addEventListener('change', drawTr);
    drawTr();
  }

  /* ───────── topics ───────── */
  async function pageTopics() {
    let { topics } = await api('topics');
    main.innerHTML = `<div class="page-head"><div><h1>Topics</h1><p class="sub">These make the sidebar on your site. Drag the arrows to reorder.</p></div></div>
      <form class="add-row" id="addT"><input type="text" id="newT" placeholder="New topic name" required maxlength="60"><button class="btn primary">Add topic</button></form>
      <div class="list" id="tl"></div>`;
    const draw = () => {
      $('#tl').innerHTML = topics.length ? topics.map((t, i) => `<div class="t-row" data-id="${t.id}">
        <div style="display:flex;flex-direction:column"><button class="btn ghost sm" data-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">▲</button><button class="btn ghost sm" data-dn="${i}" ${i === topics.length - 1 ? 'disabled' : ''} aria-label="Move down">▼</button></div>
        <input type="text" value="${esc(t.name)}" data-name="${t.id}" maxlength="60" aria-label="Topic name"><span class="cnt">${t.count} posts</span><button class="btn sm danger" data-del="${t.id}">Delete</button></div>`).join('') : '<div class="empty">No topics yet.</div>';
      $('#tl').querySelectorAll('[data-name]').forEach((inp) => { inp.onchange = async () => { const t = topics.find((x) => x.id == inp.dataset.name); if (!inp.value.trim() || inp.value === t.name) { inp.value = t.name; return; } try { await api('admin/topics/' + t.id, 'PUT', { name: inp.value }); t.name = inp.value.trim(); AdminUI.toast('Renamed (re-run “Topic names” in a post to refresh translations)'); } catch (e) { AdminUI.toast(e.message, true); } }; });
      $('#tl').querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => { const t = topics.find((x) => x.id == b.dataset.del); if (!(await AdminUI.confirm('Delete topic?', `“${t.name}” will be removed. Its ${t.count} posts stay, but become topic-less.`))) return; try { await api('admin/topics/' + t.id, 'DELETE'); topics = topics.filter((x) => x !== t); draw(); } catch (e) { AdminUI.toast(e.message, true); } }; });
      const move = async (i, d) => { const j = i + d; if (j < 0 || j >= topics.length) return; [topics[i], topics[j]] = [topics[j], topics[i]]; draw(); try { await api('admin/topics/reorder', 'POST', { ids: topics.map((t) => t.id) }); } catch (e) { AdminUI.toast(e.message, true); } };
      $('#tl').querySelectorAll('[data-up]').forEach((b) => { b.onclick = () => move(+b.dataset.up, -1); });
      $('#tl').querySelectorAll('[data-dn]').forEach((b) => { b.onclick = () => move(+b.dataset.dn, 1); });
    };
    draw();
    $('#addT').onsubmit = async (e) => { e.preventDefault(); try { await api('admin/topics', 'POST', { name: $('#newT').value }); ({ topics } = await api('topics')); $('#newT').value = ''; draw(); } catch (err) { AdminUI.toast(err.message, true); } };
  }

  /* ───────── media library ───────── */
  async function pageMedia() {
    let { media } = await api('admin/media');
    const total = () => media.reduce((a, m) => a + (m.size || 0), 0);
    main.innerHTML = `<div class="page-head"><div><h1>Media</h1><p class="sub" id="msub"></p></div><button class="btn primary" id="mUp">+ Upload image</button></div>
      <div class="media-grid" id="mg"></div>`;
    const draw = () => {
      $('#msub').textContent = `${media.length} files · ${Media.kb(total())} stored in Turso`;
      $('#mg').innerHTML = media.length ? media.map((m) => `<div class="m-item"><div class="th">${m.mime.startsWith('audio/') ? '<div style="height:100%;display:grid;place-items:center;font-size:2.2rem">🎙️</div>' : `<img src="/api/media/${m.id}" loading="lazy" alt="">`}</div>
        <div class="mi"><span>${Media.kb(m.size)}</span><span class="acts"><button data-copy="${m.id}">Copy link</button><button data-del="${m.id}">Delete</button></span></div></div>`).join('') : '<div class="empty" style="grid-column:1/-1">No files yet. Images you add in posts appear here.</div>';
      $('#mg').querySelectorAll('[data-copy]').forEach((b) => { b.onclick = async () => { const u = location.origin + '/api/media/' + b.dataset.copy; try { await navigator.clipboard.writeText(u); AdminUI.toast('Link copied'); } catch (e) { AdminUI.toast(u); } }; });
      $('#mg').querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => { if (!(await AdminUI.confirm('Delete file?', 'Any post using it will show a broken image.'))) return; try { await api('admin/media/' + b.dataset.del, 'DELETE'); media = media.filter((m) => m.id !== b.dataset.del); draw(); } catch (e) { AdminUI.toast(e.message, true); } }; });
    };
    draw();
    $('#mUp').onclick = async () => { const files = await Media.pick(true); for (const f of files) { try { const r = await Media.upload(f); AdminUI.toast(r.message, r.over); } catch (e) { AdminUI.toast(e.message, true); } } ({ media } = await api('admin/media')); draw(); };
  }

  /* ───────── setup check ───────── */
  async function pageHealth() {
    const h = await api('admin/health');
    const names = { TURSO_DATABASE_URL: 'Turso database URL', TURSO_AUTH_TOKEN: 'Turso token', GEMINI_API_KEY: 'Gemini API key', ADMIN_PASSWORD: 'Admin password', SESSION_SECRET: 'Session secret' };
    main.innerHTML = `<div class="page-head"><div><h1>Setup check</h1><p class="sub">Is everything connected?</p></div><button class="btn" id="rf">Re-check</button></div>
      <div class="list">${Object.entries(h.env).map(([k, v]) => `<div class="chk"><span>${names[k]}</span><code>${k}</code><span class="state ${v ? 'ok' : 'no'}">${v ? '✓ Set' : '✗ Missing'}</span></div>`).join('')}
        <div class="chk"><span>Turso connection</span><code>${h.dbOk ? 'tables ready' : esc(h.dbError || '')}</code><span class="state ${h.dbOk ? 'ok' : 'no'}">${h.dbOk ? '✓ Connected' : '✗ Failed'}</span></div>
        <div class="chk"><span>Translation model</span><code>${esc(h.model)} · thinking: ${esc(h.thinking)}</code></div></div>
      ${h.counts ? `<p class="muted" style="margin-top:16px">${h.counts.posts} posts · ${h.counts.topics} topics · ${h.counts.media} files (${Media.kb(Number(h.counts.media_bytes))})</p>` : ''}`;
    $('#rf').onclick = route;
  }

  /* ───────── start ───────── */
  async function loadBrand() {
    try { const s = await (await fetch('/data/site.json?v=' + Date.now())).json(); if (s.siteName) $('#navName').textContent = s.siteName; if (s.publicUrl) { const v = document.querySelector('.nav-mini[href="/"]'); if (v) v.href = s.publicUrl; } if (s.logo) { $('#navLogo').src = s.logo; $('#loginLogo').src = s.logo; } } catch (e) { /* defaults */ }
  }
  async function start() {
    let me; try { me = await api('me'); } catch (e) { me = { admin: false }; }
    if (!me.admin) return showLogin();
    $('#login').hidden = true; $('#app').hidden = false; loadBrand(); route();
  }
  start();
})();
