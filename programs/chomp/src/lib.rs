//! Chomp: shared escrow for 1v1 staked matches + on-chain score board. Layout = tasks/devnet-spec.md §1.
use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

declare_id!("4m5U9NJaLNyDzZj926jE9Y9nvKYJf82MQEcabbbGqcNf");

pub const EXPIRY_SECS: i64 = 7200;

#[program]
pub mod chomp {
    use super::*;

    pub fn init(ctx: Context<Init>, fee_bps: u16) -> Result<()> {
        require!(fee_bps <= 10_000, E::BadFee);
        let c = &mut ctx.accounts.config;
        c.authority = ctx.accounts.authority.key();
        c.fee_bps = fee_bps;
        c.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn register_game(ctx: Context<RegisterGame>, slug: String, referee: Pubkey) -> Result<()> {
        let g = &mut ctx.accounts.game;
        g.slug = slug;
        g.referee = referee;
        g.bump = ctx.bumps.game;
        Ok(())
    }

    pub fn open_match(ctx: Context<OpenMatch>, id: u64, stake: u64) -> Result<()> {
        let m = &mut ctx.accounts.mtch;
        m.game = ctx.accounts.game.key();
        m.id = id;
        m.a = ctx.accounts.a.key();
        m.b = Pubkey::default();
        m.stake = stake;
        m.created = Clock::get()?.unix_timestamp;
        m.bump = ctx.bumps.mtch;
        pay(&ctx.accounts.system_program, &ctx.accounts.a, &m.to_account_info(), stake)
    }

    pub fn join_match(ctx: Context<JoinMatch>) -> Result<()> {
        let m = &mut ctx.accounts.mtch;
        let b = ctx.accounts.b.key();
        require!(m.b == Pubkey::default(), E::SeatTaken);
        require!(b != m.a, E::SelfJoin);
        m.b = b;
        m.created = Clock::get()?.unix_timestamp; // expiry runs from join, so a late joiner isn't cancelled right away
        pay(&ctx.accounts.system_program, &ctx.accounts.b, &m.to_account_info(), m.stake)
    }

    pub fn settle(ctx: Context<Settle>, winner: u8) -> Result<()> {
        let m = &ctx.accounts.mtch;
        require!(m.b != Pubkey::default(), E::SeatOpen);
        require!(winner <= 2, E::BadWinner);
        let (to_a, to_b, fee) = split(m.stake, ctx.accounts.config.fee_bps, winner);
        let from = m.to_account_info();
        move_lamports(&from, &ctx.accounts.config.to_account_info(), fee)?;
        move_lamports(&from, &ctx.accounts.b, to_b)?;
        move_lamports(&from, &ctx.accounts.a, to_a)?; // rent + leftovers follow via close = a
        Ok(())
    }

    pub fn cancel(ctx: Context<Cancel>) -> Result<()> {
        let m = &ctx.accounts.mtch;
        let open = m.b == Pubkey::default();
        let expired = Clock::get()?.unix_timestamp > m.created + EXPIRY_SECS;
        require!(expired || (open && ctx.accounts.caller.key() == m.a), E::CantCancel);
        if !open {
            move_lamports(&m.to_account_info(), &ctx.accounts.b, m.stake)?;
        }
        Ok(()) // a's stake + rent go back via close = a
    }

    pub fn submit_score(ctx: Context<SubmitScore>, score: u64, tape: [u8; 32]) -> Result<()> {
        let s = &mut ctx.accounts.score;
        s.plays = s.plays.saturating_add(1);
        s.last = score;
        s.best = s.best.max(score);
        s.tape = tape;
        s.bump = ctx.bumps.score;
        Ok(())
    }
}

/// Payout of a settled pot (2·stake). Draw (2) refunds both with no fee. Always to_a + to_b + fee == 2·stake.
pub fn split(stake: u64, fee_bps: u16, winner: u8) -> (u64, u64, u64) {
    if winner == 2 {
        return (stake, stake, 0);
    }
    let pot = stake * 2; // lamports: 2·stake < total supply, can't overflow
    let fee = (pot as u128 * fee_bps as u128 / 10_000) as u64;
    if winner == 0 { (pot - fee, 0, fee) } else { (0, pot - fee, fee) }
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
pub struct Config { pub authority: Pubkey, pub fee_bps: u16, pub bump: u8 }

#[account]
#[derive(InitSpace)]
pub struct Game {
    #[max_len(16)]
    pub slug: String,
    pub referee: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Match { pub game: Pubkey, pub id: u64, pub a: Pubkey, pub b: Pubkey, pub stake: u64, pub created: i64, pub bump: u8 }

#[account]
#[derive(InitSpace)]
pub struct Score { pub best: u64, pub last: u64, pub plays: u32, pub tape: [u8; 32], pub bump: u8 }

#[derive(Accounts)]
pub struct Init<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(init, payer = authority, space = 8 + Config::INIT_SPACE, seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(slug: String)]
pub struct RegisterGame<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = authority)]
    pub config: Account<'info, Config>,
    #[account(init_if_needed, payer = authority, space = 8 + Game::INIT_SPACE, seeds = [b"game", slug.as_bytes()], bump,
        constraint = slug.len() <= 16 @ E::SlugTooLong)]
    pub game: Account<'info, Game>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(id: u64)]
pub struct OpenMatch<'info> {
    #[account(mut)]
    pub a: Signer<'info>,
    pub game: Account<'info, Game>,
    #[account(init, payer = a, space = 8 + Match::INIT_SPACE, seeds = [b"match", game.key().as_ref(), &id.to_le_bytes()], bump)]
    pub mtch: Account<'info, Match>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinMatch<'info> {
    #[account(mut)]
    pub b: Signer<'info>,
    #[account(mut)]
    pub mtch: Account<'info, Match>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(constraint = referee.key() == game.referee @ E::NotReferee)]
    pub referee: Signer<'info>,
    #[account(address = mtch.game @ E::WrongGame)]
    pub game: Account<'info, Game>,
    #[account(mut, close = a)]
    pub mtch: Account<'info, Match>,
    /// CHECK: must be match.a; receives lamports
    #[account(mut, address = mtch.a @ E::WrongPlayer)]
    pub a: UncheckedAccount<'info>,
    /// CHECK: must be match.b; receives lamports
    #[account(mut, address = mtch.b @ E::WrongPlayer)]
    pub b: UncheckedAccount<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
pub struct Cancel<'info> {
    pub caller: Signer<'info>,
    #[account(mut, close = a)]
    pub mtch: Account<'info, Match>,
    /// CHECK: must be match.a; receives lamports
    #[account(mut, address = mtch.a @ E::WrongPlayer)]
    pub a: UncheckedAccount<'info>,
    /// CHECK: must be match.b. Not `mut`-constrained: an open seat is Pubkey::default() (= system program id),
    /// which the runtime always demotes to read-only. Only credited when the seat is filled.
    #[account(address = mtch.b @ E::WrongPlayer)]
    pub b: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct SubmitScore<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    pub game: Account<'info, Game>,
    #[account(init_if_needed, payer = player, space = 8 + Score::INIT_SPACE, seeds = [b"score", game.key().as_ref(), player.key().as_ref()], bump)]
    pub score: Account<'info, Score>,
    pub system_program: Program<'info, System>,
}

#[error_code]
pub enum E {
    #[msg("fee_bps > 10000")] BadFee,
    #[msg("slug > 16 bytes")] SlugTooLong,
    #[msg("seat already taken")] SeatTaken,
    #[msg("can't join own match")] SelfJoin,
    #[msg("seat b still open")] SeatOpen,
    #[msg("winner must be 0, 1 or 2")] BadWinner,
    #[msg("not this game's referee")] NotReferee,
    #[msg("game != match.game")] WrongGame,
    #[msg("a/b != match.a/match.b")] WrongPlayer,
    #[msg("only a can cancel an open match before expiry")] CantCancel,
    #[msg("insufficient lamports")] Underfunded,
}

#[cfg(test)]
mod tests {
    use super::split;

    #[test]
    fn pot_conserved() {
        for stake in [0u64, 1, 7, 5_000_000, 1_000_000_007, u64::MAX / 2] {
            for bps in [0u16, 1, 250, 9_999, 10_000] {
                for w in 0..=2 {
                    let (a, b, f) = split(stake, bps, w);
                    assert_eq!(a as u128 + b as u128 + f as u128, stake as u128 * 2, "{stake} {bps} {w}");
                }
            }
        }
    }

    #[test]
    fn draw_refunds() {
        assert_eq!(split(5_000_000, 250, 2), (5_000_000, 5_000_000, 0));
    }

    #[test]
    fn fee_math() {
        assert_eq!(split(5_000_000, 250, 0), (9_750_000, 0, 250_000));
        assert_eq!(split(5_000_000, 250, 1), (0, 9_750_000, 250_000));
        assert_eq!(split(1, 250, 0), (2, 0, 0)); // fee floors
        assert_eq!(split(100, 10_000, 1), (0, 0, 200));
    }
}
