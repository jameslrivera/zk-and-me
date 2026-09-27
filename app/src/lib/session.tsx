import { Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  allowContact as allowContactTx, chainEpoch, connection, consentStatus, explain, fetchProfile,
  fetchTokenRows, fund as fundTx, makeIdentity, matchesFrom, postSegment, registerGenome,
  type Identity, type Match,
} from './chain';
import { config } from './config';
import { parseDnaFile } from './dnaFile';
import { buildGenome, publishIndices, syntheticRelatives } from './genome';

export type Who = 'a' | 'b';

export interface LogEntry { index: number; status: 'proving' | 'confirmed' | 'failed'; sig?: string; error?: string }

export interface Runtime {
  balance: number | null;
  registered: boolean | null;
  rootMatches: boolean;
  epoch: number | null;
  posted: number[];          // segment indices confirmed on-chain this epoch
  proving: number | null;
  log: LogEntry[];
  matches: Match[];
  consent: Record<string, { me: boolean; them: boolean }>;
  busy: string | null;       // what the identity is doing right now, in words
  source: string | null;     // file the genome was read from; null when generated
  error: string | null;
}

const emptyRuntime = (): Runtime => ({
  balance: null, registered: null, rootMatches: true, epoch: null, posted: [], proving: null,
  log: [], matches: [], consent: {}, busy: null, error: null, source: null,
});

interface SessionApi {
  ready: boolean;
  bootError: string | null;
  ids: Record<Who, Identity> | null;
  rt: Record<Who, Runtime>;
  indices: number[];
  refresh: (who: Who) => Promise<void>;
  fund: (who: Who) => Promise<void>;
  register: (who: Who) => Promise<void>;
  publish: (who: Who) => Promise<void>;
  allowContact: (who: Who, counterparty: PublicKey) => Promise<void>;
  loadFile: (who: Who, file: File) => Promise<void>;
  reset: () => void;
}

const Ctx = createContext<SessionApi | null>(null);

// Burner keys and a genome SEED live in sessionStorage so a refresh keeps the demo intact.
// The markers themselves are synthetic and rebuilt from the seed. A real genome must never be
// persisted in plaintext.
const KEY = 'zkme.session.v1';

function loadOrCreate(): { seed: number; a: Keypair; b: Keypair } {
  const raw = sessionStorage.getItem(KEY);
  if (raw) {
    const s = JSON.parse(raw);
    return { seed: s.seed, a: Keypair.fromSecretKey(Uint8Array.from(s.a)), b: Keypair.fromSecretKey(Uint8Array.from(s.b)) };
  }
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const a = Keypair.generate();
  const b = Keypair.generate();
  sessionStorage.setItem(KEY, JSON.stringify({ seed, a: Array.from(a.secretKey), b: Array.from(b.secretKey) }));
  return { seed, a, b };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<Record<Who, Identity> | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [rt, setRt] = useState<Record<Who, Runtime>>({ a: emptyRuntime(), b: emptyRuntime() });
  const idsRef = useRef(ids);
  idsRef.current = ids;
  const indices = useMemo(() => publishIndices(config.publishCount), []);

  const patch = useCallback((who: Who, p: Partial<Runtime> | ((r: Runtime) => Partial<Runtime>)) => {
    setRt((prev) => ({ ...prev, [who]: { ...prev[who], ...(typeof p === 'function' ? p(prev[who]) : p) } }));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const s = loadOrCreate();
        const [ma, mb] = syntheticRelatives(s.seed);
        const [ga, gb] = await Promise.all([buildGenome(ma), buildGenome(mb)]);
        setIds({ a: makeIdentity('You', s.a, ga), b: makeIdentity('Relative', s.b, gb) });
      } catch (e) {
        setBootError(explain(e));
      }
    })();
  }, []);

  const refreshMatches = useCallback(async (who: Who, epoch: number) => {
    const id = idsRef.current![who];
    const rows = await fetchTokenRows(id.genome, indices, epoch);
    const me = id.keypair.publicKey;
    const posted = rows.filter((r) => r.holders.some((h) => h.equals(me))).map((r) => r.index);
    const matches = matchesFrom(rows, me);
    const consent: Runtime['consent'] = {};
    for (const m of matches) consent[m.counterparty.toBase58()] = await consentStatus(id, m.counterparty);
    patch(who, { posted, matches, consent });
  }, [indices, patch]);

  const refresh = useCallback(async (who: Who) => {
    const id = idsRef.current?.[who];
    if (!id) return;
    try {
      const [lamports, profile, epoch] = await Promise.all([
        connection.getBalance(id.keypair.publicKey), fetchProfile(id), chainEpoch(),
      ]);
      patch(who, { balance: lamports / LAMPORTS_PER_SOL, registered: profile.registered, rootMatches: profile.rootMatches, epoch });
      if (profile.registered) await refreshMatches(who, epoch);
    } catch (e) {
      patch(who, { error: explain(e) });
    }
  }, [patch, refreshMatches]);

  useEffect(() => {
    if (!ids) return;
    void refresh('a');
    void refresh('b');
  }, [ids, refresh]);

  const run = useCallback(async (who: Who, label: string, fn: (id: Identity) => Promise<void>) => {
    const id = idsRef.current?.[who];
    if (!id) return;
    patch(who, { busy: label, error: null });
    try { await fn(id); } catch (e) { patch(who, { error: explain(e) }); } finally { patch(who, { busy: null }); }
  }, [patch]);

  const fund = useCallback((who: Who) => run(who, 'Funding', async (id) => {
    const balance = await fundTx(id.keypair.publicKey);
    patch(who, { balance });
  }), [run, patch]);

  const register = useCallback((who: Who) => run(who, 'Registering', async (id) => {
    await registerGenome(id);
    await refresh(who);
  }), [run, refresh]);

  const publish = useCallback((who: Who) => run(who, 'Publishing', async (id) => {
    const epoch = await chainEpoch();
    patch(who, { epoch });
    await refreshMatches(who, epoch);            // resume: skip anything already on-chain
    const already = new Set((await fetchTokenRows(id.genome, indices, epoch))
      .filter((r) => r.holders.some((h) => h.equals(id.keypair.publicKey))).map((r) => r.index));

    for (const index of indices) {
      if (already.has(index)) continue;
      patch(who, (r) => ({ proving: index, log: [{ index, status: 'proving' as const }, ...r.log] }));
      try {
        const { signature, holders } = await postSegment(id, index, epoch);
        patch(who, (r) => ({
          posted: [...r.posted, index],
          log: r.log.map((l) => (l.index === index && l.status === 'proving' ? { ...l, status: 'confirmed' as const, sig: signature } : l)),
        }));
        if (holders > 1) await refreshMatches(who, epoch);
      } catch (e) {
        const error = explain(e);
        patch(who, (r) => ({
          log: r.log.map((l) => (l.index === index && l.status === 'proving' ? { ...l, status: 'failed' as const, error } : l)),
        }));
        if (/epoch changed|SOL|rate-limiting|Prover files/.test(error)) throw e; // stop the run; retrying each segment won't help
      }
    }
    patch(who, { proving: null });
    await refreshMatches(who, epoch);
  }), [run, patch, refreshMatches, indices]);

  const allowContact = useCallback((who: Who, counterparty: PublicKey) => run(who, 'Recording consent', async (id) => {
    await allowContactTx(id, counterparty);
    const status = await consentStatus(id, counterparty);
    patch(who, (r) => ({ consent: { ...r.consent, [counterparty.toBase58()]: status } }));
    const other: Who = who === 'a' ? 'b' : 'a';
    const otherId = idsRef.current?.[other];
    if (otherId?.keypair.publicKey.equals(counterparty)) {
      const theirs = await consentStatus(otherId, id.keypair.publicKey);
      patch(other, (r) => ({ consent: { ...r.consent, [id.keypair.publicKey.toBase58()]: theirs } }));
    }
  }), [run, patch]);

  // replace an identity's genome with one read from a DNA file; the file stays in memory only
  const loadFile = useCallback((who: Who, file: File) => run(who, 'Reading file', async (id) => {
    const { markers } = parseDnaFile(await file.text());
    const next = makeIdentity(id.label, id.keypair, await buildGenome(markers));
    idsRef.current = { ...idsRef.current!, [who]: next };
    setIds(idsRef.current);
    patch(who, { source: file.name, posted: [], matches: [], consent: {}, log: [] });
    await refresh(who);
  }), [run, patch, refresh]);

  const reset = useCallback(() => {
    sessionStorage.removeItem(KEY);
    window.location.reload();
  }, []);

  const api: SessionApi = { ready: !!ids, bootError, ids, rt, indices, refresh, fund, register, publish, allowContact, loadFile, reset };
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useSession(): SessionApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession must be used inside SessionProvider');
  return v;
}
