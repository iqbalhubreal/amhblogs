/* Image compression + upload to Turso.
   Rule: images are shrunk in the browser to < 250 KB. If that is impossible we upload the smallest
   version we could make. Videos / PDFs / big files are NOT stored in Turso — use the Uploader and paste the link. */
window.Media = (function () {
  'use strict';
  const TARGET = 250 * 1024;
  const OK = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  const WEBP = (() => { try { const c = document.createElement('canvas'); c.width = c.height = 1; return c.toDataURL('image/webp').indexOf('data:image/webp') === 0; } catch (e) { return false; } })();

  const toBlob = (c, mime, q) => new Promise((res) => c.toBlob(res, mime, q));
  const readDataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
  async function decode(file) {
    if ('createImageBitmap' in window) { try { return await createImageBitmap(file); } catch (e) { /* fall back */ } }
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not read this image')); i.src = URL.createObjectURL(file); });
  }
  const kb = (n) => Math.round(n / 1024) + ' KB';

  async function compress(file) {
    if (!file.type.startsWith('image/')) throw new Error('Please choose an image file (PNG, JPG, WebP or GIF)');
    if (file.type === 'image/svg+xml') throw new Error('SVG is not supported here — export it as PNG first');
    if (OK.includes(file.type) && file.size <= TARGET) return { blob: file, original: file.size };

    const img = await decode(file);
    const w0 = img.width || img.naturalWidth, h0 = img.height || img.naturalHeight;
    const alpha = file.type !== 'image/jpeg';
    const mime = WEBP ? 'image/webp' : (alpha ? 'image/png' : 'image/jpeg');
    let scale = Math.min(1, 1800 / Math.max(w0, h0));
    let best = null;
    for (let step = 0; step < 18; step += 1) {
      const w = Math.max(1, Math.round(w0 * scale)), h = Math.max(1, Math.round(h0 * scale));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d');
      if (mime === 'image/jpeg') { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); }
      x.imageSmoothingQuality = 'high';
      x.drawImage(img, 0, 0, w, h);
      for (const q of (mime === 'image/png' ? [undefined] : [0.86, 0.76, 0.66, 0.56, 0.46])) {
        const b = await toBlob(c, mime, q);
        if (!b) continue;
        if (!best || b.size < best.size) best = b;
        if (b.size <= TARGET) return { blob: b, original: file.size, gifFlattened: file.type === 'image/gif' };
      }
      if (Math.min(w, h) <= 200) break;
      scale *= 0.82;
    }
    if (!best) throw new Error('Could not compress this image');
    return { blob: best, original: file.size, over: true, gifFlattened: file.type === 'image/gif' };
  }

  /** compress + save in Turso → { url, size, message } */
  async function upload(file) {
    const c = await compress(file);
    const data = await readDataUrl(c.blob);
    const r = await fetch('/api/admin/media', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Upload failed');
    let message = c.original > c.blob.size ? `Image saved: ${kb(c.original)} → ${kb(d.size)}` : `Image saved (${kb(d.size)})`;
    if (c.over) message += ' — could not get under 250 KB, saved the smallest version possible';
    if (c.gifFlattened) message += ' (animation removed)';
    return { url: d.url, size: d.size, message, over: !!c.over };
  }

  /** open the file picker */
  function pick(multiple) {
    return new Promise((res) => {
      const i = document.createElement('input');
      i.type = 'file'; i.accept = 'image/png,image/jpeg,image/webp,image/gif'; i.multiple = !!multiple;
      i.onchange = () => res([...i.files]);
      i.click();
    });
  }

  /* ── audio: max 5 minutes, stored in Turso (a voice recording made here is about 1 MB per 5 min) ── */
  const MAX_AUDIO_SECONDS = 300, MAX_AUDIO_BYTES = 3.5 * 1024 * 1024;
  const audioDuration = (blob) => new Promise((res) => {
    const a = new Audio(); a.preload = 'metadata'; const u = URL.createObjectURL(blob);
    a.onloadedmetadata = () => { URL.revokeObjectURL(u); res(isFinite(a.duration) ? a.duration : 0); };
    a.onerror = () => { URL.revokeObjectURL(u); res(0); };
    a.src = u;
  });
  async function uploadAudio(blob, knownSeconds) {
    const mime = (blob.type || 'audio/webm').split(';')[0];
    const secs = knownSeconds || await audioDuration(blob);
    if (secs && secs > MAX_AUDIO_SECONDS + 1) throw new Error('Audio is longer than 5 minutes. Use the Uploader and paste the link instead.');
    if (blob.size > MAX_AUDIO_BYTES) throw new Error('Audio file is over 3.5 MB. Use the Uploader and paste the link instead.');
    const data = await readDataUrl(new Blob([blob], { type: mime }));
    const r = await fetch('/api/admin/media', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Upload failed');
    return { url: d.url, size: d.size, message: 'Audio saved (' + kb(d.size) + ')' };
  }
  function pickAudio() {
    return new Promise((res) => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'audio/*'; i.onchange = () => res(i.files[0] || null); i.click(); });
  }
  /** microphone recorder; hard-stops at 5:00 */
  function recorder() {
    let rec, chunks = [], stream, timer, t0, tick = () => {}, done, stopping = false;
    const pickType = () => ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'].find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
    const api = {
      set onTick(f) { tick = f; },
      async start() {
        if (!navigator.mediaDevices || !window.MediaRecorder) throw new Error('Recording is not supported in this browser');
        stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
        const type = pickType();
        rec = new MediaRecorder(stream, Object.assign(type ? { mimeType: type } : {}, { audioBitsPerSecond: 32000 }));
        chunks = [];
        rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
        done = new Promise((res) => { rec.onstop = () => { stream.getTracks().forEach((t) => t.stop()); clearInterval(timer); res({ blob: new Blob(chunks, { type: rec.mimeType || type || 'audio/webm' }), seconds: Math.round((Date.now() - t0) / 1000) }); }; });
        rec.start(1000); t0 = Date.now();
        timer = setInterval(() => { const s = (Date.now() - t0) / 1000; tick(s); if (s >= MAX_AUDIO_SECONDS) api.stop(); }, 250);
      },
      stop() { if (rec && rec.state !== 'inactive' && !stopping) { stopping = true; rec.stop(); } return done; },
      cancel() { if (rec && rec.state !== 'inactive') { rec.onstop = null; rec.stop(); } if (stream) stream.getTracks().forEach((t) => t.stop()); clearInterval(timer); }
    };
    return api;
  }
  return { compress, upload, pick, uploadAudio, pickAudio, recorder, TARGET, MAX_AUDIO_SECONDS, kb };
})();
