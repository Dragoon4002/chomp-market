// Chain adapter. The game only talks to this object (openLot / commitBid / revealAndSettle / sellBack).
// chainFor(session): real devnet program (program/src/lib.rs) when the portal gives us a wallet + tx bridge,
// else the local mock (standalone, signed out, smoke.mjs). Both return the same shapes.
import { lotRandomness, contents, resolveLot, buyback, tapeHash, baseSeed, BOTS } from './game.js';

const hex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');
function salt() {
  const s = new Uint8Array(32);
  try { crypto.getRandomValues(s); } catch { /* no crypto: zero salt, mock only */ }
  return s;
}

export const onChain = (s) => !!(s.wallet && globalThis.Chomp?.tx && s.programs?.sealedHouse);
export function chainFor(s) {
  return onChain(s) ? solanaChain(s.wallet, globalThis.Chomp) : mockChain(baseSeed(s.seed));
}

export function mockChain(base) {
  return {
    // Mock: the session seed stands in for the VRF output.
    async openLot(i) { return contents(lotRandomness(base, i)[0]); },
    // Mock hash = fnv64, display only.
    async commitBid(i, amount) {
      const s = salt();
      return { amount, salt: s, commitment: tapeHash([i, amount, hex(s)]) };
    },
    async revealAndSettle(i, commit) { return resolveLot(base, i, commit.amount); },
    async sellBack(lot, mask) { return buyback(lot.items, mask); },
  };
}

// ---- devnet ----
// ponytail: solo play = one real bidder per lot. The 3 bots are computed ON CHAIN in fill_lot from the
// VRF bytes (logic.rs bot_bids, bit-identical to game.js botBids) and act as the lot's reserve price:
// the player wins only by beating their best bid (ties go to the house). Bots never move SOL;
// the player's escrow, the winning payment (95% treasury / 5% fee) and buybacks do.
// Ceiling: bot bids and items are readable from the Lot account before bidding (same leak as items).
export const PROGRAM = 'FGYiydgg6XWauRUq9eyMwHFuwJjG5TM2ndLNQVEJjfR4';
export const HOUSE = 'D44FRx8KC8Pf5wHTBWgf9whN2HM5FtAsPWVo2KiHf9dk'; // PDA ["house"]
const FEE = 'AzSe4fuW6v58p3nr9cYjK477K8eWgsbRxJLwsFi2ZaXP'; // PDA ["fee", house]
const IDENTITY = '89LYim3W5ZwUHzHDM6haGE22RoJ49UGoCrVnrqdr3bme'; // PDA ["identity"], signs the VRF request
const VRF = 'Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz';
const QUEUE = 'Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh'; // ephemeral-vrf-sdk DEFAULT_QUEUE (devnet)
const SYS = '11111111111111111111111111111111';
const SLOT_HASHES = 'SysvarS1otHashes111111111111111111111111111';
const CLOCK = 'SysvarC1ock11111111111111111111111111111111';
const BID_SIZE = 121; // 8 + Bid::INIT_SPACE (lot, bidder, commitment, deposit, amount, revealed)
export const LAMPORTS_PER_COIN = 10_000n; // = lib.rs LAMPORTS_PER_COIN: 💰1000 bankroll = 0.01 SOL
export const COMMIT_SECS = 25, REVEAL_SECS = 20;
const DISC = { // sha256("global:<name>")[..8]
  init_house: [179, 199, 91, 87, 163, 192, 163, 183],
  create_lot: [127, 218, 254, 227, 228, 250, 69, 159],
  commit_bid: [149, 237, 198, 113, 53, 66, 70, 76],
  reveal_bid: [48, 73, 28, 255, 202, 126, 236, 196],
  settle: [175, 42, 185, 87, 144, 131, 102, 212],
  sell_back: [230, 50, 8, 6, 210, 15, 152, 133],
};

const cat = (...a) => { const o = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let k = 0; for (const x of a) { o.set(x, k); k += x.length; } return o; };
const u64 = (v) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(v), true); return b; };
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function unb58(s) {
  let n = 0n;
  for (const c of s) { const d = B58.indexOf(c); if (d < 0) throw new Error('bad base58'); n = n * 58n + BigInt(d); }
  const out = [];
  for (; n; n >>= 8n) out.unshift(Number(n & 255n));
  for (const c of s) { if (c !== '1') break; out.unshift(0); }
  return Uint8Array.from(out);
}
function b58(u8) {
  let n = 0n, s = '';
  for (const b of u8) n = n * 256n + BigInt(b);
  for (; n; n /= 58n) s = B58[Number(n % 58n)] + s;
  for (const b of u8) { if (b) break; s = '1' + s; }
  return s;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
// keys: [pubkey, writable?, signer?]
export const ix = (name, keys, ...args) => ({
  programId: PROGRAM,
  keys: keys.map(([pubkey, w, s]) => ({ pubkey, isSigner: !!s, isWritable: !!w })),
  data: b64(cat(Uint8Array.from(DISC[name]), ...args)),
});
export const initHouseIx = (authority, fundLamports) => ix('init_house', [[authority, 1, 1], [HOUSE, 1], [FEE, 1], [SYS]], u64(fundLamports));

function decodeLot(d) { // Lot layout, lib.rs (8-byte discriminator first)
  const v = new DataView(d.buffer, d.byteOffset, d.length);
  return {
    state: d[16], items: [...d.subarray(17, 24)], n: d[24], weight: v.getUint16(25, true), glow: d[27], shown: d[28],
    commitEnd: Number(v.getBigInt64(53, true)), revealEnd: Number(v.getBigInt64(61, true)), winner: d.subarray(71, 103), price: v.getBigUint64(103, true),
    bots: [0, 1, 2].map((k) => Number(v.getBigUint64(114 + 8 * k, true))),
  };
}

// io = window.Chomp in the portal ({ tx, rpc, pda } per tasks/devnet-spec.md §3); program/devnet.mjs passes a node one.
export function solanaChain(wallet, io) {
  const me = unb58(wallet), lots = [];
  const read = async (addr) => {
    const v = (await io.rpc('getAccountInfo', [addr, { encoding: 'base64', commitment: 'confirmed' }])).value;
    return v && unb64(v.data[0]);
  };
  const chainNow = async () => Number(new DataView((await read(CLOCK)).buffer).getBigInt64(32, true)); // Clock.unix_timestamp
  const pda = async (...seeds) => (await io.pda(PROGRAM, seeds)).address;
  async function send(ixs) { // portal returns a signature; wait until it lands so the next read sees it
    const sig = await io.tx(ixs);
    for (let t = 0; t < 60; t++) {
      const st = (await io.rpc('getSignatureStatuses', [[sig]])).value[0];
      if (st?.err) throw new Error(`tx ${sig} failed: ${JSON.stringify(st.err)}`);
      if (st && st.confirmationStatus !== 'processed') return sig;
      await sleep(1000);
    }
    throw new Error(`tx ${sig} not confirmed`);
  }

  return {
    // create_lot → MagicBlock VRF → fill_lot callback writes contents, hints and bot bids. Poll until filled.
    async openLot(i) {
      const nextId = async () => {
        const house = await read(HOUSE);
        if (!house) throw new Error('Sealed House not initialised on devnet (init_house)');
        return new DataView(house.buffer).getBigUint64(40, true); // House.lots
      };
      let addr;
      for (;;) {
        const id = await nextId();
        addr = await pda({ s: 'lot' }, { u64: String(id) });
        try {
          await send([ix('create_lot', [[wallet, 1, 1], [HOUSE, 1], [addr, 1], [QUEUE, 1], [SYS], [IDENTITY], [VRF], [SLOT_HASHES]],
            u64(COMMIT_SECS), u64(REVEAL_SECS), Uint8Array.of(salt()[0]))]);
          break;
        } catch (e) { if ((await nextId()) === id) throw e; } // someone else took lot #id: retry with the next one
      }
      for (let t = 0; t < 90; t++) {
        const d = await read(addr);
        if (d?.[16] === 1) {
          const lot = { ...decodeLot(d), addr };
          lot.secs = Math.max(1, lot.commitEnd - (await chainNow()) - 4); // UI clock; 4 s margin for signing + landing
          return (lots[i] = lot);
        }
        await sleep(1000);
      }
      throw new Error('VRF callback did not arrive in 90 s');
    },

    // commit_bid(sha256(amount_le ‖ salt ‖ bidder ‖ lot), deposit). Deposit = whole bankroll so the escrow hides
    // the bid, and >= the reserve (max bot bid) the program requires; refunded at settle unless it pays the win.
    async commitBid(i, amount, bank = amount) {
      const s = salt();
      if (!amount) return { amount, salt: s, commitment: 'pass' }; // pass = no bid on chain
      const lam = BigInt(amount) * LAMPORTS_PER_COIN, lot = lots[i];
      const c = new Uint8Array(await crypto.subtle.digest('SHA-256', cat(u64(lam), s, me, unb58(lot.addr))));
      const bid = await pda({ s: 'bid' }, { pk: lot.addr }, { pk: wallet });
      const deposit = BigInt(Math.max(bank, amount, ...lot.bots)) * LAMPORTS_PER_COIN;
      await send([ix('commit_bid', [[wallet, 1, 1], [lot.addr, 1], [bid, 1], [SYS]], c, u64(deposit))]);
      return { amount, salt: s, bid, commitment: hex(c) };
    },

    // After commit_end: reveal_bid + settle. settle needs EVERY Bid of the lot (+ its bidder); the set is final
    // once commits close. All others revealed → one tx (early settle). Else reveal now, settle at reveal_end.
    async revealAndSettle(i, commit) {
      let lot = lots[i];
      if (commit.amount) {
        while ((await chainNow()) < lot.commitEnd) await sleep(1000);
        const reveal = ix('reveal_bid', [[wallet, 0, 1], [lot.addr, 1], [commit.bid, 1]], u64(BigInt(commit.amount) * LAMPORTS_PER_COIN), commit.salt);
        const all = (await io.rpc('getProgramAccounts', [PROGRAM, { encoding: 'base64', commitment: 'confirmed',
          filters: [{ dataSize: BID_SIZE }, { memcmp: { offset: 8, bytes: lot.addr } }] }])) // Bid.lot
          .map((a) => { const d = unb64(a.account.data[0]); return { bid: a.pubkey, bidder: b58(d.subarray(40, 72)), revealed: d[120] === 1 }; });
        const settle = ix('settle', [[lot.addr, 1], [HOUSE, 1], [FEE, 1], ...all.flatMap((b) => [[b.bid, 1], [b.bidder, 1]])]);
        if (all.every((b) => b.revealed || b.bid === commit.bid)) await send([reveal, settle]);
        else {
          await send([reveal]);
          while ((await chainNow()) < lot.revealEnd) await sleep(1000);
          try { await send([settle]); } catch (e) { if (decodeLot(await read(lot.addr)).state !== 2) throw e; } // someone else cranked it
        }
        lot = lots[i] = { ...lot, ...decodeLot(await read(lot.addr)) };
      }
      const won = commit.amount > 0 && lot.winner.every((b, k) => b === me[k]);
      const top = Math.max(...lot.bots);
      const bids = [{ key: 'a0', amount: commit.amount }, ...lot.bots.map((amount, j) => ({ key: BOTS[j].key, amount }))];
      const w = won ? 0 : top > 0 ? 1 + lot.bots.indexOf(top) : -1;
      return { lot, bids, w, price: w < 0 ? 0 : bids[w].amount, tie: false };
    },

    // sell_back(mask): House treasury pays 90% of listed value.
    async sellBack(lot, mask) {
      await send([ix('sell_back', [[wallet, 1, 1], [lot.addr, 1], [HOUSE, 1]], Uint8Array.of(mask))]);
      return buyback(lot.items, mask);
    },
  };
}
