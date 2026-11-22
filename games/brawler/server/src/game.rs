use crate::protocol::{spec_msg, start_msg};
use crate::referee::Referee;
use crate::room::{Lobby, Room, RoomRef, Status};
use crate::session::{Conn, broadcast};
use crate::{App, ChainMatch};
use brawler_sim::genes::{Dna, Skill};
use serde_json::{Value, json};
use std::sync::{Arc, atomic::Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const FORFEIT: Duration = Duration::from_secs(30);
const NO_SHOW: Duration = Duration::from_secs(5 * 60);
const DONE_TTL: Duration = Duration::from_secs(120);

pub async fn begin(app: Arc<App>, at: RoomRef, chain_match: Option<ChainMatch>) {
    let Some(match_id) = at.get_mut(&mut app.lock().rooms).map(|r| r.match_id) else {
        return;
    };
    let mut dna: [Option<(Dna, Vec<Skill>)>; 2] = [None, None];
    let mut failed = false;
    if let Some(id) = match_id {
        let chain_match = match chain_match {
            Some(m) => Some(m),
            None => app.get_match(id).await,
        };
        let tokens = chain_match.and_then(|m| m.monsters).unwrap_or_default();
        for (slot, token) in dna.iter_mut().zip(&tokens) {
            let Some(token) = token else { continue };
            *slot = app.monster_load(token).await;
            failed |= slot.is_none(); // never fall back to client DNA for a chain monster
        }
    }
    let Some((socks, mut start)) = go_live(&app, &at, failed, dna) else {
        return;
    };
    let (a, b) = tokio::join!(rtt(&socks[0]), rtt(&socks[1]));
    start["delay"] = input_delay(a, b).into();
    for (seat, c) in socks.iter().enumerate() {
        start["seat"] = seat.into();
        c.send(&start);
    }
}

/// Frames of input delay: covers A -> relay -> B latency + 3 frames jitter. Same for both seats.
fn input_delay(rtt_a: f64, rtt_b: f64) -> u32 {
    (((rtt_a + rtt_b) / 2. / (1000. / 60.)).ceil() + 3.).clamp(4., 15.) as u32
}

fn go_live(
    app: &Arc<App>,
    at: &RoomRef,
    failed: bool,
    dna: [Option<(Dna, Vec<Skill>)>; 2],
) -> Option<([Arc<Conn>; 2], Value)> {
    let mut st = app.lock();
    let st = &mut *st;
    let r = at.get_mut(&mut st.rooms)?;
    if failed {
        // on-chain match stays playable on retry (or expires)
        let r = st.rooms.remove(&at.code)?;
        st.lobby.push(app);
        for c in r.players() {
            c.error("Could not load monster from chain, try again");
            c.close();
        }
        return None;
    }
    for (s, d) in r.seats.iter_mut().zip(dna) {
        if let Some((d, sk)) = d {
            s.dna = d;
            s.skills = sk;
        }
    }
    if r.status != Status::Waiting {
        return None;
    }
    let seated = |i: usize| r.seats.get(i).and_then(|s| s.conn.clone());
    // a leaver already got cleaned up by Session::close
    let (Some(host), Some(guest)) = (seated(0), seated(1)) else {
        return None;
    };
    r.referee = Some(Referee::new([r.seats[0].stats(), r.seats[1].stats()], r.stage));
    r.status = Status::Live;
    let now = Instant::now();
    r.seats.iter_mut().for_each(|s| s.seen = now);
    broadcast(r.spectators.values(), &spec_msg(r));
    r.push_state();
    st.lobby.push(app);
    Some(([host, guest], start_msg(r)))
}

/// Worst of 6 app-level pings, ms (proxies answer protocol pings, read ~0). 300 if no answer in 3 s.
async fn rtt(c: &Conn) -> f64 {
    let mut worst = 0f64;
    let pings = async {
        for _ in 0..6 {
            let t = Instant::now();
            c.send(&json!({ "t": "ping" }));
            c.pong.notified().await;
            worst = worst.max(t.elapsed().as_secs_f64() * 1000.);
        }
    };
    match tokio::time::timeout(Duration::from_secs(3), pings).await {
        Ok(()) => worst,
        Err(_) => 300.,
    }
}

pub fn replay(app: &Arc<App>, r: &mut Room, lobby: &mut Lobby) {
    if r.status != Status::Live {
        return;
    }
    let Some(rf) = r.referee.as_mut() else { return };
    let (a, b) = (&r.seats[0].tape, &r.seats[1].tape);
    let f0 = r.frames.len();
    let mut end = None;
    while rf.frame < a.len() && rf.frame < b.len() {
        let f = rf.frame;
        if a[f] != b[f] {
            end = Some((None, "tape mismatch"));
            break;
        }
        let ins = [(a[f] >> 16) & 0xffff, a[f] & 0xffff];
        r.frames.push(ins);
        if rf.step(ins) >= 0 {
            end = Some((Some(rf.state.winner), "ko"));
            break;
        }
    }
    if r.frames.len() > f0 {
        broadcast(
            r.spectators.values(),
            &json!({ "t": "frames", "f0": f0, "ins": &r.frames[f0..] }),
        );
    }
    if let Some((winner, reason)) = end {
        finish(app, r, lobby, winner, reason);
    }
}

pub fn finish(app: &Arc<App>, r: &mut Room, lobby: &mut Lobby, winner: Option<i32>, reason: &str) {
    if r.status == Status::Done {
        return;
    }
    r.status = Status::Done;
    r.winner = winner;
    let frames = r.frames.iter().map(|[h, g]| ((h << 16) | g) as u32);
    let tape_hash = crate::referee::tape_hash(r.stage.name(), frames.clone());
    let kos = r.referee.as_ref().map_or([0, 0], Referee::kos);
    let settle = r
        .match_id
        .filter(|_| app.gasless.load(Ordering::Relaxed))
        .and_then(|id| crate::referee::attestation(&app.near, id, winner, kos, &tape_hash));
    if let (Some(id), None) = (r.match_id, &settle) {
        // contract has no matching referee_key (pre-v3): report directly
        let args = json!({ "match_id": id, "winner": winner, "kos": kos, "tape_hash": tape_hash });
        app.near.call(id, "report_result", args, 100);
    }
    if let [a, b] = &r.seats[..] {
        let at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |d| d.as_millis() as u64);
        let key = r
            .match_id
            .map_or_else(|| format!("r{at}-{}", r.uid), |id| id.to_string());
        let p = |s: &crate::room::Seat| crate::history::Player {
            account: s.account.clone(),
            name: s.name.clone(),
        };
        // ponytail: sync file write under the room lock (~100 KB); move off-lock if finishes pile up
        app.history.save_tape(
            &key,
            &json!({
                "key": key, "match_id": r.match_id, "stage": r.stage.name(), "stake": r.stake, "winner": winner,
                "reason": reason, "tape_hash": tape_hash, "settle": settle, "at": at, "frames": frames.collect::<Vec<_>>(),
                "players": r.seats.iter().map(|s| json!({ "name": s.name, "account": s.account, "dna": s.dna, "skills": s.skills })).collect::<Vec<_>>(),
            }),
        );
        app.history.push(crate::history::Rec {
            at,
            match_id: r.match_id,
            stake: r.stake.clone(),
            winner,
            reason: reason.into(),
            players: [p(a), p(b)],
            key: Some(key),
        });
    }
    if let (Some(id), Some(s)) = (r.match_id, &settle) {
        let due_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |d| d.as_millis() as u64)
            + app.settle_fallback.as_millis() as u64;
        app.history
            .set_pending(id, Some(json!({ "settle": s, "due_ms": due_ms })));
        tokio::spawn(fallback(app.clone(), id, app.settle_fallback));
    }
    broadcast(
        r.players().chain(r.spectators.values()),
        &json!({ "t": "over", "winner": winner, "reason": reason, "settle": settle }),
    );
    r.push_state();
    lobby.push(app);
    let (app, at, round) = (app.clone(), r.handle(), r.round);
    tokio::spawn(async move {
        tokio::time::sleep(DONE_TTL).await;
        let mut st = app.lock();
        if at.get_mut(&mut st.rooms).is_some_and(|r| r.round == round) {
            st.rooms.remove(&at.code);
        }
    });
}

/// After `wait`: still unsettled -> referee reports itself (only gas it spends on results).
pub async fn fallback(app: Arc<App>, id: u64, wait: Duration) {
    tokio::time::sleep(wait).await;
    let Some((_, p)) = app.history.pending().into_iter().find(|(k, _)| *k == id) else {
        return;
    };
    crate::referee::fallback(&app.near, &p["settle"]).await;
    app.history.set_pending(id, None);
}

/// Paid guest left the waiting room: refund it and reopen the match; contract refuses (market traded) -> void it.
pub async fn unjoin(app: Arc<App>, at: RoomRef, id: u64) {
    let near = &app.near;
    if !near.can_sign()
        || near
            .call_now(id, "unjoin", json!({ "match_id": id }), 30)
            .await
    {
        return;
    }
    let args = json!({ "match_id": id, "winner": null, "kos": null, "tape_hash": null });
    near.call(id, "report_result", args, 100);
    let mut st = app.lock();
    if at
        .get_mut(&mut st.rooms)
        .is_some_and(|r| r.status == Status::Waiting)
    {
        let r = st.rooms.remove(&at.code).expect("just found");
        for c in r.everyone() {
            c.error("Match voided (guest left after bets): stakes refunded");
            c.send(&json!({ "t": "left" }));
        }
        st.lobby.push(&app);
    }
}

pub fn tick(app: &Arc<App>) {
    let mut st = app.lock();
    let st = &mut *st;
    let now = Instant::now();
    for r in st.rooms.values_mut() {
        if r.status == Status::Waiting
            && r.seats.len() == 1
            && now - r.created >= NO_SHOW
            && let Some(winner) = r.no_show
        {
            let d = r.seats[0].stats();
            // fresh game: kos [0,0]
            r.referee = Some(Referee::new([d, d], r.stage));
            finish(app, r, &mut st.lobby, Some(winner), "no-show");
            continue;
        }
        if r.status != Status::Live {
            continue;
        }
        match [0, 1].map(|i| now - r.seats[i].seen > FORFEIT) {
            [true, true] => finish(app, r, &mut st.lobby, None, "both left"),
            [true, false] => finish(app, r, &mut st.lobby, Some(1), "forfeit"),
            [false, true] => finish(app, r, &mut st.lobby, Some(0), "forfeit"),
            [false, false] => {}
        }
    }
}
