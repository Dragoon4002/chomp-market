// Frame data, 60 fps. Port of client src/lib/sim/moves.ts.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MoveId {
    Jab1,
    Jab2,
    Jab3,
    SideLight,
    DownLight,
    AirNeutral,
    AirSide,
    AirDown,
    NHeavy,
    SHeavy,
    DHeavy,
    AirSideHeavy,
    Recovery,
    GroundPound,
}

pub struct Hb {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}
pub struct MoveDef {
    pub air: bool,
    pub startup: f64,
    pub active: f64,
    pub recovery: f64,
    pub hb: Hb,
    pub dmg: f64,
    pub base: f64,
    pub growth: f64,
    pub ax: f64,
    pub ay: f64,
    pub self_vx: Option<f64>,
    pub self_vy: Option<f64>,
    pub away: bool,
    pub until_land: bool,
}

#[allow(clippy::too_many_arguments)]
const fn mv(
    air: bool,
    su: f64,
    act: f64,
    rec: f64,
    hb: [f64; 4],
    dmg: f64,
    base: f64,
    growth: f64,
    ax: f64,
    ay: f64,
) -> MoveDef {
    MoveDef {
        air,
        startup: su,
        active: act,
        recovery: rec,
        hb: Hb {
            x: hb[0],
            y: hb[1],
            w: hb[2],
            h: hb[3],
        },
        dmg,
        base,
        growth,
        ax,
        ay,
        self_vx: None,
        self_vy: None,
        away: false,
        until_land: false,
    }
}

pub fn get(id: MoveId) -> &'static MoveDef {
    use MoveId::*;
    static JAB1: MoveDef = mv(
        false,
        5.,
        3.,
        12.,
        [18., -72., 55., 30.],
        5.,
        5.,
        0.02,
        0.5,
        -0.866,
    );
    static JAB2: MoveDef = mv(
        false,
        4.,
        3.,
        12.,
        [18., -72., 55., 30.],
        5.,
        5.,
        0.02,
        0.5,
        -0.866,
    );
    static JAB3: MoveDef = mv(
        false,
        6.,
        4.,
        18.,
        [18., -80., 72., 42.],
        8.,
        8.,
        0.08,
        0.8,
        -0.6,
    );
    static SIDE_LIGHT: MoveDef = MoveDef {
        self_vx: Some(7.),
        ..mv(
            false,
            8.,
            4.,
            16.,
            [15., -66., 78., 30.],
            10.,
            7.,
            0.1,
            0.94,
            -0.342,
        )
    };
    static DOWN_LIGHT: MoveDef = mv(
        false,
        7.,
        4.,
        14.,
        [8., -26., 82., 26.],
        9.,
        7.,
        0.07,
        0.5,
        -0.866,
    );
    static AIR_NEUTRAL: MoveDef = MoveDef {
        away: true,
        ..mv(
            true,
            6.,
            6.,
            12.,
            [-42., -118., 84., 48.],
            9.,
            7.,
            0.08,
            0.259,
            -0.966,
        )
    };
    static AIR_SIDE: MoveDef = mv(
        true,
        7.,
        5.,
        14.,
        [15., -72., 72., 36.],
        10.,
        7.,
        0.1,
        0.866,
        -0.5,
    );
    static AIR_DOWN: MoveDef = mv(
        true,
        8.,
        6.,
        14.,
        [-8., -22., 58., 46.],
        10.,
        6.,
        0.06,
        0.342,
        0.94,
    );
    static N_HEAVY: MoveDef = MoveDef {
        away: true,
        ..mv(
            false,
            16.,
            5.,
            24.,
            [-36., -152., 72., 82.],
            18.,
            10.,
            0.18,
            0.174,
            -0.985,
        )
    };
    static S_HEAVY: MoveDef = MoveDef {
        self_vx: Some(9.),
        ..mv(
            false,
            18.,
            5.,
            26.,
            [18., -82., 96., 52.],
            20.,
            10.,
            0.15,
            0.906,
            -0.423,
        )
    };
    static D_HEAVY: MoveDef = MoveDef {
        away: true,
        ..mv(
            false,
            15.,
            6.,
            24.,
            [-82., -40., 164., 40.],
            17.,
            10.,
            0.16,
            0.6,
            -0.8,
        )
    };
    static AIR_SIDE_HEAVY: MoveDef = MoveDef {
        self_vx: Some(6.),
        ..mv(
            true,
            14.,
            6.,
            22.,
            [18., -82., 92., 46.],
            17.,
            9.,
            0.15,
            0.906,
            -0.423,
        )
    };
    static RECOVERY: MoveDef = MoveDef {
        self_vx: Some(2.),
        self_vy: Some(-19.),
        ..mv(
            true,
            5.,
            12.,
            20.,
            [-12., -132., 62., 112.],
            12.,
            9.,
            0.1,
            0.342,
            -0.94,
        )
    };
    static GROUND_POUND: MoveDef = MoveDef {
        self_vx: Some(0.),
        self_vy: Some(22.),
        until_land: true,
        away: true,
        ..mv(
            true,
            10.,
            1.,
            18.,
            [-32., -34., 84., 44.],
            16.,
            9.,
            0.15,
            0.5,
            -0.866,
        )
    };
    match id {
        Jab1 => &JAB1,
        Jab2 => &JAB2,
        Jab3 => &JAB3,
        SideLight => &SIDE_LIGHT,
        DownLight => &DOWN_LIGHT,
        AirNeutral => &AIR_NEUTRAL,
        AirSide => &AIR_SIDE,
        AirDown => &AIR_DOWN,
        NHeavy => &N_HEAVY,
        SHeavy => &S_HEAVY,
        DHeavy => &D_HEAVY,
        AirSideHeavy => &AIR_SIDE_HEAVY,
        Recovery => &RECOVERY,
        GroundPound => &GROUND_POUND,
    }
}
