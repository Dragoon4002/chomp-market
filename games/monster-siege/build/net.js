// Live 1v1 lockstep client. Server owns the clock: plays come back stamped with apply_tick, beats {tick} every 3 ticks.
// The sim may only advance while s.t < beat. Emits inputs only; never touches sim state.
export function wsUrl() {
  const q = new URLSearchParams(location.search).get('ws');
  if (q) return q;
  // inside the portal (/g/<slug>/) the page host isn't the relay; standalone, the relay serves the page itself
  if (location.pathname.startsWith('/g/') || location.protocol === 'file:') return 'ws://localhost:8790';
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

// opts: {code?, loadout, name, on: {room, start, error, peer, forfeit}}
export function connectLive(opts) {
  let ws, token = null, downAt = 0, retry = 0, lastMsg = 0;
  const plays = new Map(); // apply_tick -> [{seat, card, x2, y}]
  const live = { seat: null, code: null, beat: 0, started: false, closed: false, down: false }; // down = reconnecting
  const send = (m) => ws.readyState === 1 && ws.send(JSON.stringify(m));
  // a dropped socket retries with the seat token every 1.5 s for 20 s (> server's 15 s grace; memory only: sandbox has no storage)
  function open() {
    clearTimeout(retry);
    const sock = (ws = new WebSocket(wsUrl())), cur = () => sock === ws; // handlers of a replaced socket are ignored
    sock.onopen = () => cur() && send(token ? { t: 'rejoin', code: live.code, token }
      : opts.code ? { t: 'join', code: opts.code, name: opts.name, loadout: opts.loadout } : { t: 'host', name: opts.name, loadout: opts.loadout });
    sock.onerror = () => cur() && !token && opts.on.error?.(`Can't reach ${wsUrl()}`);
    sock.onclose = () => {
      if (!cur()) return;
      if (!live.closed && token && Date.now() - (downAt ||= Date.now()) < 20000) { live.down = true; retry = setTimeout(open, 1500); return; }
      live.closed = true; live.down = false; opts.on.peer?.({ closed: true });
    };
    sock.onmessage = (e) => { if (cur()) { lastMsg = Date.now(); onMsg(e); } };
  }
  open();
  // phones kill/freeze sockets in the background: on return, rejoin now if the socket is gone or silent (beats come every 100 ms)
  const onVis = () => {
    if (document.visibilityState !== 'visible' || live.closed || !token) return;
    if (ws.readyState > 1 || (live.started && ws.readyState === 1 && Date.now() - lastMsg > 2500)) {
      const old = ws; downAt ||= Date.now(); live.down = true; open(); try { old.close(); } catch { /* already gone */ }
    }
  };
  document.addEventListener('visibilitychange', onVis);
  function onMsg(e) {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.t === 'room') { live.seat = m.seat; live.code = m.code; token = m.token; if (!live.started) { downAt = 0; live.down = false; } opts.on.room?.(m); }
    else if (m.t === 'start') {
      downAt = 0; live.down = false;
      plays.clear(); for (const p of m.plays ?? []) add(p);
      live.beat = Math.max(live.beat, m.tick ?? 0);
      if (!live.started) { live.started = true; opts.on.start?.(m); }
    }
    else if (m.t === 'play') add(m);
    else if (m.t === 'beat') live.beat = Math.max(live.beat, m.tick);
    else if (m.t === 'peer') opts.on.peer?.(m);
    else if (m.t === 'forfeit') opts.on.forfeit?.(m);
    else if (m.t === 'error') {
      if (live.down) { live.closed = true; live.down = false; ws.close(); opts.on.peer?.({ closed: true }); } // rejoin refused: seat is gone
      opts.on.error?.(m.msg);
    }
  }
  function add(m) {
    const k = m.apply_tick;
    if (!plays.has(k)) plays.set(k, []);
    plays.get(k).push({ seat: m.seat, card: m.card, x2: m.x2, y: m.y });
  }
  live.inputsAt = (t) => plays.get(t) ?? [];
  live.play = (card, x2, y) => send({ t: 'play', card, x2, y });
  live.over = () => send({ t: 'over' });
  live.close = () => { live.closed = true; live.down = false; clearTimeout(retry); document.removeEventListener('visibilitychange', onVis); ws.close(); };
  live.token = () => token;
  return live;
}
