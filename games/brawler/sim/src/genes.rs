//! DNA trust boundary: port of client genes.ts sanitize + statsOf.
//! ponytail: breed/randomDna lived in the removed on-chain contract; TODO(solana): port to the program (DNA must stay on-chain).
use crate::{Stats, js_max, js_min, js_round};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Dna {
    pub str: u16,
    pub dex: u16,
    pub def: u16,
    pub spd: u16,
    pub hue: u16,
    pub accent: u16,
    pub horn: u16,
    pub tail: u16,
    pub pattern: u16,
    pub eye: u16,
    pub size: u16,
}

/// mulberry32, same as TS rng().
struct Rng(u32);
impl Rng {
    fn below(&mut self, n: u32) -> u32 {
        self.0 = self.0.wrapping_add(0x6d2b79f5);
        let mut t = self.0;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        (((t ^ (t >> 14)) as u64 * n as u64) >> 32) as u32
    }
}

/// JS `+v` (Number coercion). None = NaN.
fn num(v: Option<&Value>) -> Option<f64> {
    let n = match v? {
        Value::Null => 0.,
        Value::Bool(b) => *b as u8 as f64,
        Value::Number(n) => n.as_f64()?,
        Value::String(s) => {
            let s = s.trim();
            if s.is_empty() { 0. } else { s.parse().ok()? }
        }
        _ => return None, // ponytail: JS coerces [5] -> 5, treated NaN here; any result still in range
    };
    n.is_finite().then_some(n)
}

/// Clamp untrusted DNA into valid ranges, stats summed to 22.
pub fn sanitize(x: &Value) -> Dna {
    let n = |k: &str, lo: f64, hi: f64, d: u16| {
        num(x.get(k)).map_or(d, |v| js_max(lo, js_min(hi, js_round(v))) as u16)
    };
    let mut s = [
        n("str", 3., 9., 6),
        n("dex", 3., 9., 5),
        n("def", 3., 9., 5),
        n("spd", 3., 9., 6),
    ];
    let mut sum: u16 = s.iter().sum();
    let r = &mut Rng(1);
    while sum != 22 {
        let k = r.below(4) as usize;
        if sum > 22 && s[k] > 3 {
            s[k] -= 1;
            sum -= 1;
        } else if sum < 22 && s[k] < 9 {
            s[k] += 1;
            sum += 1;
        }
    }
    Dna {
        str: s[0],
        dex: s[1],
        def: s[2],
        spd: s[3],
        hue: n("hue", 0., 359., 170),
        accent: n("accent", 0., 359., 40),
        horn: n("horn", 0., 3., 0),
        tail: n("tail", 0., 2., 0),
        pattern: n("pattern", 0., 2., 0),
        eye: n("eye", 0., 3., 0),
        size: n("size", 90., 115., 100),
    }
}

pub fn stats_of(d: &Dna) -> Stats {
    Stats {
        str: d.str as f64,
        dex: d.dex as f64,
        def: d.def as f64,
        spd: d.spd as f64,
        fx: 0,
    }
}

/// Port of genes.ts skills: Power..Speed bump str/dex/def/spd, the rest are effects (fx bit 1 << (kind - 4)).
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub enum SkillKind {
    Power,
    Agility,
    Durability,
    Speed,
    AirJump,
    Lifesteal,
    QuickDodge,
    SecondWind,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Skill {
    pub kind: SkillKind,
    pub mag: u8,
}

/// Untrusted loadout: <= 3, stat mag 1..2, per stat <= +2, total <= +3, <= 2 distinct effects; breakers dropped in order.
pub fn sanitize_skills(x: &Value) -> Vec<Skill> {
    let mut out: Vec<Skill> = vec![];
    let (mut per, mut total, mut fxs) = ([0u8; 4], 0u8, 0);
    for s in x.as_array().into_iter().flatten() {
        if out.len() >= 3 {
            break;
        }
        let Some(kind) = s
            .get("kind")
            .and_then(Value::as_str)
            .and_then(|k| serde_json::from_value::<SkillKind>(k.into()).ok())
        else {
            continue;
        };
        let i = kind as usize;
        if i >= 4 {
            if fxs < 2 && !out.iter().any(|o| o.kind == kind) {
                fxs += 1;
                out.push(Skill { kind, mag: 1 });
            }
            continue;
        }
        let Some(v) = num(s.get("mag")) else { continue };
        let mag = js_max(1., js_min(2., js_round(v))) as u8;
        if per[i] + mag <= 2 && total + mag <= 3 {
            per[i] += mag;
            total += mag;
            out.push(Skill { kind, mag });
        }
    }
    out
}

pub fn apply_skills(mut s: Stats, skills: &[Skill]) -> Stats {
    for k in skills {
        let i = k.kind as usize;
        let m = k.mag as f64;
        match i {
            0 => s.str = (s.str + m).min(11.),
            1 => s.dex = (s.dex + m).min(11.),
            2 => s.def = (s.def + m).min(11.),
            3 => s.spd = (s.spd + m).min(11.),
            _ => s.fx |= 1 << (i - 4),
        }
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn sanitize_clamps_and_sums() {
        let d = sanitize(
            &json!({ "str": 99, "dex": -4, "def": "7", "spd": null, "hue": 400.4, "size": 2 }),
        );
        assert_eq!(d.str + d.dex + d.def + d.spd, 22);
        assert!(
            [d.str, d.dex, d.def, d.spd]
                .iter()
                .all(|v| (3..=9).contains(v))
        );
        assert_eq!((d.hue, d.accent, d.size), (359, 40, 90));
        assert_eq!(sanitize(&Value::Null), sanitize(&json!({})));
    }

    #[test]
    fn skills_match_fixture() {
        let t: Value = serde_json::from_str(include_str!("../testdata/skills.json")).unwrap();
        let base = stats_of(&sanitize(&t["base"]));
        for c in t["cases"].as_array().unwrap() {
            let sk = sanitize_skills(&c["in"]);
            assert_eq!(
                serde_json::to_value(&sk).unwrap(),
                c["out"],
                "in {}",
                c["in"]
            );
            let s = apply_skills(base, &sk);
            assert_eq!(
                json!({ "str": s.str as u8, "dex": s.dex as u8, "def": s.def as u8, "spd": s.spd as u8, "fx": s.fx }),
                c["stats"],
                "in {}",
                c["in"]
            );
        }
    }
}
