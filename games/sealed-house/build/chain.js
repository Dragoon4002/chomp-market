// Thin chain adapter. Local mock today; each method marks the program instruction it maps to
// (program/src/lib.rs). The game only talks to this object, so swapping in real txs touches one file.
import { lotRandomness, resolveLot, buyback, tapeHash } from './game.js';

const hex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');
function salt() {
  const s = new Uint8Array(32);
  try { crypto.getRandomValues(s); } catch { /* no crypto: zero salt, mock only */ }
  return s;
}

export function mockChain(base) {
  return {
    // TODO(solana): VRF create_lot(commit_secs, reveal_secs, client_seed) on base, then wait for the
    // oracle's fill_lot callback and read Lot { items, weight, glow, shown, tie_seed }.
    // Mock: the session seed stands in for the VRF output.
    async openLot(i) { return lotRandomness(base, i); },

    // TODO(solana): escrow commit_bid(sha256(amount_le ‖ salt ‖ bidder), deposit) — deposit >= amount
    // hides the bid; keep { amount, salt } client-side for reveal_bid. Mock hash = fnv64, display only.
    async commitBid(i, amount) {
      const s = salt();
      return { amount, salt: s, commitment: tapeHash([i, amount, hex(s)]) };
    },

    // TODO(solana): reveal_bid(amount, salt) after commit_end for the player; bots reveal via the
    // house crank. Then settle() with every [bid, bidder] pair as remaining accounts.
    async revealAndSettle(i, commit) { return resolveLot(base, i, commit.amount); },

    // TODO(solana): sell_back(mask) pays 90% of listed value from the House treasury PDA.
    // Kept items: TODO(solana) NFT mint as Metaplex Core assets to the winner.
    async sellBack(lot, mask) { return buyback(lot.items, mask); },
  };
}
