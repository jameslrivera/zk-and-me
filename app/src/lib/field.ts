import { Buffer } from 'buffer';

/** A field element (decimal string, bigint or number) as 32 big-endian bytes — the encoding groth16-solana and the program expect. */
export function toBE32(value: bigint | string | number): Uint8Array {
  const hex = BigInt(value).toString(16).padStart(64, '0');
  if (hex.length > 64) throw new Error('Value does not fit in 32 bytes');
  return Uint8Array.from(Buffer.from(hex, 'hex'));
}

export const toArr = (bytes: Uint8Array): number[] => Array.from(bytes);

export const hex = (bytes: Uint8Array | number[]): string => '0x' + Buffer.from(Uint8Array.from(bytes)).toString('hex');

export function short(s: string, head = 4, tail = 4): string {
  return s.length <= head + tail + 1 ? s : `${s.slice(0, head)}…${s.slice(-tail)}`;
}

export const shortHex = (bytes: Uint8Array | number[]): string => short(hex(bytes), 6, 4);
