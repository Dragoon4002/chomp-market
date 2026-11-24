// Live 1v1 lockstep client. Server owns the clock: plays come back stamped with apply_tick, beats {tick} every 3 ticks.
// The sim may only advance while s.t < beat. Emits inputs only; never touches sim state.
export function wsUrl() {
  return new URLSearchParams(location.search).get('ws') || 'ws://localhost:8790';
}

// opts: {code?, loadout, name, on: {room, start, error, peer, forfeit}}
export function connectLive(opts) {
  let ws, token = null, tries = 0;
  const plays = new Map(); // apply_tick -> [{seat, card, x2, y}]
  const live = { seat: null, code: null, beat: 0, started: false, closed: false };
  const send = (m) => ws.readyState === 1 && ws.send(JSON.stringify(m));
  // a dropped socket retries with the seat token for the server's 15 s grace (memory only: sandbox has no storage)
  function open() {
    ws = new WebSocket(wsUrl());
    ws.onopen = () => send(token ? { t: 'rejoin', code: live.code, token }
      : opts.code ? { t: 'join', code: opts.code, name: opts.name, loadout: opts.loadout } : { t: 'host', name: opts.name, loadout: opts.loadout });
    ws.onerror = () => !token && opts.on.error?.(`Can't reach ${wsUrl()}`);
    ws.onclose = () => {
      if (live.closed || !token || ++tries > 7) { live.closed = true; opts.on.peer?.({ closed: true }); return; }
      setTimeout(open, 2000);
    };
    ws.onmessage = onMsg;
  }
  open();
  function onMsg(e) {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.t === 'room') { live.seat = m.seat; live.code = m.code; token = m.token; tries = 0; opts.on.room?.(m); }
    else if (m.t === 'start') {
      plays.clear(); for (const p of m.plays ?? []) add(p);
      live.beat = Math.max(live.beat, m.tick ?? 0);
      if (!live.started) { live.started = true; opts.on.start?.(m); }
    }
    else if (m.t === 'play') add(m);
    else if (m.t === 'beat') live.beat = Math.max(live.beat, m.tick);
    else if (m.t === 'peer') opts.on.peer?.(m);
    else if (m.t === 'forfeit') opts.on.forfeit?.(m);
    else if (m.t === 'error') opts.on.error?.(m.msg);
  }
  function add(m) {
    const k = m.apply_tick;
    if (!plays.has(k)) plays.set(k, []);
    plays.get(k).push({ seat: m.seat, card: m.card, x2: m.x2, y: m.y });
  }
  live.inputsAt = (t) => plays.get(t) ?? [];
  live.play = (card, x2, y) => send({ t: 'play', card, x2, y });
  live.over = () => send({ t: 'over' });
  live.close = () => { live.closed = true; ws.close(); };
  live.token = () => token;
  return live;
}
