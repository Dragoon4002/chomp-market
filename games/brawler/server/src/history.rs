//! Finished-match log for player profiles. Appended to HISTORY_FILE (JSON lines) so it survives restarts.
//! Each match's input tape goes to `tapes/<key>.json` next to it (replay + fairness check).
use serde::{Deserialize, Serialize};
use std::{
    fs::OpenOptions,
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};

const KEEP: usize = 20_000;

#[derive(Clone, Serialize, Deserialize)]
pub struct Player {
    pub account: String,
    pub name: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Rec {
    pub at: u64,
    pub match_id: Option<u64>,
    pub stake: String,
    pub winner: Option<i32>,
    pub reason: String,
    pub players: [Player; 2],
    /// Tape key (`/tape/{key}`): on-chain match id, else `r<ms>-<room uid>`.
    #[serde(default)]
    pub key: Option<String>,
}

pub struct History {
    path: String,
    recs: Mutex<Vec<Rec>>,
}

pub fn key_ok(key: &str) -> bool {
    (1..=40).contains(&key.len()) && key.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
}

impl History {
    pub fn load(path: String) -> Self {
        let recs = std::fs::File::open(&path)
            .map(|f| {
                BufReader::new(f)
                    .lines()
                    .map_while(Result::ok)
                    .filter_map(|l| serde_json::from_str(&l).ok())
                    .collect()
            })
            .unwrap_or_default();
        History {
            path,
            recs: Mutex::new(recs),
        }
    }

    pub fn push(&self, r: Rec) {
        if !self.path.is_empty()
            && let Ok(mut f) = OpenOptions::new()
                .create(true)
                .append(true)
                .open(&self.path)
        {
            let _ = writeln!(f, "{}", serde_json::to_string(&r).unwrap_or_default());
        }
        // ponytail: in-memory window + full scan per query; move to SQLite when the log outgrows this
        let mut recs = self.recs.lock().unwrap();
        recs.push(r);
        if recs.len() > KEEP {
            let cut = recs.len() - KEEP;
            recs.drain(..cut);
        }
    }

    fn tape_path(&self, key: &str) -> Option<PathBuf> {
        let dir = Path::new(&self.path).parent()?.join("tapes");
        (!self.path.is_empty() && key_ok(key)).then(|| dir.join(format!("{key}.json")))
    }

    pub fn save_tape(&self, key: &str, tape: &serde_json::Value) {
        let Some(p) = self.tape_path(key) else { return };
        let ok = p
            .parent()
            .is_some_and(|d| std::fs::create_dir_all(d).is_ok())
            && std::fs::write(&p, tape.to_string()).is_ok();
        if !ok {
            eprintln!("tape: can't write {}", p.display());
        }
    }

    pub fn tape(&self, key: &str) -> Option<String> {
        std::fs::read_to_string(self.tape_path(key)?).ok()
    }

    /// Newest first.
    pub fn of(&self, account: &str, limit: usize) -> Vec<Rec> {
        let recs = self.recs.lock().unwrap();
        recs.iter()
            .rev()
            .filter(|r| r.players.iter().any(|p| p.account == account))
            .take(limit)
            .cloned()
            .collect()
    }
}
