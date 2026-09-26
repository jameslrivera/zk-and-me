import * as snarkjs from 'snarkjs';

// Served from public/circuits (run `npm run sync-circuit` after compiling).
// Repeat fetches are served from the browser's HTTP cache.
const WASM = '/circuits/segment.wasm';
const ZKEY = '/circuits/segment_final.zkey';

const ctx = self as unknown as {
  postMessage: (m: unknown) => void;
  onmessage: ((e: MessageEvent) => void) | null;
};

// One proof at a time: snarkjs is CPU-bound, and interleaving would only slow both.
let queue: Promise<void> = Promise.resolve();

ctx.onmessage = (e: MessageEvent) => {
  const { id, input } = e.data as { id: number; input: Record<string, unknown> };
  queue = queue.then(async () => {
    try {
      const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
      ctx.postMessage({ id, ok: true, proof, publicSignals });
    } catch (err) {
      ctx.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });
};
