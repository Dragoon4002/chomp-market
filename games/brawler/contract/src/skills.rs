//! Skill NFTs: NEP-245 multi-token editions ("skill:<id>"), creator collections, presales, an escrow
//! market and per-monster loadouts. Balances are free units only; listed and equipped units are escrowed.

use crate::*;
use near_sdk::serde_json::{Value, json};

const SLOTS: usize = 3;
const MAX_PER_STAT: u8 = 2;
const MAX_STAT_TOTAL: u8 = 3;
const MAX_EFFECTS: usize = 2;
const PRICE_RING: usize = 64;
const MAX_ROYALTY_BPS: u16 = 1_000;

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
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

impl SkillKind {
    fn is_stat(self) -> bool {
        (self as u8) < 4
    }
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Rarity {
    Common,
    Rare,
    Epic,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct SkillType {
    pub id: u32,
    pub collection: u32,
    pub name: String,
    pub kind: SkillKind,
    pub mag: u8,
    pub rarity: Rarity,
    pub max_supply: Option<u32>,
    pub minted: u32,
    pub creator: AccountId,
    pub royalty_bps: u16,
    pub media: String,
}

#[near(serializers = [json])]
pub struct SkillTypeView {
    #[serde(flatten)]
    pub skill: SkillType,
    pub floor: Option<U128>,
    pub last_price: Option<U128>,
    pub listed_qty: u32,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Collection {
    pub id: u32,
    pub name: String,
    pub description: String,
    pub media: String,
    pub creator: AccountId,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct SkillListing {
    pub seller: AccountId,
    pub skill: u32,
    pub qty: u32,
    pub price_each: U128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Presale {
    pub id: u32,
    pub skill: u32,
    pub price: U128,
    pub start_ms: u64,
    pub end_ms: Option<u64>,
    pub cap_total: Option<u32>,
    pub per_wallet: Option<u32>,
    pub allowlist: bool,
    pub sold: u32,
    pub ended: bool,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct SkillRef {
    pub id: u32,
    pub kind: SkillKind,
    pub mag: u8,
}

#[near(serializers = [json])]
pub struct MtToken {
    pub token_id: String,
    pub owner_id: Option<AccountId>,
}

pub(crate) fn event(standard: &str, event: &str, data: Value) {
    let e = json!({"standard": standard, "version": "1.0.0", "event": event, "data": [data]});
    env::log_str(&format!("EVENT_JSON:{e}"));
}

fn brawl(name: &str, data: Value) {
    event("brawler", name, data);
}

pub(crate) fn skey(id: u32) -> String {
    format!("skill:{id}")
}

fn sid(token_id: &str) -> Option<u32> {
    token_id.strip_prefix("skill:")?.parse().ok()
}

fn text(s: &str, max: usize, what: &str) {
    require!(s.len() <= max, format!("{what} too long"));
}

fn page<T>(it: impl Iterator<Item = T>, from: u32, limit: u32) -> Vec<T> {
    it.skip(from as usize).take(limit.min(MAX_PAGE) as usize).collect()
}

#[near]
impl Monsters {
    /* ---------- creators ---------- */

    #[payable]
    pub fn add_creator(&mut self, account_id: AccountId) {
        self.only_owner();
        self.creators.insert(account_id);
    }

    #[payable]
    pub fn remove_creator(&mut self, account_id: AccountId) {
        self.only_owner();
        self.creators.remove(&account_id);
    }

    /// Deposit covers storage; excess refunded.
    #[payable]
    pub fn create_collection(&mut self, name: String, description: String, media: String) -> u32 {
        let creator = self.only_creator();
        require!(!name.is_empty(), "Name required");
        text(&name, 40, "Name");
        text(&description, 280, "Description");
        text(&media, 256, "Media");
        let before = env::storage_usage();
        let c = Collection { id: self.collections.len(), name, description, media, creator };
        brawl("collection_create", json!(c));
        self.collections.push(c);
        self.charge(before, 0);
        self.collections.len() - 1
    }

    /// Stat kinds: mag 1..=2. Effect kinds: mag 1.
    #[payable]
    #[allow(clippy::too_many_arguments)]
    pub fn create_skill(
        &mut self,
        collection: u32,
        name: String,
        kind: SkillKind,
        mag: u8,
        rarity: Rarity,
        max_supply: Option<u32>,
        royalty_bps: u16,
        media: String,
    ) -> u32 {
        let creator = self.only_creator();
        let c = self.collections.get(collection).unwrap_or_else(|| env::panic_str("No such collection"));
        require!(c.creator == creator, "Not your collection");
        require!(!name.is_empty(), "Name required");
        text(&name, 40, "Name");
        text(&media, 256, "Media");
        require!(if kind.is_stat() { (1..=2).contains(&mag) } else { mag == 1 }, "Bad magnitude");
        require!(royalty_bps <= MAX_ROYALTY_BPS, "Royalty too high");
        require!(max_supply.is_none_or(|s| s > 0), "max_supply must be > 0");
        let before = env::storage_usage();
        let t = SkillType {
            id: self.skills.len(),
            collection,
            name,
            kind,
            mag,
            rarity,
            max_supply,
            minted: 0,
            creator,
            royalty_bps,
            media,
        };
        brawl("skill_create", json!(t));
        self.skills.push(t);
        self.charge(before, 0);
        self.skills.len() - 1
    }

    /// Creator airdrop within supply. Deposit covers storage.
    #[payable]
    pub fn mint_skill(&mut self, skill: u32, to: AccountId, qty: u32) {
        let who = self.only_creator();
        require!(self.skill(skill).creator == who, "Not your skill");
        require!(qty > 0, "qty must be > 0");
        let before = env::storage_usage();
        self.mint_units(skill, &to, qty);
        self.charge(before, 0);
    }

    /* ---------- presales ---------- */

    /// No end_ms and no cap = permanent shop. Deposit covers storage.
    #[payable]
    #[allow(clippy::too_many_arguments)]
    pub fn create_presale(
        &mut self,
        skill: u32,
        price: U128,
        start_ms: u64,
        end_ms: Option<u64>,
        cap_total: Option<u32>,
        per_wallet: Option<u32>,
        allowlist: Option<Vec<AccountId>>,
    ) -> u32 {
        let who = self.only_creator();
        require!(self.skill(skill).creator == who, "Not your skill");
        require!(end_ms.is_none_or(|e| e > start_ms && e > now_ms()), "Bad presale window");
        let before = env::storage_usage();
        let id = self.presales.len();
        for a in allowlist.iter().flatten() {
            self.presale_allow.insert((id, a.clone()));
        }
        let p = Presale {
            id,
            skill,
            price,
            start_ms,
            end_ms,
            cap_total,
            per_wallet,
            allowlist: allowlist.is_some(),
            sold: 0,
            ended: false,
        };
        brawl("presale_create", json!(p));
        self.presales.push(p);
        self.charge(before, 0);
        id
    }

    /// Deposit ≥ price × qty + storage; excess refunded. Fee to treasury, rest owed to the creator.
    #[payable]
    pub fn buy_presale(&mut self, id: u32, qty: u32) {
        let who = env::predecessor_account_id();
        let now = now_ms();
        let p = self.presales.get(id).cloned().unwrap_or_else(|| env::panic_str("No such presale"));
        require!(qty > 0, "qty must be > 0");
        require!(!p.ended && now >= p.start_ms && p.end_ms.is_none_or(|e| now < e), "Presale not open");
        require!(!p.allowlist || self.presale_allow.contains(&(id, who.clone())), "Not on allowlist");
        require!(p.cap_total.is_none_or(|c| p.sold + qty <= c), "Presale sold out");
        let bought = self.presale_bought.get(&(id, who.clone())).copied().unwrap_or(0);
        require!(p.per_wallet.is_none_or(|w| bought + qty <= w), "Per-wallet limit reached");
        let before = env::storage_usage();
        self.mint_units(p.skill, &who, qty);
        self.presales.get_mut(id).unwrap().sold += qty;
        self.presale_bought.insert((id, who.clone()), bought + qty);
        let total = p.price.0 * qty as u128;
        let fee = total * self.market_fee_bps as u128 / BPS;
        self.treasury += fee;
        let creator = self.skill(p.skill).creator.clone();
        self.credit_owed(&creator, total - fee);
        self.push_price(skey(p.skill), p.price.0);
        brawl("presale_buy", json!({"id": id, "key": skey(p.skill), "qty": qty, "price": p.price, "buyer": who}));
        self.charge(before, total);
    }

    /// Skill creator or contract owner.
    pub fn end_presale(&mut self, id: u32) {
        let who = env::predecessor_account_id();
        let skill = self.presales.get(id).unwrap_or_else(|| env::panic_str("No such presale")).skill;
        require!(who == self.skill(skill).creator || who == self.owner, "Not your presale");
        self.presales.get_mut(id).unwrap().ended = true;
    }

    /* ---------- skill market ---------- */

    /// Escrows qty free units. Re-listing replaces the old listing. Attach ≥ 1 yocto + storage.
    #[payable]
    pub fn list_skill(&mut self, skill: u32, qty: u32, price_each: U128) {
        require!(env::attached_deposit().as_yoctonear() >= 1, "Attach 1 yoctoNEAR + storage");
        require!(qty > 0 && price_each.0 > 0, "qty and price must be > 0");
        self.skill(skill);
        let seller = env::predecessor_account_id();
        let before = env::storage_usage();
        self.unlist(skill, &seller);
        self.debit(&seller, skill, qty);
        self.skill_listings.entry(skill).or_default().push(SkillListing { seller: seller.clone(), skill, qty, price_each });
        brawl("list", json!({"key": skey(skill), "seller": seller, "qty": qty, "price": price_each}));
        self.charge(before, 0);
    }

    pub fn cancel_skill_listing(&mut self, skill: u32) {
        let seller = env::predecessor_account_id();
        require!(self.unlist(skill, &seller), "Not listed");
    }

    /// Deposit ≥ qty × price_each + storage; excess refunded. Fee → treasury, royalty → creator's `owed`.
    #[payable]
    pub fn buy_skill(&mut self, seller: AccountId, skill: u32, qty: u32) {
        let buyer = env::predecessor_account_id();
        require!(buyer != seller, "Own listing");
        require!(qty > 0, "qty must be > 0");
        let before = env::storage_usage();
        let list = self.skill_listings.get_mut(&skill).unwrap_or_else(|| env::panic_str("Not listed"));
        let i = list.iter().position(|l| l.seller == seller).unwrap_or_else(|| env::panic_str("Not listed"));
        require!(qty <= list[i].qty, "Not enough listed");
        let price = list[i].price_each.0;
        list[i].qty -= qty;
        if list[i].qty == 0 {
            list.remove(i);
        }
        self.credit(&buyer, skill, qty);
        let total = price * qty as u128;
        let fee = total * self.market_fee_bps as u128 / BPS;
        let t = self.skill(skill).clone();
        let royalty = if seller != t.creator { total * t.royalty_bps as u128 / BPS } else { 0 };
        self.treasury += fee;
        self.credit_owed(&t.creator, royalty);
        self.pay(seller.clone(), total - fee - royalty);
        self.push_price(skey(skill), price);
        mt_transfer_event(&seller, &buyer, &[skey(skill)], &[qty]);
        brawl("sale", json!({"key": skey(skill), "qty": qty, "price": U128(price), "seller": seller, "buyer": buyer}));
        self.charge(before, total);
    }

    /* ---------- equip ---------- */

    /// Replaces the whole loadout (`[]` unequips). Owner only, monster not busy or listed.
    #[payable]
    pub fn equip(&mut self, token_id: String, skills: Vec<u32>) {
        assert_one_yocto();
        let who = env::predecessor_account_id();
        let m = self.owned_free(&token_id, &who, now_ms());
        require!(m.price.is_none(), "Monster is listed for sale");
        self.check_loadout(&skills);
        for &s in &m.skills {
            self.credit(&who, s, 1);
        }
        for &s in &skills {
            self.debit(&who, s, 1);
        }
        brawl("equip", json!({"token_id": token_id, "owner": who, "skills": skills}));
        self.m_mut(&token_id).skills = skills;
    }

    /* ---------- NEP-245 ---------- */

    #[payable]
    pub fn mt_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        amount: U128,
        approval: Option<(AccountId, u64)>,
        memo: Option<String>,
    ) {
        require!(approval.is_none(), "Approvals not supported");
        self.mt_batch_transfer(receiver_id, vec![token_id], vec![amount], None, memo);
    }

    #[payable]
    pub fn mt_batch_transfer(
        &mut self,
        receiver_id: AccountId,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
        approvals: Option<Vec<Option<(AccountId, u64)>>>,
        memo: Option<String>,
    ) {
        assert_one_yocto();
        require!(approvals.is_none_or(|a| a.iter().all(Option::is_none)), "Approvals not supported");
        require!(token_ids.len() == amounts.len() && !token_ids.is_empty(), "Bad token_ids/amounts");
        let sender = env::predecessor_account_id();
        require!(sender != receiver_id, "Sender and receiver must differ");
        let mut qtys = vec![];
        for (t, a) in token_ids.iter().zip(&amounts) {
            let id = sid(t).unwrap_or_else(|| env::panic_str("Bad token_id"));
            let q = u32::try_from(a.0).ok().filter(|&q| q > 0).unwrap_or_else(|| env::panic_str("Bad amount"));
            self.debit(&sender, id, q);
            self.credit(&receiver_id, id, q);
            qtys.push(q);
        }
        let _ = memo;
        mt_transfer_event(&sender, &receiver_id, &token_ids, &qtys);
    }

    /// Free (not listed, not equipped) units.
    pub fn mt_balance_of(&self, account_id: AccountId, token_id: String) -> U128 {
        U128(sid(&token_id).map_or(0, |id| self.bal(&account_id, id)) as u128)
    }

    pub fn mt_batch_balance_of(&self, account_id: AccountId, token_ids: Vec<String>) -> Vec<U128> {
        token_ids.into_iter().map(|t| self.mt_balance_of(account_id.clone(), t)).collect()
    }

    pub fn mt_supply(&self, token_id: String) -> Option<U128> {
        sid(&token_id).and_then(|id| self.skills.get(id)).map(|t| U128(t.minted as u128))
    }

    pub fn mt_batch_supply(&self, token_ids: Vec<String>) -> Vec<Option<U128>> {
        token_ids.into_iter().map(|t| self.mt_supply(t)).collect()
    }

    pub fn mt_token(&self, token_ids: Vec<String>) -> Vec<Option<MtToken>> {
        token_ids
            .into_iter()
            .map(|t| sid(&t).and_then(|id| self.skills.get(id)).map(|_| MtToken { token_id: t, owner_id: None }))
            .collect()
    }

    /* ---------- views ---------- */

    pub fn skill_types(&self, from: u32, limit: u32) -> Vec<SkillTypeView> {
        page(self.skills.iter(), from, limit)
            .into_iter()
            .map(|t| {
                let ls = self.skill_listings.get(&t.id);
                SkillTypeView {
                    floor: ls.and_then(|l| l.iter().map(|l| l.price_each.0).min()).map(U128),
                    last_price: self.prices.get(&skey(t.id)).and_then(|h| h.last()).map(|p| p.1),
                    listed_qty: ls.map_or(0, |l| l.iter().map(|l| l.qty).sum()),
                    skill: t.clone(),
                }
            })
            .collect()
    }

    pub fn collections(&self, from: u32, limit: u32) -> Vec<Collection> {
        page(self.collections.iter().cloned(), from, limit)
    }

    pub fn skill_listings(&self, skill: u32, from: u32, limit: u32) -> Vec<SkillListing> {
        page(self.skill_listings.get(&skill).into_iter().flatten().cloned(), from, limit)
    }

    /// (skill id, free, listed) for every skill the account holds.
    pub fn skills_of(&self, account_id: AccountId) -> Vec<(u32, u32, u32)> {
        self.skills
            .iter()
            .map(|t| (t.id, self.bal(&account_id, t.id), self.listed(t.id, &account_id)))
            .filter(|r| r.1 + r.2 > 0)
            .collect()
    }

    pub fn presales(&self, from: u32, limit: u32) -> Vec<Presale> {
        page(self.presales.iter().cloned(), from, limit)
    }

    pub fn presale_bought(&self, id: u32, account_id: AccountId) -> u32 {
        self.presale_bought.get(&(id, account_id)).copied().unwrap_or(0)
    }

    pub fn presale_allowed(&self, id: u32, account_id: AccountId) -> bool {
        self.presales.get(id).is_some_and(|p| !p.allowlist || self.presale_allow.contains(&(id, account_id)))
    }

    pub fn is_creator(&self, account_id: AccountId) -> bool {
        self.creators.contains(&account_id)
    }

    /// Oldest first, last 64: (ms, price). key = "skill:<id>" or "monsters".
    pub fn price_history(&self, key: String) -> Vec<(u64, U128)> {
        self.prices.get(&key).cloned().unwrap_or_default()
    }
}

fn mt_transfer_event(from: &AccountId, to: &AccountId, token_ids: &[String], qtys: &[u32]) {
    let amounts: Vec<String> = qtys.iter().map(u32::to_string).collect();
    event("nep245", "mt_transfer", json!({"old_owner_id": from, "new_owner_id": to, "token_ids": token_ids, "amounts": amounts}));
}

impl Monsters {
    fn only_creator(&self) -> AccountId {
        let who = env::predecessor_account_id();
        require!(self.creators.contains(&who), "Only creators");
        who
    }

    fn skill(&self, id: u32) -> &SkillType {
        self.skills.get(id).unwrap_or_else(|| env::panic_str("No such skill"))
    }

    fn bal(&self, who: &AccountId, id: u32) -> u32 {
        self.balances.get(&(who.clone(), id)).copied().unwrap_or(0)
    }

    pub(crate) fn credit(&mut self, who: &AccountId, id: u32, q: u32) {
        *self.balances.entry((who.clone(), id)).or_default() += q;
    }

    fn debit(&mut self, who: &AccountId, id: u32, q: u32) {
        let b = self.bal(who, id);
        require!(b >= q, "Not enough free skill units");
        if b == q {
            self.balances.remove(&(who.clone(), id));
        } else {
            self.balances.insert((who.clone(), id), b - q);
        }
    }

    fn listed(&self, skill: u32, who: &AccountId) -> u32 {
        self.skill_listings.get(&skill).and_then(|l| l.iter().find(|l| l.seller == *who)).map_or(0, |l| l.qty)
    }

    /// Removes `who`'s listing of `skill`, returning its units to the free balance.
    fn unlist(&mut self, skill: u32, who: &AccountId) -> bool {
        let Some(list) = self.skill_listings.get_mut(&skill) else { return false };
        let Some(i) = list.iter().position(|l| l.seller == *who) else { return false };
        let qty = list.remove(i).qty;
        self.credit(who, skill, qty);
        brawl("delist", json!({"key": skey(skill), "seller": who}));
        true
    }

    fn mint_units(&mut self, id: u32, to: &AccountId, qty: u32) {
        let t = self.skills.get_mut(id).unwrap_or_else(|| env::panic_str("No such skill"));
        require!(t.max_supply.is_none_or(|s| t.minted + qty <= s), "Exceeds max supply");
        t.minted += qty;
        self.credit(to, id, qty);
        event("nep245", "mt_mint", json!({"owner_id": to, "token_ids": [skey(id)], "amounts": [qty.to_string()]}));
    }

    /// 3 Common mag-1 stat skills (picked from `seed`), if any exist.
    pub(crate) fn starter_skills(&mut self, who: &AccountId, seed: u32) {
        let pool: Vec<u32> = self
            .skills
            .iter()
            .filter(|t| t.rarity == Rarity::Common && t.kind.is_stat() && t.mag == 1)
            .filter(|t| t.max_supply.is_none_or(|s| t.minted + 3 <= s))
            .map(|t| t.id)
            .collect();
        if pool.is_empty() {
            return;
        }
        for i in 0..3 {
            self.mint_units(pool[(seed.wrapping_add(i as u32) % pool.len() as u32) as usize], who, 1);
        }
    }

    pub(crate) fn credit_owed(&mut self, to: &AccountId, amount: u128) {
        if amount > 0 {
            *self.owed.entry(to.clone()).or_default() += amount;
        }
    }

    pub(crate) fn push_price(&mut self, key: String, price: u128) {
        let h = self.prices.entry(key).or_default();
        if h.len() >= PRICE_RING {
            h.remove(0);
        }
        h.push((now_ms(), U128(price)));
    }

    fn check_loadout(&self, ids: &[u32]) {
        require!(ids.len() <= SLOTS, "Max 3 skills");
        let mut stat = [0u8; 4];
        let mut effects = vec![];
        for (i, &id) in ids.iter().enumerate() {
            require!(!ids[..i].contains(&id), "Skill equipped twice");
            let t = self.skill(id);
            if t.kind.is_stat() {
                stat[t.kind as usize] += t.mag;
            } else {
                require!(!effects.contains(&t.kind), "Effect equipped twice");
                effects.push(t.kind);
            }
        }
        require!(stat.iter().all(|&s| s <= MAX_PER_STAT), "Max +2 per stat");
        require!(stat.iter().sum::<u8>() <= MAX_STAT_TOTAL, "Max +3 total stat bonus");
        require!(effects.len() <= MAX_EFFECTS, "Max 2 effect skills");
    }

    pub(crate) fn skill_refs(&self, ids: &[u32]) -> Vec<SkillRef> {
        ids.iter().map(|&id| self.skill(id)).map(|t| SkillRef { id: t.id, kind: t.kind, mag: t.mag }).collect()
    }

    pub(crate) fn flush_skills(&mut self) {
        self.collections.flush();
        self.skills.flush();
        self.balances.flush();
        self.skill_listings.flush();
        self.presales.flush();
        self.presale_bought.flush();
        self.prices.flush();
        self.owed.flush();
    }
}
