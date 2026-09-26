import { toBE32 } from './field';

// BN254 base field modulus, used to negate a G1 point's y coordinate.
const Q = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;

export interface SnarkjsProof {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
}

/**
 * snarkjs proof → groth16-solana byte layout.
 * Proof A is negated HERE and only here — the program must not negate it again.
 * Proof B's Fp2 coordinates are swapped because the two libraries order them differently.
 */
export function formatProofForSolana(proof: SnarkjsProof, publicSignals: string[]) {
  const aY = (Q - BigInt(proof.pi_a[1])) % Q;
  const proofA = concat([toBE32(proof.pi_a[0]), toBE32(aY)]);
  const proofB = concat([
    toBE32(proof.pi_b[0][1]), toBE32(proof.pi_b[0][0]),
    toBE32(proof.pi_b[1][1]), toBE32(proof.pi_b[1][0]),
  ]);
  const proofC = concat([toBE32(proof.pi_c[0]), toBE32(proof.pi_c[1])]);
  const inputs = publicSignals.map((s) => toBE32(s));
  return { proofA, proofB, proofC, inputs };
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
