// Pose gallery for cutout heroes: serves client TS (types stripped) + public assets. node serve.mjs, open /?h=<hero>
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { stripTypeScriptTypes } from 'node:module';
const C = path.resolve(import.meta.dirname, '../../../client'), HTML = path.join(import.meta.dirname, 'gallery.html');
http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  try {
    if (u === '/') { r.setHeader('content-type', 'text/html'); return r.end(fs.readFileSync(HTML)); }
    if (u.endsWith('.ts')) { r.setHeader('content-type', 'text/javascript'); return r.end(stripTypeScriptTypes(fs.readFileSync(C + u, 'utf8'))); }
    r.setHeader('content-type', u.endsWith('.png') ? 'image/png' : 'application/json'); r.end(fs.readFileSync(C + '/public' + u));
  } catch (e) { r.statusCode = 404; r.end(String(e)); }
}).listen(+(process.env.PORT || 3124), () => console.log('http://localhost:' + (process.env.PORT || 3124) + '/?h=lortor'));
