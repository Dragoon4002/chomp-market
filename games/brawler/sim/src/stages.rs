// Stage geometry. Port of client src/lib/stages.ts (sim fields only).
pub struct Rect {
    pub x0: f64,
    pub x1: f64,
    pub y: f64,
    pub y1: f64,
}
pub struct Ledge {
    pub x0: f64,
    pub x1: f64,
    pub y: f64,
}
pub struct Blast {
    pub x0: f64,
    pub x1: f64,
    pub y0: f64,
    pub y1: f64,
}
pub struct StageDef {
    pub solids: &'static [Rect],
    pub soft: &'static [Ledge],
    pub blast: Blast,
    pub spawns: [(f64, f64); 2],
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StageId {
    Ember,
    Grove,
    Docks,
}
pub const STAGE_IDS: [&str; 3] = ["ember", "grove", "docks"];

impl StageId {
    pub fn parse(s: &str) -> Option<Self> {
        Some(match s {
            "ember" => Self::Ember,
            "grove" => Self::Grove,
            "docks" => Self::Docks,
            _ => return None,
        })
    }
    pub fn name(self) -> &'static str {
        STAGE_IDS[self as usize]
    }
    pub fn def(self) -> &'static StageDef {
        static EMBER: StageDef = StageDef {
            solids: &[Rect {
                x0: 296.,
                x1: 1304.,
                y: 600.,
                y1: 700.,
            }],
            soft: &[
                Ledge {
                    x0: 420.,
                    x1: 713.,
                    y: 429.,
                },
                Ledge {
                    x0: 887.,
                    x1: 1180.,
                    y: 429.,
                },
            ],
            blast: Blast {
                x0: -250.,
                x1: 1850.,
                y0: -450.,
                y1: 1150.,
            },
            spawns: [(600., 300.), (1000., 300.)],
        };
        static GROVE: StageDef = StageDef {
            solids: &[
                Rect {
                    x0: 81.,
                    x1: 686.,
                    y: 620.,
                    y1: 700.,
                },
                Rect {
                    x0: 914.,
                    x1: 1519.,
                    y: 620.,
                    y1: 700.,
                },
            ],
            soft: &[
                Ledge {
                    x0: 241.,
                    x1: 582.,
                    y: 478.,
                },
                Ledge {
                    x0: 646.,
                    x1: 954.,
                    y: 381.,
                },
                Ledge {
                    x0: 1018.,
                    x1: 1359.,
                    y: 478.,
                },
            ],
            blast: Blast {
                x0: -250.,
                x1: 1850.,
                y0: -500.,
                y1: 1150.,
            },
            spawns: [(510., 300.), (1090., 300.)],
        };
        static DOCKS: StageDef = StageDef {
            solids: &[Rect {
                x0: 296.,
                x1: 1304.,
                y: 640.,
                y1: 690.,
            }],
            soft: &[
                Ledge {
                    x0: 546.,
                    x1: 616.,
                    y: 512.,
                },
                Ledge {
                    x0: 763.,
                    x1: 837.,
                    y: 462.,
                },
                Ledge {
                    x0: 984.,
                    x1: 1054.,
                    y: 512.,
                },
            ],
            blast: Blast {
                x0: -300.,
                x1: 1900.,
                y0: -450.,
                y1: 1150.,
            },
            spawns: [(560., 300.), (1040., 300.)],
        };
        match self {
            Self::Ember => &EMBER,
            Self::Grove => &GROVE,
            Self::Docks => &DOCKS,
        }
    }
}
