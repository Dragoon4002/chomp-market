// Pet Den: a Tamagotchi monster whose live stats run inside a MagicBlock Private Ephemeral Rollup (TEE).
// Base: create_pet (+ permission: owner-only read) -> delegate_pet (pet + permission -> TEE validator).
// PER (gasless): tick / care. evolve = level up + commit_and_undelegate (tier goes public on base).
use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::access_control::instructions::{
    CommitAndUndelegatePermissionCpiBuilder, CreatePermissionCpiBuilder, DelegatePermissionCpiBuilder,
};
use ephemeral_rollups_sdk::access_control::structs::{Member, MembersArgs, AUTHORITY_FLAG, TX_LOGS_FLAG};
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral};
use ephemeral_rollups_sdk::consts::PERMISSION_PROGRAM_ID;
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::MagicIntentBundleBuilder;

pub mod sim;
use sim::{Action, SimError, Stats};

declare_id!("AUeP7rEoWiEwEpysKxecj7y5AXjHg76weMUZhHp5SXbr"); // placeholder, replaced at deploy

pub const PET: &[u8] = b"pet";
/// Roster size: Pet PDA = ["pet", owner, [idx]], idx < MAX_PETS.
pub const MAX_PETS: u8 = 8;
/// Real seconds per sim tick on chain. ponytail: client demo runs 2 s/tick; tune before mainnet.
pub const TICK_SECS: i64 = 60;

#[ephemeral]
#[program]
pub mod pet_den {
    use super::*;

    /// Base layer. Up to MAX_PETS per owner (roster slot idx). Also creates its PER permission: only the owner can read it in the TEE.
    // TODO(solana): dna from MagicBlock VRF (hatch) instead of the client; breed(a, b) ix mixes two adult pets' DNA (see build/sim.js breed).
    pub fn create_pet(ctx: Context<CreatePet>, idx: u8, dna: u32) -> Result<()> {
        require!(idx < MAX_PETS, PetError::RosterFull);
        let pet = &mut ctx.accounts.pet;
        pet.owner = ctx.accounts.owner.key();
        pet.idx = idx;
        pet.dna = dna;
        pet.stats = Stats::new(dna);
        pet.last_ts = Clock::get()?.unix_timestamp;
        pet.bump = ctx.bumps.pet;
        // TODO(solana): NFT mint a Metaplex Core asset for the pet (tier attribute) so it lists on the portal market.
        let owner = ctx.accounts.owner.key();
        CreatePermissionCpiBuilder::new(&ctx.accounts.permission_program)
            .permissioned_account(&pet.to_account_info())
            .permission(&ctx.accounts.permission)
            .payer(&ctx.accounts.owner)
            .system_program(&ctx.accounts.system_program)
            .args(MembersArgs { members: Some(vec![Member { flags: AUTHORITY_FLAG | TX_LOGS_FLAG, pubkey: owner }]) })
            .invoke_signed(&[&[PET, owner.as_ref(), &[idx], &[pet.bump]]])?;
        Ok(())
    }

    /// Base layer. Delegates the permission and the pet to the TEE validator (pass it as remaining_accounts[0]).
    pub fn delegate_pet<'info>(ctx: Context<'info, DelegatePet<'info>>, idx: u8) -> Result<()> {
        let owner = ctx.accounts.owner.key();
        let (_, bump) = Pubkey::find_program_address(&[PET, owner.as_ref(), &[idx]], &crate::ID);
        let seeds: &[&[u8]] = &[PET, owner.as_ref(), &[idx], &[bump]];
        let validator = ctx.remaining_accounts.first();
        let a = &ctx.accounts;
        DelegatePermissionCpiBuilder::new(&a.permission_program)
            .payer(&a.owner)
            .authority(&a.owner, true)
            .permissioned_account(&a.pet, false)
            .permission(&a.permission)
            .system_program(&a.system_program)
            .owner_program(&a.permission_program)
            .delegation_buffer(&a.permission_buffer)
            .delegation_record(&a.permission_record)
            .delegation_metadata(&a.permission_metadata)
            .delegation_program(&a.delegation_program)
            .validator(validator)
            .invoke_signed(&[seeds])?;
        a.delegate_pet(&a.owner, &[PET, owner.as_ref(), &[idx]], DelegateConfig { validator: validator.map(|v| v.key()), ..Default::default() })?;
        Ok(())
    }

    /// PER. Advance decay to now. Anyone may call (harmless), owner usually does.
    pub fn tick(ctx: Context<Care>) -> Result<()> {
        catch_up(&mut ctx.accounts.pet)
    }

    /// PER, gasless. action: 0 feed, 1 play(score 0-10 from the mini-game), 2 clean, 3 sleep/wake, 4 train, 5 interact,
    /// 6 move habitat (score = habitat index). item: 1 = an inventory item boosts feed/play/clean.
    // TODO(solana): item = burn 1 SPL item token (treat/toy/soap) from the owner in the same tx.
    // TODO(solana): session keys (#[session_auth_or], session-keys 3.1.1) so care taps need no wallet popup.
    pub fn care(ctx: Context<Care>, action: u8, score: u8, item: u8) -> Result<()> {
        require_keys_eq!(ctx.accounts.signer.key(), ctx.accounts.pet.owner, PetError::NotOwner);
        let pet = &mut ctx.accounts.pet;
        catch_up(pet)?;
        let a = match action {
            0 => Action::Feed(item),
            1 => Action::Play(score, item), // ponytail: client-reported score, it's your own pet; VRF/replay if pets get staked
            2 => Action::Clean(item),
            3 => Action::Sleep,
            4 => Action::Train,
            5 => Action::Interact,
            6 => Action::Habitat(score),
            _ => return err!(PetError::BadAction),
        };
        pet.stats.act(a).map_err(PetError::from)?;
        Ok(())
    }

    /// PER. Level up, then commit + undelegate pet and permission: the new tier lands on base (tradeable).
    /// Client re-delegates to keep caring.
    pub fn evolve(ctx: Context<Evolve>) -> Result<()> {
        let pet = &mut ctx.accounts.pet;
        require_keys_eq!(ctx.accounts.owner.key(), pet.owner, PetError::NotOwner);
        catch_up(pet)?;
        pet.stats.evolve().map_err(PetError::from)?;
        // TODO(solana): Magic Action after commit -> update the Core asset's tier attribute + pay the streak bonus into the pet's earnings vault.
        pet.exit(&crate::ID)?;
        let (owner, idx, bump) = (pet.owner, pet.idx, pet.bump);
        let seeds: &[&[u8]] = &[PET, owner.as_ref(), &[idx], &[bump]];
        let a = &ctx.accounts;
        CommitAndUndelegatePermissionCpiBuilder::new(&a.permission_program)
            .authority(&a.owner, true)
            .permissioned_account(&a.pet.to_account_info(), false)
            .permission(&a.permission)
            .magic_program(&a.magic_program)
            .magic_context(&a.magic_context)
            .invoke_signed(&[seeds])?;
        MagicIntentBundleBuilder::new(a.owner.to_account_info(), a.magic_context.to_account_info(), a.magic_program.to_account_info())
            .commit_and_undelegate(&[a.pet.to_account_info()])
            .build_and_invoke()?;
        Ok(())
    }
}

/// The only place real time touches the sim: whole ticks since last_ts.
fn catch_up(pet: &mut Pet) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let n = ((now - pet.last_ts) / TICK_SECS).max(0);
    pet.stats.advance(n.min(u32::MAX as i64) as u32);
    pet.last_ts += n * TICK_SECS;
    Ok(())
}

#[account]
#[derive(InitSpace)]
pub struct Pet {
    pub owner: Pubkey,
    pub idx: u8,
    pub dna: u32,
    pub stats: Stats,
    pub last_ts: i64,
    pub bump: u8,
}

#[derive(Accounts)]
#[instruction(idx: u8)]
pub struct CreatePet<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(init, payer = owner, space = 8 + Pet::INIT_SPACE, seeds = [PET, owner.key().as_ref(), &[idx]], bump)]
    pub pet: Account<'info, Pet>,
    /// CHECK: permission PDA, derived + checked by the permission program
    #[account(mut)]
    pub permission: UncheckedAccount<'info>,
    /// CHECK: MagicBlock permission program
    #[account(address = PERMISSION_PROGRAM_ID)]
    pub permission_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[delegate]
#[derive(Accounts)]
#[instruction(idx: u8)]
pub struct DelegatePet<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: the pet PDA being delegated
    #[account(mut, del, seeds = [PET, owner.key().as_ref(), &[idx]], bump)]
    pub pet: UncheckedAccount<'info>,
    /// CHECK: permission PDA, checked by the permission program
    #[account(mut)]
    pub permission: UncheckedAccount<'info>,
    /// CHECK: delegation buffer of the permission account
    #[account(mut)]
    pub permission_buffer: UncheckedAccount<'info>,
    /// CHECK: delegation record of the permission account
    #[account(mut)]
    pub permission_record: UncheckedAccount<'info>,
    /// CHECK: delegation metadata of the permission account
    #[account(mut)]
    pub permission_metadata: UncheckedAccount<'info>,
    /// CHECK: MagicBlock permission program
    #[account(address = PERMISSION_PROGRAM_ID)]
    pub permission_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct Care<'info> {
    pub signer: Signer<'info>,
    #[account(mut, seeds = [PET, pet.owner.as_ref(), &[pet.idx]], bump = pet.bump)]
    pub pet: Account<'info, Pet>,
}

#[commit]
#[derive(Accounts)]
pub struct Evolve<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut, seeds = [PET, owner.key().as_ref(), &[pet.idx]], bump = pet.bump)]
    pub pet: Account<'info, Pet>,
    /// CHECK: permission PDA, checked by the permission program
    #[account(mut)]
    pub permission: UncheckedAccount<'info>,
    /// CHECK: MagicBlock permission program
    #[account(address = PERMISSION_PROGRAM_ID)]
    pub permission_program: UncheckedAccount<'info>,
}

#[error_code]
pub enum PetError {
    #[msg("pet ran away")]
    Dead,
    #[msg("pet is asleep")]
    Asleep,
    #[msg("too tired to play")]
    Tired,
    #[msg("not enough xp to evolve")]
    NotReady,
    #[msg("already max tier")]
    MaxTier,
    #[msg("pet is sick: care for it first")]
    Sick,
    #[msg("not the owner")]
    NotOwner,
    #[msg("unknown action")]
    BadAction,
    #[msg("roster full")]
    RosterFull,
    #[msg("cooldown: try again in a few ticks")]
    Cooldown,
}

impl From<SimError> for PetError {
    fn from(e: SimError) -> Self {
        match e {
            SimError::Dead => PetError::Dead,
            SimError::Asleep => PetError::Asleep,
            SimError::Tired => PetError::Tired,
            SimError::NotReady => PetError::NotReady,
            SimError::MaxTier => PetError::MaxTier,
            SimError::Sick => PetError::Sick,
            SimError::Cooldown => PetError::Cooldown,
            SimError::BadAction => PetError::BadAction,
        }
    }
}
