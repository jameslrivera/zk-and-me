import { Buffer } from 'buffer';
import { buildEddsa, buildPoseidon } from 'circomlibjs';
import { DEMO_LAB_PRV } from './labKey';

export const SEGMENT_COUNT = 128;      // 2^LEVELS — must match SegmentToken(7)
export const WINDOW = 16;              // markers per segment
export const LEVELS = 7;
export const SHARED_SEGMENTS = [40, 41, 42]; // the stretch the synthetic relatives inherit

/* eslint-disable @typescript-eslint/no-explicit-any */
let poseidonP: Promise<any> | null = null;
let eddsaP: Promise<any> | null = null;
const getPoseidon = () => (poseidonP ??= buildPoseidon());
const getEddsa = () => (eddsaP ??= buildEddsa());

export interface Genome {
  markers: number[];
  segmentHashes: string[];   // Poseidon(window), decimal field elements
  layers: string[][];        // Merkle layers, leaves first
  root: string;
  signature: { R8x: string; R8y: string; S: string };
  lab: { x: string; y: string };
  signatureValid: boolean;
}

/** Small deterministic PRNG so a session can be rebuilt from a seed without storing markers. */
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Two SYNTHETIC genomes that share SHARED_SEGMENTS, as relatives would.
 * Marker values are genotypes: 0, 1 or 2 copies of the alternate allele.
 * A chance collision in any other 16-marker window is about 1 in 43 million.
 */
export function syntheticRelatives(seed: number): [number[], number[]] {
  const rand = mulberry32(seed);
  const n = SEGMENT_COUNT * WINDOW;
  const a = Array.from({ length: n }, () => Math.floor(rand() * 3));
  const b = Array.from({ length: n }, () => Math.floor(rand() * 3));
  for (const s of SHARED_SEGMENTS) {
    for (let k = 0; k < WINDOW; k++) b[s * WINDOW + k] = a[s * WINDOW + k];
  }
  return [a, b];
}

export async function buildGenome(markers: number[]): Promise<Genome> {
  if (markers.length !== SEGMENT_COUNT * WINDOW) {
    throw new Error(`Expected ${SEGMENT_COUNT * WINDOW} markers, got ${markers.length}`);
  }
  const poseidon = await getPoseidon();
  const F = poseidon.F;

  const segmentHashes: string[] = [];
  for (let s = 0; s < SEGMENT_COUNT; s++) {
    segmentHashes.push(F.toString(poseidon(markers.slice(s * WINDOW, (s + 1) * WINDOW))));
  }

  // leaf = Poseidon(segmentIndex, segmentHash) — binds each segment to its position
  const leaves = segmentHashes.map((h, i) => F.toString(poseidon([i, h])));
  const layers: string[][] = [leaves];
  while (layers[layers.length - 1].length > 1) {
    const prev = layers[layers.length - 1];
    const next: string[] = [];
    for (let i = 0; i < prev.length; i += 2) next.push(F.toString(poseidon([prev[i], prev[i + 1]])));
    layers.push(next);
  }
  const root = layers[layers.length - 1][0];

  const eddsa = await getEddsa();
  const prv = Buffer.from(DEMO_LAB_PRV);
  const msg = eddsa.F.e(BigInt(root));
  const sig = eddsa.signPoseidon(prv, msg);
  const pub = eddsa.prv2pub(prv);

  return {
    markers,
    segmentHashes,
    layers,
    root,
    signature: {
      R8x: eddsa.F.toObject(sig.R8[0]).toString(),
      R8y: eddsa.F.toObject(sig.R8[1]).toString(),
      S: sig.S.toString(),
    },
    lab: { x: eddsa.F.toObject(pub[0]).toString(), y: eddsa.F.toObject(pub[1]).toString() },
    signatureValid: eddsa.verifyPoseidon(msg, sig, pub),
  };
}

export function merkleProof(layers: string[][], index: number) {
  const pathElements: string[] = [];
  const pathIndices: number[] = [];
  let idx = index;
  for (let level = 0; level < layers.length - 1; level++) {
    const sibling = idx % 2 === 0 ? idx + 1 : idx - 1;
    pathElements.push(layers[level][sibling]);
    pathIndices.push(idx % 2);
    idx = Math.floor(idx / 2);
  }
  return { pathElements, pathIndices };
}

/** token = Poseidon(segmentIndex, segmentHash, epoch). Must match the circuit exactly. */
export async function deriveToken(segmentIndex: number, segmentHash: string, epoch: number): Promise<string> {
  const poseidon = await getPoseidon();
  return poseidon.F.toString(poseidon([segmentIndex, segmentHash, epoch]));
}

/** The circuit input for one segment, keyed by the circuit's signal names. */
export async function circuitInput(g: Genome, segmentIndex: number, epoch: number) {
  const token = await deriveToken(segmentIndex, g.segmentHashes[segmentIndex], epoch);
  const { pathElements, pathIndices } = merkleProof(g.layers, segmentIndex);
  return {
    token,
    input: {
      // public — declaration order in the template: merkleRoot, labPubX, labPubY, segmentIndex, epoch, token
      merkleRoot: g.root,
      labPubX: g.lab.x,
      labPubY: g.lab.y,
      segmentIndex: String(segmentIndex),
      epoch: String(epoch),
      token,
      // private
      segmentHash: g.segmentHashes[segmentIndex],
      pathElements,
      pathIndices: pathIndices.map(String),
      sigR8x: g.signature.R8x,
      sigR8y: g.signature.R8y,
      sigS: g.signature.S,
    },
  };
}

/** Which segments the demo publishes: the shared stretch plus the lowest indices, up to `count`. */
export function publishIndices(count: number): number[] {
  const target = Math.min(count, SEGMENT_COUNT);
  const set = new Set<number>(SHARED_SEGMENTS.slice(0, target));
  for (let i = 0; set.size < target; i++) set.add(i);
  return [...set].sort((x, y) => x - y);
}
