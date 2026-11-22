import type { Skill, SkillKind } from '@/lib/genes.ts';

export const DEMO_NOTE = 'Demo collection stored in this browser. Monsters move on-chain in a later build.';

export const GENE_NAMES: Record<string, string[]> = {
  horn: ['Curved horns', 'Spike horns', 'Ram curls', 'Crest horn'],
  tail: ['Spiked tail', 'Club tail', 'Leaf fin'],
  pattern: ['Plain hide', 'Stripes', 'Spots'],
  eye: ['Bright eyes', 'Fierce brow', 'Sleepy lids', 'Cyclops'],
};
export const SKILL_TEXT: Record<SkillKind, string> = {
  Power: 'Strength', Agility: 'Dexterity', Durability: 'Defence', Speed: 'Speed',
  AirJump: 'Third air jump', Lifesteal: 'Heal 1/5 of the damage your hits deal', QuickDodge: 'Dodge cooldown one third shorter',
  SecondWind: 'Once per stock, at 50 HP or less: heal 30',
};
export const isEffect = (s: Skill) => !['Power', 'Agility', 'Durability', 'Speed'].includes(s.kind);
export const skillLabel = (s: Skill) => (isEffect(s) ? { AirJump: 'Air jump', Lifesteal: 'Lifesteal', QuickDodge: 'Quick dodge', SecondWind: 'Second wind' }[s.kind as string] : `+${s.mag} ${SKILL_TEXT[s.kind]}`);
