#!/usr/bin/env bash
# Compile the circuit and run the Groth16 setup. Run from the repo root.
#   PTAU=path/to/powersOfTau28_hez_final_14.ptau ./scripts/build-circuit.sh
# 2^14 is required: the circuit has 12,848 constraints, which does not fit in 2^13.
set -euo pipefail
PTAU="${PTAU:-powersOfTau28_hez_final_14.ptau}"
[ -f "$PTAU" ] || { echo "Missing $PTAU — download it from the snarkjs README"; exit 1; }
[ -d app/node_modules/circomlib ] || { echo "Run npm install in app/ first (provides circomlib)"; exit 1; }

mkdir -p build
circom circuits/segment.circom --r1cs --wasm --sym -l app/node_modules -o build
npx --prefix app snarkjs r1cs info build/segment.r1cs
npx --prefix app snarkjs groth16 setup build/segment.r1cs "$PTAU" build/segment_0.zkey
npx --prefix app snarkjs zkey contribute build/segment_0.zkey build/segment_final.zkey \
  --name="zk and me" -e="$(head -c 64 /dev/urandom | od -An -tx1 | tr -d ' \n')"
npx --prefix app snarkjs zkey export verificationkey build/segment_final.zkey build/verification_key.json
echo
echo "Done. Next: convert build/verification_key.json with groth16-solana's parse-vk script,"
echo "then from app/: npm run sync-circuit && npm run test:circuit"
