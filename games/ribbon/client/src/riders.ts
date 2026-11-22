// Rider roster: who rides each seat. The trails, banners and duel cards all read from here.
// ponytail: stand-in names from brawler's chars until the real monster list lands; swap ROSTER, nothing else changes.
// For chain monsters later, brawler's body colour is hsl(dna.hue 58% 56%) (genes.ts lookOf), so use that as `color`.
export interface Rider { name: string; color: string; art?: string } // art = portrait url (optional)

export const ROSTER: Rider[] = [
  { name: 'Lortor', color: '#2ee6ff' },
  { name: 'Torfen', color: '#ffa424' },
];
export const NAMES = ROSTER.map((r) => r.name);
export const COLORS = ROSTER.map((r) => r.color);
