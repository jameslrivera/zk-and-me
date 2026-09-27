<p align="center"><img src="app/public/favicon.svg" alt="zk and me logo" width="96" height="96" /></p>

<h1 align="center">zk and me</h1>

<p align="center"><strong>Find your relatives. Keep your DNA.</strong></p>

<p align="center">This project was built for <strong>HackGT 13</strong> at the <strong>Georgia Institute of Technology</strong>.</p>

<p align="center">
  <a href="https://zk-and-me.netlify.app">Try it out</a> ·
  <a href="https://github.com/jameslrivera/zk-and-me">Source code</a> ·
  <a href="https://explorer.solana.com/address/9q6kP67QT8gwSwszckPaU1b9wvV1qMjzLJg3C1NwRDtP?cluster=devnet">Program on Solana Explorer</a>
</p>

---

**zk and me** is a decentralized, privacy-preserving genetic matching network. It eliminates the need for a centralized database.

zk and me solves the massive security and privacy risks of centralized DNA databases, like the recent 23andMe breaches, by keeping your genetic data entirely on your own device. Instead of handing over your genome to a company, your local browser securely converts your DNA segments into mathematical hashes and generates zero-knowledge proofs to verify their authenticity. These proofs and tokens are then submitted to the Solana blockchain, where relatives who share identical DNA segments will naturally collide on the exact same account address to form a match. By replacing vulnerable corporate servers with Solana's decentralized architecture, users can safely discover their family connections without ever exposing or risking their most intimate biological data.

## Inspiration

You can change a leaked password. You cannot change a leaked genome.

In October 2023, hackers breached 23andMe. By compromising just [14,000 accounts](https://www.hipaajournal.com/23andme-user-data-stolen-credential-stuffing-campaign/), they scraped the genetic data, ancestry reports, and family trees of **[6.9 million people](https://www.23andme.org/blog/articles/addressing-data-security-concerns)**.

Then, in 2025, 23andMe went bankrupt. The DNA of 15 million customers was suddenly treated as a distressed corporate asset. Despite [lawsuits from 28 attorneys general](https://www.npr.org/2025/06/10/nx-s1-5429041/23andme-states-lawsuit-genetic-data), the [court allowed](https://www.npr.org/2025/06/30/nx-s1-5451398/23andme-sale-approved-dna-data) a [$305 million sale](https://mediacenter.23andme.com/press-releases/23andme-receives-court-approval-sale-ttam-research-institute/) of the database to go through.

Both of these catastrophic failures stem from a fundamental architectural flaw: **to tell you who your relatives are, a centralized company has to hold everyone's DNA in one giant honeypot.** If their servers get hacked, your DNA is leaked. If their business goes under, your DNA is sold. You can reset a leaked password, but you can't reset your genome.

I wanted to know: is it possible to find your relatives and connect with them, while keeping your DNA strictly on your own device?

## What it does

**zk and me** is a decentralized, privacy-preserving genetic matching network. It eliminates the need for a centralized database.

Here is how it works:

1. A lab sequences your DNA and digitally signs a "fingerprint" of it. **Your actual DNA is sent to your device and never leaves it.**
2. In your browser, your DNA is chopped into 128 segments. Each segment is mathematically hashed into a unique token.
3. Your browser generates a **zero-knowledge proof (ZK proof)** for each segment. This proof says: *"I have an authentic, lab-verified DNA segment that hashes into this token."*
4. You submit ONLY the tokens and the proofs to the Solana blockchain.
5. Because relatives share identical stretches of DNA, they generate the exact same tokens. When your relative posts their token, it naturally collides with yours on-chain. **That collision is the match.**

You find your family, but the blockchain only stores random-looking hashes. There is no DNA database to hack, and no data worth selling.

## Background

### Zero-knowledge proofs

A zero-knowledge proof lets you prove a statement is true without showing the underlying data. The person checking the proof only learns whether it's valid or not. For example, proving to a bouncer that you are over 21 without showing them your ID: they never learn your birthdate, but they can be sure you are over 21.

For this project, I used Groth16 proofs on the BN254 elliptic curve, which Solana supports natively. Every zero-knowledge proof must fulfill these three properties:

- **Completeness:** If the statement is genuinely true, an honest prover will always successfully convince the verifier.
- **Soundness:** If the statement is false, it is practically impossible for a cheating prover to trick the verifier into believing it is true.
- **Zero knowledge:** The verifier learns absolutely nothing about the underlying secret data other than the simple fact that the statement is true.

### Solana

Matching genomes requires millions of micro-transactions. If a million users publish 64 segments each, that's 64 million proof-verified writes. This design relies on specific architectural strengths of Solana to make that workload possible:

- **Native ZK verification:** Solana exposes BN254 elliptic-curve operations (the `alt_bn128` syscalls) directly to developers, so complex zero-knowledge math runs natively on-chain.
- **The account model:** Solana's deterministic Program Derived Addresses (PDAs) turn standard state storage into a highly efficient routing and collision engine.
- **Micro-transaction economics:** The first relative to post a token pays a tiny rent deposit (~0.0035 SOL). The second relative pays nothing. On chains with high gas fees, uploading 64 segments per person would bankrupt the user; on Solana, it costs pennies.
- **Parallel execution:** Since almost every token is unique to one person, transactions don't block each other. Solana processes these non-overlapping account writes in parallel, allowing for massive scale.

## How I built it

**1. The circuit and cryptography (Circom, snarkjs and Groth16)**
I wrote a custom circuit in Circom that translates the privacy logic into a Rank-1 Constraint System (R1CS) with 12,848 constraints. Your genome is cut into 128 windows and committed to a Merkle tree using Poseidon hashing. For each segment you publish, the circuit proves three things: the segment actually belongs in your tree at that specific position, an accredited lab's EdDSA signature covers the tree's root, and the output "token" is the correct hash of the segment, its position, and the current week.

To make this cheap to verify on a blockchain, I used the Groth16 proving system over the BN254 elliptic curve, with a trusted setup built on the Perpetual Powers of Tau ceremony. This shrinks all that heavy math into a tiny 256-byte proof. It compiles to WebAssembly and runs locally in a background browser thread, taking a few seconds per proof.

**2. The smart contract (Rust, Anchor and Solana PDAs)**
I wrote an Anchor program on Solana to handle the proof verification and the relative matching. When a user submits a token, the program first checks that the public inputs match our on-chain registry so nobody can use a fake lab. Then it uses Solana's native `alt_bn128` syscalls to run the Groth16 pairing check and verify the zero-knowledge proof directly on-chain.

To handle the matching, I used Solana's account model instead of a traditional database. The program takes the token hash from the circuit and uses it as a seed to derive a Program Derived Address. If two people share the same DNA segment, they generate the identical token hash. That means both transactions point to the exact same account address. When a second user writes to that account, that on-chain collision registers the match.

**3. The frontend (Vite and React)**
I built a clean, static single-page app where everything sensitive happens client-side. The app reads the DNA file, builds the tree, and handles the cryptography locally. To make it easy to test, the demo can run two identities side by side to show a real-time match without ever transmitting a single genomic marker to a server.

## Challenges I ran into

**There is no ready-made path from Circom to Solana.**
Ethereum's toolchain emits a Solidity verifier in a single command. Solana provides the raw curve syscalls and the `groth16-solana` crate, but connecting them to Circom's output is entirely up to you. I had to convert the verifying key into Rust and match the proof encoding byte for byte to ensure the program could actually read and verify the proofs generated in the browser.

## Accomplishments that I'm proud of

- Successfully verifying real Groth16 proofs on-chain on Solana devnet.
- Building a complete test suite (11 program tests, 12 circuit tests) that proves the system rejects forged tokens, stolen profiles, and tampered proofs.
- Building a database-less matching engine using Solana's PDA architecture.

## What I learned

- How to get a zero-knowledge proof to verify on-chain using Solana's curve syscalls.
- How a trusted setup (like the Powers of Tau) works, and why it is secure as long as a single participant destroys their random data.
- How to deploy Rust smart contracts, and how Solana's PDAs can replace a traditional backend database.
- How raw consumer DNA text files are structured, and how to translate genetic markers into math the circuit can process.

## What's next

**Zero-knowledge machine learning (ZKML)**

Currently, the system relies on exact token collisions, meaning a single sequencing error or tiny mutation breaks a match on that segment.

To solve this, the next major step is running a machine learning model inside each person's zero-knowledge proof. Before a segment is hashed, the model would clean it up, for example correcting likely sequencing errors, so that nearly identical segments from real relatives still produce the same token. Each person runs the model only on their own data, and the proof shows the model was applied honestly, so matches become tolerant of imperfect genetic data while the underlying DNA stays hidden and off-chain.

## Privacy limits

- **Matches are pseudonymous, not anonymous.** Anyone reading the chain can see that two wallet addresses share a token.
- **Segment positions are public.** The position of each published segment is one of the proof's public inputs.
- **Tokens are guessable in principle.** Someone could hash very common DNA patterns and compare them to posted tokens.
- **The demo uses synthetic DNA and a test lab key.** A real deployment would have labs sign at sequencing time.

## Run it yourself

Requirements: Node 20+, Rust, Solana CLI 2.1, Anchor 0.31.1, circom 2.2.

```bash
# frontend
cd app
npm install
cp .env.example .env        # set VITE_LAB_AUTHORITY after registering the lab
npm run dev

# circuit (needs a 2^14 powers of tau file)
PTAU=path/to/ppot_0080_14.ptau ./scripts/build-circuit.sh
cd app && npm run test:circuit

# program and tests (local validator)
npm install
anchor test
```

Synthetic sample DNA files are in [`app/public/sample-dna/`](app/public/sample-dna/).

## Repository layout

| Path | What it is |
|---|---|
| `circuits/` | Circom circuits: Merkle path and the segment token proof |
| `programs/zk_genome/` | Solana program (Rust, Anchor) with the on-chain Groth16 verifier |
| `tests/` | Program test suite, run with `anchor test` |
| `app/` | Vite + React frontend; proving runs in a Web Worker |
| `scripts/build-circuit.sh` | Compiles the circuit and runs the Groth16 setup |
