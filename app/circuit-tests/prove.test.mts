import * as snarkjs from 'snarkjs';
import { buildBn128 } from 'ffjavascript';
import fs from 'node:fs';
import { buildGenome, syntheticRelatives, circuitInput } from '../src/lib/genome.ts';
import { formatProofForSolana } from '../src/lib/format.ts';

const B = new URL('../../build', import.meta.url).pathname;
const vk = JSON.parse(fs.readFileSync(`${B}/verification_key.json`, 'utf8'));
const [ma] = syntheticRelatives(777);
const g = await buildGenome(ma);
const { input, token } = await circuitInput(g, 41, 2961);

const t0 = Date.now();
const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, `${B}/segment_js/segment.wasm`, `${B}/segment_final.zkey`);
console.log(`proof generated in ${Date.now() - t0} ms (Node, single proof)`);
console.log('snarkjs verify:', await snarkjs.groth16.verify(vk, publicSignals, proof));

const expected = [g.root, g.lab.x, g.lab.y, '41', '2961', token];
console.log('public signal order matches program indices 0-5:', JSON.stringify(publicSignals) === JSON.stringify(expected));

// Rebuild the points from the exact bytes the program receives, using the EIP-196/197
// layout the alt_bn128 syscalls use, and run the pairing check groth16-solana runs:
//   e(-A, B) · e(vk_x, gamma) · e(C, delta) · e(alpha, beta) == 1
const curve = await buildBn128();
const { proofA, proofB, proofC, inputs } = formatProofForSolana(proof, publicSignals);
const be = (b: Uint8Array, o: number) => BigInt('0x' + Buffer.from(b.slice(o, o + 32)).toString('hex'));
const g1 = (b: Uint8Array) => curve.G1.fromObject([be(b, 0), be(b, 32), 1n]);
const g2 = (b: Uint8Array) => curve.G2.fromObject([[be(b, 32), be(b, 0)], [be(b, 96), be(b, 64)], [1n, 0n]]); // (c1,c0) per coordinate
const obj = (a: any) => a.map((x: any) => Array.isArray(x) ? x.map(BigInt) : BigInt(x));
const ic = vk.IC.map((p: any) => curve.G1.fromObject(obj(p)));
let vkx = ic[0];
inputs.forEach((bytes, i) => { vkx = curve.G1.add(vkx, curve.G1.timesScalar(ic[i + 1], bytes.slice().reverse())); });
const alpha = curve.G1.fromObject(obj(vk.vk_alpha_1));
const [beta, gamma, delta] = ['vk_beta_2', 'vk_gamma_2', 'vk_delta_2'].map((k) => curve.G2.fromObject(obj(vk[k])));

const check = (A: any, Bp: any) => curve.pairingEq(A, Bp, vkx, gamma, g1(proofC), delta, alpha, beta);
console.log('on-chain pairing check with formatted bytes:', await check(g1(proofA), g2(proofB)));
console.log('  control: A NOT negated fails:', !(await check(curve.G1.neg(g1(proofA)), g2(proofB))));
const unswapped = new Uint8Array(proofB); unswapped.set(proofB.slice(32, 64), 0); unswapped.set(proofB.slice(0, 32), 32);
console.log('  control: B coordinates unswapped fails:', !(await check(g1(proofA), g2(unswapped))));
console.log('proof bytes:', proofA.length + proofB.length + proofC.length, '| public input bytes:', inputs.length * 32);
await curve.terminate();
process.exit(0);
