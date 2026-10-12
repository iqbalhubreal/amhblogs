/* Run as the Netlify "Build command":   node scripts/make-site.js admin   |   node scripts/make-site.js public
   Writes public/_redirects and public/_headers so ONE repo can be deployed as two separate sites. */
const fs = require('fs'), path = require('path');
const mode = process.argv[2];
if (!['admin', 'public'].includes(mode)) { console.error('Usage: node scripts/make-site.js admin|public'); process.exit(1); }
const out = path.join(__dirname, '..', 'public');
let redirects, headers;
if (mode === 'admin') {
  redirects = '/  /admin/index.html  200!\n';                       // admin site opens straight on the panel
  headers = '/*\n  X-Robots-Tag: noindex, nofollow\n  Cache-Control: no-store\n';
} else {
  redirects = ['/admin  /404.html  404!', '/admin/*  /404.html  404!', '/api/admin/*  /404.html  404!', '/api/login  /404.html  404!', '/api/logout  /404.html  404!', '/api/me  /404.html  404!'].join('\n') + '\n';
  headers = '';
}
fs.writeFileSync(path.join(out, '_redirects'), redirects);
if (headers) fs.writeFileSync(path.join(out, '_headers'), headers); else fs.rmSync(path.join(out, '_headers'), { force: true });
console.log(`Prepared the ${mode} site.`);
