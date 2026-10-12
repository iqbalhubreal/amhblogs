/* Drawing pad — pen, eraser, line / rectangle / ellipse, colours, undo/redo, backgrounds. */
window.DrawPad = (function () {
  'use strict';
  const W = 1200, H = 800;
  const COLORS = ['#1d1b17', '#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#2980b9', '#8e44ad', '#ffffff'];
  const BGS = [['White', '#ffffff'], ['Cream', '#faf4e6'], ['Dark', '#1d1b17'], ['None', null]];

  function open({ onInsert }) {
    const body = document.createElement('div');
    body.className = 'dp';
    body.innerHTML = `
      <div class="dp-tools">
        <div class="dp-group" data-g="tool"></div>
        <div class="dp-group" data-g="colors"></div>
        <div class="dp-group"><span class="muted" style="padding:0 6px;font-size:.8rem">Size</span><input type="range" min="1" max="60" value="5" id="dpSize"><span id="dpSizeN" style="min-width:24px;font-size:.8rem">5</span></div>
        <div class="dp-group" data-g="bg"></div>
        <div class="dp-group"><button type="button" data-a="undo">Undo</button><button type="button" data-a="redo">Redo</button><button type="button" data-a="clear">Clear</button></div>
      </div>
      <div class="dp-wrap" id="dpWrap"><canvas width="${W}" height="${H}"></canvas></div>`;
    const m = AdminUI.modal({ title: 'Drawing pad', body, wide: true, actions: [
      { label: 'Download PNG', onClick: () => { exportBlob().then((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'drawing.png'; a.click(); }); return false; } },
      { label: 'Insert into post', primary: true, onClick: async (btn) => { btn.disabled = true; try { await onInsert(await exportBlob()); } catch (e) { AdminUI.toast(e.message, true); btn.disabled = false; return false; } } }
    ] });

    const canvas = body.querySelector('canvas'), ctx = canvas.getContext('2d'), wrap = body.querySelector('#dpWrap');
    let tool = 'pen', color = COLORS[0], size = 5, bg = '#ffffff';
    const undo = [], redo = [];
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    /* toolbar */
    const mk = (g, items, cur, set) => {
      const el = body.querySelector(`[data-g="${g}"]`);
      el.innerHTML = '';
      items.forEach(([label, val]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.className = val === cur ? 'on' : ''; b.onclick = () => { set(val); [...el.children].forEach((c) => c.classList.toggle('on', c === b)); }; el.appendChild(b); });
    };
    mk('tool', [['Pen', 'pen'], ['Eraser', 'eraser'], ['Line', 'line'], ['Rect', 'rect'], ['Ellipse', 'ellipse']], tool, (v) => { tool = v; });
    mk('bg', BGS.map(([l, v]) => [l, v]), bg, (v) => { bg = v; paintBg(); });
    const cg = body.querySelector('[data-g="colors"]');
    COLORS.forEach((c) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'dp-sw' + (c === color ? ' on' : ''); b.style.background = c; b.setAttribute('aria-label', c); b.onclick = () => { color = c; sync(); }; cg.appendChild(b); });
    const pick = document.createElement('input'); pick.type = 'color'; pick.value = color; pick.oninput = () => { color = pick.value; sync(); }; cg.appendChild(pick);
    function sync() { [...cg.querySelectorAll('.dp-sw')].forEach((b) => b.classList.toggle('on', b.getAttribute('aria-label') === color)); pick.value = /^#[0-9a-f]{6}$/i.test(color) ? color : '#000000'; }
    const sizeEl = body.querySelector('#dpSize'), sizeN = body.querySelector('#dpSizeN');
    sizeEl.oninput = () => { size = +sizeEl.value; sizeN.textContent = size; };

    function paintBg() { wrap.style.backgroundColor = bg || ''; wrap.classList.toggle('checker', !bg); }
    paintBg();

    /* history */
    const snap = () => ctx.getImageData(0, 0, W, H);
    const push = () => { undo.push(snap()); if (undo.length > 12) undo.shift(); redo.length = 0; };
    body.querySelector('[data-a="undo"]').onclick = () => { if (!undo.length) return; redo.push(snap()); ctx.putImageData(undo.pop(), 0, 0); };
    body.querySelector('[data-a="redo"]').onclick = () => { if (!redo.length) return; undo.push(snap()); ctx.putImageData(redo.pop(), 0, 0); };
    body.querySelector('[data-a="clear"]').onclick = () => { push(); ctx.clearRect(0, 0, W, H); };

    /* drawing */
    const pt = (e) => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) }; };
    const style = (e) => {
      ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.strokeStyle = ctx.fillStyle = color;
      const p = e && e.pointerType === 'pen' && e.pressure ? 0.4 + e.pressure * 1.2 : 1;
      ctx.lineWidth = Math.max(1, size * p) * (tool === 'eraser' ? 2 : 1);
    };
    let drawing = false, p0, mid0, start, base;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      canvas.setPointerCapture(e.pointerId); push(); drawing = true;
      start = p0 = pt(e); mid0 = p0; style(e);
      if (tool === 'pen' || tool === 'eraser') { ctx.beginPath(); ctx.arc(p0.x, p0.y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); } else { base = snap(); }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drawing) return;
      const p = pt(e); style(e);
      if (tool === 'pen' || tool === 'eraser') {
        const mid = { x: (p0.x + p.x) / 2, y: (p0.y + p.y) / 2 };
        ctx.beginPath(); ctx.moveTo(mid0.x, mid0.y); ctx.quadraticCurveTo(p0.x, p0.y, mid.x, mid.y); ctx.stroke();
        p0 = p; mid0 = mid;
      } else {
        ctx.putImageData(base, 0, 0); ctx.beginPath();
        if (tool === 'line') { ctx.moveTo(start.x, start.y); ctx.lineTo(p.x, p.y); }
        if (tool === 'rect') ctx.rect(start.x, start.y, p.x - start.x, p.y - start.y);
        if (tool === 'ellipse') ctx.ellipse((start.x + p.x) / 2, (start.y + p.y) / 2, Math.abs(p.x - start.x) / 2, Math.abs(p.y - start.y) / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
    const end = () => { drawing = false; };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
    m.el.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); body.querySelector('[data-a="undo"]').click(); } });

    function exportBlob() {
      const out = document.createElement('canvas'); out.width = W; out.height = H;
      const x = out.getContext('2d');
      if (bg) { x.fillStyle = bg; x.fillRect(0, 0, W, H); }
      x.drawImage(canvas, 0, 0);
      return new Promise((res, rej) => out.toBlob((b) => (b ? res(b) : rej(new Error('Could not export the drawing'))), 'image/png'));
    }
  }
  return { open };
})();
