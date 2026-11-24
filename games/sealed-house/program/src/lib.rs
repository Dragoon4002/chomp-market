//! Sealed House: sealed-bid auctions for VRF-filled collectible vaults.
//! Base layer only. Bids are commit-reveal: sha256(amount_le ‖ salt ‖ bidder).
//! Escrow = a deposit >= the bid, so the deposit only leaks an upper bound (overfund to hide).
use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use ephemeral_rollups_sdk::anchor::{vrf, vrf_callback};
use ephemeral_rollups_sdk::vrf::{
    consts::{program_identity_pubkey, DEFAULT_QUEUE, DEFAULT_TEST_QUEUE},
    instructions::{create_request_randomness_ix_const, RequestRandomnessParams},
    types::SerializableAccountMeta,
};

pub mod logic;
use logic::*;

declare_id!("GEXuTjamghE5zQdgUiKUS6TZuizHbGW3jwCd2ceTh95M"); // placeholder, no keypair yet

pub const LAMPORTS_PER_COIN: u64 = 10_000; // 1 coin = 0.00001 SOL
pub const MAX_BIDS: u16 = 16; // bounds settle's compute
const PROGRAM_IDENTITY: Pubkey = program_identity_pubkey(&crate::ID);

const PENDING: u8 = 0;
const OPEN: u8 = 1;
const SETTLED: u8 = 2;

#[program]
pub mod sealed_house {
    use super::*;

    /// One-time: House (treasury that funds buybacks) + fee vault. `fund` seeds the treasury.
    pub fn init_house(ctx: Context<InitHouse>, fund: u64) -> Result<()> {
        let h = &mut ctx.accounts.house;
        h.authority = ctx.accounts.authority.key();
        h.lots = 0;
        pay(&ctx.accounts.system_program, &ctx.accounts.authority, &h.to_account_info(), fund)
    }

    /// Opens a sealed lot and asks MagicBlock VRF for its contents.
    pub fn create_lot(ctx: Context<CreateLot>, commit_secs: i64, reveal_secs: i64, client_seed: u8) -> Result<()> {
        require!(commit_secs > 0 && reveal_secs > 0, E::BadWindow);
        let id = ctx.accounts.house.lots;
        ctx.accounts.house.lots += 1;
        let lot = &mut ctx.accounts.lot;
        lot.id = id;
        lot.state = PENDING;
        lot.commit_secs = commit_secs;
        lot.reveal_secs = reveal_secs;
        let mut caller_seed = [client_seed; 32];
        caller_seed[..8].copy_from_slice(&id.to_le_bytes()); // no grinding by picking the whole seed
        let ix = create_request_randomness_ix_const(
            RequestRandomnessParams {
                payer: ctx.accounts.authority.key(),
                oracle_queue: ctx.accounts.oracle_queue.key(),
                callback_program_id: crate::ID,
                callback_discriminator: instruction::FillLot::DISCRIMINATOR.to_vec(),
                caller_seed,
                accounts_metas: Some(vec![SerializableAccountMeta { pubkey: lot.key(), is_signer: false, is_writable: true }]),
                ..Default::default()
            },
            PROGRAM_IDENTITY,
        );
        ctx.accounts.invoke_signed_vrf(&ctx.accounts.authority.to_account_info(), &ix)?;
        Ok(())
    }

    /// VRF callback (signed by the scoped VRF identity, checked by #[vrf_callback]).
    pub fn fill_lot(ctx: Context<FillLot>, randomness: [u8; 32]) -> Result<()> {
        let lot = &mut ctx.accounts.lot;
        require!(lot.state == PENDING, E::BadState);
        let c = contents(seed_of(&randomness, 0));
        lot.items = c.items;
        lot.n = c.n;
        lot.weight = c.weight;
        lot.glow = c.glow;
        lot.shown = c.items[0];
        lot.tie_seed = seed_of(&randomness, 8);
        let now = Clock::get()?.unix_timestamp;
        lot.commit_end = now + lot.commit_secs;
        lot.reveal_end = lot.commit_end + lot.reveal_secs;
        lot.state = OPEN;
        // ponytail: items stay readable on-chain (anyone can deserialize `items`); hide them
        // in PER or store only a hash + reveal at settle if sniping from RPC becomes a problem.
        Ok(())
    }

    /// Sealed bid: stores the commitment and escrows `deposit` lamports (>= the real bid).
    pub fn commit_bid(ctx: Context<CommitBid>, commitment: [u8; 32], deposit: u64) -> Result<()> {
        let lot = &mut ctx.accounts.lot;
        require!(lot.state == OPEN, E::BadState);
        require!(Clock::get()?.unix_timestamp < lot.commit_end, E::Closed);
        require!(lot.bids < MAX_BIDS, E::Full);
        lot.bids += 1;
        let b = &mut ctx.accounts.bid;
        b.lot = lot.key();
        b.bidder = ctx.accounts.bidder.key();
        b.commitment = commitment;
        b.deposit = deposit;
        pay(&ctx.accounts.system_program, &ctx.accounts.bidder, &b.to_account_info(), deposit)
    }

    pub fn reveal_bid(ctx: Context<RevealBid>, amount: u64, salt: [u8; 32]) -> Result<()> {
        let lot = &ctx.accounts.lot;
        let now = Clock::get()?.unix_timestamp;
        require!(lot.state == OPEN && now >= lot.commit_end && now < lot.reveal_end, E::Closed);
        let b = &mut ctx.accounts.bid;
        require!(!b.revealed, E::BadState);
        require!(commitment(amount, &salt, &b.bidder) == b.commitment, E::BadReveal);
        require!(amount <= b.deposit, E::Underfunded);
        b.amount = amount;
        b.revealed = true;
        Ok(())
    }

    /// Permissionless crank after the reveal window.
    /// remaining_accounts = every Bid of this lot followed by its bidder: [bid0, bidder0, bid1, bidder1, ...].
    /// Winner pays their bid (95% treasury, 5% fee vault); everyone else is refunded;
    /// unrevealed deposits are forfeited to the fee vault. All Bid accounts are closed.
    pub fn settle<'info>(ctx: Context<'info, Settle<'info>>) -> Result<()> {
        let lot = &mut ctx.accounts.lot;
        require!(lot.state == OPEN, E::BadState);
        require!(Clock::get()?.unix_timestamp >= lot.reveal_end, E::NotYet);
        let ra = ctx.remaining_accounts;
        require!(ra.len() == 2 * lot.bids as usize, E::MissingBids);
        let mut bids: Vec<(AccountInfo<'info>, AccountInfo<'info>, Bid)> = Vec::with_capacity(lot.bids as usize);
        for pair in ra.chunks(2) {
            let (acc, who) = (&pair[0], &pair[1]);
            require_keys_eq!(*acc.owner, crate::ID, E::BadBid);
            let b = Bid::try_deserialize(&mut &acc.try_borrow_data()?[..])?;
            require_keys_eq!(b.lot, lot.key(), E::BadBid);
            require_keys_eq!(b.bidder, who.key(), E::BadBid);
            require!(who.is_writable && acc.is_writable, E::BadBid);
            require!(bids.iter().all(|x| x.0.key() != acc.key()), E::BadBid);
            bids.push((acc.clone(), who.clone(), b));
        }
        let view: Vec<([u8; 32], Option<u64>)> =
            bids.iter().map(|(_, _, b)| (b.bidder.to_bytes(), b.revealed.then_some(b.amount))).collect();
        let w = winner(&view, lot.tie_seed);
        let house = ctx.accounts.house.to_account_info();
        let fee_vault = ctx.accounts.fee_vault.to_account_info();
        for (i, (acc, who, b)) in bids.iter().enumerate() {
            if Some(i) == w {
                let (to_house, fee) = split(b.amount);
                lot.winner = b.bidder;
                lot.price = b.amount;
                move_lamports(acc, &house, to_house)?;
                move_lamports(acc, &fee_vault, fee)?;
            } else if !b.revealed {
                move_lamports(acc, &fee_vault, b.deposit)?;
            }
            move_lamports(acc, who, acc.lamports())?; // rest of escrow + rent back to bidder
            acc.try_borrow_mut_data()?.fill(0);
        }
        lot.state = SETTLED;
        // TODO(solana): NFT mint each item of the lot to the winner as a Metaplex Core asset (gachapon-example).
        Ok(())
    }

    /// Winner sells items (bit i = items[i]) back to the house at 90% of listed value.
    pub fn sell_back(ctx: Context<SellBack>, mask: u8) -> Result<()> {
        let lot = &mut ctx.accounts.lot;
        require!(lot.state == SETTLED, E::BadState);
        require_keys_eq!(lot.winner, ctx.accounts.winner.key(), E::NotWinner);
        require!(mask != 0 && mask & lot.sold == 0 && (mask as u16) < (1u16 << lot.n), E::BadMask);
        lot.sold |= mask;
        let pay_out = buyback(&lot.items, mask) * LAMPORTS_PER_COIN;
        let house = ctx.accounts.house.to_account_info();
        let floor = Rent::get()?.minimum_balance(house.data_len());
        require!(house.lamports() >= floor + pay_out, E::TreasuryLow);
        move_lamports(&house, &ctx.accounts.winner.to_account_info(), pay_out)
    }
}

pub fn commitment(amount: u64, salt: &[u8; 32], bidder: &Pubkey) -> [u8; 32] {
    solana_sha256_hasher::hashv(&[&amount.to_le_bytes(), salt, bidder.as_ref()]).to_bytes()
}

fn pay<'info>(sys: &Program<'info, System>, from: &Signer<'info>, to: &AccountInfo<'info>, lamports: u64) -> Result<()> {
    if lamports == 0 { return Ok(()); }
    transfer(CpiContext::new(sys.key(), Transfer { from: from.to_account_info(), to: to.clone() }), lamports)
}

/// Debit a program-owned account directly.
fn move_lamports(from: &AccountInfo, to: &AccountInfo, lamports: u64) -> Result<()> {
    if lamports == 0 { return Ok(()); }
    **from.try_borrow_mut_lamports()? = from.lamports().checked_sub(lamports).ok_or(E::Underfunded)?;
    **to.try_borrow_mut_lamports()? += lamports;
    Ok(())
}

#[account]
#[derive(InitSpace)]
pub struct House { pub authority: Pubkey, pub lots: u64 }

#[account]
#[derive(InitSpace)]
pub struct FeeVault {}

#[account]
#[derive(InitSpace)]
pub struct Lot {
    pub id: u64,
    pub state: u8,
    pub items: [u8; MAX_ITEMS],
    pub n: u8,
    pub weight: u16,
    pub glow: u8,
    pub shown: u8,
    pub tie_seed: u64,
    pub commit_secs: i64,
    pub reveal_secs: i64,
    pub commit_end: i64,
    pub reveal_end: i64,
    pub bids: u16,
    pub winner: Pubkey,
    pub price: u64,
    pub sold: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Bid {
    pub lot: Pubkey,
    pub bidder: Pubkey,
    pub commitment: [u8; 32],
    pub deposit: u64,
    pub amount: u64,
    pub revealed: bool,
}

#[derive(Accounts)]
pub struct InitHouse<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(init, payer = authority, space = 8 + House::INIT_SPACE, seeds = [b"house"], bump)]
    pub house: Account<'info, House>,
    #[account(init, payer = authority, space = 8, seeds = [b"fee", house.key().as_ref()], bump)]
    pub fee_vault: Account<'info, FeeVault>,
    pub system_program: Program<'info, System>,
}

#[vrf]
#[derive(Accounts)]
pub struct CreateLot<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut, seeds = [b"house"], bump, has_one = authority)]
    pub house: Account<'info, House>,
    #[account(init, payer = authority, space = 8 + Lot::INIT_SPACE, seeds = [b"lot".as_ref(), &house.lots.to_le_bytes()], bump)]
    pub lot: Account<'info, Lot>,
    /// CHECK: VRF oracle queue (devnet or local test queue)
    #[account(mut, constraint = oracle_queue.key() == DEFAULT_QUEUE || oracle_queue.key() == DEFAULT_TEST_QUEUE)]
    pub oracle_queue: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[vrf_callback]
#[derive(Accounts)]
pub struct FillLot<'info> {
    #[account(mut)]
    pub lot: Account<'info, Lot>,
}

#[derive(Accounts)]
pub struct CommitBid<'info> {
    #[account(mut)]
    pub bidder: Signer<'info>,
    #[account(mut)]
    pub lot: Account<'info, Lot>,
    #[account(init, payer = bidder, space = 8 + Bid::INIT_SPACE, seeds = [b"bid", lot.key().as_ref(), bidder.key().as_ref()], bump)]
    pub bid: Account<'info, Bid>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevealBid<'info> {
    pub bidder: Signer<'info>,
    pub lot: Account<'info, Lot>,
    #[account(mut, seeds = [b"bid", lot.key().as_ref(), bidder.key().as_ref()], bump, has_one = lot, has_one = bidder)]
    pub bid: Account<'info, Bid>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(mut)]
    pub lot: Account<'info, Lot>,
    /// CHECK: treasury PDA, receives lamports only
    #[account(mut, seeds = [b"house"], bump)]
    pub house: UncheckedAccount<'info>,
    /// CHECK: fee vault PDA, receives lamports only
    #[account(mut, seeds = [b"fee", house.key().as_ref()], bump)]
    pub fee_vault: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct SellBack<'info> {
    #[account(mut)]
    pub winner: Signer<'info>,
    #[account(mut)]
    pub lot: Account<'info, Lot>,
    /// CHECK: treasury PDA (program-owned), pays buybacks
    #[account(mut, seeds = [b"house"], bump)]
    pub house: UncheckedAccount<'info>,
}

#[error_code]
pub enum E {
    #[msg("bad window")] BadWindow,
    #[msg("wrong lot state")] BadState,
    #[msg("bidding closed or reveal window not open")] Closed,
    #[msg("too many bids")] Full,
    #[msg("reveal does not match commitment")] BadReveal,
    #[msg("bid exceeds deposit")] Underfunded,
    #[msg("reveal window still open")] NotYet,
    #[msg("pass every bid of the lot")] MissingBids,
    #[msg("bad bid account")] BadBid,
    #[msg("not the winner")] NotWinner,
    #[msg("bad item mask")] BadMask,
    #[msg("treasury too low")] TreasuryLow,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn commitment_binds_amount_salt_bidder() {
        let (a, b) = (Pubkey::new_from_array([1; 32]), Pubkey::new_from_array([2; 32]));
        let c = commitment(500, &[7; 32], &a);
        assert_eq!(c, commitment(500, &[7; 32], &a));
        assert_ne!(c, commitment(501, &[7; 32], &a));
        assert_ne!(c, commitment(500, &[8; 32], &a));
        assert_ne!(c, commitment(500, &[7; 32], &b), "a copied commitment can't be revealed by someone else");
    }
}
