// Room code <-> on-chain match id: 4 letters (brawler's alphabet), affine scramble so neighbouring ids don't look sequential.
// ponytail: ids >= 24^4 (331776) would wrap; widen to 5 letters if the platform ever gets that far.
const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ', N = 24 ** 4, A = 7919, A_INV = 303119, B = 104729;

export function toCode(id: number): string {
  let x = (id * A + B) % N, s = '';
  for (let i = 0; i < 4; i++) { s = L[x % 24] + s; x = Math.floor(x / 24); }
  return s;
}

export function fromCode(code: string): number | null {
  const c = code.trim().toUpperCase().replace(/^#/, '');
  if (!/^[A-Z]{4}$/.test(c)) return null;
  let x = 0;
  for (const ch of c) { const d = L.indexOf(ch); if (d < 0) return null; x = x * 24 + d; }
  return (((x - B) % N + N) % N) * A_INV % N;
}
