import anchor from "@coral-xyz/anchor";
import { ComputeBudgetProgram, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import * as snarkjs from "snarkjs";
import { buildEddsa } from "circomlibjs";
import { buildGenome, circuitInput, syntheticRelatives, type Genome } from "../app/src/lib/genome.ts";
import { formatProofForSolana } from "../app/src/lib/format.ts";
import { toBE32 } from "../app/src/lib/field.ts";
import { DEMO_LAB_PRV } from "../app/src/lib/labKey.ts";

const WASM = "build/segment_js/segment.wasm";
const ZKEY = "build/segment_final.zkey";
const EPOCH_SECONDS = 7 * 24 * 60 * 60;

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const program = anchor.workspace.zkGenome;
const connection = provider.connection;
const admin = provider.wallet.publicKey;

type Proof = ReturnType<typeof formatProofForSolana>;
const arr = (u: Uint8Array) => Array.from(u);
const pda = (...seeds: (Buffer | Uint8Array)[]) =>
  PublicKey.findProgramAddressSync(seeds, program.programId)[0];
const genomePda = (user: PublicKey) => pda(Buffer.from("genome"), user.toBuffer());
const labPda = (authority: PublicKey) => pda(Buffer.from("lab"), authority.toBuffer());
const tokenPda = (token: Uint8Array) => pda(Buffer.from("token"), token);
const consentPda = (a: PublicKey, b: PublicKey) => pda(Buffer.from("consent"), a.toBuffer(), b.toBuffer());
const ordered = (x: PublicKey, y: PublicKey) =>
  Buffer.compare(x.toBuffer(), y.toBuffer()) < 0 ? [x, y] : [y, x];

// funded wallet
async function newUser() {
  const kp = Keypair.generate();
  const sig = await connection.requestAirdrop(kp.publicKey, 10 * LAMPORTS_PER_SOL);
  await connection.confirmTransaction({ signature: sig, ...(await connection.getLatestBlockhash()) });
  return kp;
}

// epoch from chain time
async function chainEpoch() {
  const t = await connection.getBlockTime(await connection.getSlot("confirmed"));
  return Math.floor(t! / EPOCH_SECONDS);
}

// genome re-signed with another lab key
async function resign(g: Genome, prv: Uint8Array): Promise<Genome> {
  const eddsa = await buildEddsa();
  const sig = eddsa.signPoseidon(Buffer.from(prv), eddsa.F.e(BigInt(g.root)));
  const pub = eddsa.prv2pub(Buffer.from(prv));
  return {
    ...g,
    signature: {
      R8x: eddsa.F.toObject(sig.R8[0]).toString(),
      R8y: eddsa.F.toObject(sig.R8[1]).toString(),
      S: sig.S.toString(),
    },
    lab: { x: eddsa.F.toObject(pub[0]).toString(), y: eddsa.F.toObject(pub[1]).toString() },
  };
}

// segment proof in solana bytes
async function prove(g: Genome, index: number, epoch: number): Promise<Proof> {
  const { input } = await circuitInput(g, index, epoch);
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
  return formatProofForSolana(proof, publicSignals);
}

async function registerGenome(user: Keypair, g: Genome) {
  await program.methods
    .registerGenome(arr(toBE32(g.root)))
    .accountsStrict({
      user: user.publicKey, lab: labPda(admin),
      genomeProfile: genomePda(user.publicKey), systemProgram: SystemProgram.programId,
    })
    .signers([user])
    .rpc({ commitment: "confirmed" });
}

async function post(user: Keypair, p: Proof, profileOwner = user.publicKey) {
  return program.methods
    .postToken(arr(p.proofA), arr(p.proofB), arr(p.proofC), p.inputs.map(arr))
    .accountsStrict({
      user: user.publicKey, genomeProfile: genomePda(profileOwner), lab: labPda(admin),
      tokenEntry: tokenPda(p.inputs[5]), systemProgram: SystemProgram.programId,
    })
    .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })])
    .signers([user])
    .rpc({ commitment: "confirmed" });
}

async function consent(user: Keypair, other: PublicKey) {
  const [a, b] = ordered(user.publicKey, other);
  return program.methods
    .consent(a, b)
    .accountsStrict({ user: user.publicKey, consent: consentPda(a, b), systemProgram: SystemProgram.programId })
    .signers([user])
    .rpc({ commitment: "confirmed" });
}

// events and compute units from a confirmed tx
async function txInfo(sig: string) {
  const tx = await connection.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  const parser = new anchor.EventParser(program.programId, new anchor.BorshCoder(program.idl));
  return { events: [...parser.parseLogs(tx!.meta!.logMessages!)], units: tx!.meta!.computeUnitsConsumed };
}

async function expectError(p: Promise<unknown>, ...codes: string[]) {
  try {
    await p;
    expect.fail("should have thrown");
  } catch (e: any) {
    expect(e.error?.errorCode?.code, String(e)).to.be.oneOf(codes);
  }
}

describe("zk_genome", () => {
  let cousinA: Keypair, cousinB: Keypair, stranger: Keypair, forger: Keypair;
  let gA: Genome, gB: Genome, gC: Genome, gForged: Genome;
  let epoch: number;

  before(async () => {
    [cousinA, cousinB, stranger, forger] = await Promise.all([newUser(), newUser(), newUser(), newUser()]);
    const [ma, mb] = syntheticRelatives(777);
    const [mc] = syntheticRelatives(4242);
    [gA, gB, gC] = await Promise.all([buildGenome(ma), buildGenome(mb), buildGenome(mc)]);
    gForged = await resign(gC, Uint8Array.from({ length: 32 }, (_, i) => i + 1));
    epoch = await chainEpoch();

    const eddsa = await buildEddsa();
    const pub = eddsa.prv2pub(Buffer.from(DEMO_LAB_PRV));
    await program.methods
      .registerLab(arr(toBE32(eddsa.F.toObject(pub[0]))), arr(toBE32(eddsa.F.toObject(pub[1]))))
      .accountsStrict({ authority: admin, lab: labPda(admin), systemProgram: SystemProgram.programId })
      .rpc({ commitment: "confirmed" });

    await registerGenome(cousinA, gA);
    await registerGenome(cousinB, gB);
    await registerGenome(stranger, gC);
    await registerGenome(forger, gForged);
  });

  it("only the admin can register a lab", async () => {
    await expectError(
      program.methods
        .registerLab(arr(toBE32(1)), arr(toBE32(2)))
        .accountsStrict({ authority: stranger.publicKey, lab: labPda(stranger.publicKey), systemProgram: SystemProgram.programId })
        .signers([stranger])
        .rpc(),
      "NotAdmin",
    );
  });

  it("matches cousins on a shared segment", async () => {
    const first = await txInfo(await post(cousinA, await prove(gA, 41, epoch)));
    const second = await txInfo(await post(cousinB, await prove(gB, 41, epoch)));
    console.log(`      compute units: first post ${first.units}, second post ${second.units}`);

    expect(first.events).to.have.length(0);
    expect(second.events).to.have.length(1);
    expect(second.events[0].name).to.equal("segmentMatch");
    const holders = second.events[0].data.holders.map((h: PublicKey) => h.toBase58());
    expect(holders).to.have.members([cousinA.publicKey.toBase58(), cousinB.publicKey.toBase58()]);

    const [pa, pb] = [await prove(gA, 41, epoch), await prove(gB, 41, epoch)];
    expect(Buffer.from(pa.inputs[5]).equals(Buffer.from(pb.inputs[5]))).to.equal(true);
    const entry = await program.account.tokenEntry.fetch(tokenPda(pa.inputs[5]));
    expect(entry.holders).to.have.length(2);
    expect(Buffer.from(entry.token).equals(Buffer.from(pa.inputs[5]))).to.equal(true);
  });

  it("does not match unrelated segments", async () => {
    const pa = await prove(gA, 7, epoch);
    const pb = await prove(gB, 7, epoch);
    const a = await txInfo(await post(cousinA, pa));
    const b = await txInfo(await post(cousinB, pb));

    expect(a.events).to.have.length(0);
    expect(b.events).to.have.length(0);
    expect(tokenPda(pa.inputs[5]).equals(tokenPda(pb.inputs[5]))).to.equal(false);
    expect((await program.account.tokenEntry.fetch(tokenPda(pa.inputs[5]))).holders).to.have.length(1);
    expect((await program.account.tokenEntry.fetch(tokenPda(pb.inputs[5]))).holders).to.have.length(1);
  });

  it("rejects the same user posting a token twice", async () => {
    await expectError(post(cousinA, await prove(gA, 41, epoch)), "AlreadyPosted");
  });

  it("rejects a proof built against a different root", async () => {
    await expectError(post(cousinA, await prove(gC, 3, epoch)), "RootMismatch");
  });

  it("rejects a genome signed by an unregistered lab key", async () => {
    await expectError(post(forger, await prove(gForged, 3, epoch)), "UnknownLab");
  });

  it("rejects an epoch two periods old", async () => {
    await expectError(post(cousinA, await prove(gA, 50, epoch - 2)), "StaleEpoch");
  });

  it("rejects a tampered proof", async () => {
    const p = await prove(gA, 60, epoch);
    p.proofC[40] ^= 1;
    await expectError(post(cousinA, p), "InvalidProof");
  });

  it("rejects another wallet posting with your profile", async () => {
    await expectError(post(stranger, await prove(gA, 61, epoch), cousinA.publicKey), "NotOwner", "ConstraintSeeds");
  });

  it("unlocks contact once both parties consent", async () => {
    const first = await txInfo(await consent(cousinA, cousinB.publicKey));
    const second = await txInfo(await consent(cousinB, cousinA.publicKey));
    const again = await txInfo(await consent(cousinA, cousinB.publicKey));

    expect(first.events).to.have.length(0);
    expect(second.events).to.have.length(1);
    expect(second.events[0].name).to.equal("contactUnlocked");
    expect(again.events).to.have.length(0);

    const [a, b] = ordered(cousinA.publicKey, cousinB.publicKey);
    const c = await program.account.consent.fetch(consentPda(a, b));
    expect(c.aOk && c.bOk).to.equal(true);
  });

  it("rejects consent from a third wallet", async () => {
    const [a, b] = ordered(cousinA.publicKey, cousinB.publicKey);
    await expectError(
      program.methods
        .consent(a, b)
        .accountsStrict({ user: stranger.publicKey, consent: consentPda(a, b), systemProgram: SystemProgram.programId })
        .signers([stranger])
        .rpc(),
      "NotParty",
    );
  });
});
