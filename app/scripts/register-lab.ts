// One-time setup after deploying the program: registers the demo lab's EdDSA public key.
// Uses your Solana CLI wallet (~/.config/solana/id.json) as the lab authority.
//   npm run register-lab            (devnet by default; set RPC_URL to override)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AnchorProvider, Program, Wallet, type Idl } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { buildEddsa } from 'circomlibjs';
import { DEMO_LAB_PRV } from '../src/lib/labKey';

const toBE32 = (v: bigint) => Array.from(Buffer.from(v.toString(16).padStart(64, '0'), 'hex'));

async function main() {
  const idl = JSON.parse(fs.readFileSync(new URL('../src/idl/zk_genome.json', import.meta.url), 'utf8')) as Idl;
  const secret = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/solana/id.json'), 'utf8'));
  const authority = Keypair.fromSecretKey(Uint8Array.from(secret));
  const connection = new Connection(process.env.RPC_URL ?? 'https://api.devnet.solana.com', 'confirmed');
  const program = new Program(idl, new AnchorProvider(connection, new Wallet(authority), { commitment: 'confirmed' }));

  const eddsa = await buildEddsa();
  const pub = eddsa.prv2pub(Buffer.from(DEMO_LAB_PRV));
  const x = toBE32(eddsa.F.toObject(pub[0]));
  const y = toBE32(eddsa.F.toObject(pub[1]));
  const lab = PublicKey.findProgramAddressSync([Buffer.from('lab'), authority.publicKey.toBuffer()], program.programId)[0];

  if (await connection.getAccountInfo(lab)) {
    console.log(`Lab already registered at ${lab.toBase58()}.`);
  } else {
    const sig = await (program.methods as any)
      .registerLab(x, y)
      .accountsStrict({ authority: authority.publicKey, lab, systemProgram: SystemProgram.programId })
      .rpc();
    console.log(`Lab registered at ${lab.toBase58()} (tx ${sig}).`);
  }
  console.log(`\nAdd to app/.env:\nVITE_LAB_AUTHORITY=${authority.publicKey.toBase58()}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
