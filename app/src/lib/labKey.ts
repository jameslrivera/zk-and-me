// DEMO ONLY. A real lab signs at sequencing time and its private key never exists in a client.
// Shared by the app (to sign synthetic genomes) and scripts/register-lab.ts (to register the matching public key).
export const DEMO_LAB_PRV: number[] = Array.from({ length: 32 }, (_, i) => (i * 7 + 13) & 0xff);
