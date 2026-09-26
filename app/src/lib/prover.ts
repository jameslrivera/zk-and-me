import type { SnarkjsProof } from './format';

export interface ProveResult { proof: SnarkjsProof; publicSignals: string[] }

type Pending = { resolve: (r: ProveResult) => void; reject: (e: Error) => void };

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('../workers/prover.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent) => {
    const { id, ok, proof, publicSignals, error } = e.data;
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (ok) p.resolve({ proof, publicSignals });
    else p.reject(new Error(`Proof generation failed: ${error}`));
  };
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(`Prover worker crashed: ${e.message}`));
    pending.clear();
    worker = null;
  };
  return worker;
}

/** Proves off the main thread so the page stays responsive through many proofs. */
export function prove(input: Record<string, unknown>): Promise<ProveResult> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, input });
  });
}
