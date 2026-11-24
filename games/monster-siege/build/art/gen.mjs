// Monster Siege art: writes every SVG sprite + manifest.json. Run: node gen.mjs (from this folder).
// Card portraits (card.*.png) are baked separately from brawler head cutouts, see bake.mjs.
// Style follows games/brawler/client/src/lib/render/parts.ts (horned monster-folk: swept / spike / ram horns, pointy ears).
// tint:true sprites use neutral greys (~#9a9a9a) so runtime 'source-atop' hue tint reads.
// arena.png (landscape hex island, geometry from ../map.js) is baked here too (headless google-chrome screenshot of a generated SVG).
import { writeFileSync, readFileSync, existsSync, mkdtempSync, unlinkSync } from 'node:fs';
import * as M from '../map.js'; // board geometry shared with sim/render
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const OL = '#17131f', G = { lo: '#5f5f66', mid: '#9a9a9a', hi: '#c8c8c8', top: '#e2e2e2', dk: '#45454c' };
const HORN = '#e9dfc6', HORN_D = '#b9ab8a';
const st = (w = 3) => `stroke="${OL}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>\n`;
const strip = (n, f) => svg(64 * n, 64, Array.from({ length: n }, (_, i) => `<g transform="translate(${64 * i} 0)">${f(i)}</g>`).join(''));

// ---- unit parts (64x64 frame, facing up = we see the back, head toward the top) ----
const feet = (i, spread = 9, y = 52) => { const s = [0, 3, 0, -3][i]; return `<ellipse cx="${32 - spread}" cy="${y + s}" rx="5" ry="6" fill="${G.lo}" ${st(2.5)}/><ellipse cx="${32 + spread}" cy="${y - s}" rx="5" ry="6" fill="${G.lo}" ${st(2.5)}/>`; };
const torso = (rx, ry, cy = 40) => `<ellipse cx="32" cy="${cy}" rx="${rx}" ry="${ry}" fill="${G.mid}" ${st()}/><path d="M${32 - rx + 4} ${cy + 3}Q32 ${cy + 7} ${32 + rx - 4} ${cy + 3}" fill="none" stroke="${G.dk}" stroke-width="3"/><ellipse cx="32" cy="${cy - ry * 0.35}" rx="${rx * 0.55}" ry="${ry * 0.4}" fill="${G.hi}" opacity=".6"/>`;
const pauldrons = (dx, y = 33, r = 7) => [-1, 1].map((s) => `<circle cx="${32 + s * dx}" cy="${y}" r="${r}" fill="${G.hi}" ${st()}/><path d="M${32 + s * dx - r * 0.6} ${y - 1}a${r * 0.6} ${r * 0.5} 0 0 1 ${r * 1.2} 0" fill="none" stroke="${G.top}" stroke-width="2"/>`).join('');
const ears = (y = 24) => `<path d="M21 ${y}L10 ${y - 6}L20 ${y + 5}Z" fill="${G.mid}" ${st(2.5)}/><path d="M43 ${y}L54 ${y - 6}L44 ${y + 5}Z" fill="${G.mid}" ${st(2.5)}/>`;
const skull = (y = 24, r = 11) => `<circle cx="32" cy="${y}" r="${r}" fill="${G.mid}" ${st()}/><path d="M${32 - r + 2} ${y + 2}C${32 - r + 3} ${y - r + 1} ${32 + r - 3} ${y - r + 1} ${32 + r - 2} ${y + 2}C${32 + 4} ${y - 3} ${32 - 4} ${y - 3} ${32 - r + 2} ${y + 2}Z" fill="${G.lo}"/><circle cx="${32 - r * 0.35}" cy="${y - r * 0.45}" r="${r * 0.28}" fill="${G.top}" opacity=".7"/>`;
const HORNS = { // seen from behind: curve outward/up off the skull
  swept: (y = 24) => `<path d="M24 ${y - 6}C18 ${y - 12} 12 ${y - 14} 6 ${y - 13}C12 ${y - 9} 16 ${y - 5} 20 ${y - 1}Z" fill="${HORN}" ${st(2.5)}/><path d="M40 ${y - 6}C46 ${y - 12} 52 ${y - 14} 58 ${y - 13}C52 ${y - 9} 48 ${y - 5} 44 ${y - 1}Z" fill="${HORN}" ${st(2.5)}/>`,
  spike: (y = 24) => `<path d="M28 ${y - 8}L33 ${y - 25}L37 ${y - 8}Z" fill="${HORN}" ${st(2.5)}/><path d="M33 ${y - 22}L35 ${y - 9}" stroke="${HORN_D}" stroke-width="2"/>`,
  ram: (y = 24) => [-1, 1].map((s) => `<path d="M${32 + s * 6} ${y - 8}C${32 + s * 16} ${y - 16} ${32 + s * 25} ${y - 6} ${32 + s * 20} ${y + 3}C${32 + s * 16} ${y + 8} ${32 + s * 10} ${y + 3} ${32 + s * 13} ${y - 1}" fill="none" stroke="${OL}" stroke-width="8" stroke-linecap="round"/><path d="M${32 + s * 6} ${y - 8}C${32 + s * 16} ${y - 16} ${32 + s * 25} ${y - 6} ${32 + s * 20} ${y + 3}C${32 + s * 16} ${y + 8} ${32 + s * 10} ${y + 3} ${32 + s * 13} ${y - 1}" fill="none" stroke="${HORN}" stroke-width="4.5" stroke-linecap="round"/>`).join(''),
};
const head = (horn, y = 24, r = 11) => ears(y) + skull(y, r) + HORNS[horn](y);
const bob = (i, g) => `<g transform="translate(0 ${i % 2 ? -1.5 : 0})">${g}</g>`;
const GLOW = '#7df9ff';

const UNITS = {
  // Cannon (lortor, swept horns): wide body, war-hammer barrel held up on the right shoulder.
  cannon: (i) => feet(i, 11) + bob(i, torso(17, 13) + `<path d="M46 40L52 10" stroke="${OL}" stroke-width="7" stroke-linecap="round"/><path d="M46 40L52 10" stroke="${HORN_D}" stroke-width="3" stroke-linecap="round"/><rect x="42" y="2" width="20" height="13" rx="3" fill="${G.lo}" ${st()}/><path d="M45 8.5H59" stroke="${GLOW}" stroke-width="2.5"/>` + pauldrons(15, 32, 8) + head('swept', 23, 12)),
  // Rapid (makvel, spike horn): slim, a short blade forward in each hand.
  rapid: (i) => feet(i, 7) + bob(i, [-1, 1].map((s) => `<path d="M${32 + s * 13} ${38 - (i % 2 ? s : -s) * 2}L${32 + s * 14} ${18 - (i % 2 ? s : -s) * 2}" stroke="${OL}" stroke-width="6" stroke-linecap="round"/><path d="M${32 + s * 13} ${36 - (i % 2 ? s : -s) * 2}L${32 + s * 14} ${18 - (i % 2 ? s : -s) * 2}" stroke="${G.top}" stroke-width="2.5" stroke-linecap="round"/>`).join('') + torso(11, 10, 41) + pauldrons(11, 34, 5.5) + head('spike', 25, 10)),
  // Sniper (grodrasu, spike horn + visor strap): long glowing lance held upright past the head.
  sniper: (i) => feet(i, 8) + bob(i, `<path d="M44 46L47 1" stroke="${OL}" stroke-width="6" stroke-linecap="round"/><path d="M44 46L47 3" stroke="${G.hi}" stroke-width="2.5" stroke-linecap="round"/><path d="M47 0L44 9L50 9Z" fill="${GLOW}" ${st(2)}/>` + torso(12, 11) + pauldrons(12, 33, 6) + head('spike', 24, 11) + `<path d="M21 26Q32 30 43 26" fill="none" stroke="${OL}" stroke-width="4"/><path d="M21 26Q32 30 43 26" fill="none" stroke="${GLOW}" stroke-width="1.8"/>`),
  // Bulwark (torfen, ram horns): broad curved tower-shield wall in front.
  bulwark: (i) => feet(i, 11) + bob(i, torso(16, 12, 42) + pauldrons(15, 35, 7) + head('ram', 27, 11) + `<path d="M6 16C14 5 50 5 58 16L56 22C46 14 18 14 8 22Z" fill="${G.hi}" ${st()}/><path d="M14 13C24 8 40 8 50 13" fill="none" stroke="${G.top}" stroke-width="2.5"/><circle cx="32" cy="12" r="3" fill="${GLOW}" ${st(2)}/>`),
  // Grunt (bramdra, swept horns): stocky, club over the shoulder.
  grunt: (i) => feet(i, 8) + bob(i, `<path d="M44 42L50 14" stroke="${OL}" stroke-width="9" stroke-linecap="round"/><path d="M44 42L50 14" stroke="${G.lo}" stroke-width="5" stroke-linecap="round"/><circle cx="50" cy="14" r="2" fill="${G.hi}"/>` + torso(13, 11) + pauldrons(12, 34, 5.5) + head('swept', 25, 10)),
  // Minion: round imp, tiny horns + claws (drawn big, shown at 0.6 tile).
  minion: (i) => feet(i, 9, 54) + bob(i, [-1, 1].map((s) => `<path d="M${32 + s * 15} 36L${32 + s * 22} ${28 - (i % 2 ? s : -s) * 2}" stroke="${OL}" stroke-width="7" stroke-linecap="round"/><path d="M${32 + s * 15} 36L${32 + s * 22} ${28 - (i % 2 ? s : -s) * 2}" stroke="${G.hi}" stroke-width="3" stroke-linecap="round"/>`).join('') + `<circle cx="32" cy="36" r="18" fill="${G.mid}" ${st()}/><path d="M17 40Q32 50 47 40" fill="none" stroke="${G.lo}" stroke-width="4"/><circle cx="26" cy="27" r="5" fill="${G.top}" opacity=".7"/><path d="M22 22L17 8L28 19Z" fill="${HORN}" ${st(2.5)}/><path d="M42 22L47 8L36 19Z" fill="${HORN}" ${st(2.5)}/>`),
};

// ---- structures (3/4 top-down: light top faces, darker front faces, gold trims, light from top-left) ----
const TEAM = { you: { lo: '#1d5fc4', mid: '#3a9dff', hi: '#bdeaff' }, foe: { lo: '#a81e3c', mid: '#ff4d6d', hi: '#ffc6d3' } };
const GOLD = '#f2c14e', GOLD_D = '#8a5a14', SOL = '#2a2440';
const grad = (id, a, b, v = true) => `<linearGradient id="${id}" x1="0" y1="0" x2="${v ? 0 : 1}" y2="${v ? 1 : 0}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
const sst = (w = 2.5) => `stroke="${SOL}" stroke-width="${w}" stroke-linejoin="round"`;
const STONE = grad('sT', '#cdc8da', '#9a94ae') + grad('sF', '#7d7793', '#575170');
// Horned crest (same horns + gem as the old core.svg), centred on 0,0, ~80x48 at s=1.
const crest = (s, horn = GOLD, gem = '#fff', w = st(Math.max(3, 1.2 / s))) => `<g transform="scale(${s}) translate(-64 -60)"><path d="M50 52C42 40 34 36 24 37C32 42 38 49 44 58Z" fill="${horn}" ${w}/><path d="M78 52C86 40 94 36 104 37C96 42 90 49 84 58Z" fill="${horn}" ${w}/><path d="M64 38L78 60L64 84L50 60Z" fill="${gem}" ${w}/><path d="M64 43L72 60L64 56Z" fill="#fff" opacity=".7"/></g>`;
const tower = (x, y, w, ht, hf) => `<rect x="${x}" y="${y + ht - 4}" width="${w}" height="${hf + 4}" rx="3" fill="url(#sF)" ${sst()}/><rect x="${x}" y="${y}" width="${w}" height="${ht}" rx="3" fill="url(#sT)" ${sst()}/><rect x="${x + 5}" y="${y + 5}" width="${w - 10}" height="${ht - 10}" rx="2" fill="#6d6784"/>`;


// Hex helpers (pointy-top, vertex k at angle k*60-90). hexV = vertex list, hex = SVG points string.
const hexV = (cx, cy, R) => Array.from({ length: 6 }, (_, k) => { const a = (k * 60 - 90) * Math.PI / 180; return [cx + R * Math.cos(a), cy + R * Math.sin(a)]; });
const hex = (cx, cy, R) => hexV(cx, cy, R).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
// Hex prism seen from above: top face at cy, side visible dy px below (vertices top, ur from top; lr, bottom, ll from the lowered copy; ul from top).
const sweep = (cx, cy, R, dy) => { const t = hexV(cx, cy, R), b = hexV(cx, cy + dy, R); return [t[0], t[1], b[2], b[3], b[4], t[5]].map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '); };

// Core 2.2 x 2.5 hexes (176x200, 80 px/hex): round stone shrine on a stepped hex plinth, floating team crystal. Hex centre = (88,120).
const core = (t) => { const c = TEAM[t]; return svg(176, 200, `<defs>${STONE}${grad('cr', c.hi, c.lo)}${grad('dr', '#bdb7cf', '#6a6384', false)}<radialGradient id="gl"><stop offset="0" stop-color="${c.hi}" stop-opacity=".95"/><stop offset=".4" stop-color="${c.mid}" stop-opacity=".45"/><stop offset="1" stop-color="${c.mid}" stop-opacity="0"/></radialGradient></defs>`
  + `<ellipse cx="88" cy="176" rx="80" ry="18" fill="#000" opacity=".3"/>`
  + `<polygon points="${sweep(88, 118, 76, 12)}" fill="#575170" ${sst(3)}/><polygon points="${hex(88, 118, 76)}" fill="url(#sT)" ${sst(3)}/>`
  + `<polygon points="${sweep(88, 116, 60, 8)}" fill="${c.lo}" ${sst(2.5)}/><polygon points="${hex(88, 116, 60)}" fill="#bfb9d0" ${sst(2.5)}/><polygon points="${hex(88, 116, 54)}" fill="none" stroke="${GOLD}" stroke-width="2.5"/>`
  + [0, 1, 2, 3, 4, 5].map((k) => { const [x, y] = hexV(88, 116, 60)[k]; return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="${GOLD}" stroke="${GOLD_D}" stroke-width="1.5"/>`; }).join('')
  + `<path d="M50 70V122A38 13 0 0 0 126 122V70Z" fill="url(#dr)" ${sst(3)}/>`
  + [62, 88, 114].map((x) => `<path d="M${x - 7} 116V90A7 7 0 0 1 ${x + 7} 90V116Z" fill="${c.mid}" stroke="${SOL}" stroke-width="2"/><path d="M${x - 4} 112V91A4 4 0 0 1 ${x + 4} 91V112Z" fill="${c.hi}" opacity=".8"/>`).join('')
  + `<path d="M50 80A38 13 0 0 0 126 80" fill="none" stroke="${GOLD}" stroke-width="4"/><path d="M50 116A38 13 0 0 0 126 116" fill="none" stroke="${c.lo}" stroke-width="5"/>`
  + `<ellipse cx="88" cy="70" rx="38" ry="13" fill="url(#sT)" ${sst(3)}/><ellipse cx="88" cy="70" rx="27" ry="8" fill="#4a4366" ${sst(2)}/>`
  + [-1, -0.55, 0, 0.55, 1].map((u) => `<rect x="${88 + u * 32 - 6}" y="${58 + (1 - Math.abs(u)) * 10}" width="12" height="11" rx="2" fill="url(#sT)" ${sst(2)}/>`).join('')
  + `<circle cx="88" cy="40" r="46" fill="url(#gl)"/><ellipse cx="88" cy="70" rx="12" ry="4" fill="${c.hi}" opacity=".8"/>`
  + `<path d="M88 2L106 34L88 70L70 34Z" fill="url(#cr)" ${sst(2.5)}/><path d="M88 2L88 70L70 34Z" fill="#fff" opacity=".28"/><path d="M88 2L97 34L88 40L79 34Z" fill="#fff" opacity=".45"/><path d="M75 16l2 -5l2 5l5 2l-5 2l-2 5l-2 -5l-5 -2Z" fill="#fff"/>`
  + `<g transform="translate(88 104)">${crest(0.22, GOLD, c.hi)}</g>`); };

// Defender plinth 1 x 1.35 hexes (128x173): stone hex with team inlay + gold studs, side face below. Hex centre = (64,72).
const plinth = (t) => { const c = TEAM[t]; return svg(128, 173, `<defs>${STONE}${grad('pc', c.hi, c.lo)}</defs><ellipse cx="66" cy="150" rx="56" ry="14" fill="#000" opacity=".3"/>`
  + `<polygon points="${sweep(64, 72, 62, 18)}" fill="url(#sF)" ${sst(3)}/><path d="${hexV(64, 82, 62).slice(1, 6).map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('')}" fill="none" stroke="${c.mid}" stroke-width="5"/>`
  + `<polygon points="${hex(64, 72, 62)}" fill="url(#sT)" ${sst(3)}/><polygon points="${hex(64, 72, 56)}" fill="none" stroke="${GOLD}" stroke-width="2.5"/>`
  + `<polygon points="${hex(64, 72, 38)}" fill="url(#pc)" ${sst(2.5)}/><polygon points="${hex(64, 72, 30)}" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="2"/>`
  + hexV(64, 72, 56).map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="${GOLD}" stroke="${GOLD_D}" stroke-width="1.5"/>`).join('')); };

// Drop highlights: exactly one hex footprint (128 x 147.8 px = 1 x 1.1547 hexes), soft glowing edge, see-through centre.
const HX = 128 / Math.sqrt(3);
const glowHex = (col, hi) => `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="148" viewBox="0 0 128 ${(2 * HX).toFixed(1)}"><defs><radialGradient id="g"><stop offset=".35" stop-color="${col}" stop-opacity=".12"/><stop offset=".85" stop-color="${col}" stop-opacity=".5"/><stop offset="1" stop-color="${hi}" stop-opacity=".85"/></radialGradient><filter id="b"><feGaussianBlur stdDeviation="3"/></filter></defs>`
  + `<polygon points="${hex(64, HX, HX)}" fill="url(#g)"/><polygon points="${hex(64, HX, HX - 5)}" fill="none" stroke="${hi}" stroke-width="5" filter="url(#b)"/><polygon points="${hex(64, HX, HX - 3.5)}" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width="2.5"/></svg>\n`;

// Card corner badges (64x64): gold ring, gold sword (attack) / blue shield (defend).
const badge = (inner) => svg(64, 64, `<defs>${grad('bg', '#ffe79a', '#b8781e')}${grad('bi', '#3a2c70', '#150f30')}</defs><circle cx="32" cy="32" r="29" fill="url(#bg)" ${st(3)}/><circle cx="32" cy="32" r="22" fill="url(#bi)" stroke="#5a3a0c" stroke-width="2"/>${inner}<path d="M14 22A20 20 0 0 1 40 12" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="2.5" stroke-linecap="round"/>`);
const sword = badge(`<g transform="rotate(45 32 32)"><path d="M32 8L37 14V40H27V14Z" fill="#ffe39a" ${st(2.5)}/><path d="M32 10V39" stroke="#fff" stroke-opacity=".7" stroke-width="2"/><rect x="20" y="39" width="24" height="6" rx="3" fill="${GOLD}" ${st(2.5)}/><rect x="29" y="45" width="6" height="9" fill="#8a5a24" ${st(2)}/><circle cx="32" cy="57" r="3.5" fill="${GOLD}" ${st(2)}/></g>`);
const shield = badge(`${grad('sh', '#9fe0ff', '#1e66d0')}<path d="M32 12L48 18V31C48 42 41 49 32 53C23 49 16 42 16 31V18Z" fill="url(#sh)" ${st(2.5)}/><path d="M32 16L44 21V31C44 40 39 45 32 49Z" fill="#fff" opacity=".22"/><path d="M32 19V48M20 27H44" stroke="${GOLD}" stroke-width="3"/>`);

// ---- arena: landscape floating-island hex board, geometry straight from build/map.js, baked to arena.png via headless Chrome ----
const WORLD = [-2500, -3000, 23500, 13600], KPX = 0.12; // sim-unit rect the PNG covers, px per sim unit (120 px per hex)
const AW = Math.round((WORLD[2] - WORLD[0]) * KPX), AH = Math.round((WORLD[3] - WORLD[1]) * KPX); // 3120 x 1992
const ISLAND = { cx: M.W / 2, cy: (M.H - 0) / 2, a: 11300, b: 5750, n: 6 }; // superellipse (sim units) the hex field sits in
const se = (off, t) => { const { cx, cy, a, b, n } = ISLAND, c = Math.cos(t), s = Math.sin(t); return [cx + (a + off) * Math.sign(c) * Math.abs(c) ** (2 / n), cy + (b + off) * Math.sign(s) * Math.abs(s) ** (2 / n)]; };
const inIsland = (x, y, off = 0) => { const { cx, cy, a, b, n } = ISLAND; return (Math.abs(x - cx) / (a + off)) ** n + (Math.abs(y - cy) / (b + off)) ** n <= 1; };
const rimY = (x, off, sgn) => { const { cx, cy, a, b, n } = ISLAND; return cy + sgn * (b + off) * Math.max(0, 1 - (Math.abs(x - cx) / (a + off)) ** n) ** (1 / n); };
// check: every hex vertex sits inside the island with room for the rim blocks
for (const [x2, y] of M.HEXES) for (const [vx, vy] of hexV(...M.center(x2, y), 577)) if (!inIsland(vx, vy, -250)) throw new Error(`hex ${x2},${y} pokes out of the island`);

const arena = () => {
  const K = KPX, X = (x) => +((x - WORLD[0]) * K).toFixed(1), Y = (y) => +((y - WORLD[1]) * K).toFixed(1), R = 577 * K, H = AH, W = AW;
  let seed = 11; const r = (a = 0, b = 1) => a + (b - a) * ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pick = (a) => a[Math.floor(r(0, a.length))];
  const pts = (a) => a.map(([x, y]) => `${X(x)},${Y(y)}`).join(' ');
  const ring = (off, step) => { const d = Array.from({ length: 2880 }, (_, i) => se(off, i / 2880 * 2 * Math.PI)), o = [d[0]]; let acc = 0; for (let i = 1; i < d.length; i++) { acc += Math.hypot(d[i][0] - d[i - 1][0], d[i][1] - d[i - 1][1]); if (acc >= step) { o.push(d[i]); acc = 0; } } return o; };
  const outline = (off) => pts(Array.from({ length: 360 }, (_, i) => se(off, i / 360 * 2 * Math.PI)));
  const D = 1500; // cliff drop below the rim (sim units)
  // zone tint: x stops in sim units, red (enemy, x2<=14) -> green (neutral) -> blue (you, x2>=26), blended across the zigzag borders
  const zg = (id, red, green, blue, ro = 1, go = 1, bo = 1) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${X(0)}" y1="0" x2="${X(M.W)}" y2="0">`
    + [[7200, red, ro], [8800, green, go], [12200, green, go], [13800, blue, bo]].map(([x, c, o]) => `<stop offset="${(x / M.W).toFixed(4)}" stop-color="${c}" stop-opacity="${o}"/>`).join('') + '</linearGradient>';
  const defs = `<defs>${STONE}${grad('wa', '#74dcff', '#2b86d4')}${grad('wf', '#e4faff', '#4cb4ee', false)}${grad('pn', '#86d653', '#2a6e2c')}${grad('fl', '#fff6b0', '#ff6a12')}${grad('sand', '#fbe0b4', '#e0a978')}${grad('rk', '#b7aecd', '#857c9f')}${grad('cl', '#f4f0ff', '#9c93d8')}${grad('cry', '#d8fbff', '#2f7de0')}
${grad('sky', '#1c1a4a', '#5a4fa8')}${grad('cf', '#8a80a8', '#3a3158')}
${zg('zb', '#a3283a', '#5b9e2e', '#2373cc')}${zg('zt', '#cf3f4e', '#79bd3e', '#3c9bec')}${zg('ze', '#ff8a8a', '#e6ffa8', '#9af4ff', 1, 0.45, 1)}${zg('zd', '#5e0f1e', '#2c5a16', '#0f3f86')}
<filter id="bl"><feGaussianBlur stdDeviation="6"/></filter><filter id="bl3"><feGaussianBlur stdDeviation="3.5"/></filter><filter id="bl20"><feGaussianBlur stdDeviation="22"/></filter>
<filter id="nz" x="0" y="0" width="1" height="1"><feTurbulence type="fractalNoise" baseFrequency=".012" numOctaves="4" seed="4"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2 0 0 0 -.9"/></filter>
<filter id="nz2" x="0" y="0" width="1" height="1"><feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="2" seed="9"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 .8  1.8 0 0 0 -.95"/></filter>
<radialGradient id="lt" cx=".35" cy=".25" r=".9"><stop offset="0" stop-color="#fff0b8" stop-opacity=".22"/><stop offset=".55" stop-color="#fff0b8" stop-opacity="0"/><stop offset="1" stop-color="#140a30" stop-opacity=".5"/></radialGradient>
<radialGradient id="tg"><stop offset="0" stop-color="#ffd27a" stop-opacity=".8"/><stop offset="1" stop-color="#ff8a2a" stop-opacity="0"/></radialGradient>
<radialGradient id="cg"><stop offset="0" stop-color="#bff6ff" stop-opacity=".9"/><stop offset="1" stop-color="#3aa0ff" stop-opacity="0"/></radialGradient>
<clipPath id="gr"><polygon points="${outline(300)}"/></clipPath></defs>`;
  const block = ([x, y, w, h, d], t, f, moss) => `<rect x="${x}" y="${y + h - 6}" width="${w}" height="${d + 6}" rx="6" fill="${f}" ${sst()}/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7" fill="${t}" ${sst()}/><path d="M${x + 7} ${y + 5}H${x + w - 10}" stroke="#fff" stroke-opacity=".35" stroke-width="3" stroke-linecap="round"/>`
    + (moss ? `<path d="M${x + w * 0.3} ${y + 2}q${w * 0.3} -8 ${w * 0.6} 2q-6 8 -${w * 0.3} 6t-${w * 0.3} -8Z" fill="#6fbf3c" stroke="#2c5a22" stroke-width="2"/>` : '');
  const flower = (x, y) => { const p = pick(['#ff7eb6', '#ff9ad0', '#fff', '#ffd84d', '#ff6fa0']); return [0, 72, 144, 216, 288].map((a) => `<circle cx="${(x + 3.6 * Math.cos(a * Math.PI / 180)).toFixed(1)}" cy="${(y + 3 * Math.sin(a * Math.PI / 180)).toFixed(1)}" r="2.8" fill="${p}" stroke="#7a2a50" stroke-width=".8"/>`).join('') + `<circle cx="${x}" cy="${y}" r="1.8" fill="#ffd23a"/>`; };
  const shade = (x, y, w, h = w * 0.3) => `<ellipse cx="${x}" cy="${y}" rx="${w}" ry="${h}" fill="#000" opacity=".3" filter="url(#bl)"/>`;
  const pine = (cx, by, s) => shade(cx + s * 0.12, by, s * 0.42, s * 0.12) + `<rect x="${cx - s * 0.07}" y="${by - s * 0.3}" width="${s * 0.14}" height="${s * 0.3}" fill="#6b4524" ${st(2)}/>`
    + [0, 1, 2].map((k) => { const w = s * (1 - k * 0.22), b = by - s * 0.18 - k * s * 0.3, t = b - s * 0.55; return `<path d="M${cx} ${t}L${cx + w / 2} ${b}Q${cx} ${b + s * 0.1} ${cx - w / 2} ${b}Z" fill="url(#pn)" stroke="#1d4a1f" stroke-width="2.5" stroke-linejoin="round"/><path d="M${cx} ${t}L${cx + w / 2} ${b}Q${cx + w * 0.25} ${b + s * 0.06} ${cx} ${b + s * 0.08}Z" fill="#123d16" opacity=".35"/>`; }).join('');
  const bush = (cx, cy, s, [hi, mid, dk] = ['#a8e46a', '#5ea83a', '#25561f']) => shade(cx + 4, cy + s * 0.3, s * 0.8, s * 0.25)
    + [[-0.38, 0, 0.42], [0.38, 0.02, 0.4], [0, -0.28, 0.5]].map(([dx, dy, rr]) => `<circle cx="${cx + dx * s}" cy="${cy + dy * s}" r="${rr * s}" fill="${mid}" stroke="${dk}" stroke-width="2.5"/><circle cx="${cx + dx * s - rr * s * 0.3}" cy="${cy + dy * s - rr * s * 0.35}" r="${rr * s * 0.45}" fill="${hi}" opacity=".75"/>`).join('');
  const banner = (x, y, c) => `<rect x="${x - 10}" y="${y + 104}" width="20" height="10" rx="3" fill="url(#sF)" ${sst(2)}/><rect x="${x - 3.5}" y="${y}" width="7" height="108" fill="#5a3a22" ${st(2)}/>`
    + `<path d="M${x - 20} ${y + 10}H${x + 20}V${y + 80}L${x} ${y + 67}L${x - 20} ${y + 80}Z" fill="${c.mid}" ${st(2.5)}/><path d="M${x} ${y + 10}H${x + 20}V${y + 80}L${x} ${y + 67}Z" fill="${c.lo}" opacity=".45"/>`
    + `<path d="M${x - 15} ${y + 15}H${x + 15}V${y + 71}L${x} ${y + 61}L${x - 15} ${y + 71}Z" fill="none" stroke="${GOLD}" stroke-width="2.5"/><g transform="translate(${x} ${y + 38})">${crest(0.32, GOLD, c.hi)}</g>`
    + `<rect x="${x - 25}" y="${y + 4}" width="50" height="8" rx="4" fill="${GOLD}" stroke="${GOLD_D}" stroke-width="2"/><circle cx="${x - 26}" cy="${y + 8}" r="5" fill="${GOLD}" stroke="${GOLD_D}" stroke-width="2"/><circle cx="${x + 26}" cy="${y + 8}" r="5" fill="${GOLD}" stroke="${GOLD_D}" stroke-width="2"/><circle cx="${x}" cy="${y - 2}" r="5" fill="${GOLD}" stroke="${GOLD_D}" stroke-width="2"/>`;
  const torch = (x, y) => block([x - 20, y - 46, 40, 30, 34], '#c9c4d6', '#7b7591') + `<circle cx="${x}" cy="${y - 62}" r="60" fill="url(#tg)"/>`
    + `<path d="M${x - 16} ${y - 52}H${x + 16}L${x + 10} ${y - 40}H${x - 10}Z" fill="${GOLD}" stroke="${GOLD_D}" stroke-width="2.5" stroke-linejoin="round"/>`
    + `<path d="M${x} ${y - 92}C${x + 6} ${y - 78} ${x + 16} ${y - 70} ${x + 11} ${y - 58}C${x + 8} ${y - 50} ${x - 8} ${y - 50} ${x - 11} ${y - 58}C${x - 14} ${y - 68} ${x - 4} ${y - 74} ${x} ${y - 92}Z" fill="url(#fl)" stroke="#a8380a" stroke-width="2"/><path d="M${x} ${y - 74}C${x + 4} ${y - 66} ${x + 6} ${y - 60} ${x} ${y - 56}C${x - 6} ${y - 60} ${x - 3} ${y - 66} ${x} ${y - 74}Z" fill="#fffbe0"/>`;
  const waterfall = (x0, x1, y0, y1) => block([x0 - 14, y0 - 26, x1 - x0 + 28, 24, 14], '#c3bdd2', '#7f7896', true)
    + `<path d="M${x0} ${y0}H${x1}L${x1 + 4} ${y1}H${x0 - 4}Z" fill="url(#wf)" stroke="#2a6fa8" stroke-width="2"/>`
    + Array.from({ length: 7 }, () => { const x = r(x0 + 4, x1 - 4), a = r(y0, y1 - 60); return `<path d="M${x.toFixed(1)} ${a.toFixed(1)}v${r(30, 70).toFixed(1)}" stroke="#fff" stroke-opacity=".75" stroke-width="${r(2, 4).toFixed(1)}" stroke-linecap="round"/>`; }).join('')
    + `<ellipse cx="${(x0 + x1) / 2}" cy="${y1}" rx="${(x1 - x0) * 0.9}" ry="16" fill="#fff" opacity=".6" filter="url(#bl)"/>` + [-0.4, 0, 0.4, 0.2, -0.2].map((d, i) => `<circle cx="${(x0 + x1) / 2 + d * (x1 - x0)}" cy="${y1 - 4 + (i % 2) * 6}" r="${9 - i}" fill="#fff" stroke="#9fd8f5" stroke-width="2"/>`).join('');
  const blossom = (cx, by, s) => shade(cx + s * 0.1, by, s * 0.5, s * 0.14) + `<path d="M${cx - s * 0.06} ${by}L${cx - s * 0.04} ${by - s * 0.45}L${cx - s * 0.2} ${by - s * 0.62}M${cx - s * 0.04} ${by - s * 0.45}L${cx + s * 0.16} ${by - s * 0.66}" stroke="#5a3418" stroke-width="${s * 0.09}" stroke-linecap="round" fill="none"/>`
    + [[-0.28, -0.62, 0.3], [0.26, -0.66, 0.3], [0, -0.86, 0.34], [-0.05, -0.55, 0.26]].map(([dx, dy, rr]) => bush(cx + dx * s, by + dy * s, rr * s * 1.15, ['#ffd0ec', '#ff6fbf', '#9c1f6a'])).join('')
    + Array.from({ length: 9 }, () => `<circle cx="${(cx + r(-0.45, 0.45) * s).toFixed(1)}" cy="${(by + r(-1.05, -0.45) * s).toFixed(1)}" r="${(s * 0.03).toFixed(1)}" fill="#fff4fb"/>`).join('');
  const crystal = (cx, by, s) => shade(cx, by, s * 0.4, s * 0.12) + `<circle cx="${cx}" cy="${by - s * 0.45}" r="${s * 0.75}" fill="url(#cg)" opacity=".7"/>` + block([cx - s * 0.32, by - s * 0.2, s * 0.64, s * 0.16, s * 0.12], '#c9c4d6', '#7b7591')
    + [[-0.16, 0.5, -14], [0.16, 0.45, 16], [0, 0.85, 0]].map(([dx, h, a]) => `<path transform="rotate(${a} ${cx + dx * s} ${by - s * 0.14})" d="M${cx + dx * s} ${by - s * 0.14 - h * s}l${s * 0.11} ${h * s * 0.3}v${h * s * 0.62}h-${s * 0.22}v-${h * s * 0.62}Z" fill="url(#cry)" ${st(2.5)}/><path transform="rotate(${a} ${cx + dx * s} ${by - s * 0.14})" d="M${cx + dx * s} ${by - s * 0.14 - h * s}l${s * 0.05} ${h * s * 0.3}v${h * s * 0.6}h-${s * 0.05}Z" fill="#fff" opacity=".55"/>`).join('');
  const arch = (cx, by, s) => { const w = s, ph = s * 0.62, pw = s * 0.2; return shade(cx, by, w * 0.6, w * 0.12)
    + block([cx - w / 2, by - ph, pw, ph * 0.86, ph * 0.14], '#c9c4d6', '#7b7591') + block([cx + w / 2 - pw, by - ph, pw, ph * 0.86, ph * 0.14], '#c9c4d6', '#7b7591')
    + `<path d="M${cx - w / 2 + pw / 2} ${by - ph + 4}A${(w - pw) / 2} ${(w - pw) / 2} 0 0 1 ${cx + w / 2 - pw / 2} ${by - ph + 4}" fill="none" stroke="${SOL}" stroke-width="${pw + 6}"/><path d="M${cx - w / 2 + pw / 2} ${by - ph + 4}A${(w - pw) / 2} ${(w - pw) / 2} 0 0 1 ${cx + w / 2 - pw / 2} ${by - ph + 4}" fill="none" stroke="#bdb7cf" stroke-width="${pw}"/>`
    + `<path d="M${cx - w / 2 + pw / 2} ${by - ph + 4}A${(w - pw) / 2} ${(w - pw) / 2} 0 0 1 ${cx + w / 2 - pw / 2} ${by - ph + 4}" fill="none" stroke="${SOL}" stroke-opacity=".5" stroke-width="2.5" stroke-dasharray="3 ${(s * 0.16).toFixed(0)}"/>`
    + `<path d="M${cx - 9} ${by - ph - (w - pw) / 2 - pw / 2 + 2}h18l-3 ${pw}h-12Z" fill="#d9d3e8" ${sst(2)}/>`
    + [-1, 1].map((k) => { const x = cx + k * (w / 2 - pw / 2), y = by - ph * 0.55; return `<circle cx="${x}" cy="${y}" r="${s * 0.22}" fill="url(#tg)"/><path d="M${x} ${y - 16}c5 7 7 11 4 15c-2 3-6 3-8 0c-3-4 0-9 4-15Z" fill="url(#fl)" stroke="#a8380a" stroke-width="1.5"/>`; }).join(''); };
  const cloud = (cx, cy, s, a = 1) => `<g opacity="${a}">` + [[-0.6, 0.12, 0.42], [0.55, 0.1, 0.46], [-0.2, -0.12, 0.55], [0.22, -0.2, 0.5], [0, 0.18, 0.5], [0.95, 0.22, 0.3], [-0.95, 0.25, 0.3]]
    .map(([dx, dy, rr]) => `<circle cx="${(cx + dx * s).toFixed(1)}" cy="${(cy + dy * s).toFixed(1)}" r="${(rr * s).toFixed(1)}" fill="url(#cl)"/>`).join('') + '</g>';
  const at = (x, y) => [X(x), Y(y)];

  // 1. sky + back clouds
  let o = `<rect width="${W}" height="${H}" fill="url(#sky)"/>`;
  for (let k = 0; k < 14; k++) { const sd = k % 2, x = sd ? r(21800, 24200) : r(-3200, -800), y = r(1500, 12500); o += cloud(X(x), Y(y), r(160, 260), r(0.55, 0.85)); }
  // 2. island underside: tapered rock, then the cliff face (rim outline swept down by D) with stone courses
  o += `<polygon points="${pts([[-200, 8200], [3000, 12600], [10500, 15500], [18000, 12600], [21200, 8200]])}" fill="#352c4e"/>`;
  const cliff = Array.from({ length: 360 }, (_, i) => { const t = i / 360 * 2 * Math.PI, [x, y] = se(1150, t); return [x, Math.sin(t) > 0 ? y + D : y]; });
  o += `<clipPath id="cfc"><polygon points="${pts(cliff)}"/></clipPath><polygon points="${pts(cliff)}" fill="url(#cf)" ${sst(4)}/><g clip-path="url(#cfc)" stroke="${SOL}" stroke-opacity=".45" stroke-width="3">`;
  for (let y = 4800, k = 0; y < 13000; y += 330, k++) { o += `<path d="M0 ${Y(y)}H${W}"/>`; for (let x = -3000 + (k % 2) * 260; x < 24000; x += 520) o += `<path d="M${X(x)} ${Y(y)}v${(330 * K).toFixed(1)}"/>`; }
  o += `</g><polygon points="${pts(cliff)}" fill="#000" opacity=".12" clip-path="url(#cfc)"/>`;
  for (let k = 0; k < 40; k++) { const x = r(-800, 21800), y = rimY(x, 1150, 1) + r(200, D - 100); o += `<path d="M${X(x)} ${Y(y)}q${r(-8, 8).toFixed(0)} 14 ${r(-4, 4).toFixed(0)} ${r(20, 40).toFixed(0)}" stroke="#4f8f2a" stroke-width="4" stroke-linecap="round" fill="none" opacity=".7"/>`; }
  // 3. ground (zone tint + noise), clipped to the island
  o += `<g clip-path="url(#gr)"><rect width="${W}" height="${H}" fill="url(#zb)"/><rect width="${W}" height="${H}" filter="url(#nz)" opacity=".35"/></g>`;
  // 4. hex tiles: zone fill, random light/dark, bevel; glowing edges on top
  const PATHK = new Set(M.PATH.map((h) => M.key(...h))), COREK = new Set(M.CORE.map((h) => M.key(...h)));
  const free = M.HEXES.filter(([x2, y]) => !PATHK.has(M.key(x2, y)) && !M.BLOCKED.has(M.key(x2, y)));
  let edges = '';
  for (const [x2, y] of M.HEXES) {
    const [cx, cy] = at(...M.center(x2, y)); edges += `<polygon points="${hex(cx, cy, R)}"/>`;
    if (PATHK.has(M.key(x2, y)) || M.BLOCKED.has(M.key(x2, y))) continue;
    const v = hexV(cx, cy, R * 0.9);
    o += `<polygon points="${hex(cx, cy, R)}" fill="url(#zt)"/><polygon points="${hex(cx, cy, R * 0.97)}" fill="${r() < 0.5 ? '#fff' : '#000'}" opacity="${r(0.02, 0.09).toFixed(3)}"/>`
      + `<path d="M${v[4][0].toFixed(1)} ${v[4][1].toFixed(1)}L${v[5][0].toFixed(1)} ${v[5][1].toFixed(1)}L${v[0][0].toFixed(1)} ${v[0][1].toFixed(1)}" stroke="#fff" stroke-opacity=".2" stroke-width="4" fill="none" stroke-linecap="round"/>`
      + `<path d="M${v[1][0].toFixed(1)} ${v[1][1].toFixed(1)}L${v[2][0].toFixed(1)} ${v[2][1].toFixed(1)}L${v[3][0].toFixed(1)} ${v[3][1].toFixed(1)}" stroke="#000" stroke-opacity=".14" stroke-width="5" fill="none" stroke-linecap="round"/>`;
  }
  o += `<rect width="${W}" height="${H}" filter="url(#nz2)" opacity=".18" clip-path="url(#gr)"/>`;
  o += `<g fill="none" stroke="url(#zd)" stroke-width="3" opacity=".8">${edges}</g><g fill="none" stroke="url(#ze)" stroke-width="7" filter="url(#bl3)">${edges}</g><g fill="none" stroke="url(#ze)" stroke-width="2">${edges}</g>`;
  // flowers + tufts on neutral hexes only (defenders never stand there)
  for (const [x2, y] of free) if (M.zoneOf(x2) === -1 && r() < 0.45) { const [cx, cy] = at(...M.center(x2, y)), fx = cx + r(-R * 0.45, R * 0.45), fy = cy + r(-R * 0.4, R * 0.4);
    o += r() < 0.5 ? flower(fx, fy) + flower(fx + 10, fy + 6) : `<path d="M${fx.toFixed(0)} ${fy.toFixed(0)}l-5 -12m5 12l1 -14m-1 14l8 -10" stroke="#2f6a1c" stroke-width="3" stroke-linecap="round"/>`; }
  // 5. sandy stone path (M.PATH) + stone plazas under the cores
  for (const [x2, y] of M.PATH) { const [cx, cy] = at(...M.center(x2, y));
    o += `<polygon points="${hex(cx + 3, cy + 9, R * 0.92)}" fill="#000" opacity=".25"/><polygon points="${sweep(cx, cy, R * 0.9, 8)}" fill="#a8703f" stroke="#6e4524" stroke-width="2.5"/><polygon points="${hex(cx, cy, R * 0.9)}" fill="url(#sand)" stroke="#9a6a42" stroke-width="2.5"/>`
      + `<polygon points="${hex(cx, cy, R * 0.78)}" fill="none" stroke="#fff6dc" stroke-opacity=".35" stroke-width="2.5"/>`
      + `<path d="M${(cx + r(-20, 0)).toFixed(0)} ${(cy + r(-16, 16)).toFixed(0)}l${r(8, 16).toFixed(0)} ${r(-6, 6).toFixed(0)}l${r(6, 12).toFixed(0)} ${r(-4, 8).toFixed(0)}" stroke="#b5845a" stroke-width="2" fill="none"/>`; }
  for (const h of M.CORE) { const [cx, cy] = at(...M.center(...h));
    o += `<polygon points="${sweep(cx, cy, R * 1.55, 14)}" fill="#5b5474" ${sst(3)}/><polygon points="${hex(cx, cy, R * 1.55)}" fill="url(#rk)" ${sst(3)}/><polygon points="${hex(cx, cy, R * 1.2)}" fill="none" stroke="${SOL}" stroke-opacity=".4" stroke-width="3"/>`
      + hexV(cx, cy, R * 1.55).map(([x, y]) => `<path d="M${cx} ${cy}L${x.toFixed(1)} ${y.toFixed(1)}" stroke="${SOL}" stroke-opacity=".25" stroke-width="2.5"/>`).join(''); }
  // 6. blocked hexes: raised rock plateau / lily pond / cracked stone slab, cycled over the mirror pairs (same look on both halves)
  const KINDS = [...new Set([...M.BLOCKED].map((k) => { const h = [k >> 4, k & 15]; return Math.min(k, M.key(...M.mirror(h))); }))].sort((a, b) => a - b);
  for (const [x2, y] of M.HEXES) if (M.BLOCKED.has(M.key(x2, y))) {
    const [cx, cy] = at(...M.center(x2, y)), [mx, my] = M.mirror([x2, y]), kind = KINDS.indexOf(Math.min(M.key(x2, y), M.key(mx, my))) % 3;
    if (kind === 0) { // plateau
      o += shade(cx + 8, cy + 30, R * 0.95, R * 0.35) + `<polygon points="${sweep(cx, cy - 26, R * 0.92, 44)}" fill="#6a6184" ${sst(3)}/>`
        + [-0.5, -0.1, 0.35].map((u) => `<path d="M${(cx + u * R).toFixed(1)} ${(cy + 10).toFixed(1)}v${r(14, 30).toFixed(0)}" stroke="${SOL}" stroke-opacity=".5" stroke-width="2.5"/>`).join('')
        + `<polygon points="${hex(cx, cy - 26, R * 0.92)}" fill="url(#rk)" ${sst(3)}/><polygon points="${hex(cx, cy - 28, R * 0.74)}" fill="#7cc444" stroke="#2f6a1c" stroke-width="3"/><polygon points="${hex(cx - 6, cy - 34, R * 0.45)}" fill="#a6e46a" opacity=".55"/>`
        + bush(cx + r(-14, 14), cy - 26, 16) + flower(cx - 26, cy - 14) + flower(cx + 24, cy - 40);
    } else if (kind === 1) { // pond
      o += `<polygon points="${hex(cx, cy, R * 0.95)}" fill="url(#rk)" ${sst(3)}/><polygon points="${hex(cx, cy + 2, R * 0.78)}" fill="url(#wa)" stroke="#1f5e9a" stroke-width="3"/>`
        + `<path d="M${cx - 30} ${cy + 18}q10 -6 20 0M${cx + 6} ${cy - 22}q8 -5 16 0" stroke="#fff" stroke-opacity=".6" stroke-width="2.5" fill="none" stroke-linecap="round"/>`
        + [[-14, 8, 14], [18, 14, 11], [10, -12, 9]].map(([dx, dy, s]) => `<path d="M${cx + dx} ${cy + dy}l${s} -${s * 0.35}A${s} ${s * 0.75} 0 1 1 ${cx + dx + s * 0.9} ${cy + dy + s * 0.25}Z" fill="#5cbf4a" stroke="#2b6a24" stroke-width="2"/>`).join('')
        + `<circle cx="${cx - 14}" cy="${cy + 4}" r="5" fill="#ff8fc8" stroke="#a02a68" stroke-width="1.5"/><circle cx="${cx - 14}" cy="${cy + 4}" r="2" fill="#ffe36b"/>`;
    } else { // slab
      const v = hexV(cx, cy - 6, R * 0.86);
      o += `<polygon points="${sweep(cx, cy - 6, R * 0.86, 14)}" fill="#6a6184" ${sst(3)}/><polygon points="${hex(cx, cy - 6, R * 0.86)}" fill="url(#sT)" ${sst(3)}/>`
        + `<path d="M${cx + 4} ${cy - 4}L${v[0][0].toFixed(1)} ${v[0][1].toFixed(1)}M${cx + 4} ${cy - 4}L${v[2][0].toFixed(1)} ${v[2][1].toFixed(1)}M${cx + 4} ${cy - 4}L${v[4][0].toFixed(1)} ${v[4][1].toFixed(1)}" stroke="${SOL}" stroke-width="3"/><path d="M${v[5][0].toFixed(1)} ${(v[5][1] + 4).toFixed(1)}L${cx - 2} ${cy - 30}" stroke="#fff" stroke-opacity=".4" stroke-width="2.5"/>`;
    }
  }
  // 7. rim blocks + props, painted back to front by base y. Water channels to the two waterfalls first.
  const props = [], P = (y, s) => props.push([y, s]);
  const FALLS = [1300, M.W - 1300];
  for (const x of FALLS) { const y0 = rimY(x, 250, 1), y1 = rimY(x, 1150, 1), w = 340; o += `<rect x="${X(x - w)}" y="${Y(y0 - 300)}" width="${(2 * w * K).toFixed(1)}" height="${((y1 - y0 + 300) * K).toFixed(1)}" rx="8" fill="url(#wa)" stroke="#1f5e9a" stroke-width="3"/>`;
    P(y1 + 1, waterfall(X(x - w), X(x + w), Y(y1), Y(y1 + D + 400))); }
  for (const [x, y] of [...ring(430, 520), ...ring(900, 560)]) { if (FALLS.some((f) => Math.abs(x - f) < 480 && y > ISLAND.cy)) continue;
    const w = r(470, 600), h = r(360, 470), d = y > ISLAND.cy + 4500 ? r(180, 260) : r(220, 340);
    P(Y(y), block([X(x - w / 2), Y(y - h / 2), +(w * K).toFixed(1), +(h * K).toFixed(1), +(d * K).toFixed(1)], pick(['#c3bdd2', '#b2acc4', '#cbc6d8', '#a9a3bd']), pick(['#7f7896', '#736c8a', '#8a83a0']), r() < 0.3)); }
  const rp = (deg, off = 650) => se(off, deg * Math.PI / 180);
  const T = (deg, off, f) => { const [x, y] = rp(deg, off); P(Y(y) + 2, f(X(x), Y(y))); };
  for (const d of [238, 300]) T(d, 820, (x, y) => blossom(x, y, 230));
  for (const d of [192, 348]) T(d, 760, (x, y) => blossom(x, y, 170));
  for (const [d, s] of [[214, 150], [222, 170], [250, 150], [258, 130], [276, 140], [283, 160], [318, 150], [326, 170], [204, 120], [336, 130], [148, 140], [32, 140], [160, 110], [20, 110]]) T(d, 780, (x, y) => pine(x, y, s));
  for (const d of [52, 66, 80, 100, 114, 128, 170, 10, 200, 340, 228, 312, 245, 295]) T(d, 560 + r(0, 200), (x, y) => bush(x, y, r(20, 30)));
  for (let k = 0; k < 70; k++) T(r(0, 360), r(300, 900), (x, y) => flower(x, y));
  for (const d of [205, 156]) T(d, 520, (x, y) => `<g transform="translate(${x} ${y}) scale(1.8)">${banner(0, -114, TEAM.foe)}</g>`);
  for (const d of [335, 24]) T(d, 520, (x, y) => `<g transform="translate(${x} ${y}) scale(1.8)">${banner(0, -114, TEAM.you)}</g>`);
  for (const d of [168, 192, 12, 348, 232, 128, 308, 52]) T(d, 450, (x, y) => `<g transform="translate(${x} ${y}) scale(1.25)">${torch(0, 0)}</g>`);
  // top / bottom centre decoration (point-symmetric): crystal + arch on each rim
  for (const [x, sg, f] of [[8600, -1, (x, y) => crystal(x, y, 120)], [12600, -1, (x, y) => arch(x, y, 190)], [M.W - 8600, 1, (x, y) => crystal(x, y, 110)], [M.W - 12600, 1, (x, y) => arch(x, y, 170)]]) { const y = rimY(x, 480, sg); P(Y(y) + 3, f(X(x), Y(y))); }
  props.sort((a, b) => a[0] - b[0]).forEach(([, s]) => { o += s; });
  // 8. front clouds under the island, warm light + vignette
  for (let k = 0; k < 22; k++) { const x = r(-2600, 23600), y = r(12500, 14200); o += cloud(X(x), Y(y), r(170, 300), r(0.85, 1)); }
  o += `<rect width="${W}" height="${H}" fill="url(#lt)"/>`;
  return svg(W, H, defs + o);
};
const bakePng = (svgText, out, w, h) => { // headless Chrome screenshot of the SVG at 1:1
  const f = mkdtempSync(tmpdir() + '/arena') + '/a.svg'; writeFileSync(f, svgText);
  execFileSync('google-chrome', ['--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${w},${h}`, `--screenshot=${process.cwd()}/${out}`, 'file://' + f], { stdio: 'ignore' });
};

// ---- HUD (2x: 64 px per tile) ----
const fr = (a, w, h) => a.map((v, k) => +(v / (k % 2 ? h : w)).toFixed(4));
const BAR = [76, 46, 180, 20]; // hp slot px in the 272x80 plate (avatar overlaps the left 70 px)
const hudBar = svg(272, 80, `<defs>${grad('hb', '#2e3a70', '#131834')}</defs><rect x="3" y="3" width="266" height="74" rx="16" fill="url(#hb)" fill-opacity=".94" stroke="#080a1c" stroke-width="3"/><path d="M20 7H252" stroke="#7083d8" stroke-opacity=".55" stroke-width="2" stroke-linecap="round"/>`
  + `<rect x="${BAR[0] - 3}" y="${BAR[1] - 3}" width="${BAR[2] + 6}" height="${BAR[3] + 6}" rx="9" fill="#06081a" stroke="#000" stroke-width="2"/><rect x="${BAR[0]}" y="${BAR[1]}" width="${BAR[2]}" height="5" rx="2" fill="#000" opacity=".5"/>`);
const hudAvatar = svg(96, 96, `<defs>${grad('ha', '#e8e8e8', '#8a8a8a')}${grad('hi', '#6a6a6a', '#3a3a3a')}</defs><polygon points="${hex(48, 48, 45)}" fill="url(#ha)" ${st(3.5)}/><polygon points="${hex(48, 48, 35)}" fill="url(#hi)" ${st(2.5)}/><polygon points="${hex(48, 48, 40)}" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="2"/><g transform="translate(48 50)">${crest(0.62, '#d6d6d6', '#f4f4f4')}</g>`);
const TIMER = [34, 38, 156, 52];
const hudTimer = svg(224, 112, `<defs>${grad('tgd', '#ffe79a', '#c08424')}${grad('tin', '#2a2150', '#100c24')}</defs>`
  + `<path d="M14 26H210Q218 26 217 34L206 92Q204 104 192 104H32Q20 104 18 92L7 34Q6 26 14 26Z" fill="url(#tgd)" stroke="#4a2f0c" stroke-width="3"/><path d="M14 30H210" stroke="#fff7d0" stroke-width="2.5" stroke-linecap="round"/>`
  + `<path d="M24 36H200L192 86Q190 95 181 95H43Q34 95 32 86Z" fill="url(#tin)" stroke="#6a4512" stroke-width="2.5"/><g transform="translate(112 22)">${crest(0.5, GOLD, '#b27bff')}</g>`);
const energySeg = svg(64, 32, `<defs>${grad('es', '#ff9af3', '#b0109a')}</defs><rect x="2.5" y="3" width="59" height="26" rx="6" fill="url(#es)" stroke="#3a0a35" stroke-width="2"/><rect x="7" y="6" width="50" height="7" rx="3.5" fill="#fff" opacity=".45"/>`);

// Card frame 2x2.6 tiles (128x166): gold border, transparent portrait window, dark name plate along the bottom, purple cost gem top-left.
const W0 = [8, 8, 112, 118], NAME = [10, 128, 108, 30], GEM = [18, 17];
const frame = svg(128, 166, `<defs>${grad('fg', '#ffe9a0', '#c4872a')}${grad('fi', '#2c2350', '#140f2a')}${grad('gm', '#c49bff', '#5a22c0')}</defs>`
  + `<path fill-rule="evenodd" d="M12 1H116Q127 1 127 12V154Q127 165 116 165H12Q1 165 1 154V12Q1 1 12 1ZM${W0[0]} ${W0[1]}V${W0[1] + W0[3]}H${W0[0] + W0[2]}V${W0[1]}Z" fill="url(#fg)" stroke="#4a2f0c" stroke-width="2.5"/>`
  + `<path d="M12 4H116" stroke="#fff8d8" stroke-width="2" stroke-linecap="round"/><rect x="${W0[0]}" y="${W0[1]}" width="${W0[2]}" height="${W0[3]}" fill="none" stroke="#3b2a10" stroke-width="2"/>`
  + `<rect x="${NAME[0]}" y="${NAME[1]}" width="${NAME[2]}" height="${NAME[3]}" rx="6" fill="url(#fi)" stroke="#6a4a14" stroke-width="2"/><path d="M16 131H112" stroke="#6d5cb0" stroke-opacity=".6" stroke-width="1.5"/>`
  + `<path d="M18 0L33 8.5V25.5L18 34L3 25.5V8.5Z" fill="url(#gm)" stroke="#24104a" stroke-width="2.5" stroke-linejoin="round"/><path d="M18 4L29 10.5V15L18 9L7 15V10.5Z" fill="#fff" opacity=".45"/>`);

// ---- fx ----
const shot = svg(32, 32, `<ellipse cx="16" cy="16" rx="7" ry="13" fill="${G.mid}" opacity=".45"/><ellipse cx="16" cy="14" rx="4" ry="9" fill="${G.top}" ${st(1.5)}/><ellipse cx="16" cy="11" rx="2" ry="4" fill="#fff"/>`);
const splash = svg(96 * 4, 96, [0, 1, 2, 3].map((i) => { const r = 14 + i * 9, o = 1 - i * 0.22; return `<g transform="translate(${96 * i} 0)" opacity="${o}"><circle cx="48" cy="48" r="${r}" fill="${G.top}" opacity=".3"/><circle cx="48" cy="48" r="${r}" fill="none" stroke="#fff" stroke-width="${8 - i * 1.5}"/>${[0, 60, 120, 180, 240, 300].map((a) => `<circle cx="${48 + Math.cos((a + i * 12) * Math.PI / 180) * (r + 6)}" cy="${48 + Math.sin((a + i * 12) * Math.PI / 180) * (r + 6)}" r="${4 - i * 0.8}" fill="${G.mid}" ${st(1.5)}/>`).join('')}</g>`; }).join(''));
const star = (r) => Array.from({ length: 8 }, (_, k) => { const a = k * Math.PI / 4, q = k % 2 ? r * 0.45 : r; return `${(24 + Math.cos(a) * q).toFixed(1)} ${(24 + Math.sin(a) * q).toFixed(1)}`; }).join('L');
const hit = svg(48 * 3, 48, [10, 20, 16].map((r, i) => `<g transform="translate(${48 * i} 0)" opacity="${[1, 1, 0.55][i]}"><path d="M${star(r)}Z" fill="#ffe36b" ${st(2)}/><path d="M${star(r * 0.5)}Z" fill="#fff"/></g>`).join(''));
const energy = svg(64, 64, `<path d="M32 3L57 17V47L32 61L7 47V17Z" fill="#e0a526" ${st(3.5)}/><path d="M32 10L50 20V44L32 54L14 44V20Z" fill="#ffd166"/><path d="M36 13L20 36H31L27 52L45 27H34Z" fill="#fff8e0" ${st(2.5)}/>`);


// Tray (landscape, 64 px per tile): wide bottom panel, energy row on the left, raised card bay (4 cards + smaller Next) on the right.
const TR = { w: 30, h: 4.25, gem: [1.9, 2.45], bar: [3.3, 2.2, 10, 0.5], label: [13.5, 2.0, 1.8, 0.9], cards: [0, 1, 2, 3].map((i) => [18.6 + i * 2.2, 1.0, 2, 2.6]), next: [27.65, 1.6, 1.5, 1.95] };
const px = ([x, y, w, h]) => [x * 64, y * 64, w * 64, h * 64];
const trayW = TR.w * 64, trayH = TR.h * 64, B = TR.cards[0][0] * 64 - 838; // B = card-bay x shift
const hudTray = svg(trayW, trayH, `<defs>${grad('ty', '#3a2c78', '#160f34')}${grad('tb', '#4a3a96', '#221852')}${grad('tk', '#0a0720', '#1a1238')}</defs>`
  + `<path d="M3 ${trayH}V120L40 84H${770 + B}L${800 + B} ${trayH}Z" fill="url(#ty)" stroke="#0a0720" stroke-width="4"/><path d="M8 122L42 89H${766 + B}" fill="none" stroke="${GOLD}" stroke-width="3"/>`
  + `<path d="M${760 + B} ${trayH}L${790 + B} 40Q${796 + B} 20 ${818 + B} 20H${trayW - 22}Q${trayW - 3} 20 ${trayW - 3} 42V${trayH}Z" fill="url(#tb)" stroke="#0a0720" stroke-width="4"/><path d="M${793 + B} 38Q${799 + B} 25 ${818 + B} 25H${trayW - 22}Q${trayW - 8} 25 ${trayW - 8} 42" fill="none" stroke="${GOLD}" stroke-width="3"/>`
  + `<path d="M${808 + B} ${trayH - 6}L${834 + B} 56Q${838 + B} 46 ${850 + B} 46H${trayW - 30}Q${trayW - 18} 46 ${trayW - 18} 58V${trayH - 6}" fill="none" stroke="#7a5ad8" stroke-opacity=".6" stroke-width="2"/>`
  + (([x, y, w, h]) => `<rect x="${x - 50}" y="${y - 14}" width="${w + 50 + TR.label[2] * 64 + 14}" height="${h + 28}" rx="${(h + 28) / 2}" fill="url(#tk)" stroke="#6a52c8" stroke-width="2.5"/>`)(px(TR.bar))
  + `<circle cx="${TR.gem[0] * 64}" cy="${TR.gem[1] * 64}" r="40" fill="url(#tk)" stroke="#6a52c8" stroke-width="2.5"/>`
  + (([x, y, w, h]) => Array.from({ length: 10 }, (_, i) => `<rect x="${(x + i * w / 10 + 2).toFixed(1)}" y="${y + 2}" width="${(w / 10 - 4).toFixed(1)}" height="${h - 4}" rx="5" fill="#2a2052"/>`).join(''))(px(TR.bar))
  + [...TR.cards, TR.next].map((c) => { const [x, y, w, h] = px(c); return `<rect x="${x - 4}" y="${y - 4}" width="${w + 8}" height="${h + 8}" rx="13" fill="#120c2c" stroke="#3a3070" stroke-width="2"/>`; }).join(''));

// ---- write ----
const files = {
  'unit.cannon.svg': strip(4, UNITS.cannon), 'unit.rapid.svg': strip(4, UNITS.rapid), 'unit.sniper.svg': strip(4, UNITS.sniper),
  'unit.bulwark.svg': strip(4, UNITS.bulwark), 'unit.grunt.svg': strip(4, UNITS.grunt), 'unit.minion.svg': strip(4, UNITS.minion),
  'core.svg': core('you'), 'coreEnemy.svg': core('foe'), 'hex.base.svg': plinth('you'), 'hex.baseEnemy.svg': plinth('foe'),
  'hex.ok.svg': glowHex('#5cf0c8', '#a8fff0'), 'hex.attack.svg': glowHex('#ffa630', '#ffe07a'), 'hex.bad.svg': glowHex('#ff3040', '#ff9a9a'),
  'ui.sword.svg': sword, 'ui.shield.svg': shield,
  'card.frame.svg': frame, 'fx.shot.svg': shot, 'fx.splash.svg': splash, 'fx.hit.svg': hit, 'ui.energy.svg': energy,
  'hud.bar.svg': hudBar, 'hud.avatar.svg': hudAvatar, 'hud.timer.svg': hudTimer, 'hud.tray.svg': hudTray, 'hud.energySeg.svg': energySeg,
};
for (const [f, s] of Object.entries(files)) writeFileSync(f, s);
for (const f of ['pad.svg', 'padEnemy.svg', 'padDead.svg']) if (existsSync(f)) unlinkSync(f); // retired
bakePng(arena(), 'arena.png', AW, AH);

const walk = (src, w) => ({ src, w, h: w, anchor: [0.5, 0.7], tint: true, frames: 4, fps: 8 });
const portrait = (k) => ({ src: `card.${k}.png`, w: 2, h: 2, anchor: [0.5, 0.5], tint: true });
const ui = (src, w, h, extra = {}) => ({ src, w, h, anchor: [0, 0], tint: false, ...extra });
const HXH = +(2 / Math.sqrt(3)).toFixed(4); // hex height in tiles (1.1547)
const sprites = {
  'unit.cannon': walk('unit.cannon.svg', 1.25), 'unit.rapid': walk('unit.rapid.svg', 1), 'unit.sniper': walk('unit.sniper.svg', 1),
  'unit.bulwark': walk('unit.bulwark.svg', 1.25), 'unit.grunt': walk('unit.grunt.svg', 1), 'unit.minion': walk('unit.minion.svg', 0.6),
  // world = sim-unit rect [x0,y0,x1,y1] the PNG covers (top-down, linear); w/h = same in tiles
  arena: { src: 'arena.png', w: (WORLD[2] - WORLD[0]) / 1000, h: (WORLD[3] - WORLD[1]) / 1000, anchor: [0, 0], tint: false, world: WORLD },
  core: { src: 'core.svg', w: 2.2, h: 2.5, anchor: [0.5, 0.6], tint: false }, // anchor = core hex centre
  coreEnemy: { src: 'coreEnemy.svg', w: 2.2, h: 2.5, anchor: [0.5, 0.6], tint: false },
  'hex.base': { src: 'hex.base.svg', w: 1, h: 1.35, anchor: [0.5, 0.416], tint: false }, // anchor = hex centre = plinth top centre (stand the unit there)
  'hex.baseEnemy': { src: 'hex.baseEnemy.svg', w: 1, h: 1.35, anchor: [0.5, 0.416], tint: false },
  'hex.ok': { src: 'hex.ok.svg', w: 1, h: HXH, anchor: [0.5, 0.5], tint: false },
  'hex.attack': { src: 'hex.attack.svg', w: 1, h: HXH, anchor: [0.5, 0.5], tint: false },
  'hex.bad': { src: 'hex.bad.svg', w: 1, h: HXH, anchor: [0.5, 0.5], tint: false },
  'ui.sword': { src: 'ui.sword.svg', w: 0.6, h: 0.6, anchor: [0.5, 0.5], tint: false },
  'ui.shield': { src: 'ui.shield.svg', w: 0.6, h: 0.6, anchor: [0.5, 0.5], tint: false },
  'card.frame': { src: 'card.frame.svg', w: 2, h: 2.6, anchor: [0, 0], tint: false, window: fr(W0, 128, 166), name: fr(NAME, 128, 166), gem: fr(GEM, 128, 166) },
  ...Object.fromEntries(['cannon', 'rapid', 'sniper', 'bulwark', 'grunt'].filter((k) => existsSync(`card.${k}.png`)).map((k) => [`card.${k}`, portrait(k)])),
  'fx.shot': { src: 'fx.shot.svg', w: 0.4, h: 0.4, anchor: [0.5, 0.5], tint: true },
  'fx.splash': { src: 'fx.splash.svg', w: 2, h: 2, anchor: [0.5, 0.5], tint: true, frames: 4, fps: 12 },
  'fx.hit': { src: 'fx.hit.svg', w: 0.6, h: 0.6, anchor: [0.5, 0.5], tint: false, frames: 3, fps: 15 },
  'ui.energy': { src: 'ui.energy.svg', w: 1, h: 1, anchor: [0.5, 0.5], tint: false },
  'hud.bar': ui('hud.bar.svg', 4.25, 1.25, { slot: fr(BAR, 272, 80) }), // neutral plate; code fills slot (red/blue). Mirror horizontally for the right side.
  'hud.avatar': ui('hud.avatar.svg', 1.5, 1.5, { tint: true }),
  'hud.timer': ui('hud.timer.svg', 3.5, 1.75, { text: fr(TIMER, 224, 112) }),
  'hud.tray': ui('hud.tray.svg', TR.w, TR.h, { gem: fr(TR.gem, TR.w, TR.h), bar: fr(TR.bar, TR.w, TR.h), label: fr(TR.label, TR.w, TR.h), cards: TR.cards.map((c) => fr(c, TR.w, TR.h)), next: fr(TR.next, TR.w, TR.h) }),
  'hud.energySeg': ui('hud.energySeg.svg', 1, 0.5), // 10 side by side fill tray.bar exactly (stretch to bar.w/10)
};
const old = existsSync('manifest.json') ? JSON.parse(readFileSync('manifest.json', 'utf8')) : { v: 0 };
writeFileSync('manifest.json', JSON.stringify({ v: old.v + 1, tile: 32, sprites }, null, 1) + '\n');
console.log('wrote', Object.keys(files).length, `svgs + arena.png ${AW}x${AH}, manifest v`, old.v + 1);
