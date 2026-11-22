// Emits keyfall art-src/*.svg (4x art, cartoon cel style) — run: node gen.mjs <art-src dir>
import fs from 'fs';
const OUT = process.argv[2];
const OL = '#2a1a35';
let uid = 0;
const id = (p) => `${p}${uid++}`;
const svg = (w, h, body, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n<defs>${defs}</defs>\n${body}\n</svg>\n`;
const files = {};
const put = (n, s) => (files[n] = s);

// outlined union of shapes + optional cel shading clipped to it
function blob(shapes, fill, { sw = 3, shade = '', hi = '', defsOut } = {}) {
  const c = id('c');
  defsOut.push(`<clipPath id="${c}">${shapes}</clipPath>`);
  return `<g fill="${OL}" stroke="${OL}" stroke-width="${sw * 2}" stroke-linejoin="round">${shapes}</g>` +
    `<g fill="${fill}">${shapes}</g>` +
    (shade || hi ? `<g clip-path="url(#${c})">${shade}${hi}</g>` : '');
}
const D = () => { const d = []; return d; };

// palette
const G = { base: '#86b34c', dk: '#557f34', lt: '#c3e070', deep: '#3d5e2b' }; // military green
const CREAM = '#f4e2a6', CREAMDK = '#d9b977';
const RED = '#e8463a', REDDK = '#a52a31';
const GOLD = '#ffc53a', GOLDDK = '#d4861c';
const GLASS = '#8be8ff', GLASSDK = '#3d97cf';
const STEEL = { base: '#5f8ad0', dk: '#3c5a9a', lt: '#a7c8f5', deep: '#2b3f73' };
const PINK = { base: '#ff7fb5', dk: '#cc4a8d', lt: '#ffc6df' };
const CYAN = '#3ff0ff';

// ---------- bomber 120x52, faces right, pivot (0.5,0.615) => body centre y=20
{
  const d = D();
  const fus = `<path d="M10,19 C10,14 14,11 21,11 L90,10 C104,10 113,14 116,19 C117,24 111,28 99,29 L21,28 C14,28 10,24 10,19 Z"/>`;
  const fin = `<path d="M13,17 L6,4 C5,1 9,0 12,2 L31,15 Z"/>`;
  const stab = `<path d="M20,22 L5,31 C4,33 7,34 9,33 L30,25 Z"/>`;
  const wing = `<path d="M55,21 L42,42 C41,45 45,46 48,44 L80,23 Z"/>`;
  const nac = `<ellipse cx="62" cy="34" rx="11" ry="5"/>`;
  put('bomber', svg(120, 52,
    blob(stab, G.dk, { defsOut: d }) +
    blob(fin, G.base, { defsOut: d, shade: `<rect x="0" y="10" width="40" height="20" fill="${G.dk}"/>`, hi: `<path d="M8,4 L14,14" stroke="${G.lt}" stroke-width="3"/>` }) +
    blob(fus, G.base, { defsOut: d,
      shade: `<rect x="0" y="22" width="120" height="10" fill="${CREAM}"/><rect x="0" y="26" width="120" height="6" fill="${CREAMDK}"/>`,
      hi: `<path d="M18,14 L88,13" stroke="${G.lt}" stroke-width="3" stroke-linecap="round"/><path d="M44,12 L44,22 M80,11 L80,22" stroke="${G.dk}" stroke-width="1.5" opacity=".7"/>` }) +
    `<path d="M92,12 C101,11 108,13 112,17 L95,18 Z" fill="${GLASS}" stroke="${OL}" stroke-width="2.5" stroke-linejoin="round"/><path d="M97,13 L104,13.5" stroke="#fff" stroke-width="2" stroke-linecap="round"/>` +
    `<path d="M112,16 C116,18 117,22 113,25 L110,20 Z" fill="${RED}" stroke="${OL}" stroke-width="2" stroke-linejoin="round"/>` +
    `<rect x="32" y="26" width="26" height="6" rx="2" fill="${RED}" stroke="${OL}" stroke-width="2.5"/><path d="M45,26 V32" stroke="${REDDK}" stroke-width="2"/>` +
    `<circle cx="27" cy="18" r="5" fill="${CREAM}" stroke="${OL}" stroke-width="2"/><circle cx="27" cy="18" r="2.5" fill="${RED}"/>` +
    blob(wing, G.base, { defsOut: d, shade: `<path d="M40,38 L80,22 L80,50 L40,50Z" fill="${G.dk}"/>`, hi: `<path d="M56,23 L76,23" stroke="${G.lt}" stroke-width="2.5"/>` }) +
    blob(nac, '#6f7f8f', { sw: 2.5, defsOut: d, shade: `<rect x="50" y="35" width="30" height="6" fill="#4b5766"/>`, hi: `<rect x="55" y="30" width="12" height="2" fill="#b5c2cf"/>` }) +
    `<ellipse cx="74" cy="34" rx="2.5" ry="10" fill="#fff" opacity=".45"/><circle cx="73" cy="34" r="2.5" fill="${GOLD}" stroke="${OL}" stroke-width="1.5"/>`,
    d.join('')));
}

// ---------- chopper 124x60 x3, faces right, pivot (0.484,0.467) => (60,32)
{
  for (let f = 0; f < 3; f++) {
    uid = 1000; // identical ids/body across frames
    const d = D();
    const boom = `<path d="M56,34 L14,34 C10,34 9,38 12,40 L58,46 Z"/>`;
    const tailfin = `<path d="M18,36 L8,20 C7,17 11,16 13,18 L26,35 Z"/>`;
    const cab = `<path d="M50,36 C50,28 58,24 70,24 L94,24 C106,24 116,32 118,42 C119,48 114,51 106,51 L58,51 C53,51 50,46 50,40 Z"/>`;
    const skid = `<path d="M60,51 L58,56 M100,51 L102,56" stroke="${OL}" stroke-width="3"/><path d="M52,56 L110,56 C113,56 114,53 112,52" fill="none" stroke="${OL}" stroke-width="4" stroke-linecap="round"/><path d="M53,56 L109,56" stroke="#8a93a3" stroke-width="1.5" stroke-linecap="round"/>`;
    const mast = `<rect x="76" y="14" width="8" height="11" rx="1.5" fill="#6f7f8f" stroke="${OL}" stroke-width="2.5"/>`;
    // main rotor: 2 blades on a flat ellipse, angle varies per frame
    const hx = 80, hy = 12, rx = 44, ry = 4.5, th = (f * 60 * Math.PI) / 180;
    let rotor = `<ellipse cx="${hx}" cy="${hy}" rx="${rx}" ry="${ry}" fill="#fff" opacity=".28"/>`;
    for (const a of [th, th + Math.PI]) {
      const x = hx + rx * Math.cos(a), y = hy + ry * Math.sin(a);
      rotor += `<path d="M${hx},${hy} L${x.toFixed(1)},${y.toFixed(1)}" stroke="${OL}" stroke-width="6" stroke-linecap="round"/><path d="M${hx},${hy} L${x.toFixed(1)},${y.toFixed(1)}" stroke="#5b6475" stroke-width="2.5" stroke-linecap="round"/>`;
    }
    rotor += `<circle cx="${hx}" cy="${hy}" r="4" fill="${GOLD}" stroke="${OL}" stroke-width="2"/>`;
    const tailRotor = `<circle cx="10" cy="24" r="8" fill="#fff" opacity=".3" stroke="${OL}" stroke-opacity=".5" stroke-width="1.5"/><circle cx="10" cy="24" r="2.5" fill="${RED}" stroke="${OL}" stroke-width="1.5"/>`;
    put(`chopper_${f}`, svg(124, 60,
      blob(boom, G.base, { defsOut: d, shade: `<rect x="0" y="40" width="70" height="10" fill="${G.dk}"/>`, hi: `<path d="M16,36 L54,36" stroke="${G.lt}" stroke-width="2"/>` }) +
      blob(tailfin, G.base, { defsOut: d, shade: `<rect x="0" y="30" width="30" height="10" fill="${G.dk}"/>` }) +
      tailRotor + skid + mast +
      blob(cab, G.base, { defsOut: d,
        shade: `<rect x="40" y="44" width="90" height="10" fill="${CREAM}"/><rect x="40" y="48" width="90" height="6" fill="${CREAMDK}"/>`,
        hi: `<path d="M60,28 C64,26 72,26 86,26" stroke="${G.lt}" stroke-width="3" fill="none" stroke-linecap="round"/><rect x="64" y="34" width="5" height="10" fill="${RED}"/><rect x="70" y="34" width="2" height="10" fill="${RED}"/>` }) +
      `<path d="M96,26 C106,27 113,33 115,40 L96,40 Z" fill="${GLASS}" stroke="${OL}" stroke-width="2.5" stroke-linejoin="round"/><path d="M100,29 C104,30 107,32 109,35" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M98,40 L114,40 L114,44 L98,44Z" fill="${GLASSDK}" opacity=".0"/>` +
      `<rect x="100" y="47" width="18" height="4" rx="2" fill="#4b5766" stroke="${OL}" stroke-width="2"/>` +
      `<circle cx="80" cy="38" r="4.5" fill="${CREAM}" stroke="${OL}" stroke-width="2"/><circle cx="80" cy="38" r="2" fill="${RED}"/>` +
      rotor,
      d.join('')));
  }
  uid = 2000;
}

// ---------- balloon 88x124, pivot centre
{
  const d = D();
  const env = `<path d="M44,4 C68,4 84,22 84,44 C84,62 70,76 58,86 L30,86 C18,76 4,62 4,44 C4,22 20,4 44,4 Z"/>`;
  const gores = [-1, 1].map((s) => `<path d="M44,4 C${44 + s * 22},14 ${44 + s * 24},60 ${44 + s * 9},86 L${44 + s * 4},86 C${44 + s * 12},60 ${44 + s * 12},16 44,4Z" fill="${CREAM}"/>`).join('') +
    `<path d="M44,4 C${44 - 36},14 ${44 - 38},62 30,86 L22,86 C4,70 0,20 44,4Z" fill="${PINK.base}"/>`;
  put('balloon', svg(88, 124,
    `<path d="M32,86 L30,104 M56,86 L58,104 M44,86 L44,104" stroke="${OL}" stroke-width="2.5"/>` +
    blob(env, PINK.base, { defsOut: d, sw: 3.5,
      shade: gores + `<path d="M84,30 C86,60 70,84 58,90 L88,90 L88,30Z" fill="${PINK.dk}" opacity=".55"/>`,
      hi: `<path d="M22,22 C26,14 34,10 40,10" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" opacity=".8"/>` }) +
    `<rect x="26" y="80" width="36" height="8" rx="3" fill="${GOLD}" stroke="${OL}" stroke-width="3"/><rect x="28" y="81" width="32" height="2" fill="#fff3b0"/>` +
    blob(`<path d="M24,104 L64,104 L60,121 L28,121 Z"/>`, '#c9783e', { defsOut: d, sw: 3,
      shade: `<path d="M24,112 H64 M24,117 H64" stroke="#8f4e2a" stroke-width="2"/><path d="M36,104 V122 M44,104 V122 M52,104 V122" stroke="#8f4e2a" stroke-width="1.5"/>`,
      hi: `<rect x="22" y="104" width="44" height="3" fill="#eaa56a"/>` }),
    d.join('')));
}

// ---------- bomb 64x128 (parachute top, nose down), pivot centre
{
  const d = D();
  const canopy = `<path d="M4,30 C4,12 18,3 32,3 C46,3 60,12 60,30 C56,26 51,26 47,31 C43,26 37,26 32,31 C27,26 21,26 17,31 C13,26 8,26 4,30 Z"/>`;
  const body = `<path d="M32,56 C46,56 50,74 50,90 C50,106 42,118 32,124 C22,118 14,106 14,90 C14,74 18,56 32,56 Z"/>`;
  const fins = `<path d="M20,50 L32,62 L44,50 L46,64 L18,64 Z"/>`;
  put('bomb', svg(64, 128,
    `<path d="M6,30 L28,52 M17,31 L30,52 M32,31 L32,52 M47,31 L34,52 M58,30 L36,52" stroke="${OL}" stroke-width="2" fill="none"/>` +
    blob(canopy, PINK.base, { defsOut: d, sw: 3,
      shade: `<path d="M32,0 C26,10 26,22 32,32 L38,32 C42,22 40,10 32,0Z" fill="${CREAM}"/><path d="M10,0 C6,14 8,24 12,32 L4,32 L0,0Z" fill="${CREAM}"/><path d="M54,0 C58,14 56,24 52,32 L64,32 L64,0Z" fill="${CREAM}"/><rect x="0" y="22" width="64" height="12" fill="${PINK.dk}" opacity=".45"/>`,
      hi: `<path d="M14,13 C18,8 24,6 28,6" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".85"/>` }) +
    blob(fins, '#6f7f8f', { defsOut: d, shade: `<rect x="32" y="48" width="20" height="20" fill="#4b5766"/>` }) +
    blob(body, G.base, { defsOut: d, sw: 3.5,
      shade: `<path d="M34,56 C48,64 52,96 36,124 L64,124 L64,56Z" fill="${G.dk}"/><rect x="0" y="70" width="64" height="7" fill="${GOLD}"/><rect x="40" y="70" width="24" height="7" fill="${GOLDDK}"/><path d="M0,108 L64,108 L64,128 L0,128Z" fill="${RED}"/><path d="M38,108 L64,108 L64,128 L36,128Z" fill="${REDDK}"/>`,
      hi: `<path d="M22,82 C21,92 22,100 25,106" stroke="${G.lt}" stroke-width="4" fill="none" stroke-linecap="round"/>` }),
    d.join('')));
}

// ---------- fireball 32x32
put('fireball', svg(32, 32,
  `<circle cx="16" cy="16" r="13.5" fill="${REDDK}" stroke="${OL}" stroke-width="2.5"/><circle cx="16" cy="16" r="11" fill="#ff7a2a"/><circle cx="15" cy="15" r="7.5" fill="#ffd23f"/><circle cx="14" cy="14" r="4" fill="#fff8d0"/>`));

// ---------- explosions (puffy lobed clouds)
function lobes(list, fill, sw = 3) {
  const s = list.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('');
  return `<g fill="${OL}" stroke="${OL}" stroke-width="${sw * 2}">${s}</g><g fill="${fill}">${s}</g>`;
}
const ring = (cx, cy, R, n, r, rot = 0) => Array.from({ length: n }, (_, i) => {
  const a = rot + (i / n) * Math.PI * 2; return [+(cx + R * Math.cos(a)).toFixed(1), +(cy + R * Math.sin(a)).toFixed(1), r];
});
{
  // 0: 76x76 bright flash
  const c = 38;
  put('explosion_0', svg(76, 76,
    lobes([...ring(c, c, 22, 8, 12), [c, c, 26]], '#ffb02e') +
    `<g fill="#ffe14d">${ring(c, c, 14, 8, 10, 0.3).map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}<circle cx="${c}" cy="${c}" r="18"/></g>` +
    `<circle cx="${c - 2}" cy="${c - 2}" r="13" fill="#fffbe0"/>` +
    ring(c, c, 33, 8, 0, 0.4).map(([x, y]) => `<path d="M${(c + (x - c) * 0.82).toFixed(1)},${(c + (y - c) * 0.82).toFixed(1)} L${x},${y}" stroke="#fff3a0" stroke-width="3" stroke-linecap="round"/>`).join('')));
  // 1: 84x84 full fireball
  const e = 42;
  put('explosion_1', svg(84, 84,
    lobes([...ring(e, e, 26, 9, 13, 0.2), [e, e, 30]], '#ff7a2a') +
    `<g fill="#ffb02e">${ring(e - 2, e - 3, 18, 8, 11).map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}<circle cx="${e - 2}" cy="${e - 3}" r="20"/></g>` +
    `<g fill="#ffe14d"><circle cx="${e - 4}" cy="${e - 6}" r="14"/><circle cx="${e + 6}" cy="${e - 2}" r="8"/></g><circle cx="${e - 7}" cy="${e - 9}" r="6" fill="#fffbe0"/>` +
    `<g fill="${REDDK}">${ring(e, e, 30, 9, 4, 0.55).filter((_, i) => i % 2 === 0).map(([x, y, r]) => `<circle cx="${x}" cy="${y + 3}" r="${r}"/>`).join('')}</g>`));
  // 2: 84x84 expanding, darker, smoke creeping
  put('explosion_2', svg(84, 84,
    lobes([...ring(e, e, 28, 10, 12.5, 0.1), [e, e, 28]], '#e0533a') +
    `<g fill="#6a4a63">${ring(e, e, 28, 10, 10, 0.1).filter((_, i) => i % 3 !== 1).map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>` +
    `<g fill="#ff8a2a"><circle cx="${e - 2}" cy="${e - 2}" r="18"/>${ring(e - 2, e - 2, 14, 6, 8, 0.5).map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>` +
    `<circle cx="${e - 4}" cy="${e - 5}" r="10" fill="#ffc83a"/><circle cx="${e - 6}" cy="${e - 7}" r="4" fill="#fff3b0"/>` +
    `<g fill="#8d6a80">${ring(e, e, 28, 10, 4, 0.1).filter((_, i) => i % 3 !== 1).map(([x, y, r]) => `<circle cx="${x - 3}" cy="${y - 3}" r="${r}"/>`).join('')}</g>`));
  // 3: 92x88 dispersing smoke + embers
  const cx = 46, cy = 44;
  const puffs = ring(cx, cy, 30, 7, 10, 0.25);
  put('explosion_3', svg(92, 88,
    puffs.map(([x, y, r]) => lobes([[x, y, r], [x + 5, y + 3, r * 0.7]], '#6a4a63', 2.5)).join('') +
    puffs.map(([x, y, r]) => `<circle cx="${x - 3}" cy="${y - 3}" r="${r * 0.45}" fill="#8d6a80"/>`).join('') +
    lobes([[cx, cy, 10], [cx + 6, cy + 4, 7]], '#6a4a63', 2.5) + `<circle cx="${cx}" cy="${cy}" r="5" fill="#e0533a"/>` +
    ring(cx, cy, 19, 6, 2.6, 0.75).map(([x, y, r], i) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${i % 2 ? '#ffc83a' : '#ff7a2a'}" stroke="${OL}" stroke-width="1.5"/>`).join('')));
}

// ---------- clouds (no outline, soft cel shading); flat bottoms on the image bottom edge
function cloud(w, h, lumps) {
  const s = lumps.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('') + `<rect x="${lumps[0][0]}" y="${h - 22}" width="${lumps.at(-1)[0] - lumps[0][0]}" height="22" rx="6"/>`;
  const c = id('k');
  return svg(w, h,
    `<g fill="#b4bfe6" stroke="#b4bfe6" stroke-width="4">${s}</g><g fill="#ffffff">${s}</g><g clip-path="url(#${c})"><path d="M0,${h - 11} C${w * 0.3},${h - 15} ${w * 0.6},${h - 8} ${w},${h - 13} V${h} H0Z" fill="#dfe5f8"/><rect x="0" y="${h - 4}" width="${w}" height="4" fill="#c6d0f0"/></g>`,
    `<clipPath id="${c}">${s}</clipPath>`);
}
put('cloud_0', cloud(112, 44, [[16, 32, 12], [36, 24, 16], [60, 20, 18], [82, 26, 15], [98, 33, 11]]));
put('cloud_1', cloud(108, 48, [[14, 36, 11], [30, 26, 15], [54, 30, 14], [72, 18, 17], [94, 34, 12]]));
put('cloud_2', cloud(112, 48, [[14, 36, 12], [34, 24, 17], [58, 28, 15], [80, 22, 16], [99, 35, 11]]));
put('cloud_3', cloud(116, 52, [[14, 40, 12], [30, 30, 15], [50, 34, 13], [70, 22, 19], [95, 34, 15], [104, 40, 10]]));

// ---------- sun 192x192 / moon 96x96 (pivot bottom-centre, disc fills)
put('sun', svg(192, 192,
  `<circle cx="96" cy="96" r="92" fill="url(#sg)" stroke="#ffb02e" stroke-width="7"/><circle cx="96" cy="96" r="80" fill="none" stroke="#fff6cf" stroke-width="5" opacity=".7"/>`,
  `<radialGradient id="sg" cx=".42" cy=".4" r=".65"><stop offset="0" stop-color="#fffbe6"/><stop offset=".55" stop-color="#ffe98a"/><stop offset="1" stop-color="#ffc947"/></radialGradient>`));
put('moon', svg(96, 96,
  `<circle cx="48" cy="48" r="45" fill="#eef0ff" stroke="#9aa6e0" stroke-width="5"/><path d="M48,5 A43,43 0 0 1 48,91 A30,43 0 0 0 48,5Z" fill="#c9cff5"/>` +
  `<circle cx="34" cy="36" r="8" fill="#d3d8f7" stroke="#aab4e8" stroke-width="2"/><circle cx="58" cy="60" r="10" fill="#bcc3ef" stroke="#a0aae4" stroke-width="2"/><circle cx="30" cy="64" r="4.5" fill="#d3d8f7" stroke="#aab4e8" stroke-width="2"/><path d="M22,26 A32,32 0 0 1 40,14" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/>`));

// ---------- sky 960x536 opaque
put('sky', svg(960, 536,
  `<rect width="960" height="536" fill="url(#sk)"/>` +
  `<g fill="#fff" opacity=".18"><ellipse cx="180" cy="150" rx="170" ry="10"/><ellipse cx="300" cy="172" rx="120" ry="7"/><ellipse cx="720" cy="110" rx="190" ry="11"/><ellipse cx="610" cy="132" rx="110" ry="6"/><ellipse cx="840" cy="250" rx="140" ry="8"/><ellipse cx="120" cy="300" rx="130" ry="7"/></g>` +
  `<rect y="380" width="960" height="156" fill="url(#hz)"/>`,
  `<linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3f86d6"/><stop offset=".55" stop-color="#7dbbec"/><stop offset="1" stop-color="#c6e4f4"/></linearGradient>` +
  `<linearGradient id="hz" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe2b8" stop-opacity="0"/><stop offset="1" stop-color="#ffe2b8" stop-opacity=".55"/></linearGradient>`));

// ---------- profile helper: smooth closed silhouette from (x,y) points, filled to bottom
function ridge(pts, w, h, dy = 0) {
  let p = `M0,${h} L${pts[0][0]},${pts[0][1] + dy}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], mx = (x0 + x1) / 2;
    p += ` C${mx},${y0 + dy} ${mx},${y1 + dy} ${x1},${y1 + dy}`;
  }
  return p + ` L${w},${h} Z`;
}
// mountains 960x260 (orig top profile, 4x)
{
  const pts = [[0, 150], [60, 128], [130, 96], [200, 52], [255, 12], [290, 2], [330, 32], [380, 58], [430, 60], [470, 44], [520, 30], [560, 10], [600, 4], [640, 40], [690, 90], [760, 112], [830, 130], [900, 150], [960, 152]];
  const m = ridge(pts, 960, 260);
  // lit faces: thin strip below ridge shifted right
  put('bg_mountains', svg(960, 260,
    `<path d="${m}" fill="url(#mg)"/>` +
    `<g clip-path="url(#mc)"><path d="${ridge(pts.map(([x, y]) => [x + 14, y]), 960, 260, 22)}" fill="#8e5878"/>` +
    `<path d="M290,2 C276,60 300,110 270,180 C262,210 280,240 276,260 L220,260 C250,200 246,120 290,2Z M600,4 C590,60 610,110 590,170 C582,200 596,236 592,260 L540,260 C566,200 560,110 600,4Z" fill="#7c4a6c" opacity=".45"/>` +
    `<path d="${ridge(pts, 960, 260, 0)}" fill="none" stroke="#d29bb1" stroke-width="6" transform="translate(-4,3)"/>` +
    `<rect y="200" width="960" height="60" fill="url(#mf)"/></g>`,
    `<linearGradient id="mg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b8809a"/><stop offset="1" stop-color="#97617f"/></linearGradient><clipPath id="mc"><path d="${m}"/></clipPath><linearGradient id="mf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c590a6" stop-opacity="0"/><stop offset="1" stop-color="#c590a6" stop-opacity=".6"/></linearGradient>`));
}
// dunes 960x140
{
  const pts = [[0, 76], [70, 64], [140, 58], [210, 56], [290, 40], [350, 14], [400, 2], [430, 2], [470, 20], [530, 44], [600, 60], [680, 72], [750, 62], [820, 52], [900, 44], [960, 40]];
  const m = ridge(pts, 960, 140);
  put('bg_dunes', svg(960, 140,
    `<path d="${m}" fill="url(#dg)"/><g clip-path="url(#dc)">` +
    `<path d="M400,2 C430,40 470,90 520,140 L960,140 L960,60 C820,60 600,70 470,20Z" fill="#cf8452"/>` +
    `<path d="M0,110 C200,96 400,120 600,104 C760,92 880,108 960,100 L960,140 L0,140Z" fill="#c97d4d"/>` +
    `<path d="${m}" fill="none" stroke="#f8cd92" stroke-width="7" transform="translate(-3,3)"/>` +
    `<path d="M120,96 C170,88 220,92 260,86 M640,96 C700,90 760,94 800,88" stroke="#f3bd82" stroke-width="3" fill="none" stroke-linecap="round"/></g>`,
    `<linearGradient id="dg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0b071"/><stop offset="1" stop-color="#dc955c"/></linearGradient><clipPath id="dc"><path d="${m}"/></clipPath>`));
}

// ---------- rocks (pivot bottom-centre)
const RK = { base: '#df8a4f', dk: '#a9553a', lt: '#f6b77a' };
function rock(name, w, h, shape, cracks) {
  const d = D();
  put(name, svg(w, h, blob(shape, RK.base, { defsOut: d, sw: 3,
    shade: `<g transform="translate(20,16)" fill="${RK.dk}" opacity=".8">${shape}</g><rect x="0" y="${h - 9}" width="${w}" height="9" fill="${RK.dk}"/>`,
    hi: `<g transform="translate(-6,-4)" fill="none" stroke="${RK.lt}" stroke-width="4" stroke-linejoin="round" opacity=".9">${shape}</g><path d="${cracks}" stroke="${OL}" stroke-width="2" fill="none" stroke-linecap="round" opacity=".55"/>` }), d.join('')));
}
rock('rock_0', 124, 60, `<path d="M4,57 C6,44 16,32 30,24 C42,10 58,4 72,8 C86,10 96,22 106,32 C114,40 120,48 120,57 Z"/>`, 'M50,14 L58,30 L52,44 M58,30 L80,34 L92,52 M30,30 L40,46');
rock('rock_1', 128, 64, `<path d="M4,61 C8,48 20,40 34,34 C46,18 60,6 76,6 C92,6 100,20 108,30 C118,38 124,50 124,61 Z"/>`, 'M66,12 L62,30 L74,44 L70,58 M62,30 L40,40 M74,44 L100,46');
rock('rock_2', 128, 56, `<path d="M4,53 C10,42 24,38 44,38 C60,36 72,34 82,30 C84,18 90,6 100,4 C112,4 118,14 116,26 C122,34 124,44 124,53 Z"/>`, 'M98,10 L94,24 L104,34 M30,44 L44,50 M70,40 L64,50');

// ---------- sand 64x64 tile (opaque, horizontally + vertically tileable)
put('sand', svg(64, 64,
  `<rect width="64" height="64" fill="#efbf78"/>` +
  `<path d="M0,0 H64 V6 C56,9 48,5 40,8 C32,11 24,5 16,8 C8,11 4,7 0,6Z" fill="#f9d899"/>` +
  `<g fill="#d99a58"><ellipse cx="14" cy="24" rx="3" ry="1.6"/><ellipse cx="44" cy="34" rx="3.5" ry="1.8"/><ellipse cx="28" cy="46" rx="2.5" ry="1.4"/><ellipse cx="54" cy="16" rx="2" ry="1.2"/></g>` +
  `<g fill="#fbe0a8"><ellipse cx="13" cy="22.8" rx="2" ry=".9"/><ellipse cx="43" cy="32.8" rx="2.4" ry="1"/><circle cx="36" cy="20" r="1"/><circle cx="8" cy="40" r="1"/><circle cx="58" cy="44" r="1"/></g>`));

// ---------- city 112x176, pivot bottom
{
  const d = D();
  const backL = `<path d="M2,174 V8 C2,4 4,2 8,2 H40 C44,2 46,4 46,8 V174 Z"/>`;
  const backR = `<path d="M66,174 V30 H96 V22 H106 V30 C108,30 110,32 110,34 V174 Z"/>`;
  const front = `<path d="M8,174 V60 C8,56 10,54 14,54 H52 L60,64 H100 C104,64 106,66 106,70 V174 Z"/>`;
  const win = (x, y, w, h, c1, c2) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5" fill="${c1}" stroke="${OL}" stroke-width="2"/><rect x="${x + 1.5}" y="${y + 1.5}" width="${w / 2.5}" height="${h - 3}" fill="${c2}" opacity=".85"/>`;
  let bwin = '';
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) bwin += win(8 + c * 12, 12 + r * 18, 7, 11, '#3d6aa6', '#7fb0e6');
  for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) bwin += win(74 + c * 16, 38 + r * 18, 8, 11, '#3d6aa6', '#7fb0e6');
  let fwin = '';
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if (!(r === 2 && c === 1)) fwin += win(18 + c * 28, 76 + r * 32, 20, 22, '#8fdcff', '#e6f8ff');
  put('city', svg(112, 176,
    `<rect x="18" y="0" width="3" height="8" fill="${OL}"/><circle cx="19.5" cy="1.5" r="1.5" fill="${RED}"/>` +
    blob(backL, '#7a5aa6', { defsOut: d, shade: `<rect x="34" y="0" width="14" height="176" fill="#5a3f86"/>`, hi: `<rect x="2" y="2" width="6" height="172" fill="#9f82cc"/>` }) +
    blob(backR, '#7a5aa6', { defsOut: d, shade: `<rect x="98" y="0" width="14" height="176" fill="#5a3f86"/>`, hi: `<rect x="66" y="30" width="5" height="144" fill="#9f82cc"/>` }) +
    bwin +
    blob(front, '#f0a9cf', { defsOut: d, sw: 3,
      shade: `<rect x="92" y="60" width="20" height="120" fill="#cf78ab"/><rect x="0" y="164" width="112" height="12" fill="#cf78ab"/>`,
      hi: `<rect x="8" y="54" width="7" height="120" fill="#ffd3ea"/><path d="M10,58 H50 L58,68 H104" stroke="#ffd3ea" stroke-width="3" fill="none"/>` }) +
    `<rect x="6" y="52" width="48" height="5" rx="2" fill="${GOLD}" stroke="${OL}" stroke-width="2"/><rect x="58" y="62" width="50" height="5" rx="2" fill="${GOLD}" stroke="${OL}" stroke-width="2"/>` +
    fwin +
    `<path d="M42,140 H70 V146 L66,150 L62,146 L58,150 L54,146 L50,150 L46,146 L42,150 Z" fill="${RED}" stroke="${OL}" stroke-width="2" stroke-linejoin="round"/>` +
    `<rect x="46" y="150" width="20" height="24" fill="#8fdcff" stroke="${OL}" stroke-width="2.5"/><path d="M56,150 V174" stroke="${OL}" stroke-width="2"/><rect x="48" y="152" width="4" height="20" fill="#e6f8ff"/>`,
    d.join('')));
}

// ---------- turret base 96x48 (pivot bottom-centre; gun pivot at y~26)
{
  const d = D();
  const dome = `<path d="M8,40 C8,18 26,6 48,6 C70,6 88,18 88,40 Z"/>`;
  put('turret_base', svg(96, 48,
    blob(dome, STEEL.base, { defsOut: d, sw: 3,
      shade: `<path d="M60,6 C76,12 88,24 88,40 L96,40 L96,0Z" fill="${STEEL.dk}"/>`,
      hi: `<path d="M20,28 C22,18 32,12 42,10" stroke="${STEEL.lt}" stroke-width="5" fill="none" stroke-linecap="round"/>` }) +
    `<path d="M14,34 H82" stroke="${GOLD}" stroke-width="3"/><path d="M14,34 H82" stroke="${OL}" stroke-width="1" transform="translate(0,2)" opacity=".5"/>` +
    `<circle cx="48" cy="26" r="9" fill="${GOLD}" stroke="${OL}" stroke-width="3"/><circle cx="48" cy="26" r="4" fill="${GOLDDK}"/><circle cx="46" cy="24" r="1.6" fill="#fff3b0"/>` +
    blob(`<rect x="2" y="39" width="92" height="8" rx="3"/>`, '#4b5470', { defsOut: d, sw: 2, hi: `<rect x="2" y="39" width="92" height="2.5" fill="#7c86a6"/>` }) +
    [12, 30, 48, 66, 84].map((x) => `<circle cx="${x}" cy="43.5" r="1.6" fill="#a9b2cf"/>`).join(''),
    d.join('')));
}
// ---------- turret gun 92x24 (pivot left-centre (0,12); points right)
{
  const d = D();
  put('turret_gun', svg(92, 24,
    blob(`<rect x="22" y="7" width="58" height="10" rx="2"/>`, STEEL.base, { defsOut: d, sw: 2,
      shade: `<rect x="0" y="13" width="92" height="6" fill="${STEEL.dk}"/>`, hi: `<rect x="22" y="8" width="58" height="2" fill="${STEEL.lt}"/>` }) +
    blob(`<rect x="78" y="4" width="12" height="16" rx="3"/>`, STEEL.base, { defsOut: d, sw: 2,
      shade: `<rect x="78" y="13" width="14" height="8" fill="${STEEL.dk}"/>`, hi: `<rect x="80" y="5" width="2" height="8" fill="${STEEL.lt}"/>` }) +
    `<rect x="88" y="8" width="3" height="8" fill="${CYAN}"/>` +
    [36, 44, 52].map((x) => `<rect x="${x}" y="5" width="5" height="14" rx="1.5" fill="${CYAN}" stroke="${OL}" stroke-width="1.5"/>`).join('') +
    blob(`<path d="M2,12 C2,5 6,2 12,2 H24 C27,2 29,4 29,7 V17 C29,20 27,22 24,22 H12 C6,22 2,19 2,12 Z"/>`, STEEL.base, { defsOut: d, sw: 2,
      shade: `<rect x="0" y="14" width="32" height="10" fill="${STEEL.dk}"/>`, hi: `<rect x="6" y="4" width="18" height="2.5" rx="1" fill="${STEEL.lt}"/>` }) +
    `<circle cx="12" cy="12" r="5" fill="${GOLD}" stroke="${OL}" stroke-width="2"/><circle cx="11" cy="11" r="1.5" fill="#fff3b0"/>`,
    d.join('')));
}

// ---------- crosshair 384x384 (white, multiplied by red in code)
{
  const ring = `<circle cx="192" cy="192" r="118" fill="none" stroke-width="34"/>`;
  const prong = (r) => `<g transform="rotate(${r} 192 192)"><rect x="176" y="10" width="32" height="74" rx="14"/><rect x="180" y="104" width="24" height="26" rx="10"/></g>`;
  const all = ring + [0, 90, 180, 270].map(prong).join('');
  put('crosshair', svg(384, 384,
    `<g stroke="${OL}" fill="${OL}"><circle cx="192" cy="192" r="118" fill="none" stroke-width="50"/>${[0, 90, 180, 270].map((r) => `<g transform="rotate(${r} 192 192)" stroke-width="14" stroke-linejoin="round"><rect x="176" y="10" width="32" height="74" rx="14"/><rect x="180" y="104" width="24" height="26" rx="10"/></g>`).join('')}</g>` +
    `<g stroke="#fff" fill="#fff">${all}</g>` +
    `<path d="M110,140 A100,100 0 0 1 150,98" stroke="#dfe6ff" stroke-width="10" fill="none" stroke-linecap="round" opacity=".0"/>` +
    `<circle cx="192" cy="192" r="118" fill="none" stroke="#d8dcef" stroke-width="10" stroke-dasharray="0 0" transform="translate(0,9)" opacity=".0"/>`));
}

// ---------- smoke 128x128 (puff centred (48,80), r~32 — tinted in code)
put('smoke', svg(128, 128,
  `<g fill="#6e4652"><circle cx="48" cy="84" r="24"/><circle cx="36" cy="74" r="15"/><circle cx="60" cy="72" r="16"/><circle cx="48" cy="64" r="15"/></g>` +
  `<g fill="#8f6170"><circle cx="44" cy="76" r="16"/><circle cx="34" cy="70" r="10"/><circle cx="54" cy="66" r="11"/></g><circle cx="40" cy="66" r="5" fill="#ad8090"/>`));

// ---------- HUD svgs (cartoon glossy icons) + logo
const HUD = {};
HUD.hp = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110 100" role="img" aria-label="health"><path d="M55,94 C30,76 6,58 6,32 C6,16 18,6 32,6 C42,6 50,12 55,20 C60,12 68,6 78,6 C92,6 104,16 104,32 C104,58 80,76 55,94Z" fill="#e8463a" stroke="${OL}" stroke-width="9" stroke-linejoin="round"/><path d="M55,86 C76,70 96,54 98,34 C96,52 76,70 55,86Z M98,34 C99,48 84,64 68,76 L60,82 C80,66 98,52 98,34Z" fill="#a52a31"/><path d="M78,14 C90,14 98,24 97,36 C92,58 72,74 56,86 C70,70 88,56 90,36 C90,24 84,16 78,14Z" fill="#a52a31"/><path d="M20,30 C20,20 28,14 36,15" stroke="#ffd0cc" stroke-width="8" fill="none" stroke-linecap="round"/><circle cx="20" cy="42" r="4" fill="#ffd0cc"/></svg>\n`;
HUD.wpm = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" role="img" aria-label="words per minute"><rect x="8" y="8" width="104" height="104" rx="20" fill="#c97a28" stroke="${OL}" stroke-width="8"/><rect x="12" y="10" width="96" height="84" rx="16" fill="#ffc53a"/><rect x="20" y="16" width="80" height="66" rx="12" fill="#ffe27a"/><path d="M26,24 C40,20 60,20 76,22" stroke="#fff6c8" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M42,34 V70 M44,52 L64,34 M50,48 L68,70" stroke="${OL}" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M78,40 L90,52 L78,64" stroke="#e8463a" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>\n`;
HUD.timer = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 110" role="img" aria-label="time left"><rect x="48" y="4" width="24" height="14" rx="5" fill="#ffc53a" stroke="${OL}" stroke-width="6"/><path d="M90,22 L100,14" stroke="${OL}" stroke-width="14" stroke-linecap="round"/><path d="M90,22 L100,14" stroke="#ffc53a" stroke-width="6" stroke-linecap="round"/><circle cx="60" cy="62" r="44" fill="#ffc53a" stroke="${OL}" stroke-width="8"/><path d="M60,18 A44,44 0 0 1 60,106 A44,44 0 0 0 96,40Z" fill="#d4861c" opacity=".55"/><circle cx="60" cy="62" r="32" fill="#fff4dc" stroke="${OL}" stroke-width="6"/><path d="M60,36 V42 M86,62 H80 M60,88 V82 M34,62 H40" stroke="${OL}" stroke-width="5" stroke-linecap="round"/><path d="M60,62 L76,46" stroke="#e8463a" stroke-width="7" stroke-linecap="round"/><circle cx="60" cy="62" r="6" fill="#e8463a" stroke="${OL}" stroke-width="3"/><path d="M30,40 C36,30 46,24 56,22" stroke="#fff3b0" stroke-width="6" fill="none" stroke-linecap="round"/></svg>\n`;
{
  const src = fs.readFileSync(new URL('./orig-svg/logo.svg', 'file://' + OUT + '/'), 'utf8');
  const t = src.match(/<path id="t" d="[^"]+" transform="[^"]+"\/>/)[0];
  HUD.logo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 883 200" role="img" aria-label="KEYFALL">
<defs>${t}
<linearGradient id="g" x1="0" y1="40" x2="0" y2="140" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff6b0"/><stop offset=".45" stop-color="#ffc53a"/><stop offset="1" stop-color="#ff7a1e"/></linearGradient>
<linearGradient id="b" x1="0" x2="1"><stop offset="0" stop-color="#3ff0ff"/><stop offset="1" stop-color="#b05cff"/></linearGradient>
<filter id="u" x="-10%" y="-10%" width="120%" height="140%"><feGaussianBlur stdDeviation="5"/></filter></defs>
<use href="#t" fill="#000" fill-opacity=".45" stroke="#000" stroke-opacity=".45" stroke-width="20" transform="translate(4 12)" filter="url(#u)"/>
<use href="#t" fill="#5a2a7a" stroke="${OL}" stroke-width="18" stroke-linejoin="round" transform="translate(5 10)"/>
<use href="#t" fill="#5a2a7a" stroke="#5a2a7a" stroke-width="6" stroke-linejoin="round" transform="translate(3 6)"/>
<use href="#t" fill="url(#g)" stroke="${OL}" stroke-width="12" stroke-linejoin="round" paint-order="stroke"/>
<use href="#t" fill="none" stroke="#fff8c8" stroke-width="2.5" stroke-linejoin="round" transform="translate(-1.5 -2)" opacity=".8"/>
<rect x="38" y="164" width="807" height="14" rx="7" fill="${OL}"/>
<rect x="40" y="166" width="803" height="10" fill="url(#b)" rx="5"/>
<rect x="48" y="168" width="787" height="3" fill="#fff" opacity=".8" rx="1.5"/>
</svg>\n`;
}

fs.mkdirSync(OUT, { recursive: true });
for (const [n, s] of Object.entries(files)) fs.writeFileSync(`${OUT}/${n}.svg`, s);
fs.mkdirSync(`${OUT}/hud`, { recursive: true });
for (const [n, s] of Object.entries(HUD)) fs.writeFileSync(`${OUT}/hud/${n}.svg`, s);
console.log(Object.keys(files).length, 'sprites,', Object.keys(HUD).length, 'hud');
