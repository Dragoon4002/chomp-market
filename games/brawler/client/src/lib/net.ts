// Every packet re-sends all local inputs the peer hasn't acked, so a lossy/unreliable channel never stalls for good.
// Rollback: `frame` is the last frame with both inputs known (confirmed, fed to the referee tape). The local sim runs
// ahead to `head` predicting the peer repeats its last input; the renderer resimulates frame..head from the confirmed
// state every tick, so a late packet only causes a small correction instead of a freeze.
export type Send = (m: object) => void;
export const MAX_PRED = 10; // frames the local sim may run ahead of confirmed input (~170 ms)

export class Netplay {
  frame = 0;
  head = 0;
  stalled = false; // this tick couldn't advance (prediction window full)
  stallTicks = 0; // consecutive stalled ticks
  desync = false;
  private local = new Map<number, number>();
  private remote = new Map<number, number>();
  private lastRemote = 0;
  private hashes = new Map<number, number>();
  private remoteHashes = new Map<number, number>();
  private peerNeed = 0; // first local frame the peer hasn't received yet
  private peerFrame = 0; // peer's head, as of its last packet
  private peerAdv = 0; // peer's (its head - our head as it last saw it)
  private sinceSkip = 0;
  private lastRx = 0;
  private peerS = 0;
  private peerSAt = 0;
  rtt = 0;
  maxGap = 0; // longest silence between peer packets, ms
  freezes = 0; // times the banner showed
  private send: Send;
  readonly seat: number;
  readonly delay: number;

  // Only a real hold-up shows: the prediction window ran out and stayed out for 250 ms.
  get lagging() { return this.stallTicks >= 15; }

  // start > 0: resumed after a reconnect at confirmed frame `start`; the peer already has its own inputs from there.
  constructor(send: Send, seat: number, delay = 4, start = 0) {
    this.send = send; this.seat = seat; this.delay = delay;
    this.frame = this.head = this.peerNeed = this.peerFrame = start;
    for (let f = start; f < start + delay; f++) { this.local.set(f, 0); if (!start) this.remote.set(f, 0); }
  }

  // Peer reconnected and resumes at our confirmed frame: drop its stale unconfirmed inputs, resend ours from here.
  resync(send: Send) {
    this.send = send;
    for (const f of [...this.remote.keys()]) if (f >= this.frame) this.remote.delete(f);
    this.peerNeed = this.peerFrame = this.frame; this.peerAdv = 0; this.lastRx = 0;
  }

  onMessage(m: { t: string; f: number; b?: unknown; a?: number; h?: number; fr?: number; v?: number; s?: number; e?: number; d?: number }) {
    if (m.t === 'in' && Array.isArray(m.b) && Number.isInteger(m.f)) {
      const now = performance.now();
      if (this.lastRx) this.maxGap = Math.max(this.maxGap, Math.round(now - this.lastRx));
      this.lastRx = now;
      if (Number.isFinite(m.s)) { this.peerS = m.s!; this.peerSAt = now; }
      if (Number.isFinite(m.e) && m.e! > 0) { const x = now - m.e! - (m.d ?? 0); this.rtt = Math.round(this.rtt ? this.rtt * 0.9 + x * 0.1 : x); }
      m.b.slice(0, 64).forEach((b, i) => { if (m.f + i >= this.frame) this.remote.set(m.f + i, Number(b) & 511); });
      if (Number.isInteger(m.a) && m.a! > this.peerNeed) this.peerNeed = m.a!;
      if (Number.isInteger(m.fr) && m.fr! > this.peerFrame) this.peerFrame = m.fr!;
      if (Number.isFinite(m.v)) this.peerAdv = m.v!;
    }
    if (m.t === 'hash') { this.remoteHashes.set(m.f, m.h!); this.check(m.f); }
  }

  private check(f: number) {
    const a = this.hashes.get(f), b = this.remoteHashes.get(f);
    if (a === undefined || b === undefined) return;
    if (a !== b) this.desync = true;
    this.hashes.delete(f); this.remoteHashes.delete(f);
  }

  private confirmAll(confirm: (inputs: number[]) => void, hashNow: () => number) {
    while (this.frame < this.head && this.remote.has(this.frame)) {
      const r = this.remote.get(this.frame)!;
      confirm(this.pair(this.frame, r));
      this.lastRemote = r;
      this.remote.delete(this.frame);
      this.frame++;
      if (this.frame % 60 === 0) {
        const h = hashNow();
        this.hashes.set(this.frame, h);
        this.send({ t: 'hash', f: this.frame, h });
        this.check(this.frame);
      }
    }
  }

  stats() { return `ping ${this.rtt}ms · worst gap ${this.maxGap}ms · freezes ${this.freezes}`; }

  private pair(f: number, r: number) { const l = this.local.get(f)!; return this.seat === 0 ? [l, r] : [r, l]; }

  // Inputs for the predicted frames frame..head-1 (peer input known if it already arrived, else its last one).
  predicted(): number[][] {
    const out: number[][] = [];
    let r = this.lastRemote;
    for (let f = this.frame; f < this.head; f++) { r = this.remote.get(f) ?? r; out.push(this.pair(f, r)); }
    return out;
  }

  // Called at 60 Hz: moves head one frame (unless the window is full or time sync skips), confirms every frame whose
  // peer input arrived, then sends one input packet.
  tick(readLocal: () => number, confirm: (inputs: number[]) => void, hashNow: () => number) {
    // Time sync: the side that's ahead would sit at the edge of the window, so it skips at most 1 tick in 10
    // (invisible) until both share the margin. Timing only, sim stays deterministic.
    const adv = this.head - this.peerFrame;
    this.confirmAll(confirm, hashNow);
    if (this.head - this.frame >= MAX_PRED) {
      this.stalled = true;
      if (++this.stallTicks === 15) {
        this.freezes++;
        console.warn('netplay freeze', { rtt: this.rtt, sinceLastPacket: Math.round(performance.now() - this.lastRx), frame: this.frame, head: this.head, peerHead: this.peerFrame, delay: this.delay });
      }
    }
    else {
      this.stalled = false; this.stallTicks = 0;
      if ((adv - this.peerAdv) / 2 > 1 && ++this.sinceSkip >= 10) this.sinceSkip = 0;
      else { this.local.set(this.head + this.delay, readLocal()); this.head++; }
    }
    this.confirmAll(confirm, hashNow);
    for (const f of this.local.keys()) if (f < this.peerNeed && f < this.frame) this.local.delete(f);
    let need = this.frame;
    while (this.remote.has(need)) need++;
    const b: number[] = [];
    for (let f = this.peerNeed; this.local.has(f) && b.length < 64; f++) b.push(this.local.get(f)!);
    const now = performance.now();
    this.send({ t: 'in', f: this.peerNeed, b, a: need, fr: this.head, v: adv, s: now, e: this.peerS, d: this.peerS ? now - this.peerSAt : 0 });
  }
}

const FRAME_MS = 1000 / 60;
const P2P_TIMEOUT = 4000;

// WebRTC DataChannel setup, signaled through the relay. Host (seat 0) decides the transport and delay and tells the
// guest with a reliable 'go' over the relay, so both sides always agree. No answer within 4 s -> relay fallback.
// ponytail: STUN only; players behind symmetric NAT fall back to relay. Add a TURN server if that's common.
export function linkPeer(
  relay: WebSocket, seat: number, relayDelay: number, forceRelay: boolean,
  onData: (m: any) => void,
  ready: (send: Send, delay: number, label: string) => void,
) {
  const rsend: Send = (m) => relay.readyState === WebSocket.OPEN && relay.send(JSON.stringify(m));
  const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  let dc: RTCDataChannel | null = null;
  let done = false;
  const pongs: number[] = [];

  const finish = (p2p: boolean, delay: number) => {
    if (done) return;
    done = true;
    if (!p2p) pc.close();
    const send: Send = p2p ? (m) => dc?.readyState === 'open' && dc.send(JSON.stringify(m)) : rsend;
    ready(send, delay, p2p ? 'P2P' : 'RELAY');
  };

  const measure = () => { // host: 10 app-level pings over the channel, worst RTT -> delay (covers jitter seen at connect)
    let sent = 0;
    const iv = setInterval(() => {
      if (done) return clearInterval(iv);
      if (sent < 10) { sent++; return dc!.send(JSON.stringify({ t: 'p', s: performance.now() })); }
      clearInterval(iv);
      const rtt = Math.max(0, ...pongs);
      const delay = Math.min(8, Math.max(2, Math.ceil(rtt / 2 / FRAME_MS) + 1));
      rsend({ t: 'go', p2p: true, delay });
      finish(true, delay);
    }, 50);
  };

  const wire = (ch: RTCDataChannel) => {
    dc = ch;
    ch.onmessage = (e) => {
      let m: any;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'p') ch.send(JSON.stringify({ t: 'q', s: m.s }));
      else if (m.t === 'q') pongs.push(performance.now() - m.s);
      else onData(m);
    };
    if (seat === 0) ch.onopen = measure;
  };

  pc.onicecandidate = (e) => { if (e.candidate) rsend({ t: 'ice', c: e.candidate }); };
  pc.ondatachannel = (e) => wire(e.channel);

  if (seat === 0) {
    const fallback = () => { if (!done) { rsend({ t: 'go', p2p: false, delay: relayDelay }); finish(false, relayDelay); } };
    if (forceRelay) fallback();
    else {
      setTimeout(fallback, P2P_TIMEOUT);
      wire(pc.createDataChannel('g', { ordered: false, maxRetransmits: 0 }));
      pc.createOffer().then((o) => pc.setLocalDescription(o)).then(() => rsend({ t: 'sdp', d: pc.localDescription }));
    }
  }

  // Signaling messages must apply in order (ICE can't be added before the remote description).
  let chain = Promise.resolve();
  const signal = (m: any) => {
    if (m.t === 'go') return finish(!!m.p2p, m.delay); // outside the chain: a stuck WebRTC call must not block fallback
    chain = chain.then(async () => {
      if (m.t === 'sdp' && !done) {
        await pc.setRemoteDescription(m.d);
        if (m.d.type === 'offer') {
          await pc.setLocalDescription(await pc.createAnswer());
          rsend({ t: 'sdp', d: pc.localDescription });
        }
      } else if (m.t === 'ice' && !done) await pc.addIceCandidate(m.c);
    }).catch(() => {});
  };
  return { signal, close: () => { done = true; pc.close(); } };
}
