# zk and me — frontend

Vite + React. Everything sensitive runs in the browser: the genome is built here, proofs are generated in a Web Worker, and only proofs and hashes are sent to Solana. There is no server.

## Setup

Run from `app/`, after the program is built and deployed with `anchor deploy`.

```
npm install
npm run sync-idl          # copies ../target/idl/zk_genome.json into src/idl/
npm run sync-circuit      # copies segment.wasm and segment_final.zkey into public/circuits/
npm run register-lab      # one time per deployment; prints VITE_LAB_AUTHORITY
cp .env.example .env      # paste VITE_LAB_AUTHORITY, optionally VITE_DEMO_FUNDER_SECRET
npm run dev
```

Re-run `sync-idl` after every `anchor build` and `sync-circuit` after every circuit change. A stale IDL or zkey is the most likely cause of `InvalidProof`.

## Screens

| Route | Screen | Talks to |
| --- | --- | --- |
| `#genome` | Your genome — fund, register, then publish | `register_genome`, `GenomeProfile` |
| `#publish` | Proving grid and transaction log | prover worker → `post_token` |
| `#match` | Match details and two-sided consent | `TokenEntry` reads, `consent` |
| `#demo` | Two identities with the live chain column between them | all of the above, both sides |

## How it maps to the backend

- `src/lib/genome.ts` — synthetic relatives, Merkle tree, demo lab signature, `deriveToken`, circuit inputs. Must match the circuit.
- `src/lib/format.ts` — snarkjs proof → groth16-solana bytes. Negates proof A; the program must not.
- `src/lib/chain.ts` — PDAs, epoch from chain time, every instruction call, and error messages.
- `src/lib/session.tsx` — two burner identities and their state; the screens only call its actions.
- `src/workers/prover.worker.ts` — runs snarkjs off the main thread, one proof at a time.

## Demo notes

- Two identities share one tab to stand in for two devices. Say so on stage.
- Each identity publishes `VITE_PUBLISH_COUNT` segments (default 16) including the shared stretch at positions 40–42.
- Burners live in `sessionStorage`. **Reset demo** starts fresh keys and genomes.
- `VITE_DEMO_FUNDER_SECRET` ships to the browser. Devnet only.

## Sample DNA files

`public/sample-dna/` holds three synthetic DNA files in the tab-separated raw-data format (rsid, chromosome, position, genotype): `cousin-a.txt`, `cousin-b.txt` and `stranger.txt`. The cousins share segments 40–42; the stranger shares nothing. The site serves them for download, and each identity can load one with **Upload DNA file**. The file is read in the browser and never uploaded.

They are not real DNA. The app only reads its own 2,048-marker demo panel (`src/lib/dnaFile.ts`), so a real consumer DNA file is rejected. Regenerate them with `npm run make-samples`.

## Circuit tests

After `../scripts/build-circuit.sh`, run `npm run test:circuit`. It checks valid proofs for both relatives, twelve adversarial inputs the circuit must reject or accept, public-signal order, and replays groth16-solana's pairing check on the exact bytes this app sends — so an encoding mistake shows up here, not as a silent `InvalidProof` on devnet.
