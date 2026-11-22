// Gen-1 monster-folk part library: SVG path data, drawn through Path2D by rig.ts.
// Coordinate rules (all parts face +x, y down, like SVG):
//   limbs/tail/weapons: origin at the joint, bone runs along +y for its length.
//   torso: origin at body centre (hip at y=+15, neck at y=-15).   head: origin at skull centre.   foot: origin at ankle.
// Variant arrays are indexed by DNA genes: horn 0..3 -> HORNS, tail 0..2 -> TAIL_TIP + WEAPON, pattern 0..2 -> TRIM, eye 0..3 -> eyes.

// Tapered capsule for a bone segment, slight muscle bulge on the front (+x) side.
export const seg = (len: number, w0: number, w1: number) => {
  const a = w0 / 2, b = w1 / 2;
  return `M${-a} 0C${-a * 1.08} ${len * 0.35} ${-b * 1.05} ${len * 0.7} ${-b} ${len}A${b} ${b} 0 0 0 ${b} ${len}C${b * 1.18} ${len * 0.65} ${a * 1.22} ${len * 0.3} ${a} 0A${a} ${a} 0 0 0 ${-a} 0Z`;
};

export const LIMB = {
  thigh: seg(22, 15, 11), shin: seg(23, 11, 9),
  upper: seg(20, 11, 9), fore: seg(20, 9, 8),
  neck: seg(10, 9, 8),
  tail1: seg(18, 9, 6), tail2: seg(16, 6, 3),
};

// Arms
export const PAULDRON = 'M-9-3C-9-12 9-12 10-3C10 4 6 7 0 7C-6 7-9 4-9-3Z';
export const GAUNTLET = 'M-5.5 7L5.5 7L7 20L-7 20Z';
export const CUFF = 'M-6 7L6 7';
export const FIST = 'M-6 18C-8 25-4 29 1 29C6 29 8 25 6 18Z';
export const KNUCKLES = 'M-3 26L5 26';

// Legs
export const KNEE = 'M0-4a4 4 0 1 0 0.1 0Z';
export const BOOT_TOP = 'M-6.5 9L6.5 9';
export const FOOT = 'M-6-6C-6-10 4-10 9-7C14-5 16-1 15 3L-6 3C-9 3-9-2-6-6Z';

// Torso
export const TORSO = 'M-10-18C0-21 12-19 14-12C16-4 12 4 10 9L11 19L-11 19L-10 9C-14 2-15-10-10-18Z';
export const PLATE = 'M-6-16C4-19 12-16 13-10C14-3 10 3 4 4C-2 4-7 0-8-6C-9-11-9-14-6-16Z';
export const TRIM = [
  '',
  'M-5-12L3-8L11-12L11-9L3-5L-5-9Z', // chevron
  'M-2-12a1.8 1.8 0 1 0 .1 0ZM6-14a1.8 1.8 0 1 0 .1 0ZM10-6a1.8 1.8 0 1 0 .1 0ZM2-4a1.8 1.8 0 1 0 .1 0Z', // studs
];
export const BELT = 'M-11 7L11 7L11 12L-11 12Z';
export const BUCKLE = 'M2 7.5L7 7.5L7 11.5L2 11.5Z';
export const TASSET = 'M-12 12L12 12L15 25L3 22L0 27L-4 22L-14 25Z';

// Head
export const HEAD = 'M-11-3C-12-13-5-18 2-18C10-18 14-12 14-5L16 0L14 2C14 9 9 13 3 13C-4 13-10 8-11-3Z';
export const EAR = 'M-4-3L-15-12L-7 3Z';
export const HAIR = 'M-14 5C-17-6-13-17-3-20C6-23 15-19 16-10C11-13 6-12 2-10C1-14-4-15-6-12C-8-9-10-4-9 2C-11 3-12 4-14 5Z';
export const EYE = 'M3-6C6-8.5 10-8.5 12-5C10-2.5 6-2.5 3-4Z';
export const EYE_C = [8, -5, 2.6] as const; // iris centre x, y, radius
export const VISOR = 'M-1-9L15-9L15-2L-1-1Z';
export const VISOR_SLIT = 'M2-5.5L13-5.5';
export const BROW = 'M2-10.5L12-9.5L12-8L2-9Z';
export const BROW_ANGRY = 'M2-12L12-8.5L12-7L2-10.5Z';
export const MOUTH = 'M7 7Q10 8 12 6';
export const MOUTH_OPEN = 'M6 6C8 4.5 12 4 13 6C13 10 9 12 7 9Z';

// Horn variants: [far-side path, near-side path]; a stroke-only spiral for the ram (2).
export const HORNS: { far?: string; near?: string; curl?: string }[] = [
  { far: 'M-2-15C-6-23-14-28-24-28C-17-23-12-17-9-11Z', near: 'M4-16C1-24-6-30-15-31C-9-25-4-18-1-12Z' }, // swept
  { far: 'M-2-16L1-30L6-17Z', near: 'M5-17L10-29L13-15Z' }, // spikes
  { curl: 'M-4-14C-10-24-24-20-22-9C-21-2-12-2-12-7C-11-11-16-12-17-9' }, // ram curl
  { near: 'M6-15C8-24 11-31 16-36C15-27 14-20 13-13Z' }, // forehead crest
];

// Tail tips, in tail2-local space (bone ends at y = 16).
export const TAIL_TIP = [
  'M0 12L-6 19L0 28L6 19Z', // spade
  'M0 11a7 7 0 1 0 .1 0Z', // club
  'M0 7C-9 13-10 25 0 33C7 25 6 14 0 7Z', // leaf
];

// Cosmetic weapons in the front fist, forearm-local (fist grip at y ~ 24). Cosmetic only: hitboxes come from the sim.
export const WEAPON: { grip: string; head: string; guard?: string }[] = [
  { grip: 'M-2 13L2 13L2 31L-2 31Z', guard: 'M-9 27L9 27L9 31L-9 31Z', head: 'M-3 31L3 31L3.5 64L0 73L-3.5 64Z' }, // sword
  { grip: 'M-2 10L2 10L2 52L-2 52Z', head: 'M-11 46C-12 46-13 48-13 50L-13 62C-13 64-12 66-10 66L10 66C12 66 13 64 13 62L13 50C13 48 12 46 10 46Z' }, // hammer
  { grip: 'M-1.7-20L1.7-20L1.7 68L-1.7 68Z', guard: 'M-3.5 64L3.5 64L3.5 69L-3.5 69Z', head: 'M0 66C-6 74-5 82 0 92C5 82 6 74 0 66Z' }, // spear
];
export const BLADE_EDGE = ['M0 33L0 66', 'M-13 56L13 56', 'M0 70L0 88'];
