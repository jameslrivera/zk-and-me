const env = import.meta.env;

export const config = {
  rpcUrl: env.VITE_RPC_URL || 'https://api.devnet.solana.com',
  labAuthority: env.VITE_LAB_AUTHORITY || '',
  publishCount: Math.max(1, Math.min(128, Number(env.VITE_PUBLISH_COUNT || 16))),
  funderSecret: env.VITE_DEMO_FUNDER_SECRET || '',
};

export function requireLabAuthority(): string {
  if (!config.labAuthority) {
    throw new Error('VITE_LAB_AUTHORITY is not set. Run `npm run register-lab`, then add the printed value to .env.');
  }
  return config.labAuthority;
}
