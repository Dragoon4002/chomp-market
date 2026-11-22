import { IN } from './sim/sim.ts';

// WASD (or arrows) move, Space/W jump, J light, K heavy, L block, C dodge.
// Alternates: right click / Z light, left click / X heavy, Q block.
// Gamepad: A jump, X light, B/Y heavy, bumpers/triggers dodge.
const KEYS: Record<string, number> = {
  KeyA: IN.LEFT, KeyD: IN.RIGHT, KeyW: IN.UP | IN.JUMP, KeyS: IN.DOWN,
  ArrowLeft: IN.LEFT, ArrowRight: IN.RIGHT, ArrowUp: IN.UP | IN.JUMP, ArrowDown: IN.DOWN,
  Space: IN.JUMP, KeyJ: IN.LIGHT, KeyK: IN.HEAVY, KeyL: IN.BLOCK, KeyC: IN.DODGE,
  KeyZ: IN.LIGHT, KeyX: IN.HEAVY, KeyQ: IN.BLOCK,
  Mouse0: IN.HEAVY, Mouse2: IN.LIGHT,
};
const held = new Set<string>();
const tapped = new Set<string>(); // pressed+released between two 60 Hz polls still counts once
const press = (code: string) => { held.add(code); tapped.add(code); };
addEventListener('keydown', (e) => {
  if (e.code in KEYS && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) { press(e.code); e.preventDefault(); }
});
addEventListener('keyup', (e) => held.delete(e.code));
// Only clicks on the fight canvas (or its letterbox) count, so UI buttons keep working.
const onArena = (e: Event) => e.target instanceof Element && e.target.matches('canvas, .arena');
addEventListener('mousedown', (e) => {
  if (onArena(e) && `Mouse${e.button}` in KEYS) { press(`Mouse${e.button}`); e.preventDefault(); }
});
addEventListener('mouseup', (e) => held.delete(`Mouse${e.button}`));
addEventListener('contextmenu', (e) => { if (onArena(e)) e.preventDefault(); });
addEventListener('blur', () => { held.clear(); touches.clear(); });

function pad() {
  const g = navigator.getGamepads?.()[0];
  if (!g) return 0;
  const btn = (n: number) => !!g.buttons[n]?.pressed;
  const ax = g.axes[0] ?? 0, ay = g.axes[1] ?? 0;
  let b = 0;
  if (ax < -0.5 || btn(14)) b |= IN.LEFT;
  if (ax > 0.5 || btn(15)) b |= IN.RIGHT;
  if (ay < -0.5 || btn(12)) b |= IN.UP;
  if (ay > 0.5 || btn(13)) b |= IN.DOWN;
  if (btn(0)) b |= IN.JUMP;
  if (btn(2)) b |= IN.LIGHT;
  if (btn(1) || btn(3)) b |= IN.HEAVY;
  if (btn(4) || btn(5) || btn(6) || btn(7)) b |= IN.DODGE;
  return b;
}

// On-screen touch pad: bits held per pointer, so move + attack fingers combine.
const touches = new Map<number, number>();
let touchTap = 0;
export function setTouch(id: number, bits: number) {
  touchTap |= bits & ~(touches.get(id) ?? 0);
  if (bits) touches.set(id, bits); else touches.delete(id);
}

export function readInput() {
  let b = pad() | touchTap;
  touchTap = 0;
  for (const t of touches.values()) b |= t;
  for (const [code, bit] of Object.entries(KEYS)) if (held.has(code) || tapped.has(code)) b |= bit;
  tapped.clear();
  return b;
}
