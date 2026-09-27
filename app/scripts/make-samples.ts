// Writes the synthetic sample DNA files served by the app.
//   npm run make-samples
import fs from 'node:fs';
import { formatDnaFile } from '../src/lib/dnaFile';
import { SHARED_SEGMENTS, syntheticRelatives } from '../src/lib/genome';

const OUT = new URL('../public/sample-dna/', import.meta.url);
const shared = `${SHARED_SEGMENTS[0]}-${SHARED_SEGMENTS[SHARED_SEGMENTS.length - 1]}`;

const [cousinA, cousinB] = syntheticRelatives(1923);
const [stranger] = syntheticRelatives(8871);

fs.mkdirSync(OUT, { recursive: true });
const files: [string, number[], string][] = [
  ['cousin-a.txt', cousinA, `Cousin A. Shares segments ${shared} with Cousin B.`],
  ['cousin-b.txt', cousinB, `Cousin B. Shares segments ${shared} with Cousin A.`],
  ['stranger.txt', stranger, 'Stranger. Not related to either cousin.'],
];
for (const [name, markers, profile] of files) {
  fs.writeFileSync(new URL(name, OUT), formatDnaFile(markers, profile));
  console.log(`wrote public/sample-dna/${name}`);
}
