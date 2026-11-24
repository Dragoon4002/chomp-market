// Copy the static export (EXPORT=1 next build) into ../build for the portal.
// Next's JS/CSS live in build/assets/ (not _next/): the market's Next dev server blocks any "/_next" request
// from the portal's sandboxed iframe (opaque origin). Keeps market/ untouched.
import fs from 'node:fs';
import path from 'node:path';

fs.rmSync('../build', { recursive: true, force: true });
fs.cpSync('out', '../build', { recursive: true });
fs.renameSync('../build/_next', '../build/assets');
for (const f of fs.readdirSync('../build', { recursive: true })) {
  const p = path.join('../build', f);
  if (!/\.(html|js|css|txt)$/.test(p)) continue;
  const s = fs.readFileSync(p, 'utf8');
  if (s.includes('/_next/')) fs.writeFileSync(p, s.replaceAll('/_next/', '/assets/'));
}
