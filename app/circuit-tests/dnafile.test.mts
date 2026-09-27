import * as snarkjs from 'snarkjs';
import fs from 'node:fs';
import { DnaFileError, formatDnaFile, parseDnaFile } from '../src/lib/dnaFile.ts';
import { buildGenome, circuitInput, deriveToken, SEGMENT_COUNT, SHARED_SEGMENTS } from '../src/lib/genome.ts';

const WASM = new URL('../../build/segment_js/segment.wasm', import.meta.url).pathname;
const read = (name: string) => fs.readFileSync(new URL(`../public/sample-dna/${name}`, import.meta.url), 'utf8');
const epoch = 2961;
const results: boolean[] = [];
const check = (name: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); results.push(ok); };

const [a, b, s] = ['cousin-a.txt', 'cousin-b.txt', 'stranger.txt'].map((f) => parseDnaFile(read(f)));
check('all three sample files parse to 2,048 markers', [a, b, s].every((p) => p.markers.length === 2048));
check('round trip: format then parse gives the same markers', JSON.stringify(parseDnaFile(formatDnaFile(a.markers, 'x')).markers) === JSON.stringify(a.markers));

const [ga, gb, gs] = [await buildGenome(a.markers), await buildGenome(b.markers), await buildGenome(s.markers)];
const tokens = async (g: typeof ga) => Promise.all(Array.from({ length: SEGMENT_COUNT }, (_, i) => deriveToken(i, g.segmentHashes[i], epoch)));
const [ta, tb, ts] = [await tokens(ga), await tokens(gb), await tokens(gs)];
const sharedAB = ta.map((t, i) => (t === tb[i] ? i : -1)).filter((i) => i >= 0);
check(`cousins share exactly segments ${SHARED_SEGMENTS.join(', ')}`, JSON.stringify(sharedAB) === JSON.stringify(SHARED_SEGMENTS));
check('stranger shares no segment with either cousin', ts.every((t, i) => t !== ta[i] && t !== tb[i]));

const { input } = await circuitInput(ga, 41, epoch);
let witnessOk = true;
try { await snarkjs.wtns.calculate(input, WASM, { type: 'mem' }); } catch { witnessOk = false; }
check('circuit accepts a segment from an uploaded file', witnessOk);

const rejects = (text: string) => { try { parseDnaFile(text); return false; } catch (e) { return e instanceof DnaFileError; } };
check('a file with none of the demo markers is rejected', rejects('rs4477212\t1\t82154\tAA\nrs3094315\t1\t752566\tAG\n'));
check('an incomplete file is rejected', rejects(read('cousin-a.txt').split('\n').slice(0, 500).join('\n')));

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
