// Chomp portal bridge for hosted games (any engine with a web export).
// <script src="/chomp-sdk.js"></script>, then: Chomp.onSession(s => ...); Chomp.ready();
// Game runs in an opaque-origin sandbox, so postMessage targets "*": only the parent receives,
// and the portal only sends public data (wallet pubkey, mode, stake, seed).
(() => {
  let session = null;
  const subs = new Set();
  addEventListener("message", (e) => {
    if (e.source !== parent || e.data?.chomp !== 1 || e.data.type !== "session") return;
    session = e.data.data;
    subs.forEach((f) => f(session));
  });
  const send = (type, data) => parent !== window && parent.postMessage({ chomp: 1, type, data }, "*");
  window.Chomp = {
    ready: () => send("ready"),
    start: () => send("match:start"),
    result: (r) => send("match:result", r), // { winner?, score?, tapeHash? }
    frames: (f) => send("frames", f), // settle: "frames" games only
    onSession: (f) => (subs.add(f), session && f(session)),
    get session() { return session; },
  };
})();
