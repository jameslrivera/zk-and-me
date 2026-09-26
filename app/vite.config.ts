import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// web3.js, Anchor and snarkjs expect Node's Buffer; the polyfill supplies it
// in the page and in the prover worker.
const polyfills = () => nodePolyfills({ include: ['buffer'], globals: { Buffer: true } });

export default defineConfig({
  plugins: [react(), polyfills()],
  worker: { format: 'es', plugins: () => [polyfills()] },
});
