// Arena layouts. Pure data: the sim reads geometry, the renderer reads palette/name.
// All layouts are mirror-symmetric around x = 800 so neither spawn is favoured.
// Solids/ledges match the painted art in public/stages/<id> (placement: render/artstage.ts). Mirror in sim/src/stages.rs.

export interface Rect { x0: number; x1: number; y: number; y1: number } // solid: land on top, blocked from sides/below
export interface Ledge { x0: number; x1: number; y: number } // soft: land from above, drop through
export interface StageDef {
  name: string;
  blurb: string;
  solids: Rect[];
  soft: Ledge[];
  blast: { x0: number; x1: number; y0: number; y1: number };
  spawns: { x: number; y: number }[];
  cam: { x0: number; x1: number; y0: number; y1: number }; // box always kept in frame
}

export const STAGES = {
  ember: {
    name: 'Ember Ruins',
    blurb: 'A wide island of broken stone. Big stage, two ledges, room to brawl.',
    solids: [{ x0: 296, x1: 1304, y: 600, y1: 700 }],
    soft: [{ x0: 420, x1: 713, y: 429 }, { x0: 887, x1: 1180, y: 429 }],
    blast: { x0: -250, x1: 1850, y0: -450, y1: 1150 },
    spawns: [{ x: 600, y: 300 }, { x: 1000, y: 300 }],
    cam: { x0: 480, x1: 1120, y0: 380, y1: 640 },
  },
  grove: {
    name: 'Skyroot Grove',
    blurb: 'Two treetop islands split by a gap. Branches stacked high for air fights.',
    solids: [{ x0: 81, x1: 686, y: 620, y1: 700 }, { x0: 914, x1: 1519, y: 620, y1: 700 }],
    soft: [{ x0: 241, x1: 582, y: 478 }, { x0: 646, x1: 954, y: 381 }, { x0: 1018, x1: 1359, y: 478 }],
    blast: { x0: -250, x1: 1850, y0: -500, y1: 1150 },
    spawns: [{ x: 510, y: 300 }, { x: 1090, y: 300 }],
    cam: { x0: 250, x1: 1350, y0: 300, y1: 660 },
  },
  docks: {
    name: 'Tidecrest Docks',
    blurb: 'A long low pier over the night sea. Hard to knock anyone off the sides.',
    solids: [{ x0: 296, x1: 1304, y: 640, y1: 690 }],
    soft: [{ x0: 546, x1: 616, y: 512 }, { x0: 763, x1: 837, y: 462 }, { x0: 984, x1: 1054, y: 512 }],
    blast: { x0: -300, x1: 1900, y0: -450, y1: 1150 },
    spawns: [{ x: 560, y: 300 }, { x: 1040, y: 300 }],
    cam: { x0: 440, x1: 1160, y0: 400, y1: 680 },
  },
} satisfies Record<string, StageDef>;

export type StageId = keyof typeof STAGES;
export const STAGE_IDS = Object.keys(STAGES) as StageId[];
