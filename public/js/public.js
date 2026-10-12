/* AMH Blogs — public site (vanilla JS, History-API router) */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  };
  const codes = LANGS.map((l) => l.code);
  const state = { lang: 'en', site: {}, topics: [] };
  const view = $('#view');

  /* ── i18n ── */
  const t = (k) => (UI[state.lang] && UI[state.lang][k]) || UI.en[k] || k;
  const langInfo = (c) => LANGS.find((l) => l.code === c) || LANGS[0];

  function pickLang() {
    const q = new URLSearchParams(location.search).get('lang');
    if (q && codes.includes(q)) return q;
    const saved = store.get('ib_lang');
    if (saved && codes.includes(saved)) return saved;
    const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
    return codes.includes(nav) ? nav : 'en';
  }
  function applyLang() {
    const info = langInfo(state.lang);
    document.documentElement.lang = state.lang;
    document.documentElement.dir = info.dir;
    $('#langSelect').value = state.lang;
    $('#topicsTitle').textContent = t('topics');
    $('#aboutTitle').textContent = t('about');
    $('#searchInput').placeholder = t('search');
    $('#searchInputMobile').placeholder = t('search');
  }

  /* ── helpers ── */
  async function api(url) {
    const r = await fetch(url, { credentials: 'same-origin' });
    if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
    return r.json();
  }
  const fmtDate = (ts) => { try { return new Intl.DateTimeFormat(state.lang, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(ts)); } catch (e) { return ''; } };
  const mins = (w) => Math.max(1, Math.round((w || 0) / 200));
  function toast(msg) { const el = $('#toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 1800); }
  const hexToRgba = (hex, a) => {
    const m = String(hex || '').trim().match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i);
    if (!m) return null;
    let h = m[1]; if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  };
  const safeUrl = (u) => (/^(https?:|mailto:|\/)/i.test(u || '') ? u : '#');

  /* ── site settings (editable in Pages CMS → public/data/site.json) ── */
  async function loadSite() {
    try { state.site = await api('/data/site.json?v=' + Date.now()); } catch (e) { state.site = {}; }
    const s = state.site;
    const name = s.siteName || 'AMH Blogs';
    $('#brandName').textContent = name;
    document.title = name;
    const logo = $('#brandLogo');
    if (s.showLogo !== false && s.logo) { logo.src = s.logo; logo.hidden = false; } else { logo.hidden = true; }
    if (s.logo) { const ic = document.querySelector('link[rel="icon"]'); if (ic) ic.href = s.logo; }

    let css = '';
    const light = hexToRgba(s.accent, 0.09), dark = hexToRgba(s.accentDark || s.accent, 0.12);
    if (s.accent) css += `:root{--accent:${s.accent};--accent-soft:${light}}`;
    if (s.accentDark || s.accent) css += `[data-theme="dark"]{--accent:${s.accentDark || s.accent};--accent-soft:${dark}}`;
    if (s.headingFont && /^[\w ]+$/.test(s.headingFont) && s.headingFont !== 'Fraunces') {
      const l = document.createElement('link'); l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(s.headingFont).replace(/%20/g, '+') + ':wght@400;600;700&display=swap';
      document.head.appendChild(l);
      css += `:root{--font-display:'${s.headingFont}','Noto Naskh Arabic','Noto Sans Devanagari','Noto Sans Bengali','Noto Sans JP',Georgia,serif}`;
    }
    let st = $('#siteVars'); if (!st) { st = document.createElement('style'); st.id = 'siteVars'; document.head.appendChild(st); }
    st.textContent = css;

    if (s.about) { $('#aboutText').textContent = s.about; $('#aboutBox').hidden = false; }
    $('#footerText').textContent = s.footer || '';
    $('#footerLinks').innerHTML = (s.links || []).filter((l) => l && l.label).map((l) => `<a href="${esc(safeUrl(l.url))}" rel="noopener">${esc(l.label)}</a>`).join('');
  }

  /* ── topics sidebar ── */
  async function loadTopics() {
    try { state.topics = (await api('/api/topics?lang=' + state.lang)).topics || []; } catch (e) { state.topics = []; }
    let totalPosts = 0;
    try {
      const postData = await api('/api/posts?' + new URLSearchParams({ lang: state.lang, limit: '1', page: '1' }));
      totalPosts = Number(postData.total) || 0;
    } catch (e) { /* keep topic loading resilient if the post count is unavailable */ }

    // Show populated, named topics only, not the all-posts link or default General bucket.
    const visibleTopics = state.topics.filter((x) => Number(x.count) > 0);
    const list = $('#topicList');
    if (totalPosts === 0 || visibleTopics.length === 0) {
      list.innerHTML = `<p class="topics-empty">${esc(t('empty'))}</p>`;
      $('#topicsTitle').hidden = false;
    } else {
      list.innerHTML = visibleTopics.map((x) => `<a href="/topic/${encodeURIComponent(x.slug)}" data-link data-slug="${esc(x.slug)}"><span>${esc(x.name)}</span><span class="n">${x.count}</span></a>`).join('');
      $('#topicsTitle').hidden = false;
    }
    markActive();
  }
  let activeSlug = '';
  function markActive(slug) {
    if (slug !== undefined) activeSlug = slug || '';
    document.querySelectorAll('#topicList a').forEach((a) => a.classList.toggle('active', a.dataset.slug === activeSlug));
  }

  /* ── cards ── */
  const cover = (p, cls) => p.cover
    ? `<div class="cover ${cls || ''}"><img src="${esc(p.cover)}" alt="" loading="lazy"></div>`
    : `<div class="cover ph ${cls || ''}" aria-hidden="true">${esc([...(p.title || '?')][0] || '?')}</div>`;
  const metaLine = (p) => `<div class="meta"><span>${esc(fmtDate(p.date))}</span><span class="dot">${mins(p.words)} ${esc(t('minRead'))}</span></div>`;
  const chip = (p) => (p.topic_name && p.topic_slug !== 'general' ? `<span class="chip">${esc(p.topic_name)}</span>` : '');
  const card = (p) => `<a class="card" href="/post/${encodeURIComponent(p.slug)}" data-link>${cover(p)}<div class="body">${chip(p)}<h3>${esc(p.title)}</h3><p>${esc(p.excerpt)}</p>${metaLine(p)}</div></a>`;
  const hero = (p) => `<a class="hero" href="/post/${encodeURIComponent(p.slug)}" data-link>${cover(p)}<div class="body">${chip(p)}<h2>${esc(p.title)}</h2><p>${esc(p.excerpt)}</p>${metaLine(p)}</div></a>`;
  const skeleton = () => { view.innerHTML = '<div class="grid">' + '<div class="skel"></div>'.repeat(6) + '</div>'; };

  async function renderList(params, withHero) {
    window.onscroll = async () => {
      if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500 && !loading) {
        loading = true;
        page += 1;
        try { const d = await api('/api/posts?' + base + '&page=' + page); grid.insertAdjacentHTML('beforeend', d.posts.map(card).join('')); } catch (e) { page -= 1; }
        loading = false;
      }
    };
    let loading = false;
    const base = new URLSearchParams({ lang: state.lang, limit: '12' });
    Object.entries(params).forEach(([k, v]) => v && base.set(k, v));
    let page = 1;
    const box = document.createElement('div');
    const first = await api('/api/posts?' + base + '&page=1');
      if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500 && !loading) {
        loading = true;
        page += 1;
        try { const d = await api('/api/posts?' + base + '&page=' + page); grid.insertAdjacentHTML('beforeend', d.posts.map(card).join('')); } catch (e) { page -= 1; }
        loading = false;
      }
    };
    let loading = false;
    if (!first.posts.length) { box.innerHTML = `<div class="empty">${esc(t('empty'))}</div>`; return box; }
    let html = '', rest = first.posts;
    if (withHero) { html += hero(rest[0]); rest = rest.slice(1); }
    box.innerHTML = html + `<div class="grid">${rest.map(card).join('')}</div>`;
    const grid = $('.grid', box);
    let loaded = first.posts.length;
    return box;
  }

  /* ── pages ── */
  async function home() {
    markActive('');
    skeleton();
    document.title = state.site.siteName || 'AMH Blogs';
    try {
      const list = await renderList({}, true);
      view.innerHTML = `<section class="intro"><h1>${esc(state.site.siteName || 'AMH Blogs')}</h1>${state.site.tagline ? `<p>${esc(state.site.tagline)}</p>` : ''}</section>`;
      view.appendChild(list);
    } catch (e) { view.innerHTML = `<div class="empty">${esc(t('empty'))}</div>`; }
  }
  async function topicPage(slug) {
    markActive(slug);
    skeleton();
    const tp = state.topics.find((x) => x.slug === slug);
    try {
      const list = await renderList({ topic: slug }, false);
      view.innerHTML = `<h1 class="page-title">${esc(tp ? tp.name : slug)}${tp ? `<small>${tp.count}</small>` : ''}</h1>`;
      view.appendChild(list);
      document.title = (tp ? tp.name : slug) + ' — ' + (state.site.siteName || '');
    } catch (e) { notFound(); }
  }
  async function searchPage() {
    markActive('');
    const q = (new URLSearchParams(location.search).get('q') || '').trim();
    $('#searchInput').value = q;
    $('#searchInputMobile').value = q;
    skeleton();
    try {
      const list = await renderList({ q }, false);
      view.innerHTML = `<h1 class="page-title">${esc(t('results'))}<small>“${esc(q)}”</small></h1>`;
      view.appendChild(list);
    } catch (e) { notFound(); }
  }
  async function postPage(slug) {
    skeleton();
    let d;
    try { d = await api(`/api/posts/${encodeURIComponent(slug)}?lang=${state.lang}`); } catch (e) { return notFound(); }
    const p = d.post;
    markActive(p.topic_slug || '');
    const contentLang = p.translated ? state.lang : p.lang;
    const info = langInfo(contentLang);
    const notice = state.lang !== p.lang && !p.translated ? `<div class="notice">${esc(t('notTranslated'))}</div>` : '';
    const draft = p.status !== 'published' ? '<div class="notice">Draft — only you can see this.</div>' : '';
    view.innerHTML = `
      <article class="post" lang="${contentLang}" dir="${info.dir}">
        <a class="crumbs" href="${p.topic_slug && p.topic_slug !== 'general' ? '/topic/' + encodeURIComponent(p.topic_slug) : '/'}" data-link>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>${esc(p.topic_slug && p.topic_slug !== 'general' ? p.topic_name : t('back'))}
        </a>
        ${draft}${notice}
        ${p.topic_name ? `<span class="chip">${esc(p.topic_name)}</span>` : ''}
        <h1>${esc(p.title)}</h1>
        ${p.excerpt ? `<p class="lede">${esc(p.excerpt)}</p>` : ''}
        <div class="meta"><span>${esc(fmtDate(p.date))}</span><span class="dot">${mins(p.words)} ${esc(t('minRead'))}</span></div>
        ${p.cover ? `<img class="hero-img" src="${esc(p.cover)}" alt="">` : ''}
        <div class="prose" id="prose"></div>
        <div class="post-foot">
          <button class="btn" id="shareBtn"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>${esc(t('share'))}</button>
          <a class="btn" href="/" data-link>${esc(t('all'))}</a>
        </div>
      </article>`;
    const prose = $('#prose');
    prose.innerHTML = p.content || '';
    prose.querySelectorAll('img').forEach((i) => { i.loading = 'lazy'; });
    prose.querySelectorAll('a[href]').forEach((a) => { if (/^https?:/i.test(a.getAttribute('href')) && a.hostname !== location.hostname) { a.target = '_blank'; a.rel = 'noopener noreferrer'; } });
    document.title = p.title + ' — ' + (state.site.siteName || '');
    const md = document.querySelector('meta[name="description"]'); if (md) md.content = p.excerpt || '';
    $('#shareBtn').onclick = async () => {
      const url = location.origin + location.pathname;
      if (navigator.share) { try { await navigator.share({ title: p.title, url }); return; } catch (e) { /* cancelled */ } }
      try { await navigator.clipboard.writeText(url); toast(t('copied')); } catch (e) { toast(url); }
    };
  }
  function notFound() { view.innerHTML = `<div class="empty">${esc(t('notFound'))}<br><br><a class="btn" href="/" data-link>${esc(t('all'))}</a></div>`; }

  /* ── router ── */
  function route() {
    document.body.classList.remove('menu-open');
    $('#menuBtn').setAttribute('aria-expanded', 'false');
    const p = location.pathname.replace(/\/+$/, '') || '/';
    let m;
    if (p === '/') return home();
    if ((m = p.match(/^\/topic\/([^/]+)$/))) return topicPage(decodeURIComponent(m[1]));
    if ((m = p.match(/^\/post\/([^/]+)$/))) return postPage(decodeURIComponent(m[1]));
    if (p === '/search') return searchPage();
    return notFound();
  }
  function go(url) { history.pushState(null, '', url); route(); window.scrollTo({ top: 0 }); }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-link]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault(); go(a.getAttribute('href'));
  });
  window.addEventListener('popstate', route);

  /* ── controls ── */
  function submitSearch(e, inputId) {
    e.preventDefault();
    const q = $(inputId).value.trim();
    $('#searchInput').value = q;
    $('#searchInputMobile').value = q;
    if (q) go('/search?q=' + encodeURIComponent(q)); else go('/');
  }
  $('#searchForm').addEventListener('submit', (e) => submitSearch(e, '#searchInput'));
  $('#searchFormMobile').addEventListener('submit', (e) => submitSearch(e, '#searchInputMobile'));
  $('#searchInput').addEventListener('input', () => { $('#searchInputMobile').value = $('#searchInput').value; });
  $('#searchInputMobile').addEventListener('input', () => { $('#searchInput').value = $('#searchInputMobile').value; });
  $('#themeBtn').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next); store.set('ib_theme', next);
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = next === 'dark' ? '#14120f' : '#faf8f4';
  });
  $('#menuBtn').addEventListener('click', () => {
    const open = document.body.classList.toggle('menu-open');
    $('#menuBtn').setAttribute('aria-expanded', String(open));
  });
  $('#scrim').addEventListener('click', () => document.body.classList.remove('menu-open'));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.body.classList.remove('menu-open'); });

  const sel = $('#langSelect');
  sel.innerHTML = LANGS.map((l) => `<option value="${l.code}">${esc(l.name)}</option>`).join('');
  sel.addEventListener('change', async () => {
    state.lang = sel.value; store.set('ib_lang', state.lang);
    if (new URLSearchParams(location.search).has('lang')) history.replaceState(null, '', location.pathname);
    applyLang(); await loadTopics(); route();
  });

  /* ── boot ── */
  (async function boot() {
    state.lang = pickLang();
    applyLang();
    await Promise.all([loadSite(), loadTopics()]);
    route();
  })();
})();
