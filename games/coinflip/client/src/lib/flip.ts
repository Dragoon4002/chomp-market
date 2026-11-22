// Commit-reveal coin: commit = sha256(seed), result = sha256(seed ‖ utf8(clientSeed))[0] & 1 (0 heads, 1 tails).
export const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
export const unhex = (s: string) => Uint8Array.from(s.match(/../g) ?? [], (h) => parseInt(h, 16));
const sha = async (b: Uint8Array) => new Uint8Array(await crypto.subtle.digest('SHA-256', b as BufferSource));

export const commitOf = async (seed: Uint8Array) => hex(await sha(seed));

export async function flip(seed: Uint8Array, clientSeed: string): Promise<0 | 1> {
  const c = new TextEncoder().encode(clientSeed);
  const b = new Uint8Array(seed.length + c.length);
  b.set(seed);
  b.set(c, seed.length);
  return ((await sha(b))[0] & 1) as 0 | 1;
}
