// Render-side only — reads sim events, never feeds the sim.
import type { GameState } from './sim/sim.ts';
import type { StageId } from './stages.ts';

export interface AudioSettings { music: number; sfx: number; muted: boolean }
const KEY = 'ba.audio.v1';
const MUSIC_MAX = 0.16, SFX_MAX = 0.32; // "full" slider = still soft

let settings: AudioSettings = { music: 0.6, sfx: 0.7, muted: false };
try { settings = { ...settings, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { /* private mode */ }

let ctx: AudioContext | null = null;
let sfxBus: GainNode, musicBus: GainNode, musicFade: GainNode;
let noise: AudioBuffer;
const debug = ((globalThis as any).__audio = { played: 0, notes: 0, state: 'locked' });

// Autoplay policy: the context can only start inside a user gesture.
function unlock() {
  if (!ctx) {
    const AC = globalThis.AudioContext ?? (globalThis as any).webkitAudioContext;
    if (!AC) return;
    ctx = new AC() as AudioContext;
    const comp = ctx.createDynamicsCompressor(); // keeps stacked hits from clipping
    comp.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.connect(comp);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; lp.connect(comp);
    musicBus = ctx.createGain(); musicBus.connect(lp);
    musicFade = ctx.createGain(); musicFade.gain.value = 0; musicFade.connect(musicBus);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    applyVolumes();
    if (wanted) startMusic(wanted);
  }
  if (ctx.state === 'suspended') ctx.resume();
  debug.state = ctx.state;
}
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, unlock);

function applyVolumes() {
  if (!ctx) return;
  const t = ctx.currentTime, m = settings.muted ? 0 : 1;
  sfxBus.gain.setTargetAtTime(settings.sfx * SFX_MAX * m, t, 0.05);
  musicBus.gain.setTargetAtTime(settings.music * MUSIC_MAX * m, t, 0.1);
}

export const getAudio = () => settings;
export function setAudio(p: Partial<AudioSettings>) {
  settings = { ...settings, ...p };
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* private mode */ }
  applyVolumes();
  return settings;
}
export const toggleMute = () => setAudio({ muted: !settings.muted });

// Synth primitives take ctx+dest so they also render offline.
type C = BaseAudioContext;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

function tone(c: C, dest: AudioNode, t: number, f0: number, f1: number, dur: number, gain: number, type: OscillatorType = 'sine', attack = 0.005) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
}

function hiss(c: C, buf: AudioBuffer, dest: AudioNode, t: number, dur: number, gain: number, filter: BiquadFilterType, f0: number, f1 = f0, q = 1, attack = 0.003) {
  const s = c.createBufferSource(), bq = c.createBiquadFilter(), g = c.createGain();
  s.buffer = buf; bq.type = filter; bq.Q.value = q;
  bq.frequency.setValueAtTime(f0, t); bq.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(bq).connect(g).connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}

// Each SFX: (ctx, noise, dest, time, param). Exported for the offline render check.
export const SFX = {
  hit(c: C, n: AudioBuffer, d: AudioNode, t: number, power: number) {
    const k = Math.min(1, power / 25), p = rnd(0.92, 1.08);
    tone(c, d, t, 150 * p, 45, 0.1 + 0.12 * k, 0.45 + 0.4 * k); // body thump
    hiss(c, n, d, t, 0.035 + 0.03 * k, 0.25, 'bandpass', 2200 * p, 900, 1.2); // contact click
    if (k > 0.55) tone(c, d, t, 80, 38, 0.28, 0.35, 'triangle'); // heavy: low tail
  },
  swing(c: C, n: AudioBuffer, d: AudioNode, t: number, heavy: number) {
    hiss(c, n, d, t, heavy ? 0.2 : 0.11, heavy ? 0.32 : 0.22, 'bandpass', heavy ? 500 : 900, heavy ? 1600 : 2600, 2, 0.03);
  },
  jump(c: C, _n: AudioBuffer, d: AudioNode, t: number) { tone(c, d, t, 260 * rnd(0.95, 1.05), 470, 0.09, 0.07); },
  land(c: C, n: AudioBuffer, d: AudioNode, t: number, power: number) {
    hiss(c, n, d, t, 0.09, Math.min(0.18, 0.04 + power / 80), 'lowpass', 500, 160, 0.7);
  },
  dodge(c: C, n: AudioBuffer, d: AudioNode, t: number) { hiss(c, n, d, t, 0.2, 0.09, 'highpass', 1800, 5200, 0.6, 0.05); },
  ko(c: C, n: AudioBuffer, d: AudioNode, t: number) {
    tone(c, d, t, 95, 32, 0.7, 0.6);
    hiss(c, n, d, t, 0.6, 0.22, 'lowpass', 900, 120, 0.7);
    for (const [f, dt] of [[1320, 0.05], [1760, 0.12], [2640, 0.2]]) tone(c, d, t + dt, f, f, 0.8, 0.035, 'triangle', 0.01);
  },
  win(c: C, _n: AudioBuffer, d: AudioNode, t: number) {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, d, t + i * 0.11, f, f, 0.6, 0.11, 'triangle', 0.01));
  },
};

function play(kind: keyof typeof SFX, param = 0) {
  if (!ctx || settings.muted || ctx.state !== 'running') return;
  SFX[kind](ctx, noise, sfxBus, ctx.currentTime + 0.005, param);
  debug.played++;
}

// Called once per sim step. Swings/dodges are detected from state (t === 0 on the start frame).
const seenWinner = new WeakSet<GameState>();
// seat: our seat (<0 = spectator). Win jingle only for the winner's side.
export function playEvents(s: GameState, seat = -1) {
  for (const e of s.events) {
    if (e.kind === 'hit') play('hit', e.power);
    else if (e.kind === 'ko') play('ko');
    else if (e.kind === 'jump') play('jump');
    else if (e.kind === 'land' && e.power > 4) play('land', e.power);
  }
  for (const f of s.fighters) {
    if (f.t !== 0) continue;
    if (f.state === 'attack') play('swing', /Heavy|recovery|groundPound/.test(f.move ?? '') ? 1 : 0);
    else if (f.state === 'dodge') play('dodge');
  }
  if (s.winner >= 0 && !seenWinner.has(s)) { seenWinner.add(s); if (seat < 0 || s.winner === seat) play('win'); }
}

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

interface Theme { bpm: number; chords: number[][]; beat: (c: C, d: AudioNode, n: AudioBuffer, t: number, chord: number[], beat: number, bar: number) => void }

function pad(c: C, d: AudioNode, t: number, notes: number[], dur: number, gain: number) {
  for (const m of notes) for (const det of [-6, 6]) {
    const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = det;
    f.type = 'lowpass'; f.frequency.value = 650;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + dur * 0.35);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(d); o.start(t); o.stop(t + dur + 0.1);
  }
}

const pickOf = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

const THEMES: Record<StageId, Theme> = {
  // warm minor pads + slow plucks (Am F C G)
  ember: {
    bpm: 68, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
    beat(c, d, _n, t, ch, beat) {
      const spb = 60 / 68;
      if (beat === 0) { pad(c, d, t, ch, spb * 4.2, 0.035); tone(c, d, t, hz(ch[0] - 12), hz(ch[0] - 12), spb * 3.5, 0.12, 'sine', 0.3); }
      if (Math.random() < 0.55) tone(c, d, t + (Math.random() < 0.3 ? spb / 2 : 0), hz(pickOf(ch) + 12), hz(pickOf(ch) + 12), 1.1, 0.07, 'triangle', 0.004);
    },
  },
  // airy pentatonic marimba + breathy flute line (C pentatonic)
  grove: {
    bpm: 84, chords: [[60, 64, 67], [57, 60, 64], [62, 67, 69], [60, 64, 67]],
    beat(c, d, _n, t, ch, beat, bar) {
      const pent = [60, 62, 64, 67, 69, 72, 74, 76], spb = 60 / 84;
      if (beat === 0) tone(c, d, t, hz(ch[0] - 12), hz(ch[0] - 12), spb * 4, 0.08, 'sine', 0.4);
      for (const off of [0, spb / 2]) if (Math.random() < 0.45) {
        const m = pickOf(pent);
        tone(c, d, t + off, hz(m), hz(m), 0.45, 0.09, 'sine', 0.002); // marimba body
        tone(c, d, t + off, hz(m) * 4, hz(m) * 4, 0.08, 0.02, 'sine', 0.002); // bright strike partial
      }
      if (beat === 0 && bar % 2 === 0) { // flute: soft sine with slow attack + vibrato
        const o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
        o.frequency.value = hz(pickOf(pent) + 12); lfo.frequency.value = 5; lg.gain.value = 4;
        lfo.connect(lg).connect(o.frequency);
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.045, t + 0.6); g.gain.linearRampToValueAtTime(0.0001, t + spb * 3.5);
        o.connect(g).connect(d); o.start(t); lfo.start(t); o.stop(t + spb * 4); lfo.stop(t + spb * 4);
      }
    },
  },
  // low sea swells + drone + sparse bells (D dorian)
  docks: {
    bpm: 60, chords: [[50, 57, 62], [48, 55, 60], [50, 57, 62], [45, 52, 57]],
    beat(c, d, n, t, ch, beat, bar) {
      if (beat === 0) tone(c, d, t, hz(ch[0] - 12), hz(ch[0] - 12), 4.3, 0.13, 'sine', 0.8);
      if (beat === 0 && bar % 2 === 0) hiss(c, n, d, t, 7, 0.05, 'lowpass', 300, 900, 0.5, 3); // wave swell
      if (Math.random() < 0.28) { // bell: inharmonic partials
        const f = hz(pickOf([62, 64, 65, 67, 69, 71, 72, 74]) + 12);
        tone(c, d, t, f, f, 2.2, 0.05, 'sine', 0.003);
        tone(c, d, t, f * 2.76, f * 2.76, 0.9, 0.012, 'sine', 0.003);
      }
    },
  },
};

let wanted: StageId | null = null;
let timer = 0;
// Start (or switch) the arena's music; null fades it out.
export function music(stage: StageId | null) {
  wanted = stage;
  if (!ctx) return; // starts on unlock
  if (stage) startMusic(stage); else stopMusic();
}

function stopMusic() {
  clearInterval(timer); timer = 0;
  if (ctx) musicFade.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
}

function startMusic(stage: StageId) {
  stopMusic();
  const c = ctx!, th = THEMES[stage], spb = 60 / th.bpm;
  musicFade.gain.cancelScheduledValues(c.currentTime);
  musicFade.gain.setTargetAtTime(1, c.currentTime + 0.3, 1.2); // gentle fade-in
  let next = c.currentTime + 0.1, beat = 0;
  // Lookahead scheduler: every 100 ms queue beats falling in the next 0.4 s.
  const tick = () => {
    while (next < c.currentTime + 0.4) {
      const bar = Math.floor(beat / 4);
      th.beat(c, musicFade, noise, next, th.chords[bar % th.chords.length], beat % 4, bar);
      debug.notes++;
      next += spb; beat++;
    }
  };
  tick();
  timer = setInterval(tick, 100) as unknown as number;
}
