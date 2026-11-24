// Thin chain adapter. Today: in-memory mock of program/ (pet_den) running the same sim.
// Real-time -> ticks happens here (the edge), never in sim.js.
import { newStats, advance, act, evolve } from './sim.js';

export const TICK_MS = 2000; // ponytail: demo speed; the program uses TICK_SECS = 60
const KEY = 'petden.v1';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } }; // portal sandbox: throws -> in-memory
const save = (p) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* sandboxed */ } };

export function createChain(owner) {
  let pet = load();
  if (pet && pet.owner !== owner) pet = null;
  const ok = (err) => { save(pet); if (err) throw new Error(err); return pet; };

  return {
    get pet() { return pet; },
    // TODO(solana): PER auth: verifyTeeRpcIntegrity(TEE) + getAuthToken(TEE, wallet, sign) -> Connection(`https://devnet-tee.magicblock.app?token=${token}`)
    //   then fetch Pet PDA ["pet", owner] from the TEE (owner-only read via the permission program).
    async createPet(dna, now) {
      // TODO(solana): base tx pet_den.create_pet(dna) (+ CreatePermission CPI, member = owner).
      pet = { owner, dna, stats: newStats(), lastMs: now, delegated: false };
      return ok();
    },
    async delegate() {
      // TODO(solana): base tx pet_den.delegate_pet, remainingAccounts = [TEE validator MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo].
      pet.delegated = true;
      return ok();
    },
    // Mirrors catch_up(): whole ticks since lastMs.
    async tick(now) {
      // TODO(solana): PER tx pet_den.tick (gasless) when the client wants a fresh read; reads are free via TEE RPC.
      const n = Math.max(0, Math.floor((now - pet.lastMs) / TICK_MS));
      advance(pet.stats, n);
      pet.lastMs += n * TICK_MS;
      return ok();
    },
    async care(kind, score, now) {
      // TODO(solana): PER tx pet_den.care(action, score), signed by a session key (gum-sdk V2), no wallet popup.
      await this.tick(now);
      return ok(act(pet.stats, kind, score));
    },
    async evolve(now) {
      // TODO(solana): PER tx pet_den.evolve -> commit_and_undelegate pet + permission (tier public on base),
      //   then base tx delegate_pet again to keep caring. Magic Action: update Core NFT tier attribute.
      await this.tick(now);
      const err = evolve(pet.stats);
      if (!err) pet.delegated = false;
      return ok(err);
    },
  };
}
