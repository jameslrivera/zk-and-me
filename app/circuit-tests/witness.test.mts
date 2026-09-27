import * as snarkjs from 'snarkjs';
import { buildEddsa } from 'circomlibjs';
import { Buffer } from 'buffer';
import { buildGenome, syntheticRelatives, circuitInput } from '../src/lib/genome.ts';

const WASM = new URL('../../build/segment_js/segment.wasm', import.meta.url).pathname;
const epoch = 2961;
const [ma, mb] = syntheticRelatives(777);
const [ga, gb] = [await buildGenome(ma), await buildGenome(mb)];

async function tryWitness(name: string, input: any, expectOk: boolean) {
  let ok = true, why = '';
  try { await snarkjs.wtns.calculate(input, WASM, { type: 'mem' }); }
  catch (e: any) { ok = false; why = String(e.message).split('\n')[0].slice(0, 90); }
  const pass = ok === expectOk;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  → ${ok ? 'witness built' : 'rejected: ' + why}`);
  return pass;
}

const results: boolean[] = [];
const A41 = (await circuitInput(ga, 41, epoch)).input as any;
const B41 = (await circuitInput(gb, 41, epoch)).input as any;
results.push(await tryWitness('cousin A, shared segment 41', A41, true));
results.push(await tryWitness('cousin B, shared segment 41', B41, true));
console.log(`      tokens equal for shared segment: ${A41.token === B41.token}`);
const A7 = (await circuitInput(ga, 7, epoch)).input as any;
const B7 = (await circuitInput(gb, 7, epoch)).input as any;
console.log(`      tokens differ for unshared segment 7: ${A7.token !== B7.token}`);
results.push(await tryWitness('first leaf (index 0)', (await circuitInput(ga, 0, epoch)).input, true));
results.push(await tryWitness('last leaf (index 127)', (await circuitInput(ga, 127, epoch)).input, true));

// attacks
results.push(await tryWitness('forged token', { ...A41, token: A7.token }, false));
results.push(await tryWitness('wrong epoch for token', { ...A41, epoch: String(epoch + 1) }, false));
results.push(await tryWitness('segment moved to another position', { ...A41, segmentIndex: '5' }, false));
results.push(await tryWitness('segment hash swapped in', { ...A41, segmentHash: ga.segmentHashes[7] }, false));
results.push(await tryWitness("other person's root", { ...A41, merkleRoot: gb.root }, false));
const bad = [...A41.pathIndices]; bad[0] = '2';
results.push(await tryWitness('non-boolean path index', { ...A41, pathIndices: bad }, false));

// self-signed genome: attacker signs their own root with their own key
const eddsa = await buildEddsa();
const evil = Buffer.alloc(32, 9);
const sig = eddsa.signPoseidon(evil, eddsa.F.e(BigInt(ga.root)));
const pub = eddsa.prv2pub(evil);
const selfSigned = { ...A41, labPubX: eddsa.F.toObject(pub[0]).toString(), labPubY: eddsa.F.toObject(pub[1]).toString(),
  sigR8x: eddsa.F.toObject(sig.R8[0]).toString(), sigR8y: eddsa.F.toObject(sig.R8[1]).toString(), sigS: sig.S.toString() };
results.push(await tryWitness('self-signed genome (circuit accepts; program must reject key)', selfSigned, true));
results.push(await tryWitness("real lab key with attacker's signature", { ...selfSigned, labPubX: A41.labPubX, labPubY: A41.labPubY }, false));

console.log(`\n${results.filter(Boolean).length}/${results.length} behaved as expected`);
process.exit(0);
