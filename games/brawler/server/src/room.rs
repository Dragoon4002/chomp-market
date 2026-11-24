use crate::App;
use crate::protocol::{lobby_msg, room_state};
use crate::referee::Referee;
use crate::session::{Conn, broadcast};
use brawler_sim::{
    StageId, Stats,
    genes::{Dna, Skill, apply_skills, stats_of},
};
use rand::Rng;
use serde_json::{Value, json};
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use std::time::{Duration, Instant};

const CODE_LETTERS: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOBBY_THROTTLE: Duration = Duration::from_millis(500);
const CHAT_KEEP: usize = 50;

pub struct Seat {
    pub conn: Option<Arc<Conn>>,
    pub name: String,
    pub dna: Dna,
    /// Equipped skills, read from chain at `begin`. Off-chain seats stay empty (client claims never trusted).
    pub skills: Vec<Skill>,
    pub account: String,
    pub seen: Instant,
    /// Confirmed inputs mirrored by this player, packed host<<16|guest.
    pub tape: Vec<i32>,
}

impl Seat {
    pub fn new(conn: Arc<Conn>, name: String, dna: Dna, account: String) -> Self {
        Seat {
            conn: Some(conn),
            name,
            dna,
            skills: vec![],
            account,
            seen: Instant::now(),
            tape: vec![],
        }
    }

    pub fn stats(&self) -> Stats {
        apply_skills(stats_of(&self.dna), &self.skills)
    }
}

#[derive(Clone, Copy, PartialEq)]
pub enum Status {
    Waiting,
    Live,
    Done,
}

impl Status {
    pub fn as_str(self) -> &'static str {
        match self {
            Status::Waiting => "waiting",
            Status::Live => "live",
            Status::Done => "done",
        }
    }
}

pub struct Room {
    /// Codes get reused; uid tells a room apart from a later one with the same code.
    pub uid: u64,
    pub code: String,
    pub public: bool,
    pub view: bool,
    pub bettable: bool,
    pub match_id: Option<u64>,
    /// On-chain [a, b] once both are known; settle pays only these.
    pub pair: [String; 2],
    pub stake: String,
    pub stage: StageId,
    pub seats: Vec<Seat>,
    pub spectators: HashMap<u64, Arc<Conn>>,
    pub status: Status,
    pub winner: Option<i32>,
    pub referee: Option<Referee>,
    pub frames: Vec<[i32; 2]>,
    pub created: Instant,
    /// `match` rooms: on-chain seat of 1st arrival (wins if other never shows).
    pub no_show: Option<i32>,
    /// Bumped per rematch so a stale DONE_TTL timer can't remove the next game.
    pub round: u32,
    pub rematch: [bool; 2],
    /// Last CHAT_KEEP lines `{from, seat, text, ts}`.
    pub chat: VecDeque<Value>,
    /// Host pressed "Call bot": the bot service joins rooms flagged in the lobby.
    pub wants_bot: bool,
}

impl Room {
    pub fn handle(&self) -> RoomRef {
        RoomRef {
            code: self.code.clone(),
            uid: self.uid,
        }
    }

    pub fn seat_of(&self, c: &Conn) -> Option<usize> {
        self.seats
            .iter()
            .position(|s| s.conn.as_ref().is_some_and(|x| x.id == c.id))
    }

    pub fn opponent(&self, seat: usize) -> Option<&Arc<Conn>> {
        self.seats.get(1 - seat).and_then(|s| s.conn.as_ref())
    }

    /// Fresh game in the same room (same seats/DNA/stage); `game::begin` takes it from here.
    pub fn reset(&mut self) {
        self.round += 1;
        self.status = Status::Waiting;
        self.winner = None;
        self.referee = None;
        self.frames.clear();
        self.no_show = None;
        self.rematch = [false; 2];
        self.seats.iter_mut().for_each(|s| s.tape.clear());
    }

    pub fn players(&self) -> impl Iterator<Item = &Arc<Conn>> {
        self.seats.iter().filter_map(|s| s.conn.as_ref())
    }

    pub fn everyone(&self) -> impl Iterator<Item = &Arc<Conn>> {
        self.players().chain(self.spectators.values())
    }

    pub fn push_state(&self) {
        broadcast(self.everyone(), &room_state(self));
    }

    /// Newcomer `c`: everyone gets `roomstate`, `c` gets the `chatlog`.
    pub fn welcome(&self, c: &Conn) {
        self.push_state();
        c.send(&json!({ "t": "chatlog", "lines": self.chat }));
    }

    pub fn add_chat(&mut self, line: Value) {
        if self.chat.len() == CHAT_KEEP {
            self.chat.pop_front();
        }
        self.chat.push_back(line);
    }
}

#[derive(Clone)]
pub struct RoomRef {
    pub code: String,
    pub uid: u64,
}

impl RoomRef {
    pub fn get_mut<'a>(&self, rooms: &'a mut HashMap<String, Room>) -> Option<&'a mut Room> {
        rooms.get_mut(&self.code).filter(|r| r.uid == self.uid)
    }
}

#[derive(Default)]
pub struct Lobby {
    pub subs: HashMap<u64, Arc<Conn>>,
    pending: bool,
}

impl Lobby {
    pub fn push(&mut self, app: &Arc<App>) {
        if self.pending {
            return;
        }
        self.pending = true;
        let app = app.clone();
        tokio::spawn(async move {
            tokio::time::sleep(LOBBY_THROTTLE).await;
            let mut st = app.lock();
            st.lobby.pending = false;
            broadcast(st.lobby.subs.values(), &lobby_msg(&st.rooms));
        });
    }
}

#[derive(Default)]
pub struct Shared {
    pub rooms: HashMap<String, Room>,
    pub lobby: Lobby,
    last_uid: u64,
}

impl Shared {
    pub fn open_room(&mut self, seat: Seat, configure: impl FnOnce(&mut Room)) -> RoomRef {
        self.last_uid += 1;
        let mut r = Room {
            uid: self.last_uid,
            code: self.new_code(),
            public: false,
            view: false,
            bettable: false,
            match_id: None,
            pair: Default::default(),
            stake: "0".into(),
            stage: StageId::Ember,
            seats: vec![seat],
            spectators: HashMap::new(),
            status: Status::Waiting,
            winner: None,
            referee: None,
            frames: vec![],
            created: Instant::now(),
            no_show: None,
            round: 0,
            rematch: [false; 2],
            chat: VecDeque::new(),
            wants_bot: false,
        };
        configure(&mut r);
        let at = r.handle();
        self.rooms.insert(r.code.clone(), r);
        at
    }

    fn new_code(&self) -> String {
        let mut rng = rand::rng();
        loop {
            let code: String = (0..4)
                .map(|_| CODE_LETTERS[rng.random_range(0..CODE_LETTERS.len())] as char)
                .collect();
            if !self.rooms.contains_key(&code) {
                return code;
            }
        }
    }
}
