/* Rich text editor for AMH Blogs (contenteditable + a full toolbar). */
window.RichEditor = (function () {
  'use strict';
  const I = {
    undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
    redo: '<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/>',
    bold: '<path d="M6 4h8a4 4 0 0 1 0 8H6zM6 12h9a4 4 0 0 1 0 8H6z"/>',
    italic: '<path d="M19 4h-9M14 20H5M15 4 9 20"/>',
    underline: '<path d="M6 4v6a6 6 0 0 0 12 0V4M4 20h16"/>',
    strike: '<path d="M16 4H9a3 3 0 0 0-2.8 4M14 12a4 4 0 0 1 0 8H6M4 12h16"/>',
    color: '<path d="m9 15 3-9 3 9M10 12.5h4"/>',
    mark: '<path d="m9 11-6 6v3h9l3-3M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>',
    left: '<path d="M3 6h18M3 12h12M3 18h16"/>',
    center: '<path d="M3 6h18M7 12h10M5 18h14"/>',
    right: '<path d="M3 6h18M9 12h12M5 18h16"/>',
    justify: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    ul: '<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
    ol: '<path d="M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>',
    quote: '<path d="M3 21c3 0 7-1 7-8V5H4v6h4M14 21c3 0 7-1 7-8V5h-6v6h4"/>',
    code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    unlink: '<path d="m18.8 13.2 1.7-1.7a5 5 0 0 0-7-7l-1.7 1.7M5.2 10.8l-1.7 1.7a5 5 0 0 0 7 7l1.7-1.7M8 2v3M2 8h3M16 22v-3M22 16h-3"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
    video: '<rect x="2" y="5" width="14" height="14" rx="2"/><path d="m22 8-6 4 6 4z"/>',
    audio: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/>',
    pdf: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    table: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
    hr: '<path d="M3 12h18"/>',
    draw: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    clear: '<path d="M4 7V4h16v3M5 20h6M13 4 8 20M15 15l5 5M20 15l-5 5"/>',
    source: '<path d="m18 16 4-4-4-4M6 8l-4 4 4 4M14.5 4l-5 16"/>',
    full: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>'
  };
  const svg = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${I[k]}</svg>`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ── paste cleaner ── */
  const KEEP = new Set(['p', 'br', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'a', 'strong', 'em', 'u', 's', 'blockquote', 'pre', 'code', 'img', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'hr', 'sup', 'sub', 'mark']);
  const BLOCKS = 'p,div,ul,ol,table,h1,h2,h3,h4,h5,pre,blockquote';
  function cleanHTML(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script,style,meta,link,title,iframe,object,embed,head').forEach((n) => n.remove());
    const walk = (el) => {
      [...el.children].forEach(walk);
      let tag = el.tagName.toLowerCase();
      const rename = { b: 'strong', i: 'em', strike: 's', del: 's', h1: 'h2', h5: 'h4', h6: 'h4' };
      if (rename[tag]) { const n = doc.createElement(rename[tag]); n.innerHTML = el.innerHTML; el.replaceWith(n); el = n; tag = n.tagName.toLowerCase(); }
      if (tag === 'div' && !el.querySelector(BLOCKS)) { const n = doc.createElement('p'); n.innerHTML = el.innerHTML; el.replaceWith(n); return; }
      if (!KEEP.has(tag)) { el.replaceWith(...el.childNodes); return; }
      [...el.attributes].forEach((a) => {
        const ok = (tag === 'a' && a.name === 'href') || (tag === 'img' && (a.name === 'src' || a.name === 'alt')) || ((tag === 'td' || tag === 'th') && (a.name === 'colspan' || a.name === 'rowspan'));
        if (!ok) el.removeAttribute(a.name);
      });
      if (tag === 'a') { const h = el.getAttribute('href') || ''; if (!/^(https?:|mailto:|\/|#)/i.test(h)) el.removeAttribute('href'); }
    };
    [...doc.body.children].forEach(walk);
    return doc.body.innerHTML.replace(/<!--[\s\S]*?-->/g, '');
  }

  /* ── embeds ── */
  function videoHTML(url) {
    let m;
    if ((m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/))([\w-]{11})/i))) return `<div class="embed" contenteditable="false"><iframe src="https://www.youtube.com/embed/${m[1]}" allowfullscreen loading="lazy" title="Video"></iframe></div><p><br></p>`;
    if ((m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i))) return `<div class="embed" contenteditable="false"><iframe src="https://player.vimeo.com/video/${m[1]}" allowfullscreen loading="lazy" title="Video"></iframe></div><p><br></p>`;
    if (/\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(url)) return `<video controls preload="metadata" src="${esc(url)}"></video><p><br></p>`;
    return `<div class="embed" contenteditable="false"><iframe src="${esc(url)}" allowfullscreen loading="lazy" title="Embedded media"></iframe></div><p><br></p>`;
  }

  function create(host, opts) {
    opts = opts || {};
    host.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'rte';
    root.innerHTML = '<div class="rte-bar" role="toolbar"></div><div class="rte-area prose" contenteditable="true" spellcheck="true" data-ph="Start writing…"></div><textarea class="rte-src" hidden spellcheck="false"></textarea><div class="rte-foot"><span class="wc"></span><span class="hint">Tip: paste or drop images — they are shrunk to under 250 KB automatically</span></div>';
    host.appendChild(root);
    const bar = root.querySelector('.rte-bar'), area = root.querySelector('.rte-area'), src = root.querySelector('.rte-src'), wc = root.querySelector('.wc');
    let lastRange = null, sourceMode = false, ctx = null;
    const buttons = {};

    try { document.execCommand('defaultParagraphSeparator', false, 'p'); document.execCommand('styleWithCSS', false, true); } catch (e) { /* ignore */ }

    /* selection helpers */
    const inArea = (n) => n && area.contains(n);
    document.addEventListener('selectionchange', () => {
      const s = getSelection();
      if (s.rangeCount && inArea(s.anchorNode)) { lastRange = s.getRangeAt(0).cloneRange(); refreshState(); }
    });
    function restore() {
      area.focus();
      if (lastRange) { const s = getSelection(); s.removeAllRanges(); s.addRange(lastRange); }
    }
    const exec = (cmd, val) => { restore(); document.execCommand(cmd, false, val); changed(); };
    const insert = (html) => { restore(); document.execCommand('insertHTML', false, html); changed(); };

    /* toolbar */
    const sep = () => { const s = document.createElement('span'); s.className = 'sep'; bar.appendChild(s); };
    function btn(key, icon, title, fn, stateCmd) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'tb'; b.title = title; b.setAttribute('aria-label', title); b.innerHTML = svg(icon);
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', fn);
      bar.appendChild(b); buttons[key] = { el: b, cmd: stateCmd };
      return b;
    }
    function txtBtn(key, label, title, fn) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'tb'; b.title = title; b.textContent = label;
      b.addEventListener('mousedown', (e) => e.preventDefault()); b.addEventListener('click', fn);
      bar.appendChild(b); buttons[key] = { el: b };
      return b;
    }
    function colorBtn(icon, title, cmd, init) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'tb'; b.title = title; b.innerHTML = svg(icon) + `<span class="swatch" style="background:${init}"></span>`;
      const inp = document.createElement('input'); inp.type = 'color'; inp.value = init;
      inp.addEventListener('input', () => { b.querySelector('.swatch').style.background = inp.value; exec(cmd, inp.value); });
      b.appendChild(inp); bar.appendChild(b);
    }

    btn('undo', 'undo', 'Undo (Ctrl+Z)', () => exec('undo'));
    btn('redo', 'redo', 'Redo (Ctrl+Y)', () => exec('redo'));
    sep();
    const sel = document.createElement('select');
    sel.className = 'tb-sel'; sel.title = 'Text style';
    sel.innerHTML = '<option value="p">Paragraph</option><option value="h2">Heading 1</option><option value="h3">Heading 2</option><option value="h4">Heading 3</option><option value="blockquote">Quote</option><option value="pre">Code block</option>';
    sel.addEventListener('change', () => { exec('formatBlock', '<' + sel.value + '>'); });
    bar.appendChild(sel);
    sep();
    btn('bold', 'bold', 'Bold (Ctrl+B)', () => exec('bold'), 'bold');
    btn('italic', 'italic', 'Italic (Ctrl+I)', () => exec('italic'), 'italic');
    btn('underline', 'underline', 'Underline (Ctrl+U)', () => exec('underline'), 'underline');
    btn('strike', 'strike', 'Strikethrough', () => exec('strikeThrough'), 'strikeThrough');
    colorBtn('color', 'Text colour', 'foreColor', '#c0392b');
    colorBtn('mark', 'Highlight', 'hiliteColor', '#ffe9a8');
    sep();
    btn('left', 'left', 'Align left', () => exec('justifyLeft'), 'justifyLeft');
    btn('center', 'center', 'Align centre', () => exec('justifyCenter'), 'justifyCenter');
    btn('right', 'right', 'Align right', () => exec('justifyRight'), 'justifyRight');
    btn('justify', 'justify', 'Justify', () => exec('justifyFull'), 'justifyFull');
    txtBtn('dir', 'RTL', 'Switch this paragraph between right-to-left and left-to-right (Arabic, Urdu)', () => {
      restore();
      const n = lastRange && lastRange.startContainer; let el = n && (n.nodeType === 3 ? n.parentElement : n);
      el = el && el.closest('p,h2,h3,h4,li,blockquote,pre,td,th');
      if (!el || !area.contains(el)) return;
      el.setAttribute('dir', el.getAttribute('dir') === 'rtl' ? 'ltr' : 'rtl'); changed();
    });
    sep();
    btn('ul', 'ul', 'Bulleted list', () => exec('insertUnorderedList'), 'insertUnorderedList');
    btn('ol', 'ol', 'Numbered list', () => exec('insertOrderedList'), 'insertOrderedList');
    btn('quote', 'quote', 'Quote', () => exec('formatBlock', '<blockquote>'));
    btn('code', 'code', 'Code block', () => exec('formatBlock', '<pre>'));
    sep();
    btn('link', 'link', 'Insert link (Ctrl+K)', linkDialog);
    btn('unlink', 'unlink', 'Remove link', () => exec('unlink'));
    btn('image', 'image', 'Image (upload, paste or link)', imageDialog);
    btn('video', 'video', 'Video (YouTube, Vimeo or file link)', videoDialog);
    btn('audio', 'audio', 'Audio (record, upload or link, up to 5 min)', audioDialog);
    btn('pdf', 'pdf', 'PDF / file link', pdfDialog);
    btn('table', 'table', 'Table', tableDialog);
    btn('hr', 'hr', 'Divider line', () => insert('<hr><p><br></p>'));
    btn('draw', 'draw', 'Drawing pad', () => { DrawPad.open({ onInsert: async (blob) => { const f = new File([blob], 'drawing.png', { type: 'image/png' }); await insertImageFile(f); } }); });
    sep();
    btn('clear', 'clear', 'Clear formatting', () => { exec('removeFormat'); exec('formatBlock', '<p>'); });
    btn('source', 'source', 'Edit HTML source', toggleSource);
    btn('full', 'full', 'Full screen', () => { root.classList.toggle('full'); document.body.style.overflow = root.classList.contains('full') ? 'hidden' : ''; });

    function refreshState() {
      Object.values(buttons).forEach((b) => { if (b.cmd) { let on = false; try { on = document.queryCommandState(b.cmd); } catch (e) { /* ignore */ } b.el.classList.toggle('on', !!on); } });
      let v = ''; try { v = String(document.queryCommandValue('formatBlock') || '').toLowerCase(); } catch (e) { /* ignore */ }
      const map = { 'heading 2': 'h2', 'heading 3': 'h3', 'heading 4': 'h4', h2: 'h2', h3: 'h3', h4: 'h4', blockquote: 'blockquote', pre: 'pre', p: 'p', div: 'p', '': 'p' };
      sel.value = map[v] || 'p';
    }

    /* dialogs */
    async function linkDialog() {
      const hasSel = lastRange && !lastRange.collapsed;
      const fields = [{ name: 'url', label: 'Link address', type: 'url', placeholder: 'https://…', required: true }];
      if (!hasSel) fields.push({ name: 'text', label: 'Link text', type: 'text', placeholder: 'Click here' });
      const v = await AdminUI.askForm('Insert link', fields, 'Insert');
      if (!v) return;
      let url = v.url.trim(); if (!/^(https?:|mailto:|\/|#)/i.test(url)) url = 'https://' + url;
      if (hasSel) exec('createLink', url); else insert(`<a href="${esc(url)}">${esc(v.text || url)}</a>&nbsp;`);
    }
    async function insertImageFile(file) {
      AdminUI.toast('Compressing & saving image…');
      const r = await Media.upload(file);
      insert(`<p><img src="${r.url}" alt=""></p>`);
      AdminUI.toast(r.message, r.over);
      return r;
    }
    function imageDialog() {
      const body = document.createElement('div');
      body.innerHTML = `<div class="drop" tabindex="0">Click to choose images, or drop them here<br><small>Saved inside your database. Anything over 250 KB is compressed automatically.</small></div>
        <div class="field"><label>…or paste an image link</label><input type="url" placeholder="https://example.com/photo.jpg" id="imgUrl"></div>
        <div class="field"><label>Description (alt text)</label><input type="text" id="imgAlt" placeholder="What is in the picture?"></div>`;
      const m = AdminUI.modal({ title: 'Insert image', body, actions: [{ label: 'Insert from link', primary: true, onClick: () => {
        const u = body.querySelector('#imgUrl').value.trim(); if (!u) { AdminUI.toast('Paste an image link first', true); return false; }
        insert(`<p><img src="${esc(u)}" alt="${esc(body.querySelector('#imgAlt').value)}"></p>`);
      } }] });
      const drop = body.querySelector('.drop');
      const handle = async (files) => {
        if (!files.length) return; m.close();
        for (const f of files) { try { await insertImageFile(f); } catch (e) { AdminUI.toast(e.message, true); } }
      };
      drop.onclick = async () => handle(await Media.pick(true));
      drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
      drop.ondragleave = () => drop.classList.remove('over');
      drop.ondrop = (e) => { e.preventDefault(); handle([...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'))); };
    }

    function audioDialog() {
      const body = document.createElement('div');
      body.innerHTML = `
        <div class="rec">
          <div class="rec-top"><button type="button" class="btn primary" id="recBtn">● Record</button><span class="rec-time" id="recTime">0:00 / 5:00</span></div>
          <div class="rec-bar"><i id="recFill"></i></div>
          <audio id="recPlay" controls hidden></audio>
          <div class="rec-actions" id="recActs" hidden><button type="button" class="btn primary" id="recUse">Insert recording</button><button type="button" class="btn ghost" id="recRedo">Discard</button></div>
          <small class="muted">Recording stops automatically at 5 minutes. Saved inside your database.</small>
        </div>
        <hr style="border:0;border-top:1px solid var(--line);margin:18px 0">
        <div class="field"><label>Upload an audio file (up to 5 minutes)</label><button type="button" class="btn" id="audFile">Choose audio file…</button></div>
        <div class="field"><label>…or paste an audio link</label><input type="url" id="audUrl" placeholder="https://…/podcast.mp3"><small>Longer audio: host it with the Uploader and paste the link here.</small></div>`;
      const m = AdminUI.modal({ title: 'Insert audio', body, onClose: () => rec && rec.cancel(), actions: [{ label: 'Insert from link', primary: true, onClick: () => {
        const u = body.querySelector('#audUrl').value.trim(); if (!u) { AdminUI.toast('Paste an audio link first', true); return false; }
        insert('<p><audio controls preload="metadata" src="' + esc(u) + '"></audio></p><p><br></p>');
      } }] });
      const $ = (id) => body.querySelector(id);
      let rec = null, result = null;
      const fmt = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
      const place = async (blob, secs) => {
        try { AdminUI.toast('Saving audio…'); const r = await Media.uploadAudio(blob, secs); insert('<p><audio controls preload="metadata" src="' + r.url + '"></audio></p><p><br></p>'); AdminUI.toast(r.message); m.close(); }
        catch (e) { AdminUI.toast(e.message, true); }
      };
      $('#recBtn').onclick = async () => {
        const btn = $('#recBtn');
        if (rec) { result = await rec.stop(); finish(); return; }
        try {
          rec = Media.recorder();
          rec.onTick = (s) => { $('#recTime').textContent = fmt(s) + ' / 5:00'; $('#recFill').style.width = Math.min(100, s / Media.MAX_AUDIO_SECONDS * 100) + '%'; if (s >= Media.MAX_AUDIO_SECONDS) setTimeout(async () => { if (rec) { result = await rec.stop(); finish(); } }, 50); };
          await rec.start(); btn.textContent = '■ Stop'; btn.classList.add('danger'); btn.classList.remove('primary');
        } catch (e) { rec = null; AdminUI.toast(e.name === 'NotAllowedError' ? 'Microphone permission was denied' : e.message, true); }
      };
      function finish() {
        rec = null; const btn = $('#recBtn'); btn.textContent = '● Record'; btn.classList.remove('danger'); btn.classList.add('primary');
        if (!result) return;
        const pl = $('#recPlay'); pl.src = URL.createObjectURL(result.blob); pl.hidden = false; $('#recActs').hidden = false;
      }
      $('#recUse').onclick = () => place(result.blob, result.seconds);
      $('#recRedo').onclick = () => { result = null; $('#recPlay').hidden = true; $('#recActs').hidden = true; $('#recTime').textContent = '0:00 / 5:00'; $('#recFill').style.width = '0'; };
      $('#audFile').onclick = async () => { const f = await Media.pickAudio(); if (f) place(f); };
    }
    async function videoDialog() {
      const v = await AdminUI.askForm('Insert video', [
        { name: 'url', label: 'Video link', type: 'url', required: true, placeholder: 'https://youtu.be/…  or  https://…/video.mp4', hint: 'YouTube, Vimeo, a direct .mp4/.webm file, or any embed link. Use the Uploader to host your own video file.' }
      ], 'Insert');
      if (v) insert(videoHTML(v.url.trim()));
    }
    async function pdfDialog() {
      const v = await AdminUI.askForm('Insert PDF / file', [
        { name: 'url', label: 'PDF link', type: 'url', required: true, placeholder: 'https://…/file.pdf' },
        { name: 'title', label: 'Title shown to readers', type: 'text', placeholder: 'Download the full PDF' },
        { name: 'inline', label: 'Also show the PDF inside the post', type: 'checkbox', value: false }
      ], 'Insert');
      if (!v) return;
      const u = esc(v.url.trim());
      insert(`<p><a class="file-card" href="${u}" target="_blank" rel="noopener">${esc(v.title || 'Open PDF')}</a></p>` + (v.inline ? `<div class="embed pdf" contenteditable="false"><iframe src="${u}" loading="lazy" title="PDF"></iframe></div>` : '') + '<p><br></p>');
    }
    async function tableDialog() {
      const v = await AdminUI.askForm('Insert table', [
        { name: 'rows', label: 'Rows', type: 'number', value: 3 }, { name: 'cols', label: 'Columns', type: 'number', value: 3 },
        { name: 'head', label: 'First row is a header', type: 'checkbox', value: true }
      ], 'Insert');
      if (!v) return;
      const r = Math.min(30, Math.max(1, +v.rows || 3)), c = Math.min(10, Math.max(1, +v.cols || 3));
      let h = '<table><tbody>';
      for (let i = 0; i < r; i += 1) { h += '<tr>' + Array.from({ length: c }, () => (v.head && i === 0 ? '<th><br></th>' : '<td><br></td>')).join('') + '</tr>'; }
      insert(h + '</tbody></table><p><br></p>');
    }

    /* source mode */
    function toggleSource() {
      sourceMode = !sourceMode;
      if (sourceMode) { src.value = getHTML(); src.hidden = false; area.hidden = true; } else { setHTML(src.value); src.hidden = true; area.hidden = false; changed(); }
      buttons.source.el.classList.toggle('on', sourceMode);
      hideCtx();
    }
    src.addEventListener('input', () => { if (opts.onChange) opts.onChange(); });

    /* floating context bar (images + tables) */
    function hideCtx() { if (ctx) { ctx.remove(); ctx = null; } area.querySelectorAll('.sel').forEach((n) => n.classList.remove('sel')); }
    function showCtx(target, items) {
      hideCtx();
      ctx = document.createElement('div'); ctx.className = 'ctx';
      items.forEach(([label, fn]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.onmousedown = (e) => e.preventDefault(); b.onclick = () => { fn(); changed(); if (!document.contains(target) || !area.contains(target)) hideCtx(); }; ctx.appendChild(b); });
      root.appendChild(ctx);
      const rr = root.getBoundingClientRect(), tr = target.getBoundingClientRect();
      ctx.style.top = Math.max(60, tr.top - rr.top - 44) + 'px';
      ctx.style.left = Math.max(8, Math.min(tr.left - rr.left, rr.width - ctx.offsetWidth - 8)) + 'px';
    }
    area.addEventListener('click', (e) => {
      const img = e.target.closest('img'), emb = e.target.closest('.embed'), cell = e.target.closest('td,th');
      if (img) {
        hideCtx(); img.classList.add('sel');
        const w = (p) => () => { img.style.width = p; img.style.height = 'auto'; };
        const al = (l, r) => () => { img.style.display = 'block'; img.style.marginLeft = l; img.style.marginRight = r; };
        showCtx(img, [['S', w('33%')], ['M', w('66%')], ['L', w('100%')], ['Auto', () => { img.style.width = ''; }], ['◧', al('0', 'auto')], ['◫', al('auto', 'auto')], ['◨', al('auto', '0')],
          ['Alt text', async () => { const v = await AdminUI.askForm('Image description', [{ name: 'alt', label: 'Alt text', type: 'text', value: img.getAttribute('alt') || '' }], 'Save'); if (v) img.setAttribute('alt', v.alt); }],
          ['Delete', () => { (img.closest('p') && img.closest('p').children.length === 1 ? img.closest('p') : img).remove(); }]]);
      } else if (emb) {
        hideCtx(); emb.classList.add('sel'); showCtx(emb, [['Delete', () => emb.remove()]]);
      } else if (cell) {
        const table = cell.closest('table'), row = cell.parentElement, idx = [...row.children].indexOf(cell);
        showCtx(table, [
          ['+ Row', () => { const n = row.cloneNode(true); n.querySelectorAll('td,th').forEach((c) => { const d = document.createElement('td'); d.innerHTML = '<br>'; c.replaceWith(d); }); row.after(n); }],
          ['+ Column', () => { table.querySelectorAll('tr').forEach((r) => { const d = document.createElement('td'); d.innerHTML = '<br>'; const ref = r.children[idx]; if (ref) ref.after(d); else r.appendChild(d); }); }],
          ['− Row', () => { if (table.rows.length > 1) row.remove(); }],
          ['− Column', () => { if (row.children.length > 1) table.querySelectorAll('tr').forEach((r) => r.children[idx] && r.children[idx].remove()); }],
          ['Delete table', () => table.remove()]]);
      } else hideCtx();
    });
    area.addEventListener('keydown', (e) => {
      hideCtx();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); linkDialog(); }
      if (e.key === 'Tab') {
        const sc = lastRange && lastRange.startContainer;
        const node = sc && (sc.nodeType === 3 ? sc.parentElement : sc);
        const cell = node && node.closest ? node.closest('td,th') : null;
        if (cell) { e.preventDefault(); const next = e.shiftKey ? cell.previousElementSibling : cell.nextElementSibling; if (next) { const r = document.createRange(); r.selectNodeContents(next); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } }
      }
    });
    area.addEventListener('scroll', hideCtx);

    /* paste / drop */
    area.addEventListener('paste', async (e) => {
      const cd = e.clipboardData; if (!cd) return;
      const files = [...cd.files].filter((f) => f.type.startsWith('image/'));
      if (files.length) { e.preventDefault(); for (const f of files) { try { await insertImageFile(f); } catch (err) { AdminUI.toast(err.message, true); } } return; }
      const html = cd.getData('text/html');
      if (html) { e.preventDefault(); document.execCommand('insertHTML', false, cleanHTML(html)); changed(); }
    });
    area.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
    area.addEventListener('drop', async (e) => {
      const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'));
      if (!files.length) return;
      e.preventDefault();
      if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(e.clientX, e.clientY); if (r) lastRange = r; }
      for (const f of files) { try { await insertImageFile(f); } catch (err) { AdminUI.toast(err.message, true); } }
    });

    /* content */
    function changed() {
      const t = area.innerText.trim(); const words = (t.match(/[\p{L}\p{N}]+/gu) || []).length;
      wc.textContent = words + (words === 1 ? ' word' : ' words');
      if (opts.onChange) opts.onChange();
    }
    area.addEventListener('input', changed);
    function getHTML() {
      if (sourceMode) return src.value.trim();
      const c = area.cloneNode(true);
      c.querySelectorAll('.sel').forEach((n) => { n.classList.remove('sel'); if (!n.getAttribute('class')) n.removeAttribute('class'); });
      c.querySelectorAll('[contenteditable]').forEach((n) => n.removeAttribute('contenteditable'));
      const html = c.innerHTML.replace(/<p><br><\/p>\s*$/g, '').trim();
      return /<(img|iframe|video|hr|table)\b/i.test(html) || c.innerText.trim() ? html : '';
    }
    function setHTML(html) { area.innerHTML = html || ''; area.querySelectorAll('.embed').forEach((n) => n.setAttribute('contenteditable', 'false')); lastRange = null; hideCtx(); changed(); }

    return { getHTML, setHTML, focus: () => area.focus(), el: root };
  }
  return { create };
})();
