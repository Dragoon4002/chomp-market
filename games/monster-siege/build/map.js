// Monster Siege hex map: shared by sim, render, bot and the art generator. Pure data, no deps.
// Pointy-top hexes in "doubled width" coords (x2, y): a hex exists iff (x2 + y) is odd,
// neighbours are (±2,0) and (±1,±1). Odd rows hold 21 hexes (x2 0..40), even rows 20 (x2 1..39).
// Board is point-symmetric: (x2, y) <-> (40 - x2, 10 - y). Seat 0 (you) core is on the right.

export const ROWS = 11, X2MAX = 40;
export const HEX_W = 1000;                 // sim units across flats (1 "tile" in unit ranges)
export const STEP_X = HEX_W / 2;           // per x2
export const STEP_Y = 866;                 // 1.5 * R, R = HEX_W / sqrt(3) ~= 577
export const MARGIN = 500;
export const W = MARGIN * 2 + X2MAX * STEP_X;          // 21000
export const H = MARGIN * 2 + (ROWS - 1) * STEP_Y;     // 9660

export const valid = (x2, y) => y >= 0 && y < ROWS && x2 >= 0 && x2 <= X2MAX && (x2 + y) % 2 === 1;
export const center = (x2, y) => [MARGIN + x2 * STEP_X, MARGIN + y * STEP_Y];
export const mirror = ([x2, y]) => [X2MAX - x2, ROWS - 1 - y];
export const key = (x2, y) => x2 * 16 + y;

// Every hex on the board.
export const HEXES = [];
for (let y = 0; y < ROWS; y++) for (let x2 = 0; x2 <= X2MAX; x2++) if (valid(x2, y)) HEXES.push([x2, y]);

// Path from seat 0 core (right) to seat 1 core (left): S-shaped snake, point-symmetric.
const WAY = [[38, 5], [32, 5], [29, 2], [23, 2], [20, 5], [17, 8], [11, 8], [8, 5], [2, 5]];
export const PATH = [WAY[0]];
for (let i = 1; i < WAY.length; i++) {
  let [x, y] = WAY[i - 1];
  const [tx, ty] = WAY[i];
  while (x !== tx || y !== ty) {
    if (y === ty) x += Math.sign(tx - x) * 2;
    else { x += Math.sign(tx - x); y += Math.sign(ty - y); }
    PATH.push([x, y]);
  }
}
export const CORE = [PATH[0], PATH[PATH.length - 1]]; // [seat0 (right), seat1 (left)]

// Rocks / water / plateaus: nobody can place here. Listed for seat 0's half + middle, mirrored for seat 1.
const BLOCK0 = [[34, 1], [35, 2], [28, 7], [33, 8], [36, 9], [20, 1], [21, 2]];
export const BLOCKED = new Set();
for (const h of BLOCK0) { BLOCKED.add(key(...h)); BLOCKED.add(key(...mirror(h))); }

// Fixed deploy zones by column: seat 0 owns x2 >= 26, seat 1 owns x2 <= 14, the middle is neutral.
export const zoneOf = (x2) => (x2 >= 26 ? 0 : x2 <= 14 ? 1 : -1);

const PATHSET = new Set(PATH.map((h) => key(...h)));
const CORESET = new Set(CORE.map((h) => key(...h)));
export const isPath = (x2, y) => PATHSET.has(key(x2, y));
// What a card dropped on (x2, y) by seat does: 'attack' (path, any zone: squad spawns at own core),
// 'defend' (free ground hex in own zone), or null (invalid).
export function dropKind(seat, x2, y) {
  if (!valid(x2, y) || CORESET.has(key(x2, y))) return null;
  if (PATHSET.has(key(x2, y))) return 'attack';
  if (BLOCKED.has(key(x2, y)) || zoneOf(x2) !== seat) return null;
  return 'defend'; // occupancy (one defender per hex) is checked by the sim
}

// Nearest hex to a sim-space point (for input picking). Brute force over 225 hexes: fine per click.
export function hexAt(px, py) {
  let best = null, bd = Infinity;
  for (const [x2, y] of HEXES) {
    const [cx, cy] = center(x2, y), d = (cx - px) ** 2 + (cy - py) ** 2;
    if (d < bd) { bd = d; best = [x2, y]; }
  }
  return bd <= (STEP_Y * 0.8) ** 2 ? best : null;
}

// Point at integer distance d (0..PATH_LEN) along PATH from seat 0's core; every hex step is HEX_W long.
// The far half is computed as the mirror of the near half, so pathPos(PATH_LEN - d) is exactly the mirror of pathPos(d).
export const PATH_LEN = (PATH.length - 1) * HEX_W;
export function pathPos(d) {
  if (d * 2 > PATH_LEN) { const [x, y] = pathPos(PATH_LEN - d); return [W - x, H - y]; }
  const i = Math.floor(d / HEX_W), f = d - i * HEX_W, [ax, ay] = center(...PATH[i]);
  if (!f) return [ax, ay];
  const [bx, by] = center(...PATH[i + 1]);
  return [ax + Math.trunc(((bx - ax) * f) / HEX_W), ay + Math.trunc(((by - ay) * f) / HEX_W)];
}
