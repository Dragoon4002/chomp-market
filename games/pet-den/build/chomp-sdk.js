// Standalone copy of market/public/chomp-sdk.js so a plain static server has /chomp-sdk.js (portal serves its own).
// Chomp portal bridge for hosted games (any engine with a web export).
// <script src="/chomp-sdk.js"></script>, then: Chomp.onSession(s => ...); Chomp.ready();
// Game runs in an opaque-origin sandbox, so postMessage targets "*": only the parent receives,
// and the portal only sends public data (wallet pubkey, mode, stake, seed, programs) + replies to this frame's requests.
// Wallet calls (protocol: tasks/devnet-spec.md §3) return Promises; each rejects after 60 s or on portal error:
//   Chomp.connect() → { wallet }            Chomp.tx(ixs, { er }) → signature (base58)
//   Chomp.rpc(method, params, { er }) → JSON-RPC result    Chomp.pda(programId, seeds) → { address, bump }
//   Chomp.sign(message) → base58 ed25519 signature of the utf8 message
//   Ix = { programId, keys: [{ pubkey, isSigner, isWritable }], data: base64 }; Seed = {s}|{pk}|{u8}|{u64: "str"}|{hex}
(() => {
  let session = null, n = 0;
  const subs = new Set();
  const pending = new Map();
  addEventListener("message", (e) => {
    if (e.source !== parent || e.data?.chomp !== 1) return;
    const d = e.data.data;
    if (e.data.type === "session") { session = d; subs.forEach((f) => f(session)); }
    if (e.data.type === "res" && pending.has(d?.id)) {
      const p = pending.get(d.id);
      pending.delete(d.id);
      clearTimeout(p.t);
      d.ok ? p.res(d.value) : p.rej(new Error(d.error || "portal error"));
    }
  });
  const send = (type, data) => parent !== window && parent.postMessage({ chomp: 1, type, data }, "*");
  const req = (method, params) => new Promise((res, rej) => {
    if (parent === window) return rej(new Error("Chomp: not inside the portal"));
    const id = ++n;
    const t = setTimeout(() => { pending.delete(id); rej(new Error(`Chomp.${method} timed out`)); }, 60000);
    pending.set(id, { res, rej, t });
    send("req", { id, method, params });
  });
  window.Chomp = {
    ready: () => send("ready"),
    start: () => send("match:start"),
    result: (r) => send("match:result", r), // { winner?, score?, tapeHash? }; numeric score → on-chain leaderboard
    frames: (f) => send("frames", f), // settle: "frames" games only
    onSession: (f) => (subs.add(f), session && f(session)),
    get session() { return session; },
    connect: () => req("connect"),
    tx: (ixs, o) => req("tx", { ixs, er: !!o?.er }),
    rpc: (method, params, o) => req("rpc", { method, params, er: !!o?.er }),
    pda: (programId, seeds) => req("pda", { programId, seeds }),
    sign: (message) => req("sign", { message }),
  };
})();
