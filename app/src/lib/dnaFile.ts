import { SEGMENT_COUNT, WINDOW } from './genome';

export const MARKER_COUNT = SEGMENT_COUNT * WINDOW;
const BASES = ['A', 'C', 'G', 'T'];

export interface PanelMarker { rsid: string; chromosome: number; position: number; ref: string; alt: string }

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// fixed marker panel shared by the app and the sample files
export const PANEL: PanelMarker[] = (() => {
  const rand = mulberry32(20260926);
  const out: PanelMarker[] = [];
  let chromosome = 0;
  let position = 0;
  for (let i = 0; i < MARKER_COUNT; i++) {
    const c = Math.floor((i * 22) / MARKER_COUNT) + 1;
    if (c !== chromosome) { chromosome = c; position = 50_000 + Math.floor(rand() * 50_000); }
    position += 20_000 + Math.floor(rand() * 180_000);
    const ref = BASES[Math.floor(rand() * 4)];
    let alt = BASES[Math.floor(rand() * 4)];
    while (alt === ref) alt = BASES[Math.floor(rand() * 4)];
    out.push({ rsid: `rs${1_000_000 + i * 1000 + Math.floor(rand() * 1000)}`, chromosome, position, ref, alt });
  }
  return out;
})();

const INDEX = new Map(PANEL.map((m, i) => [m.rsid, i]));

export class DnaFileError extends Error {}

export interface ParsedDna { markers: number[]; rowsRead: number; description: string | null }

// read a raw-data text file into 2,048 genotypes (0, 1 or 2 copies of the alt allele)
export function parseDnaFile(text: string): ParsedDna {
  const markers: (number | undefined)[] = new Array(MARKER_COUNT);
  let rowsRead = 0;
  let found = 0;
  let description: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      const m = /^#\s*Profile:\s*(.+)$/i.exec(line);
      if (m) description = m[1];
      continue;
    }
    rowsRead++;
    const [rsid, , , genotype] = line.split(/[\t,]+|\s+/);
    const i = INDEX.get(rsid);
    if (i === undefined || !genotype) continue;
    const { ref, alt } = PANEL[i];
    const g = genotype.toUpperCase();
    if (g.length !== 2 || ![...g].every((b) => b === ref || b === alt)) {
      throw new DnaFileError(`Marker ${rsid} has genotype "${genotype}", expected two of ${ref}/${alt}.`);
    }
    if (markers[i] === undefined) found++;
    markers[i] = [...g].filter((b) => b === alt).length;
  }
  if (found === 0) {
    throw new DnaFileError('None of the demo markers were found. This demo only reads the synthetic sample files.');
  }
  if (found < MARKER_COUNT) {
    throw new DnaFileError(`Found ${found.toLocaleString()} of ${MARKER_COUNT.toLocaleString()} demo markers. The file is incomplete.`);
  }
  return { markers: markers as number[], rowsRead, description };
}

// write genotypes out in the same tab-separated raw-data format
export function formatDnaFile(markers: number[], profile: string): string {
  const head = [
    '# zk and me sample DNA file',
    '# SYNTHETIC DATA. This is not real human DNA.',
    `# Profile: ${profile}`,
    '# Format: rsid, chromosome, position, genotype (tab-separated), like common consumer raw-data exports',
    '# rsid\tchromosome\tposition\tgenotype',
  ];
  const rows = PANEL.map((m, i) => {
    const n = markers[i];
    const g = n === 0 ? m.ref + m.ref : n === 1 ? m.ref + m.alt : m.alt + m.alt;
    return `${m.rsid}\t${m.chromosome}\t${m.position}\t${g}`;
  });
  return [...head, ...rows, ''].join('\n');
}
