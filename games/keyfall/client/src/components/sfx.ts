// SFXManager + MusicManager port (reference §7): sliders default 1 x max 0.5, per-play pitch U(.95,1.05), volume U(.9,1).
const CLIPS = ['typewriter_press', 'laser_fire', 'explosion', 'bomb_fall', 'chopper_fire', 'city_attacked_siren', 'error_short', 'error_three_strikes'] as const;
export type Clip = (typeof CLIPS)[number];

const KEY = 'keyfall.muted';
let muted = (() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } })();
let ac: AudioContext | null = null, out: GainNode | null = null, music: HTMLAudioElement | null = null;
const bufs: Partial<Record<Clip, AudioBuffer>> = {};
let sirenUntil = 0;

// Must run inside a user gesture (autoplay policy).
export function unlock() {
  if (!music) {
    music = new Audio('/sfx/music.ogg');
    music.loop = true;
    music.volume = 0.5;
  }
  if (!muted && music.paused) music.play().catch(() => {});
  if (ac) { void ac.resume(); return; }
  ac = new AudioContext();
  out = ac.createGain();
  out.gain.value = muted ? 0 : 0.5;
  out.connect(ac.destination);
  for (const c of CLIPS) fetch(`/sfx/${c}.ogg`).then((r) => r.arrayBuffer()).then((b) => ac!.decodeAudioData(b)).then((b) => { bufs[c] = b; }, () => {});
}

export function play(c: Clip, vol = 1, pitch = 1) {
  const b = bufs[c];
  if (!ac || !out || !b || muted) return;
  if (c === 'city_attacked_siren') { // not restarted while already playing
    if (ac.currentTime < sirenUntil) return;
    sirenUntil = ac.currentTime + b.duration / 0.98;
    pitch = 0.98;
  }
  const s = ac.createBufferSource(), g = ac.createGain();
  s.buffer = b;
  s.playbackRate.value = pitch * (0.95 + Math.random() * 0.1);
  g.gain.value = vol * (0.9 + Math.random() * 0.1);
  s.connect(g).connect(out);
  s.start();
}

export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem(KEY, m ? '1' : '0'); } catch { /* private mode */ }
  if (out) out.gain.value = m ? 0 : 0.5;
  if (music) { if (m) music.pause(); else music.play().catch(() => {}); }
}
