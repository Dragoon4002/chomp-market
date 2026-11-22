import { newGame, step, type GameState } from './sim/sim.ts';
import { applySkills, sanitize, sanitizeSkills, statsOf } from './genes.ts';
import type { StageId } from './stages.ts';

// Server-recorded fight (GET /tape/<key>); frames packed host<<16|guest.
export interface Tape {
  key: string; match_id: number | null; stage: StageId; stake: string; winner: number | null; reason: string;
  tape_hash: string; at: number; frames: number[]; players: { name: string; account: string; dna: unknown; skills?: unknown }[];
}

export const unpack = (f: number) => [(f >>> 16) & 0xffff, f & 0xffff];

// Same as server referee::tape_hash: sha256(utf8(stage) ++ 0x00 ++ frames as u32 LE), lowercase hex.
export async function tapeHash(stage: string, frames: number[]) {
  const s = new TextEncoder().encode(stage);
  const buf = new Uint8Array(s.length + 1 + frames.length * 4);
  buf.set(s);
  const dv = new DataView(buf.buffer);
  frames.forEach((f, i) => dv.setUint32(s.length + 1 + i * 4, f >>> 0, true));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf)), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Headless re-run of the whole tape (~1 µs/frame).
export function simulate(t: Pick<Tape, 'players' | 'stage' | 'frames'>): GameState {
  const s = newGame(t.players.map((p) => applySkills(statsOf(sanitize(p.dna)), sanitizeSkills(p.skills))), t.stage);
  for (const f of t.frames) { if (s.winner >= 0) break; step(s, unpack(f)); }
  return s;
}
