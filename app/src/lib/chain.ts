import { Buffer } from 'buffer';
import { AnchorProvider, Program, type Idl } from '@coral-xyz/anchor';
import {
  ComputeBudgetProgram, Connection, Keypair, LAMPORTS_PER_SOL, PublicKey,
  SystemProgram, Transaction, VersionedTransaction, sendAndConfirmTransaction,
} from '@solana/web3.js';
import idlJson from '../idl/zk_genome.json';
import { config, requireLabAuthority } from './config';
import { toArr, toBE32 } from './field';
import { formatProofForSolana } from './format';
import { circuitInput, deriveToken, type Genome } from './genome';
import { prove } from './prover';

/* eslint-disable @typescript-eslint/no-explicit-any */
const idl = idlJson as unknown as Idl;
export const PROGRAM_ID = new PublicKey((idl as any).address);
export const connection = new Connection(config.rpcUrl, 'confirmed');

export const EPOCH_SECONDS = 7 * 24 * 60 * 60; // must match EPOCH_SECONDS in the program
const COMPUTE_UNITS = 400_000;

/* ---------- identities ---------- */

/** Minimal wallet over a burner keypair — enough for AnchorProvider. */
class BurnerWallet {
  constructor(readonly payer: Keypair) {}
  get publicKey() { return this.payer.publicKey; }
  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if (tx instanceof VersionedTransaction) tx.sign([this.payer]);
    else tx.partialSign(this.payer);
    return tx;
  }
  async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
    return Promise.all(txs.map((t) => this.signTransaction(t)));
  }
}

export interface Identity {
  label: string;
  keypair: Keypair;
  program: Program<Idl>;
  genome: Genome;
}

export function makeIdentity(label: string, keypair: Keypair, genome: Genome): Identity {
  const provider = new AnchorProvider(connection, new BurnerWallet(keypair) as any, { commitment: 'confirmed' });
  return { label, keypair, genome, program: new Program(idl, provider) };
}

/* ---------- PDAs (seeds must match the program) ---------- */

const pda = (seeds: (Buffer | Uint8Array)[]) => PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
export const genomePda = (user: PublicKey) => pda([Buffer.from('genome'), user.toBuffer()]);
export const labPda = (authority: PublicKey) => pda([Buffer.from('lab'), authority.toBuffer()]);
export const tokenPda = (token: Uint8Array) => pda([Buffer.from('token'), Buffer.from(token)]);
export const consentPda = (a: PublicKey, b: PublicKey) => pda([Buffer.from('consent'), a.toBuffer(), b.toBuffer()]);

/** Byte-wise order, matching Rust's derived Ord on Pubkey. */
export function orderedPair(x: PublicKey, y: PublicKey): [PublicKey, PublicKey] {
  return Buffer.compare(x.toBuffer(), y.toBuffer()) < 0 ? [x, y] : [y, x];
}

export const currentLab = () => labPda(new PublicKey(requireLabAuthority()));

/* ---------- time ---------- */

/** Epoch from chain time, not the browser clock, so proofs agree with the program's check. */
export async function chainEpoch(): Promise<number> {
  const slot = await connection.getSlot('confirmed');
  const t = await connection.getBlockTime(slot);
  return Math.floor((t ?? Math.floor(Date.now() / 1000)) / EPOCH_SECONDS);
}

/* ---------- reads ---------- */

export interface ProfileState { registered: boolean; rootMatches: boolean }

export async function fetchProfile(id: Identity): Promise<ProfileState> {
  const acct: any = await (id.program.account as any).genomeProfile.fetchNullable(genomePda(id.keypair.publicKey));
  if (!acct) return { registered: false, rootMatches: true };
  const onChain = Buffer.from(acct.merkleRoot as number[]);
  return { registered: true, rootMatches: onChain.equals(Buffer.from(toBE32(id.genome.root))) };
}

export interface TokenRow { index: number; token: Uint8Array; pda: PublicKey; holders: PublicKey[] }

/** Token accounts for the given segments of one genome, in this epoch. Missing accounts have no holders. */
export async function fetchTokenRows(genome: Genome, indices: number[], epoch: number): Promise<TokenRow[]> {
  const tokens = await Promise.all(indices.map(async (i) => toBE32(await deriveToken(i, genome.segmentHashes[i], epoch))));
  const pdas = tokens.map(tokenPda);
  const infos: any[] = [];
  const reader = new Program(idl, { connection } as any);
  for (let i = 0; i < pdas.length; i += 100) {
    infos.push(...(await (reader.account as any).tokenEntry.fetchMultiple(pdas.slice(i, i + 100))));
  }
  return indices.map((index, k) => ({
    index, token: tokens[k], pda: pdas[k], holders: (infos[k]?.holders ?? []) as PublicKey[],
  }));
}

export interface Match { counterparty: PublicKey; indices: number[]; accounts: PublicKey[] }

/** Groups this identity's matched segments by the other account on each token. */
export function matchesFrom(rows: TokenRow[], me: PublicKey): Match[] {
  const byParty = new Map<string, Match>();
  for (const row of rows) {
    if (!row.holders.some((h) => h.equals(me))) continue;
    for (const h of row.holders) {
      if (h.equals(me)) continue;
      const key = h.toBase58();
      const m = byParty.get(key) ?? { counterparty: h, indices: [], accounts: [] };
      m.indices.push(row.index);
      m.accounts.push(row.pda);
      byParty.set(key, m);
    }
  }
  return [...byParty.values()].sort((x, y) => y.indices.length - x.indices.length);
}

export async function consentStatus(id: Identity, counterparty: PublicKey) {
  const me = id.keypair.publicKey;
  const [a, b] = orderedPair(me, counterparty);
  const c: any = await (id.program.account as any).consent.fetchNullable(consentPda(a, b));
  if (!c) return { me: false, them: false };
  const meIsA = (c.a as PublicKey).equals(me);
  return { me: meIsA ? c.aOk : c.bOk, them: meIsA ? c.bOk : c.aOk } as { me: boolean; them: boolean };
}

/* ---------- writes ---------- */

export async function registerGenome(id: Identity): Promise<string> {
  const user = id.keypair.publicKey;
  return (id.program.methods as any)
    .registerGenome(toArr(toBE32(id.genome.root)))
    .accountsStrict({ user, lab: currentLab(), genomeProfile: genomePda(user), systemProgram: SystemProgram.programId })
    .rpc();
}

/** Prove one segment in the worker, then post it. Returns the tx signature and the token's holder count after posting. */
export async function postSegment(id: Identity, index: number, epoch: number) {
  const user = id.keypair.publicKey;
  const { input, token } = await circuitInput(id.genome, index, epoch);
  const { proof, publicSignals } = await prove(input);
  if (publicSignals[5] !== token) {
    throw new Error('Public signal order does not match the program. Check public.json after recompiling the circuit.');
  }
  const f = formatProofForSolana(proof, publicSignals);
  const tokenBytes = toBE32(token);
  const tokenEntry = tokenPda(tokenBytes);

  const signature: string = await (id.program.methods as any)
    .postToken(toArr(f.proofA), toArr(f.proofB), toArr(f.proofC), f.inputs.map(toArr))
    .accountsStrict({ user, genomeProfile: genomePda(user), lab: currentLab(), tokenEntry, systemProgram: SystemProgram.programId })
    .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: COMPUTE_UNITS })])
    .rpc();

  const entry: any = await (id.program.account as any).tokenEntry.fetchNullable(tokenEntry);
  return { signature, holders: (entry?.holders?.length ?? 1) as number };
}

export async function allowContact(id: Identity, counterparty: PublicKey): Promise<string> {
  const user = id.keypair.publicKey;
  const [a, b] = orderedPair(user, counterparty);
  return (id.program.methods as any)
    .consent(a, b)
    .accountsStrict({ user, consent: consentPda(a, b), systemProgram: SystemProgram.programId })
    .rpc();
}

/** Tops a burner up from the devnet funder if configured, otherwise asks the faucet. */
export const FUND_SOL = 0.3;

export async function fund(pubkey: PublicKey, sol = FUND_SOL): Promise<number> {
  const lamports = Math.round(sol * LAMPORTS_PER_SOL);
  if (config.funderSecret) {
    const funder = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(config.funderSecret)));
    const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: pubkey, lamports }));
    await sendAndConfirmTransaction(connection, tx, [funder]);
  } else {
    const sig = await connection.requestAirdrop(pubkey, lamports);
    await connection.confirmTransaction({ signature: sig, ...(await connection.getLatestBlockhash()) });
  }
  return (await connection.getBalance(pubkey)) / LAMPORTS_PER_SOL;
}

export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
export const explorerAccount = (key: PublicKey) => `https://explorer.solana.com/address/${key.toBase58()}/anchor-account?cluster=devnet`;

/* ---------- errors, in the interface's voice ---------- */

const PROGRAM_ERRORS: Record<string, string> = {
  RootMismatch: 'This genome does not match the one registered for this account. Start a new session.',
  UnknownLab: 'The lab key is not registered. Run `npm run register-lab` and check VITE_LAB_AUTHORITY.',
  StaleEpoch: 'The epoch changed while proving. Publish again to use the new one.',
  NotOwner: 'This account does not own that genome profile.',
  NotParty: 'This account is not part of that match.',
  TokenFull: 'That segment already has the maximum number of holders.',
  AlreadyPosted: 'That segment is already published for this account.',
  ProofParsingFailed: 'The chain could not read the proof. Check the proof encoding against groth16-solana.',
  InvalidProof: 'The chain rejected the proof. Check that the circuit files match the deployed verifying key.',
};

export function explain(err: unknown): string {
  const e = err as any;
  const code: string | undefined = e?.error?.errorCode?.code;
  if (code && PROGRAM_ERRORS[code]) return PROGRAM_ERRORS[code];
  const text = String(e?.message ?? e);
  if (/insufficient (funds|lamports)|debit an account/i.test(text)) return 'Not enough test SOL. Press Create account again, then retry.';
  if (/429|too many requests|rate limit/i.test(text)) return 'The RPC endpoint is rate-limiting. Wait a moment, or set VITE_RPC_URL to a provider endpoint.';
  if (/airdrop/i.test(text)) return 'The devnet faucet refused the airdrop. Use faucet.solana.com or set VITE_DEMO_FUNDER_SECRET.';
  if (/circuits\/segment/i.test(text) || /Failed to fetch/i.test(text)) return 'Prover files are missing. Run `npm run sync-circuit` after compiling the circuit.';
  return text;
}
