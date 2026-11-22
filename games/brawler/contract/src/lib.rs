//! The arena contract (`arena`) locks monsters into matches and writes results (record, history,
//! season wins, titles). A busy monster (locked or rented out) cannot move.
//!
//! Money: buy/rent pay out with push transfers; a failed payout is credited to the payee's `owed`
//! balance, which they pull with `withdraw_owed`. Minting (hatch/breed) is paid by the caller: storage is
//! measured and any excess deposit refunded. Other storage (history, titles, rentals) is paid by
//! the contract balance.

mod genes;
mod skills;
pub use genes::Dna;
pub use skills::*;

use near_contract_standards::non_fungible_token::core::NonFungibleTokenCore;
use near_contract_standards::non_fungible_token::events::NftMint;
use near_contract_standards::non_fungible_token::metadata::{
    NFT_METADATA_SPEC, NFTContractMetadata, NonFungibleTokenMetadataProvider, TokenMetadata,
};
use near_contract_standards::non_fungible_token::{
    NonFungibleToken, NonFungibleTokenEnumeration, NonFungibleTokenResolver, Token, TokenId,
};
use near_sdk::json_types::U128;
use near_sdk::store::{IterableSet, LookupMap, LookupSet, Vector};
use near_sdk::{
    AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseError, PromiseOrValue, assert_one_yocto,
    env, near, require, serde_json,
};
use std::collections::HashMap;

const BPS: u128 = 10_000;
const HOUR_MS: u64 = 3_600_000;
const DAY_MS: u64 = 86_400_000;
const MAX_HISTORY: usize = 50;
const MAX_PAGE: u32 = 50;
const MAX_DAYS: u32 = 365;
const MAX_TITLE: usize = 64;
const CALLBACK_GAS: Gas = Gas::from_tgas(5);
const PLACES: [&str; 3] = ["Champion", "Runner-up", "Third"];
const LEADERBOARD_SCAN: usize = 200;

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
enum Key {
    Tokens,
    Enumeration,
    Monsters,
    History,
    Starters,
    Listings,
    RentOffers,
    RentedBy,
    SeasonWins,
    SeasonTokens(u32),
    Owed,
    Creators,
    Collections,
    Skills,
    Balances,
    SkillListings,
    Presales,
    PresaleAllow,
    PresaleBought,
    Prices,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Default, Debug, PartialEq)]
pub struct Record {
    pub w: u32,
    pub l: u32,
    pub ko: u32,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Rental {
    pub renter: AccountId,
    pub until_ms: u64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct RentOffer {
    pub price_per_day: U128,
    pub max_days: u32,
}

#[near(serializers = [borsh])]
#[derive(Clone)]
pub struct Monster {
    name: String,
    r#gen: u32,
    parents: Option<[TokenId; 2]>,
    breeder: AccountId,
    born_ms: u64,
    dna: Dna,
    record: Record,
    titles: Vec<String>,
    price: Option<u128>,
    rent_offer: Option<RentOffer>,
    rental: Option<Rental>, // may be expired; check `rented`
    locked_until_ms: u64,
    cooldown_until_ms: u64,
    skills: Vec<u32>, // equipped skill ids, 1 unit each escrowed; travels with the monster
}

impl Monster {
    fn rented(&self, now: u64) -> Option<&AccountId> {
        self.rental.as_ref().filter(|r| r.until_ms > now).map(|r| &r.renter)
    }
    fn busy(&self, now: u64) -> bool {
        self.locked_until_ms > now || self.rented(now).is_some()
    }
}

#[near(serializers = [json])]
pub struct MonsterView {
    pub token_id: String,
    pub owner_id: AccountId,
    pub name: String,
    pub r#gen: u32,
    pub parents: Option<[String; 2]>,
    pub breeder: AccountId,
    pub born_ms: u64,
    pub dna: Dna,
    pub record: Record,
    pub titles: Vec<String>,
    pub price: Option<U128>,
    pub rent_offer: Option<RentOffer>,
    pub rental: Option<Rental>,
    pub locked_until_ms: u64,
    pub cooldown_until_ms: u64,
    pub skills: Vec<SkillRef>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct HistoryEntry {
    pub match_id: u64,
    pub vs: Option<String>,
    pub won: Option<bool>,
    pub kos: u8,
    pub ms: u64,
    pub tournament: Option<u64>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct SeasonView {
    pub id: u32,
    pub name: String,
    pub ends_ms: u64,
    pub active: bool,
}

#[near(serializers = [json])]
pub struct ConfigView {
    pub owner: AccountId,
    pub arena: AccountId,
    pub treasury: U128,
    pub breed_fee: U128,
    pub market_fee_bps: u32,
    pub royalty_bps: u32,
    pub rent_fee_bps: u32,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Monsters {
    owner: AccountId,
    arena: AccountId,
    treasury: u128,
    breed_fee: u128,
    market_fee_bps: u32,
    royalty_bps: u32,
    rent_fee_bps: u32,
    next_id: u64,
    tokens: NonFungibleToken,
    monsters: LookupMap<TokenId, Monster>,
    history: LookupMap<TokenId, Vec<HistoryEntry>>, // oldest first, capped
    starters: LookupSet<AccountId>,
    listings: IterableSet<TokenId>,
    rent_offers: IterableSet<TokenId>,
    rented_by: LookupMap<AccountId, Vec<TokenId>>, // pruned on each new rental
    season: Option<SeasonView>,                    // current or last season
    season_tokens: Vector<TokenId>,                // tokens with ≥1 win this season
    season_wins: LookupMap<(u32, TokenId), u32>,
    season_top: Vec<(TokenId, u32)>, // running top 3 of the current/last season
    owed: LookupMap<AccountId, u128>, // failed payouts + creator proceeds, pulled with `withdraw_owed`
    creators: LookupSet<AccountId>,
    collections: Vector<Collection>,
    skills: Vector<SkillType>,
    balances: LookupMap<(AccountId, u32), u32>, // free units
    skill_listings: LookupMap<u32, Vec<SkillListing>>, // ponytail: whole vec rewritten per change; split per seller if a skill gets 1000s of listings
    presales: Vector<Presale>,
    presale_allow: LookupSet<(u32, AccountId)>,
    presale_bought: LookupMap<(u32, AccountId), u32>,
    prices: LookupMap<String, Vec<(u64, U128)>>,
}

fn now_ms() -> u64 {
    env::block_timestamp_ms()
}

fn seed() -> u32 {
    let s = env::random_seed_array();
    u32::from_le_bytes([s[0], s[1], s[2], s[3]])
}

#[near]
impl Monsters {
    #[init]
    pub fn new(owner_id: AccountId, arena_id: AccountId) -> Self {
        Self {
            tokens: NonFungibleToken::new(Key::Tokens, owner_id.clone(), None::<Key>, Some(Key::Enumeration), None::<Key>),
            owner: owner_id,
            arena: arena_id,
            treasury: 0,
            breed_fee: NearToken::from_millinear(100).as_yoctonear(),
            market_fee_bps: 250,
            royalty_bps: 500,
            rent_fee_bps: 250,
            next_id: 0,
            monsters: LookupMap::new(Key::Monsters),
            history: LookupMap::new(Key::History),
            starters: LookupSet::new(Key::Starters),
            listings: IterableSet::new(Key::Listings),
            rent_offers: IterableSet::new(Key::RentOffers),
            rented_by: LookupMap::new(Key::RentedBy),
            season: None,
            season_tokens: Vector::new(Key::SeasonTokens(0)),
            season_wins: LookupMap::new(Key::SeasonWins),
            season_top: vec![],
            owed: LookupMap::new(Key::Owed),
            creators: LookupSet::new(Key::Creators),
            collections: Vector::new(Key::Collections),
            skills: Vector::new(Key::Skills),
            balances: LookupMap::new(Key::Balances),
            skill_listings: LookupMap::new(Key::SkillListings),
            presales: Vector::new(Key::Presales),
            presale_allow: LookupSet::new(Key::PresaleAllow),
            presale_bought: LookupMap::new(Key::PresaleBought),
            prices: LookupMap::new(Key::Prices),
        }
    }

    /* ---------- minting ---------- */

    /// 3 random gen-0 monsters + 3 random Common stat skill units, once per account. Deposit covers storage; excess refunded.
    #[payable]
    pub fn hatch_starters(&mut self) -> Vec<MonsterView> {
        let who = env::predecessor_account_id();
        require!(!self.starters.contains(&who), "Starters already claimed");
        let before = env::storage_usage();
        self.starters.insert(who.clone());
        let base = seed();
        let ids: Vec<TokenId> =
            (0..3).map(|i| base.wrapping_add(i)).map(|s| self.mint(&who, s, genes::random_dna(s), 0, None)).collect();
        self.starter_skills(&who, base);
        self.charge(before, 0);
        ids.iter().map(|id| self.view(id)).collect()
    }

    /// Child of two of the caller's free monsters. Deposit ≥ breed_fee + storage; excess refunded.
    #[payable]
    pub fn breed(&mut self, a: String, b: String) -> MonsterView {
        let who = env::predecessor_account_id();
        let now = now_ms();
        require!(a != b, "Pick two different monsters");
        let (ma, mb) = (self.owned_free(&a, &who, now), self.owned_free(&b, &who, now));
        require!(ma.cooldown_until_ms <= now && mb.cooldown_until_ms <= now, "Monster is on breeding cooldown");
        let before = env::storage_usage();
        let s = seed();
        let r#gen = ma.r#gen.max(mb.r#gen) + 1;
        let id = self.mint(&who, s, genes::breed(&ma.dna, &mb.dna, s), r#gen, Some([a.clone(), b.clone()]));
        for t in [&a, &b] {
            self.m_mut(t).cooldown_until_ms = now + HOUR_MS;
        }
        self.treasury += self.breed_fee;
        self.charge(before, self.breed_fee);
        self.view(&id)
    }

    /* ---------- market ---------- */

    /// 1 yocto: a function-call key must not be able to list.
    #[payable]
    pub fn list(&mut self, token_id: String, price: U128) {
        assert_one_yocto();
        self.owned_free(&token_id, &env::predecessor_account_id(), now_ms());
        require!(price.0 > 0, "Price must be > 0");
        self.m_mut(&token_id).price = Some(price.0);
        self.listings.insert(token_id);
    }

    pub fn delist(&mut self, token_id: String) {
        self.only_token_owner(&token_id);
        self.m_mut(&token_id).price = None;
        self.listings.remove(&token_id);
    }

    #[payable]
    pub fn buy(&mut self, token_id: String) {
        let buyer = env::predecessor_account_id();
        let m = self.get(&token_id);
        let seller = self.owner_of(&token_id);
        let price = m.price.unwrap_or_else(|| env::panic_str("Not for sale"));
        require!(env::attached_deposit().as_yoctonear() == price, "Deposit must equal price");
        require!(!m.busy(now_ms()), "Monster is busy");
        self.tokens.internal_transfer(&seller, &buyer, &token_id, None, None); // emits nft_transfer
        self.clear_market(&token_id);

        let fee = price * self.market_fee_bps as u128 / BPS;
        let royalty =
            if m.breeder != seller && m.r#gen > 0 { price * self.royalty_bps as u128 / BPS } else { 0 };
        self.treasury += fee;
        self.push_price("monsters".into(), price);
        skills::event("brawler", "sale", serde_json::json!({"key": "monsters", "token_id": token_id, "qty": 1, "price": U128(price), "seller": seller, "buyer": buyer}));
        self.pay(seller, price - fee - royalty);
        self.pay(m.breeder, royalty);
    }

    /// 1 yocto: a function-call key must not be able to list.
    #[payable]
    pub fn offer_rent(&mut self, token_id: String, price_per_day: U128, max_days: u32) {
        assert_one_yocto();
        self.only_token_owner(&token_id);
        require!(price_per_day.0 > 0, "Price must be > 0");
        require!((1..=MAX_DAYS).contains(&max_days), "max_days must be 1..=365");
        self.m_mut(&token_id).rent_offer = Some(RentOffer { price_per_day, max_days });
        self.rent_offers.insert(token_id);
    }

    pub fn cancel_rent_offer(&mut self, token_id: String) {
        self.only_token_owner(&token_id);
        self.m_mut(&token_id).rent_offer = None;
        self.rent_offers.remove(&token_id);
    }

    /// Rent for `days`; the renter may only fight with it. Offer stays for the next renter.
    #[payable]
    pub fn rent(&mut self, token_id: String, days: u32) {
        let renter = env::predecessor_account_id();
        let now = now_ms();
        let m = self.get(&token_id);
        let owner = self.owner_of(&token_id);
        let o = m.rent_offer.clone().unwrap_or_else(|| env::panic_str("Not for rent"));
        require!(renter != owner, "Already yours");
        require!(days >= 1 && days <= o.max_days, "Bad rental length");
        require!(!m.busy(now), "Monster is busy");
        require!(m.price.is_none(), "Monster is listed for sale");
        let amount = o.price_per_day.0 * days as u128;
        require!(env::attached_deposit().as_yoctonear() == amount, "Deposit must equal price_per_day * days");

        self.m_mut(&token_id).rental = Some(Rental { renter: renter.clone(), until_ms: now + days as u64 * DAY_MS });
        let list = self.rented_by.entry(renter.clone()).or_default();
        list.retain(|t| self.monsters.get(t).and_then(|m| m.rented(now)) == Some(&renter));
        list.push(token_id);
        let fee = amount * self.rent_fee_bps as u128 / BPS;
        self.treasury += fee;
        self.pay(owner, amount - fee);
    }

    /// Payout result: a failed transfer is credited to the payee's `owed` instead of vanishing.
    /// (A failed treasury withdrawal lands in the owner's `owed`.)
    #[private]
    pub fn on_pay(&mut self, to: AccountId, amount: U128) -> bool {
        // Transfers return no data, so anything but Failed is success.
        if !matches!(env::promise_result_checked(0, 0), Err(PromiseError::Failed)) {
            return true;
        }
        *self.owed.entry(to).or_default() += amount.0;
        false
    }

    /// Pull everything owed to the caller (failed payouts). Restored if the transfer fails.
    pub fn withdraw_owed(&mut self) -> U128 {
        let who = env::predecessor_account_id();
        let amount = self.owed.remove(&who).unwrap_or_else(|| env::panic_str("Nothing owed"));
        self.pay(who, amount);
        U128(amount)
    }

    /* ---------- arena ---------- */

    /// Lock for a match. `account_id` must be the owner (not rented out) or the active renter.
    pub fn lock(&mut self, token_id: String, account_id: AccountId, until_ms: u64) -> Dna {
        self.only_arena();
        let now = now_ms();
        let m = self.get(&token_id);
        match m.rented(now) {
            Some(r) => {
                require!(*r == account_id, "Monster is rented out");
                require!(until_ms <= m.rental.as_ref().unwrap().until_ms, "Rental ends before the match");
            }
            None => require!(self.owner_of(&token_id) == account_id, "Not your monster"),
        }
        require!(m.locked_until_ms <= now, "Monster is busy");
        require!(m.price.is_none(), "Monster is listed for sale");
        require!(until_ms > now, "Lock must end in the future");
        self.m_mut(&token_id).locked_until_ms = until_ms;
        m.dna
    }

    /// (token, until_ms passed to `lock`). Clears only that exact lock; a newer lock (another match) is kept.
    pub fn unlock(&mut self, locks: Vec<(String, u64)>) {
        self.only_arena();
        for (id, until_ms) in locks {
            if let Some(m) = self.monsters.get_mut(&id).filter(|m| m.locked_until_ms == until_ms) {
                m.locked_until_ms = 0;
            }
        }
    }

    /// Record, history and (tournament only, so free matches can't farm them) season wins for both
    /// seats (unknown tokens ignored). Does not unlock.
    pub fn record_result(
        &mut self,
        match_id: u64,
        tokens: [Option<String>; 2],
        winner: Option<u8>,
        kos: [u8; 2],
        tournament: Option<u64>,
    ) {
        self.only_arena();
        require!(winner.is_none_or(|w| w <= 1), "winner must be 0 or 1");
        let now = now_ms();
        let season =
            self.season.as_ref().filter(|s| tournament.is_some() && s.active && now < s.ends_ms).map(|s| s.id);
        for i in 0..2 {
            let Some(id) = &tokens[i] else { continue };
            let Some(m) = self.monsters.get_mut(id) else { continue };
            let won = winner.map(|w| w as usize == i);
            match won {
                Some(true) => m.record.w += 1,
                Some(false) => m.record.l += 1,
                None => {}
            }
            m.record.ko += kos[i] as u32;
            let h = self.history.entry(id.clone()).or_default();
            if h.len() >= MAX_HISTORY {
                h.remove(0);
            }
            h.push(HistoryEntry { match_id, vs: tokens[1 - i].clone(), won, kos: kos[i], ms: now, tournament });
            if let (Some(s), Some(true)) = (season, won) {
                let key = (s, id.clone());
                let w = self.season_wins.get(&key).copied().unwrap_or(0);
                if w == 0 {
                    self.season_tokens.push(id.clone());
                }
                self.season_wins.insert(key, w + 1);
                // running top 3; stable sort keeps whoever reached the count first ahead on ties
                self.season_top.retain(|(t, _)| t != id);
                self.season_top.push((id.clone(), w + 1));
                self.season_top.sort_by_key(|r| std::cmp::Reverse(r.1));
                self.season_top.truncate(3);
            }
        }
    }

    pub fn add_title(&mut self, token_id: String, title: String) {
        self.only_arena();
        require!(title.len() <= MAX_TITLE, "Title too long");
        self.m_mut(&token_id).titles.push(title);
    }

    /* ---------- seasons ---------- */

    #[payable]
    pub fn start_season(&mut self, name: String, ends_ms: u64) {
        self.only_owner();
        require!(!self.season.as_ref().is_some_and(|s| s.active), "A season is already active");
        require!(!name.is_empty() && name.len() <= 40, "Bad season name");
        require!(ends_ms > now_ms(), "Season must end in the future");
        let id = self.season.as_ref().map_or(1, |s| s.id + 1);
        // ponytail: old season's token list stays in storage (contract-paid); clear it if storage matters
        self.season_tokens = Vector::new(Key::SeasonTokens(id));
        self.season_top.clear();
        self.season = Some(SeasonView { id, name, ends_ms, active: true });
    }

    /// Owner ends the season (any time); top 3 by season wins get titles.
    #[payable]
    pub fn end_season(&mut self) {
        self.only_owner();
        let s = self.season.clone().filter(|s| s.active).unwrap_or_else(|| env::panic_str("No active season"));
        for (i, (id, _)) in self.season_top.clone().into_iter().enumerate() {
            self.m_mut(&id).titles.push(format!("{} {}", s.name, PLACES[i]));
        }
        self.season.as_mut().unwrap().active = false;
    }

    pub fn get_season(&self) -> Option<SeasonView> {
        self.season.clone()
    }

    /// (token, wins) for the current/last season, most wins first. Top 3 are exact (ties: first to
    /// reach the count first); the rest come from the season's first 200 winning tokens.
    /// ponytail: bounded scan below the top 3; keep a sorted top-N if the full board matters.
    pub fn get_leaderboard(&self, limit: u32) -> Vec<(String, u32)> {
        let Some(s) = &self.season else { return vec![] };
        let mut rows = self.season_top.clone();
        for t in self.season_tokens.iter().take(LEADERBOARD_SCAN) {
            if !rows.iter().any(|(r, _)| r == t) {
                rows.push((t.clone(), self.season_wins.get(&(s.id, t.clone())).copied().unwrap_or(0)));
            }
        }
        rows.sort_by_key(|r| std::cmp::Reverse(r.1));
        rows.truncate(limit.min(100) as usize);
        rows
    }

    /* ---------- views ---------- */

    pub fn get_monster(&self, token_id: String) -> Option<MonsterView> {
        self.monsters.contains_key(&token_id).then(|| self.view(&token_id))
    }

    pub fn monsters_of(&self, account_id: AccountId, from: u32, limit: u32) -> Vec<MonsterView> {
        let Some(set) = self.tokens.tokens_per_owner.as_ref().unwrap().get(&account_id) else { return vec![] };
        set.iter().skip(from as usize).take(limit.min(MAX_PAGE) as usize).map(|id| self.view(&id)).collect()
    }

    pub fn rented_by(&self, account_id: AccountId) -> Vec<MonsterView> {
        let now = now_ms();
        let ids = self.rented_by.get(&account_id).cloned().unwrap_or_default();
        ids.iter().filter(|t| self.get(t).rented(now) == Some(&account_id)).map(|t| self.view(t)).collect()
    }

    /// Newest first.
    pub fn get_history(&self, token_id: String) -> Vec<HistoryEntry> {
        self.history.get(&token_id).map(|h| h.iter().rev().cloned().collect()).unwrap_or_default()
    }

    pub fn listings(&self, from: u32, limit: u32) -> Vec<MonsterView> {
        self.listings.iter().skip(from as usize).take(limit.min(MAX_PAGE) as usize).map(|id| self.view(id)).collect()
    }

    pub fn rent_offers(&self, from: u32, limit: u32) -> Vec<MonsterView> {
        self.rent_offers.iter().skip(from as usize).take(limit.min(MAX_PAGE) as usize).map(|id| self.view(id)).collect()
    }

    pub fn owed_of(&self, account_id: AccountId) -> U128 {
        U128(self.owed.get(&account_id).copied().unwrap_or(0))
    }

    pub fn starters_claimed(&self, account_id: AccountId) -> bool {
        self.starters.contains(&account_id)
    }

    pub fn config(&self) -> ConfigView {
        ConfigView {
            owner: self.owner.clone(),
            arena: self.arena.clone(),
            treasury: U128(self.treasury),
            breed_fee: U128(self.breed_fee),
            market_fee_bps: self.market_fee_bps,
            royalty_bps: self.royalty_bps,
            rent_fee_bps: self.rent_fee_bps,
        }
    }

    /* ---------- owner ---------- */

    #[payable]
    pub fn set_arena(&mut self, arena_id: AccountId) {
        self.only_owner();
        self.arena = arena_id;
    }

    #[payable]
    pub fn set_fees(&mut self, breed_fee: U128, market_fee_bps: u32, royalty_bps: u32, rent_fee_bps: u32) {
        self.only_owner();
        require!(market_fee_bps + royalty_bps <= 5_000 && rent_fee_bps <= 5_000, "Fees too high");
        self.breed_fee = breed_fee.0;
        self.market_fee_bps = market_fee_bps;
        self.royalty_bps = royalty_bps;
        self.rent_fee_bps = rent_fee_bps;
    }

    #[payable]
    pub fn withdraw_treasury(&mut self, amount: U128) {
        self.only_owner();
        require!(amount.0 <= self.treasury, "Exceeds treasury");
        self.treasury -= amount.0;
        self.pay(self.owner.clone(), amount.0);
    }
}

/* ---------- NEP-171 / 177 / 181 ---------- */

#[near]
impl NonFungibleTokenCore for Monsters {
    #[payable]
    fn nft_transfer(&mut self, receiver_id: AccountId, token_id: TokenId, approval_id: Option<u64>, memo: Option<String>) {
        self.before_transfer(&token_id);
        self.tokens.nft_transfer(receiver_id, token_id, approval_id, memo)
    }

    #[payable]
    fn nft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<bool> {
        self.before_transfer(&token_id);
        self.tokens.nft_transfer_call(receiver_id, token_id, approval_id, memo, msg)
    }

    fn nft_token(&self, token_id: TokenId) -> Option<Token> {
        self.tokens.nft_token(token_id).map(|t| self.with_meta(t))
    }
}

#[near]
impl NonFungibleTokenResolver for Monsters {
    #[private]
    fn nft_resolve_transfer(
        &mut self,
        previous_owner_id: AccountId,
        receiver_id: AccountId,
        token_id: TokenId,
        approved_account_ids: Option<HashMap<AccountId, u64>>,
    ) -> bool {
        let kept = self.tokens.nft_resolve_transfer(previous_owner_id, receiver_id, token_id.clone(), approved_account_ids);
        if !kept {
            // receiver may have listed / rented it out before it bounced back.
            // ponytail: rent paid meanwhile went to the receiver; the renter loses the rest of it.
            // A lock taken by the receiver meanwhile stays until the arena unlocks it.
            self.clear_market(&token_id);
            self.m_mut(&token_id).rental = None;
        }
        kept
    }
}

#[near]
impl NonFungibleTokenEnumeration for Monsters {
    fn nft_total_supply(&self) -> U128 {
        self.tokens.nft_total_supply()
    }
    fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        self.tokens.nft_tokens(from_index, limit).into_iter().map(|t| self.with_meta(t)).collect()
    }
    fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 {
        self.tokens.nft_supply_for_owner(account_id)
    }
    fn nft_tokens_for_owner(&self, account_id: AccountId, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        self.tokens.nft_tokens_for_owner(account_id, from_index, limit).into_iter().map(|t| self.with_meta(t)).collect()
    }
}

#[near]
impl NonFungibleTokenMetadataProvider for Monsters {
    fn nft_metadata(&self) -> NFTContractMetadata {
        NFTContractMetadata {
            spec: NFT_METADATA_SPEC.into(),
            name: "Brawler Arena Monsters".into(),
            symbol: "BRAWL".into(),
            icon: None,
            base_uri: None,
            reference: None,
            reference_hash: None,
        }
    }
}

impl Monsters {
    /// Owner actions need 1 yoctoNEAR so a function-call key can't trigger them.
    fn only_owner(&self) {
        assert_one_yocto();
        require!(env::predecessor_account_id() == self.owner, "Only owner");
    }
    fn only_arena(&self) {
        require!(env::predecessor_account_id() == self.arena, "Only arena");
    }
    fn only_token_owner(&self, id: &TokenId) {
        require!(self.owner_of(id) == env::predecessor_account_id(), "Not your monster");
    }
    fn owner_of(&self, id: &TokenId) -> AccountId {
        self.tokens.owner_by_id.get(id).unwrap_or_else(|| env::panic_str("No such monster"))
    }
    fn get(&self, id: &TokenId) -> Monster {
        self.monsters.get(id).cloned().unwrap_or_else(|| env::panic_str("No such monster"))
    }
    fn m_mut(&mut self, id: &TokenId) -> &mut Monster {
        self.monsters.get_mut(id).unwrap_or_else(|| env::panic_str("No such monster"))
    }
    fn owned_free(&self, id: &TokenId, who: &AccountId, now: u64) -> Monster {
        require!(self.owner_of(id) == *who, "Not your monster");
        let m = self.get(id);
        require!(!m.busy(now), "Monster is busy");
        m
    }
    fn mint(&mut self, owner: &AccountId, seed: u32, dna: Dna, r#gen: u32, parents: Option<[TokenId; 2]>) -> TokenId {
        let id = self.next_id.to_string();
        self.next_id += 1;
        self.tokens.internal_mint_with_refund(id.clone(), owner.clone(), None, None);
        self.monsters.insert(
            id.clone(),
            Monster {
                name: genes::name_for(seed),
                r#gen,
                parents,
                breeder: owner.clone(),
                born_ms: now_ms(),
                dna,
                record: Record::default(),
                titles: vec![],
                price: None,
                rent_offer: None,
                rental: None,
                locked_until_ms: 0,
                cooldown_until_ms: 0,
                skills: vec![],
            },
        );
        NftMint { owner_id: owner, token_ids: &[&id], memo: None }.emit();
        id
    }

    /// Caller pays `fee` (already booked by the caller) + storage used since `before`; excess refunded.
    fn charge(&mut self, before: u64, fee: u128) {
        self.monsters.flush(); // store:: maps write lazily; flush so storage_usage sees it
        self.flush_skills();
        let cost = env::storage_byte_cost().as_yoctonear() * (env::storage_usage().saturating_sub(before)) as u128;
        let need = fee + cost;
        let dep = env::attached_deposit().as_yoctonear();
        require!(dep >= need, format!("Attach at least {need} yoctoNEAR (fee + storage)"));
        if dep > need {
            Promise::new(env::predecessor_account_id()).transfer(NearToken::from_yoctonear(dep - need)).detach();
        }
    }

    /// Push payout; failure is credited to `to`'s `owed` by `on_pay`.
    fn pay(&self, to: AccountId, amount: u128) {
        if amount == 0 {
            return;
        }
        Promise::new(to.clone())
            .transfer(NearToken::from_yoctonear(amount))
            .then(Self::ext(env::current_account_id()).with_static_gas(CALLBACK_GAS).on_pay(to, U128(amount)))
            .detach();
    }

    fn before_transfer(&mut self, id: &TokenId) {
        require!(!self.get(id).busy(now_ms()), "Monster is busy");
        self.clear_market(id);
    }

    fn clear_market(&mut self, id: &TokenId) {
        let m = self.m_mut(id);
        m.price = None;
        m.rent_offer = None;
        self.listings.remove(id);
        self.rent_offers.remove(id);
    }

    fn view(&self, id: &TokenId) -> MonsterView {
        let m = self.get(id);
        let now = now_ms();
        MonsterView {
            token_id: id.clone(),
            owner_id: self.owner_of(id),
            rental: m.rented(now).is_some().then(|| m.rental.clone()).flatten(),
            name: m.name,
            r#gen: m.r#gen,
            parents: m.parents,
            breeder: m.breeder,
            born_ms: m.born_ms,
            dna: m.dna,
            record: m.record,
            titles: m.titles,
            price: m.price.map(U128),
            rent_offer: m.rent_offer,
            locked_until_ms: m.locked_until_ms,
            cooldown_until_ms: m.cooldown_until_ms,
            skills: self.skill_refs(&m.skills),
        }
    }

    /// NEP-177 token metadata built from game data (nothing extra stored).
    fn with_meta(&self, mut t: Token) -> Token {
        if let Some(m) = self.monsters.get(&t.token_id) {
            t.metadata = Some(TokenMetadata {
                title: Some(m.name.clone()),
                description: Some(format!("Gen {} brawler", m.r#gen)),
                extra: serde_json::to_string(&m.dna).ok(),
                ..Default::default()
            });
        }
        t
    }
}

#[cfg(test)]
mod tests;
