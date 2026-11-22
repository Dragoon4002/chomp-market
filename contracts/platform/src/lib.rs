//! Spend calls need 1 yocto: wallet confirm, fn-call keys can't spend.
//! Games: `register_game(game, referee, assets?, referee_key?)`. Referee `report_result`s that game's matches, or anyone
//! `settle`s with the referee key's ed25519 attestation (`settle_msg`). Seat payouts credit balances at the result.
//! assets = optional NFT contract w/ lock/unlock/record_result/add_title (lock first, `#[private]` callback re-credits on fail).
//! Market: per-match binary CLOB, side-0 share + side-1 share = UNIT. Every fill needs a real counterparty (no house
//! money). Winning shares redeem UNIT minus fee, void refunds exactly what was paid.

use near_sdk::json_types::{Base64VecU8, U128};
use near_sdk::store::{IterableMap, LookupMap, Vector};
use near_sdk::{
    AccountId, BorshStorageKey, CurveType, Gas, NearToken, PanicOnDefault, Promise, PromiseError, PromiseOrValue, PublicKey,
    assert_one_yocto, env, ext_contract, near, require,
};

const BPS: u128 = 10_000;
pub const UNIT: u128 = 10_000_000_000_000_000_000_000; // 0.01 NEAR per share
const TICK: u128 = UNIT / BPS; // yocto per share per bps
const MAX_FILLS: usize = 20;
const MAX_BOOK: usize = 100; // ponytail: resting orders per side in a sorted Vec; tree if books get deep
const EXPIRY_NS: u64 = 2 * 60 * 60 * 1_000_000_000;
const MAX_LIST: u64 = 50;
const MAX_RECENT: u32 = 20;
const MAX_SCAN: usize = 500; // ponytail: game filter scans newest 500; per-game index if games outgrow it
const MAX_HISTORY: usize = 200; // ponytail: oldest price points drop off; store sampled history if longer charts matter
const CALLBACK_GAS: Gas = Gas::from_tgas(5);
// create/join w/ monster: attach >= 100 Tgas
const LOCK_GAS: Gas = Gas::from_tgas(15);
const ON_LOCK_GAS: Gas = Gas::from_tgas(40);
const ON_ENTER_GAS: Gas = Gas::from_tgas(100); // the 8th entry creates 4 matches
const ENTER_GAS: Gas = Gas::from_tgas(150); // lock + on_enter + enter_tournament itself
// report_result / settle worst case (final): 20 + 10 + 10 + 10 = 50 of the caller's 100 Tgas
const RECORD_GAS: Gas = Gas::from_tgas(20);
const UNLOCK_GAS: Gas = Gas::from_tgas(10);
const TITLE_GAS: Gas = Gas::from_tgas(10);
const MATCH_LOCK_MS: u64 = 5 * 60 * 60 * 1000; // 2 h open + 2 h live + 1 h buffer
// ponytail: 72 h = 24 h entry + 3 rounds x 2 h; re-lock per round if brackets get slower
const TOURNEY_LOCK_MS: u64 = 72 * 60 * 60 * 1000;
const TOURNEY_CANCEL_NS: u64 = 24 * 60 * 60 * 1_000_000_000;

/// (token id, until_ms). unlock passes both: stale unlock can't free newer lock.
type Lock = (String, u64);

#[allow(dead_code)] // feeds macro only
#[ext_contract(ext_assets)]
trait Assets {
    fn lock(&mut self, token_id: String, account_id: AccountId, until_ms: u64);
    fn unlock(&mut self, locks: Vec<(String, u64)>);
    fn record_result(&mut self, match_id: u64, tokens: [Option<String>; 2], winner: Option<u8>, kos: [u8; 2], tournament: Option<u64>);
    fn add_title(&mut self, token_id: String, title: String);
}

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
enum Key {
    Matches,
    Positions,
    History,
    Fills,
    Books,
    Tournaments,
    Games,
    Balances,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Game {
    pub referee_id: AccountId,
    pub assets_id: Option<AccountId>,
    pub referee_key: Option<PublicKey>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Status {
    Open,
    Live,
    Settled(u8),
    Refund,
}

#[near(serializers = [borsh])]
#[derive(Clone)]
pub struct Match {
    game: String,
    host: AccountId,
    guest: Option<AccountId>,
    stake: u128,
    bettable: bool,
    status: Status,
    kos: u8,
    sets: u128, // matched share pairs, collateral = sets * UNIT
    fills: u32,
    orders: u32,
    last_bps: u16,
    created_ns: u64,
    started_ns: u64,
    advances: u8, // tournament: seat that moved on
    monsters: [Option<Lock>; 2],
    tournament: Option<(u64, u8, u8)>, // (id, round, slot)
    tape_hash: Option<String>,
}

#[near(serializers = [borsh])]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum TStatus {
    Open,
    Live,
    Done,
    Cancelled,
}

#[near(serializers = [borsh])]
#[derive(Clone)]
pub struct Tournament {
    game: String,
    size: u8,
    entry_fee: u128,
    pot: u128,
    bettable: bool,
    status: TStatus,
    entrants: Vec<(AccountId, Lock)>,
    rounds: Vec<Vec<Option<u64>>>, // match ids
    champion: Option<AccountId>,
    created_ns: u64,
    claimed: Vec<bool>,
}

#[near(serializers = [borsh])]
#[derive(Clone, Default)]
pub struct Position {
    shares: [u64; 2],
    paid: [u128; 2], // void refund
    open: u128,      // resting escrow
    claimed: bool,
}

/// Bid for `side` shares at `price_bps` each.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Order {
    pub id: u32,
    pub who: AccountId,
    pub side: u8,
    pub price_bps: u16,
    pub qty: u64, // remaining
    pub filled: u64,
    pub ms: u64,
}

/// `price_bps` = what the taker paid per `side` share; the maker paid 10000 - it for the other side.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct FillView {
    pub id: u32,
    pub taker: AccountId,
    pub maker: AccountId,
    pub side: u8,
    pub price_bps: u16,
    pub qty: u64,
    pub ms: u64,
}

#[near(serializers = [json])]
pub struct OrderResult {
    pub id: Option<u32>, // resting remainder
    pub filled: u64,
    pub cost: U128,
}

#[near(serializers = [json])]
pub struct MatchView {
    pub id: u64,
    pub game: String,
    pub host: AccountId,
    pub guest: Option<AccountId>,
    pub stake: U128,
    pub bettable: bool,
    pub status: String,
    pub winner: Option<u8>,
    pub kos: u8,
    pub price_bps: u16, // last fill, side 0
    pub collateral: U128,
    pub fills: u32,
    pub created_ms: u64,
    pub started_ms: u64,
    pub monsters: [Option<String>; 2],
    pub tournament: Option<u64>,
    pub tape_hash: Option<String>,
}

#[near(serializers = [json])]
pub struct EntrantView {
    pub account: AccountId,
    pub monster: String,
}

#[near(serializers = [json])]
pub struct TournamentView {
    pub id: u64,
    pub game: String,
    pub size: u8,
    pub entry_fee: U128,
    pub pot: U128,
    pub bettable: bool,
    pub status: String,
    pub entrants: Vec<EntrantView>,
    pub rounds: Vec<Vec<Option<u64>>>,
    pub champion: Option<AccountId>,
    pub created_ms: u64,
    pub claimed: Vec<bool>,
}

#[near(serializers = [json])]
pub struct PositionView {
    pub shares: [u64; 2],
    pub paid: [U128; 2],
    pub open: U128,
    pub claimed: bool,
}

#[near(serializers = [json])]
pub struct ConfigView {
    pub owner: AccountId,
    pub fee_bps: u32,
    pub max_bet: U128,
    pub unit: U128,
    pub treasury: U128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Arena {
    owner: AccountId,
    fee_bps: u32,
    max_bet: u128, // per order escrow
    treasury: u128,
    games: IterableMap<String, Game>,
    balances: LookupMap<AccountId, u128>, // ponytail: storage paid by contract; storage deposit before mainnet
    matches: Vector<Match>,               // id = index
    positions: LookupMap<(u64, AccountId), Position>,
    history: LookupMap<u64, Vec<(u64, u16)>>, // (ms, side 0 bps) per fill
    fills: LookupMap<(u64, u32), FillView>,
    books: LookupMap<(u64, u8), Vec<Order>>, // bids per side, best first: price desc, then oldest
    tournaments: Vector<Tournament>,         // id = index
}

/// Referee attestation: ed25519 over sha256(utf8 of this). Same string in brawler-server `referee::settle_msg`.
pub fn settle_msg(game: &str, contract: &str, match_id: u64, winner: Option<u8>, kos: [u8; 2], tape_hash: &str) -> String {
    let w = winner.map_or("none".to_string(), |w| w.to_string());
    format!("{game}-settle|{contract}|{match_id}|{w}|{},{}|{tape_hash}", kos[0], kos[1])
}

fn cost(price_bps: u16, qty: u64) -> u128 {
    price_bps as u128 * TICK * qty as u128
}

#[near]
impl Arena {
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        Self {
            owner: owner_id,
            fee_bps: 10,
            max_bet: NearToken::from_near(100).as_yoctonear(),
            treasury: 0,
            games: IterableMap::new(Key::Games),
            balances: LookupMap::new(Key::Balances),
            matches: Vector::new(Key::Matches),
            positions: LookupMap::new(Key::Positions),
            history: LookupMap::new(Key::History),
            fills: LookupMap::new(Key::Fills),
            books: LookupMap::new(Key::Books),
            tournaments: Vector::new(Key::Tournaments),
        }
    }

    /* ---------- balance ---------- */

    #[payable]
    pub fn deposit(&mut self) {
        let amt = env::attached_deposit().as_yoctonear();
        require!(amt > 0, "Attach a deposit");
        self.credit(&env::predecessor_account_id(), amt);
    }

    pub fn withdraw(&mut self, amount: U128) -> Promise {
        let who = env::predecessor_account_id();
        require!(amount.0 > 0, "Bad amount");
        self.debit(&who, amount.0);
        Promise::new(who.clone())
            .transfer(NearToken::from_yoctonear(amount.0))
            .then(Self::ext(env::current_account_id()).with_static_gas(CALLBACK_GAS).on_withdraw(who, amount))
    }

    /// Transfer failed -> re-credit.
    #[private]
    pub fn on_withdraw(&mut self, account_id: AccountId, amount: U128) -> bool {
        if promise_ok() {
            return true;
        }
        self.credit(&account_id, amount.0);
        false
    }

    pub fn balance_of(&self, account_id: AccountId) -> U128 {
        U128(self.balances.get(&account_id).copied().unwrap_or(0))
    }

    /* ---------- players ---------- */

    /// Monster -> lock first, returns `on_create` result (`null` = re-credited).
    #[payable]
    pub fn create_match(&mut self, game: String, stake: U128, bettable: bool, monster_id: Option<String>) -> PromiseOrValue<Option<u64>> {
        assert_one_yocto();
        let host = env::predecessor_account_id();
        let g = self.game(&game);
        self.debit(&host, stake.0);
        let Some(mon) = monster_id else {
            return PromiseOrValue::Value(Some(self.open_match(game, host, stake.0, bettable, None)));
        };
        let until = now_ms() + MATCH_LOCK_MS;
        PromiseOrValue::Promise(
            lock(&g, &mon, &host, until)
                .then(Self::ext(env::current_account_id()).with_static_gas(ON_LOCK_GAS).on_create(game, host, stake, bettable, mon, until)),
        )
    }

    #[private]
    pub fn on_create(
        &mut self,
        game: String,
        host: AccountId,
        stake: U128,
        bettable: bool,
        monster_id: String,
        until_ms: u64,
    ) -> Option<u64> {
        if promise_ok() {
            return Some(self.open_match(game, host, stake.0, bettable, Some((monster_id, until_ms))));
        }
        self.bounce(&game, host, stake.0, None);
        None
    }

    /// Monster -> lock first, returns `on_join` result (false = re-credited).
    #[payable]
    pub fn join_match(&mut self, match_id: u64, monster_id: Option<String>) -> PromiseOrValue<bool> {
        assert_one_yocto();
        let guest = env::predecessor_account_id();
        let m = self.get_match_internal(match_id);
        require!(m.status == Status::Open, "Match not open");
        require!(guest != m.host, "Host cannot join own match");
        self.debit(&guest, m.stake);
        let Some(mon) = monster_id else {
            self.go_live(match_id, guest, None);
            return PromiseOrValue::Value(true);
        };
        let until = now_ms() + MATCH_LOCK_MS;
        PromiseOrValue::Promise(
            lock(&self.game(&m.game), &mon, &guest, until).then(Self::ext(env::current_account_id()).with_static_gas(ON_LOCK_GAS).on_join(
                match_id,
                guest,
                U128(m.stake),
                mon,
                until,
            )),
        )
    }

    /// Someone else may have joined / host cancelled while lock in flight.
    #[private]
    pub fn on_join(&mut self, match_id: u64, guest: AccountId, deposit: U128, monster_id: String, until_ms: u64) -> bool {
        let locked = promise_ok();
        let m = self.get_match_internal(match_id);
        if locked && m.status == Status::Open && deposit.0 == m.stake {
            self.go_live(match_id, guest, Some((monster_id, until_ms)));
            return true;
        }
        self.bounce(&m.game, guest, deposit.0, locked.then_some((monster_id, until_ms)));
        false
    }

    pub fn cancel_match(&mut self, match_id: u64) {
        let m = self.get_mut(match_id);
        require!(env::predecessor_account_id() == m.host, "Only host");
        require!(m.status == Status::Open, "Match not open");
        self.finish(match_id, Status::Refund);
        self.after(match_id, [0, 0]);
    }

    /* ---------- spectators ---------- */

    /// Bid for `qty` `side` shares at up to `price_bps` each. Fills vs opposite bids with prices summing >= 10000 at the
    /// maker's price (taker keeps the improvement), own orders skipped, at most MAX_FILLS; remainder rests.
    /// Debits exactly fills + resting escrow.
    #[payable]
    pub fn place_order(&mut self, match_id: u64, side: u8, price_bps: u16, qty: u64) -> OrderResult {
        assert_one_yocto();
        let who = env::predecessor_account_id();
        require!(side <= 1, "side must be 0 or 1");
        require!(price_bps >= 1 && (price_bps as u128) < BPS, "Bad price");
        require!(qty > 0, "Bad qty");
        require!(cost(price_bps, qty) <= self.max_bet, "Order above maximum");
        let m = self.tradable(match_id, &who);
        let (ms, mut fill_id, mut last) = (now_ms(), m.fills, m.last_bps);
        let mut book = self.books.get(&(match_id, 1 - side)).cloned().unwrap_or_default();
        let (mut left, mut spent, mut n, mut i) = (qty, 0u128, 0usize, 0usize);
        while left > 0 && n < MAX_FILLS && i < book.len() && book[i].price_bps + price_bps >= BPS as u16 {
            if book[i].who == who {
                i += 1;
                continue;
            }
            let o = &mut book[i];
            let q = left.min(o.qty);
            let px = BPS as u16 - o.price_bps;
            o.qty -= q;
            o.filled += q;
            let maker = o.who.clone();
            let mp = o.price_bps;
            if o.qty == 0 {
                book.remove(i);
            }
            left -= q;
            n += 1;
            spent += cost(px, q);
            let mut p = self.position(match_id, &maker);
            p.open -= cost(mp, q);
            p.paid[1 - side as usize] += cost(mp, q);
            p.shares[1 - side as usize] += q;
            self.positions.insert((match_id, maker.clone()), p);
            self.fills.insert((match_id, fill_id), FillView { id: fill_id, taker: who.clone(), maker, side, price_bps: px, qty: q, ms });
            fill_id += 1;
            last = if side == 0 { px } else { mp };
            let h = self.history.entry(match_id).or_default();
            if h.len() >= MAX_HISTORY {
                h.remove(0);
            }
            h.push((ms, last));
        }
        self.books.insert((match_id, 1 - side), book);
        let filled = qty - left;
        let mut p = self.position(match_id, &who);
        p.shares[side as usize] += filled;
        p.paid[side as usize] += spent;
        let mut id = None;
        let m = self.get_mut(match_id);
        m.sets += filled as u128;
        m.fills = fill_id;
        m.last_bps = last;
        let oid = m.orders;
        if left > 0 {
            m.orders += 1;
            let mine = self.books.entry((match_id, side)).or_default();
            require!(mine.len() < MAX_BOOK, "Book full");
            let at = mine.iter().position(|o| o.price_bps < price_bps).unwrap_or(mine.len());
            mine.insert(at, Order { id: oid, who: who.clone(), side, price_bps, qty: left, filled, ms });
            p.open += cost(price_bps, left);
            spent += cost(price_bps, left);
            id = Some(oid);
        }
        self.positions.insert((match_id, who.clone()), p);
        self.debit(&who, spent);
        OrderResult { id, filled, cost: U128(spent) }
    }

    /// Refunds the unfilled rest while the book is open (after: `claim`).
    pub fn cancel_order(&mut self, match_id: u64, order_id: u32) -> U128 {
        let who = env::predecessor_account_id();
        let m = self.get_match_internal(match_id);
        require!(book_open(&m), "Book closed");
        for side in 0..2 {
            let Some(book) = self.books.get_mut(&(match_id, side)) else {
                continue;
            };
            let Some(i) = book.iter().position(|o| o.id == order_id && o.who == who) else {
                continue;
            };
            let o = book.remove(i);
            let back = cost(o.price_bps, o.qty);
            let mut p = self.position(match_id, &who);
            p.open -= back;
            self.positions.insert((match_id, who.clone()), p);
            self.credit(&who, back);
            return U128(back);
        }
        env::panic_str("No such order")
    }

    /* ---------- referee ---------- */

    pub fn report_kos(&mut self, match_id: u64, kos: u8) {
        let game = self.get_match_internal(match_id).game;
        self.only_referee(&game);
        let m = self.get_mut(match_id);
        require!(m.status == Status::Live, "Match not live");
        if kos > m.kos {
            m.kos = kos;
        }
    }

    /// `kos[i]` = KOs by seat i (asset record; void bracket match: more KOs advances). `tape_hash` = sha256 hex of replay.
    pub fn report_result(&mut self, match_id: u64, winner: Option<u8>, kos: Option<[u8; 2]>, tape_hash: Option<String>) {
        self.only_referee(&self.get_match_internal(match_id).game);
        self.resolve(match_id, winner, kos, tape_hash);
    }

    /// Anyone posts the referee's attestation: `signature` = ed25519 by the game's `referee_key` over sha256(`settle_msg`).
    pub fn settle(&mut self, match_id: u64, winner: Option<u8>, kos: [u8; 2], tape_hash: String, signature: Base64VecU8) {
        let game = self.get_match_internal(match_id).game;
        let key = self.game(&game).referee_key.unwrap_or_else(|| env::panic_str("No referee key"));
        let msg = settle_msg(&game, env::current_account_id().as_str(), match_id, winner, kos, &tape_hash);
        let ok = match (<[u8; 64]>::try_from(signature.0), <&[u8; 32]>::try_from(&key.as_bytes()[1..])) {
            (Ok(sig), Ok(pk)) => env::ed25519_verify(&sig, env::sha256_array(msg.as_bytes()), pk),
            _ => false,
        };
        require!(ok, "Bad signature");
        self.resolve(match_id, winner, Some(kos), Some(tape_hash));
    }

    /// Guest joined, fight never started: refund guest, reopen. Market traded -> rejected (bettors priced this pairing); void via report_result.
    pub fn unjoin(&mut self, match_id: u64) {
        let m = self.get_match_internal(match_id);
        self.only_referee(&m.game);
        require!(m.status == Status::Live && m.tournament.is_none(), "Match not unjoinable");
        require!(m.fills == 0, "Market has trades");
        let guest = m.guest.clone().unwrap();
        self.credit(&guest, m.stake);
        self.unlock(&m.game, m.monsters[1].clone().into_iter().collect());
        let m = self.get_mut(match_id);
        m.guest = None;
        m.monsters[1] = None;
        m.status = Status::Open;
        m.started_ns = 0;
    }

    /// Anyone voids unsettled (or unjoined) match after 2 h.
    pub fn expire(&mut self, match_id: u64) {
        let now = env::block_timestamp();
        let m = self.get_match_internal(match_id);
        let since = match m.status {
            Status::Open => m.created_ns,
            Status::Live => m.started_ns,
            _ => env::panic_str("Match already finished"),
        };
        require!(now.saturating_sub(since) > EXPIRY_NS, "Not expired yet");
        self.finish(match_id, Status::Refund);
        self.after(match_id, [0, 0]);
    }

    /* ---------- tournaments ---------- */

    #[payable]
    pub fn create_tournament(&mut self, game: String, size: u8, entry_fee: U128, bettable: bool) -> u64 {
        self.only_owner();
        self.game(&game);
        require!(size == 4 || size == 8, "Size must be 4 or 8");
        let rounds = (0..size.trailing_zeros()).map(|r| vec![None; (size >> (r + 1)) as usize]).collect();
        let id = self.tournaments.len() as u64;
        self.tournaments.push(Tournament {
            game,
            size,
            entry_fee: entry_fee.0,
            pot: 0,
            bettable,
            status: TStatus::Open,
            entrants: vec![],
            rounds,
            champion: None,
            created_ns: env::block_timestamp(),
            claimed: vec![],
        });
        id
    }

    /// Locks monster 72 h, then `on_enter` registers (false = re-credited).
    #[payable]
    pub fn enter_tournament(&mut self, id: u64, monster_id: String) -> Promise {
        assert_one_yocto();
        let who = env::predecessor_account_id();
        let t = self.get_t(id);
        require!(t.status == TStatus::Open, "Tournament not open");
        require!(env::block_timestamp().saturating_sub(t.created_ns) <= TOURNEY_CANCEL_NS, "Entry closed");
        require!(!t.entrants.iter().any(|e| e.0 == who), "Already entered");
        // fail here, not out of gas in on_enter after lock
        require!(env::prepaid_gas() >= ENTER_GAS, "Attach 150 Tgas");
        self.debit(&who, t.entry_fee);
        let until = now_ms() + TOURNEY_LOCK_MS;
        lock(&self.game(&t.game), &monster_id, &who, until).then(
            Self::ext(env::current_account_id()).with_static_gas(ON_ENTER_GAS).on_enter(id, who, U128(t.entry_fee), monster_id, until),
        )
    }

    /// No panics past lookup: fee lands in pot or re-credited.
    #[private]
    pub fn on_enter(&mut self, id: u64, account_id: AccountId, fee: U128, monster_id: String, until_ms: u64) -> bool {
        let locked = promise_ok();
        let t = self.get_t(id);
        if !locked || t.status != TStatus::Open || t.entrants.iter().any(|e| e.0 == account_id) {
            self.bounce(&t.game, account_id, fee.0, locked.then_some((monster_id, until_ms)));
            return false;
        }
        let t = self.tournaments.get_mut(id as u32).unwrap();
        t.entrants.push((account_id, (monster_id, until_ms)));
        t.claimed.push(false);
        t.pot += fee.0;
        if t.entrants.len() == t.size as usize {
            t.status = TStatus::Live;
            let e = t.entrants.clone();
            for s in 0..e.len() / 2 {
                self.tourney_match(id, 0, s as u8, e[2 * s].clone(), e[2 * s + 1].clone());
            }
        }
        true
    }

    /// Champion: pot - fee. Cancelled: fee back. Credits balance.
    pub fn claim_tournament(&mut self, id: u64) -> U128 {
        let who = env::predecessor_account_id();
        let t = self.get_t(id);
        let i = t.entrants.iter().position(|e| e.0 == who).unwrap_or_else(|| env::panic_str("Nothing to claim"));
        let due = match t.status {
            _ if t.claimed[i] => 0,
            TStatus::Cancelled => t.entry_fee,
            TStatus::Done if t.champion.as_ref() == Some(&who) => t.pot - t.pot * self.fee_bps as u128 / BPS,
            _ => 0,
        };
        require!(due > 0, "Nothing to claim");
        self.tournaments.get_mut(id as u32).unwrap().claimed[i] = true;
        self.credit(&who, due);
        U128(due)
    }

    /// Anyone cancels a tournament unfilled after 24 h.
    pub fn cancel_tournament(&mut self, id: u64) {
        let t = self.get_t(id);
        require!(t.status == TStatus::Open, "Tournament not open");
        require!(env::block_timestamp().saturating_sub(t.created_ns) > TOURNEY_CANCEL_NS, "Not expired yet");
        self.tournaments.get_mut(id as u32).unwrap().status = TStatus::Cancelled;
        self.unlock(&t.game, t.entrants.into_iter().map(|e| e.1).collect());
    }

    /* ---------- payouts ---------- */

    /// Credits caller's market payout (winning shares - fee, or void refund) + unfilled escrow. Seats are paid at the result.
    pub fn claim(&mut self, match_id: u64) -> U128 {
        let who = env::predecessor_account_id();
        let m = self.get_match_internal(match_id);
        let key = (match_id, who.clone());
        let (due, fee) = self.positions.get(&key).map_or((0, 0), |p| self.position_due(&m, p));
        require!(due > 0, "Nothing to claim");
        self.positions.get_mut(&key).unwrap().claimed = true;
        self.treasury += fee;
        self.credit(&who, due);
        U128(due)
    }

    /* ---------- views ---------- */

    pub fn get_game(&self, game: String) -> Option<Game> {
        self.games.get(&game).cloned()
    }

    pub fn list_games(&self) -> Vec<(String, Game)> {
        self.games.iter().map(|(k, v)| (k.clone(), v.clone())).collect()
    }

    pub fn get_tournament(&self, id: u64) -> Option<TournamentView> {
        self.tournaments.get(id as u32).map(|t| tview(id, t))
    }

    /// Newest first. `from` = newest ids to skip.
    pub fn list_tournaments(&self, from: u64, limit: u64, game: Option<String>) -> Vec<TournamentView> {
        newest(self.tournaments.len(), from)
            .map(|id| (id, &self.tournaments[id as u32]))
            .filter(|(_, t)| game.as_ref().is_none_or(|g| *g == t.game))
            .take(limit.min(MAX_LIST) as usize)
            .map(|(id, t)| tview(id, t))
            .collect()
    }

    pub fn get_match(&self, match_id: u64) -> Option<MatchView> {
        self.matches.get(match_id as u32).map(|m| view(match_id, m))
    }

    pub fn get_position(&self, match_id: u64, account_id: AccountId) -> Option<PositionView> {
        self.positions.get(&(match_id, account_id)).map(|p| PositionView {
            shares: p.shares,
            paid: p.paid.map(U128),
            open: U128(p.open),
            claimed: p.claimed,
        })
    }

    /// Bids per side aggregated by price, best first: [[(price_bps, qty)]; 2]. Ask for side s = 10000 - best bid of 1 - s.
    pub fn get_book(&self, match_id: u64) -> [Vec<(u16, u64)>; 2] {
        let open = self.matches.get(match_id as u32).is_some_and(book_open);
        [0u8, 1].map(|s| {
            let mut lv: Vec<(u16, u64)> = vec![];
            for o in self.books.get(&(match_id, s)).filter(|_| open).into_iter().flatten() {
                match lv.last_mut() {
                    Some(l) if l.0 == o.price_bps => l.1 += o.qty,
                    _ => lv.push((o.price_bps, o.qty)),
                }
            }
            lv
        })
    }

    /// Caller's resting orders, empty once the book closed.
    pub fn get_orders(&self, match_id: u64, account_id: AccountId) -> Vec<Order> {
        if !self.matches.get(match_id as u32).is_some_and(book_open) {
            return vec![];
        }
        (0..2).flat_map(|s| self.books.get(&(match_id, s)).into_iter().flatten().filter(|o| o.who == account_id).cloned()).collect()
    }

    /// Newest first.
    pub fn get_fills(&self, match_id: u64, limit: u32) -> Vec<FillView> {
        let n = self.matches.get(match_id as u32).map(|m| m.fills).unwrap_or(0);
        (0..limit.min(MAX_RECENT)).map_while(|i| n.checked_sub(i + 1)).filter_map(|id| self.fills.get(&(match_id, id)).cloned()).collect()
    }

    /// (ms, side 0 bps) per fill, oldest first.
    pub fn get_prices(&self, match_id: u64) -> Vec<(u64, u16)> {
        self.history.get(&match_id).cloned().unwrap_or_default()
    }

    pub fn claimable(&self, match_id: u64, account_id: AccountId) -> U128 {
        let Some(m) = self.matches.get(match_id as u32) else {
            return U128(0);
        };
        U128(self.positions.get(&(match_id, account_id)).map_or(0, |p| self.position_due(m, p).0))
    }

    /// Newest first. `from` = newest ids to skip.
    pub fn list_matches(&self, from: u64, limit: u64, game: Option<String>) -> Vec<MatchView> {
        newest(self.matches.len(), from)
            .map(|id| (id, &self.matches[id as u32]))
            .filter(|(_, m)| game.as_ref().is_none_or(|g| *g == m.game))
            .take(limit.min(MAX_LIST) as usize)
            .map(|(id, m)| view(id, m))
            .collect()
    }

    pub fn config(&self) -> ConfigView {
        ConfigView {
            owner: self.owner.clone(),
            fee_bps: self.fee_bps,
            max_bet: U128(self.max_bet),
            unit: U128(UNIT),
            treasury: U128(self.treasury),
        }
    }

    /* ---------- owner ---------- */

    /// Upsert.
    #[payable]
    pub fn register_game(&mut self, game: String, referee_id: AccountId, assets_id: Option<AccountId>, referee_key: Option<PublicKey>) {
        self.only_owner();
        require!(!game.is_empty() && game.len() <= 32, "Bad game id");
        require!(referee_key.as_ref().is_none_or(|k| k.curve_type() == CurveType::ED25519), "Key must be ed25519");
        self.games.insert(game, Game { referee_id, assets_id, referee_key });
    }

    /// Owner (1 yocto) or the game's referee rotates the attestation key.
    #[payable]
    pub fn set_referee_key(&mut self, game: String, referee_key: Option<PublicKey>) {
        let mut g = self.game(&game);
        if env::predecessor_account_id() != g.referee_id {
            self.only_owner();
        }
        require!(referee_key.as_ref().is_none_or(|k| k.curve_type() == CurveType::ED25519), "Key must be ed25519");
        g.referee_key = referee_key;
        self.games.insert(game, g);
    }

    #[payable]
    pub fn set_limits(&mut self, max_bet: U128) {
        self.only_owner();
        require!(max_bet.0 >= UNIT, "Bad limits");
        self.max_bet = max_bet.0;
    }

    #[payable]
    pub fn withdraw_treasury(&mut self, amount: U128) -> Promise {
        self.only_owner();
        require!(amount.0 <= self.treasury, "Exceeds treasury");
        self.treasury -= amount.0;
        Promise::new(self.owner.clone()).transfer(NearToken::from_yoctonear(amount.0))
    }
}

impl Arena {
    /// 1 yocto: fn-call key can't trigger.
    fn only_owner(&self) {
        assert_one_yocto();
        require!(env::predecessor_account_id() == self.owner, "Only owner");
    }
    fn only_referee(&self, game: &str) {
        require!(env::predecessor_account_id() == self.game(game).referee_id, "Only referee");
    }
    fn game(&self, game: &str) -> Game {
        self.games.get(game).cloned().unwrap_or_else(|| env::panic_str("Unknown game"))
    }
    /// None if game dropped assets mid-match: locks then just expire.
    fn assets(&self, game: &str) -> Option<AccountId> {
        self.games.get(game).and_then(|g| g.assets_id.clone())
    }
    fn credit(&mut self, who: &AccountId, amt: u128) {
        if amt > 0 {
            *self.balances.entry(who.clone()).or_insert(0) += amt;
        }
    }
    fn debit(&mut self, who: &AccountId, amt: u128) {
        if amt == 0 {
            return;
        }
        let b = self.balances.get_mut(who).filter(|b| **b >= amt).unwrap_or_else(|| env::panic_str("Insufficient balance"));
        *b -= amt;
    }
    fn get_mut(&mut self, id: u64) -> &mut Match {
        self.matches.get_mut(id as u32).unwrap_or_else(|| env::panic_str("No such match"))
    }
    fn get_match_internal(&self, id: u64) -> Match {
        self.matches.get(id as u32).cloned().unwrap_or_else(|| env::panic_str("No such match"))
    }
    fn position(&self, id: u64, who: &AccountId) -> Position {
        self.positions.get(&(id, who.clone())).cloned().unwrap_or_default()
    }

    fn get_t(&self, id: u64) -> Tournament {
        self.tournaments.get(id as u32).cloned().unwrap_or_else(|| env::panic_str("No such tournament"))
    }

    fn unlock(&self, game: &str, locks: Vec<Lock>) {
        if let (false, Some(a)) = (locks.is_empty(), self.assets(game)) {
            ext_assets::ext(a).with_static_gas(UNLOCK_GAS).unlock(locks).detach();
        }
    }

    /// Failed lock callback: re-credit, unlock if we did lock.
    fn bounce(&mut self, game: &str, who: AccountId, amount: u128, locked: Option<Lock>) {
        self.credit(&who, amount);
        self.unlock(game, locked.into_iter().collect());
    }

    fn open_match(&mut self, game: String, host: AccountId, stake: u128, bettable: bool, monster: Option<Lock>) -> u64 {
        let id = self.matches.len() as u64;
        self.matches.push(Match {
            game,
            host,
            guest: None,
            stake,
            bettable,
            status: Status::Open,
            kos: 0,
            sets: 0,
            fills: 0,
            orders: 0,
            last_bps: 5000,
            created_ns: env::block_timestamp(),
            started_ns: 0,
            advances: 0,
            monsters: [monster, None],
            tournament: None,
            tape_hash: None,
        });
        id
    }

    fn go_live(&mut self, id: u64, guest: AccountId, monster: Option<Lock>) {
        let m = self.get_mut(id);
        m.guest = Some(guest);
        m.monsters[1] = monster;
        m.status = Status::Live;
        m.started_ns = env::block_timestamp();
    }

    /// Zero-stake Live bracket match.
    fn tourney_match(&mut self, tid: u64, round: u8, slot: u8, a: (AccountId, Lock), b: (AccountId, Lock)) {
        let t = &self.tournaments[tid as u32];
        let id = self.open_match(t.game.clone(), a.0, 0, t.bettable, Some(a.1));
        self.get_mut(id).tournament = Some((tid, round, slot));
        self.go_live(id, b.0, Some(b.1));
        self.tournaments.get_mut(tid as u32).unwrap().rounds[round as usize][slot as usize] = Some(id);
    }

    fn resolve(&mut self, match_id: u64, winner: Option<u8>, kos: Option<[u8; 2]>, tape_hash: Option<String>) {
        let m = self.get_match_internal(match_id);
        require!(m.status == Status::Live, "Match not live");
        if let Some(h) = &tape_hash {
            require!(h.len() == 64 && h.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f')), "Bad tape_hash");
        }
        let kos = kos.unwrap_or_default();
        let mm = self.get_mut(match_id);
        mm.tape_hash = tape_hash;
        mm.kos = mm.kos.max(kos[0].saturating_add(kos[1]));
        let status = match winner {
            None => Status::Refund,
            Some(w) => {
                require!(w <= 1, "winner must be 0 or 1");
                Status::Settled(w)
            }
        };
        self.finish(match_id, status);
        if let (true, Some(a)) = (m.monsters.iter().any(Option::is_some), self.assets(&m.game)) {
            ext_assets::ext(a)
                .with_static_gas(RECORD_GAS)
                .record_result(match_id, m.monsters.clone().map(|l| l.map(|l| l.0)), winner, kos, m.tournament.map(|t| t.0))
                .detach();
        }
        self.after(match_id, kos);
    }

    fn after(&mut self, id: u64, kos: [u8; 2]) {
        let m = self.get_match_internal(id);
        let Some((tid, round, slot)) = m.tournament else {
            return self.unlock(&m.game, m.monsters.into_iter().flatten().collect());
        };
        // void/expired: more reported KOs advances, tie -> seat 0 (lower entrant index)
        let w = match m.status {
            Status::Settled(w) => w as usize,
            _ => (kos[1] > kos[0]) as usize,
        };
        self.get_mut(id).advances = w as u8;
        self.unlock(&m.game, m.monsters[1 - w].clone().into_iter().collect());
        let t = self.get_t(tid);
        let (r, s) = (round as usize, slot as usize);
        if r + 1 == t.rounds.len() {
            let mon = m.monsters[w].clone().unwrap();
            self.treasury += t.pot * self.fee_bps as u128 / BPS;
            let t = self.tournaments.get_mut(tid as u32).unwrap();
            t.status = TStatus::Done;
            t.champion = Some(seat_account(&m, w));
            if let Some(a) = self.assets(&m.game) {
                ext_assets::ext(a).with_static_gas(TITLE_GAS).add_title(mon.0.clone(), format!("Tournament #{tid} Champion")).detach();
            }
            return self.unlock(&m.game, vec![mon]);
        }
        let Some(sib) = t.rounds[r][s ^ 1].map(|i| self.get_match_internal(i)) else {
            return;
        };
        if matches!(sib.status, Status::Open | Status::Live) {
            return;
        }
        let ws = sib.advances as usize;
        let me = (seat_account(&m, w), m.monsters[w].clone().unwrap());
        let them = (seat_account(&sib, ws), sib.monsters[ws].clone().unwrap());
        let (a, b) = if s % 2 == 0 { (me, them) } else { (them, me) };
        self.tourney_match(tid, round + 1, (s / 2) as u8, a, b);
    }

    fn tradable(&self, id: u64, who: &AccountId) -> Match {
        let m = self.get_match_internal(id);
        require!(m.bettable, "Match not bettable");
        require!(book_open(&m), "Book closed");
        require!(*who != m.host && Some(who) != m.guest.as_ref(), "Players cannot bet on their own match");
        m
    }

    /// End match, closes its book, credits seats: winner 2 x stake - fee, void stakes back.
    fn finish(&mut self, id: u64, status: Status) {
        let m = self.get_mut(id);
        m.status = status;
        let m = m.clone();
        match status {
            Status::Settled(w) => {
                let pot = 2 * m.stake;
                let fee = pot * self.fee_bps as u128 / BPS;
                self.treasury += fee;
                self.credit(&seat_account(&m, w as usize), pot - fee);
            }
            _ => {
                self.credit(&m.host, m.stake);
                if let Some(g) = &m.guest {
                    self.credit(g, m.stake);
                }
            }
        }
    }

    /// (payout, fee) once the book closed.
    fn position_due(&self, m: &Match, p: &Position) -> (u128, u128) {
        if p.claimed {
            return (0, 0);
        }
        match m.status {
            Status::Settled(w) => {
                let gross = p.shares[w as usize] as u128 * UNIT;
                let fee = gross * self.fee_bps as u128 / BPS;
                (gross - fee + p.open, fee)
            }
            Status::Refund => (p.paid[0] + p.paid[1] + p.open, 0),
            _ => (0, 0),
        }
    }
}

fn book_open(m: &Match) -> bool {
    matches!(m.status, Status::Open | Status::Live)
}

fn lock(g: &Game, mon: &str, who: &AccountId, until_ms: u64) -> Promise {
    let a = g.assets_id.clone().unwrap_or_else(|| env::panic_str("Game has no assets"));
    ext_assets::ext(a).with_static_gas(LOCK_GAS).lock(mon.into(), who.clone(), until_ms)
}

fn newest(len: u32, from: u64) -> impl Iterator<Item = u64> {
    (0..(len as u64).saturating_sub(from)).rev().take(MAX_SCAN)
}

/// Promise 0 not Failed. Transfers return nothing, lock's Dna unused.
fn promise_ok() -> bool {
    !matches!(env::promise_result_checked(0, 0), Err(PromiseError::Failed))
}

fn now_ms() -> u64 {
    env::block_timestamp() / 1_000_000
}

fn seat_account(m: &Match, seat: usize) -> AccountId {
    if seat == 0 { m.host.clone() } else { m.guest.clone().unwrap() }
}

fn tview(id: u64, t: &Tournament) -> TournamentView {
    let status = match t.status {
        TStatus::Open => "open",
        TStatus::Live => "live",
        TStatus::Done => "done",
        TStatus::Cancelled => "cancelled",
    };
    TournamentView {
        id,
        game: t.game.clone(),
        size: t.size,
        entry_fee: U128(t.entry_fee),
        pot: U128(t.pot),
        bettable: t.bettable,
        status: status.into(),
        entrants: t.entrants.iter().map(|(a, m)| EntrantView { account: a.clone(), monster: m.0.clone() }).collect(),
        rounds: t.rounds.clone(),
        champion: t.champion.clone(),
        created_ms: t.created_ns / 1_000_000,
        claimed: t.claimed.clone(),
    }
}

fn view(id: u64, m: &Match) -> MatchView {
    let (status, winner) = match m.status {
        Status::Open => ("open", None),
        Status::Live => ("live", None),
        Status::Settled(w) => ("settled", Some(w)),
        Status::Refund => ("refund", None),
    };
    MatchView {
        id,
        game: m.game.clone(),
        host: m.host.clone(),
        guest: m.guest.clone(),
        stake: U128(m.stake),
        bettable: m.bettable,
        status: status.into(),
        winner,
        kos: m.kos,
        price_bps: m.last_bps,
        collateral: U128(m.sets * UNIT),
        fills: m.fills,
        created_ms: m.created_ns / 1_000_000,
        started_ms: m.started_ns / 1_000_000,
        monsters: m.monsters.clone().map(|l| l.map(|l| l.0)),
        tournament: m.tournament.map(|t| t.0),
        tape_hash: m.tape_hash.clone(),
    }
}

#[cfg(test)]
mod tests;
