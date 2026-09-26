use anchor_lang::prelude::*;
use groth16_solana::groth16::Groth16Verifier;

mod verifying_key;
use verifying_key::VERIFYINGKEY;

declare_id!("9q6kP67QT8gwSwszckPaU1b9wvV1qMjzLJg3C1NwRDtP");

pub const EPOCH_SECONDS: i64 = 7 * 24 * 60 * 60;
pub const MAX_HOLDERS: usize = 16;
pub const ADMIN: Pubkey = pubkey!("9vtqstu6MWVkJyE9988XNQqgGo5ga3pDjp9CNw77iU8A");

// epoch as a 32-byte big-endian field element
pub fn epoch_bytes(epoch: i64) -> [u8; 32] {
    let mut out = [0u8; 32];
    out[24..].copy_from_slice(&(epoch as u64).to_be_bytes());
    out
}

// token bytes used as the token account seed
pub fn token_seed(public_inputs: &[[u8; 32]; 6]) -> &[u8] {
    &public_inputs[5]
}

// genome matching program
#[program]
pub mod zk_genome {
    use super::*;

    // register a lab key
    pub fn register_lab(ctx: Context<RegisterLab>, pub_x: [u8; 32], pub_y: [u8; 32]) -> Result<()> {
        let lab = &mut ctx.accounts.lab;
        lab.authority = ctx.accounts.authority.key();
        lab.pub_x = pub_x;
        lab.pub_y = pub_y;
        Ok(())
    }

    // register a genome root
    pub fn register_genome(ctx: Context<RegisterGenome>, root: [u8; 32]) -> Result<()> {
        let p = &mut ctx.accounts.genome_profile;
        p.owner = ctx.accounts.user.key();
        p.merkle_root = root;
        p.lab = ctx.accounts.lab.key();
        Ok(())
    }

    // verify a segment proof and post its token
    pub fn post_token(
        ctx: Context<PostToken>,
        proof_a: [u8; 64],
        proof_b: [u8; 128],
        proof_c: [u8; 64],
        public_inputs: [[u8; 32]; 6],
    ) -> Result<()> {
        let profile = &ctx.accounts.genome_profile;
        let lab = &ctx.accounts.lab;

        let now = Clock::get()?.unix_timestamp / EPOCH_SECONDS;
        let epoch_ok = public_inputs[4] == epoch_bytes(now)
            || public_inputs[4] == epoch_bytes(now - 1);

        require!(public_inputs[0] == profile.merkle_root, GenomeError::RootMismatch);
        require!(public_inputs[1] == lab.pub_x, GenomeError::UnknownLab);
        require!(public_inputs[2] == lab.pub_y, GenomeError::UnknownLab);
        require!(epoch_ok, GenomeError::StaleEpoch);
        require!(profile.lab == lab.key(), GenomeError::UnknownLab);

        // proof_a is negated by the client
        let mut verifier = Groth16Verifier::new(
            &proof_a, &proof_b, &proof_c, &public_inputs, &VERIFYINGKEY,
        )
        .map_err(|_| GenomeError::ProofParsingFailed)?;
        verifier.verify().map_err(|_| GenomeError::InvalidProof)?;

        let entry = &mut ctx.accounts.token_entry;
        if entry.holders.is_empty() {
            entry.token = public_inputs[5];
        }
        require!(entry.holders.len() < MAX_HOLDERS, GenomeError::TokenFull);
        require!(!entry.holders.contains(&profile.owner), GenomeError::AlreadyPosted);
        entry.holders.push(profile.owner);

        if entry.holders.len() > 1 {
            emit!(SegmentMatch {
                token: public_inputs[5],
                holders: entry.holders.clone(),
                epoch: public_inputs[4],
            });
        }
        Ok(())
    }

    // record consent for a matched pair
    pub fn consent(ctx: Context<GiveConsent>, a: Pubkey, b: Pubkey) -> Result<()> {
        let me = ctx.accounts.user.key();
        let c = &mut ctx.accounts.consent;
        if c.a == Pubkey::default() {
            require!(a < b, GenomeError::NotParty);
            c.a = a;
            c.b = b;
        }
        let was_unlocked = c.a_ok && c.b_ok;
        if me == c.a {
            c.a_ok = true;
        } else if me == c.b {
            c.b_ok = true;
        } else {
            return err!(GenomeError::NotParty);
        }

        if c.a_ok && c.b_ok && !was_unlocked {
            emit!(ContactUnlocked { a: c.a, b: c.b });
        }
        Ok(())
    }
}

#[event]
pub struct SegmentMatch {
    pub token: [u8; 32],
    pub holders: Vec<Pubkey>,
    pub epoch: [u8; 32],
}

#[event]
pub struct ContactUnlocked {
    pub a: Pubkey,
    pub b: Pubkey,
}

#[derive(Accounts)]
pub struct RegisterLab<'info> {
    #[account(mut, address = ADMIN @ GenomeError::NotAdmin)]
    pub authority: Signer<'info>,
    #[account(init, payer = authority, space = 8 + Lab::INIT_SPACE,
              seeds = [b"lab", authority.key().as_ref()], bump)]
    pub lab: Account<'info, Lab>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterGenome<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    pub lab: Account<'info, Lab>,
    #[account(init, payer = user, space = 8 + GenomeProfile::INIT_SPACE,
              seeds = [b"genome", user.key().as_ref()], bump)]
    pub genome_profile: Account<'info, GenomeProfile>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(proof_a: [u8; 64], proof_b: [u8; 128], proof_c: [u8; 64], public_inputs: [[u8; 32]; 6])]
pub struct PostToken<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        seeds = [b"genome", user.key().as_ref()],
        bump,
        constraint = genome_profile.owner == user.key() @ GenomeError::NotOwner
    )]
    pub genome_profile: Account<'info, GenomeProfile>,

    pub lab: Account<'info, Lab>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + TokenEntry::INIT_SPACE,
        seeds = [b"token", token_seed(&public_inputs)],
        bump
    )]
    pub token_entry: Account<'info, TokenEntry>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(a: Pubkey, b: Pubkey)]
pub struct GiveConsent<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + Consent::INIT_SPACE,
        seeds = [b"consent", a.as_ref(), b.as_ref()],
        bump
    )]
    pub consent: Account<'info, Consent>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct GenomeProfile {
    pub owner: Pubkey,
    pub merkle_root: [u8; 32],
    pub lab: Pubkey,
}

#[account]
#[derive(InitSpace)]
pub struct Lab {
    pub authority: Pubkey,
    pub pub_x: [u8; 32],
    pub pub_y: [u8; 32],
}

#[account]
#[derive(InitSpace)]
pub struct TokenEntry {
    pub token: [u8; 32],
    #[max_len(16)]
    pub holders: Vec<Pubkey>,
}

#[account]
#[derive(InitSpace)]
pub struct Consent {
    pub a: Pubkey,
    pub b: Pubkey,
    pub a_ok: bool,
    pub b_ok: bool,
}

#[error_code]
pub enum GenomeError {
    #[msg("Merkle root does not match the registered profile.")]
    RootMismatch,
    #[msg("Lab is not registered or does not match the profile.")]
    UnknownLab,
    #[msg("Proof is for an epoch that is no longer accepted.")]
    StaleEpoch,
    #[msg("Caller does not own this profile.")]
    NotOwner,
    #[msg("Caller is not a party to this consent record.")]
    NotParty,
    #[msg("This token already has the maximum holders.")]
    TokenFull,
    #[msg("This user already posted this token.")]
    AlreadyPosted,
    #[msg("Proof could not be parsed.")]
    ProofParsingFailed,
    #[msg("Proof is invalid.")]
    InvalidProof,
    #[msg("Only the admin can register a lab.")]
    NotAdmin,
}
