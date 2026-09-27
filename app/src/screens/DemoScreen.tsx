import { useEffect, useRef, useState } from 'react';
import { explorerAccount, fetchTokenRows, type TokenRow } from '../lib/chain';
import { short, shortHex } from '../lib/field';
import { SEGMENT_COUNT } from '../lib/genome';
import { partnerMatch, useSession, type Who } from '../lib/session';
import { ErrorNotice, SegmentGrid, Swatch, type CellState } from '../components/ui';
import { DnaSource } from '../components/DnaSource';

const POLL_MS = 8000;

export function DemoScreen() {
  const { ids, rt, indices, reset, refresh } = useSession();
  const [rows, setRows] = useState<TokenRow[]>([]);
  const rtRef = useRef(rt);
  rtRef.current = rt;
  const epoch = rt.a.epoch ?? rt.b.epoch;

  // The chain column reads real token accounts for both identities' segments.
  useEffect(() => {
    if (!ids || epoch === null) return;
    let alive = true;
    const load = async () => {
      try {
        const [ra, rb] = await Promise.all([
          fetchTokenRows(ids.a.genome, indices, epoch),
          fetchTokenRows(ids.b.genome, indices, epoch),
        ]);
        const byPda = new Map<string, TokenRow>();
        for (const row of [...ra, ...rb]) if (row.holders.length) byPda.set(row.pda.toBase58(), row);
        if (!alive) return;
        const list = [...byPda.values()].sort((x, y) => y.holders.length - x.holders.length);
        setRows(list);
        // a pane only learns of a match on its own actions; catch the ones its relative created
        for (const who of ['a', 'b'] as const) {
          const me = ids[who].keypair.publicKey;
          const inMatch = list.some((r) => r.holders.length > 1 && r.holders.some((h) => h.equals(me)));
          if (inMatch && !rtRef.current[who].matches.length && !rtRef.current[who].busy) void refresh(who);
        }
      } catch { /* keep the last good view; the panes surface errors */ }
    };
    void load();
    const t = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, [ids, epoch, indices, refresh]);

  if (!ids) return null;
  const hit = rows.find((r) => r.holders.length > 1);

  return (
    <main className="stack" style={{ gap: 24 }}>
      <div className="demo-head">
        <h1 className="h1">A match, found by collision.</h1>
        <button type="button" className="pill" onClick={reset}>Reset demo</button>
      </div>

      <div className="demo-cols">
        <Pane who="a" />

        <section className="chain" aria-label="Solana devnet, public">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="big">Solana devnet</div>
            <span className="public">Public</span>
          </div>
          {hit ? (
            <a className="banner" role="status" href={explorerAccount(hit.pda)} target="_blank" rel="noreferrer">
              <span className="mono" style={{ fontWeight: 500 }}>segmentMatch ↗</span>
              <small>{hit.holders.length} holders on token {shortHex(hit.token)}{epoch !== null ? `, epoch ${epoch}` : ''}</small>
            </a>
          ) : (
            <p className="note" style={{ color: 'var(--chain-muted)' }}>No matches yet.</p>
          )}
          <div className="label">Token accounts ({rows.length})</div>
          <div className="token-list">
            {rows.map((r) => (
              <a key={r.pda.toBase58()} className={r.holders.length > 1 ? 'token is-match' : 'token'} href={explorerAccount(r.pda)} target="_blank" rel="noreferrer" title="Open on Solana Explorer">
                <span>{shortHex(r.token)} ↗</span>
                <span className="holders">{r.holders.length} holder{r.holders.length > 1 ? 's · match' : ''}</span>
              </a>
            ))}
          </div>
          <p className="foot">Public on Solana. No DNA here. Click a token to open it on Explorer.</p>
        </section>

        <Pane who="b" />
      </div>
    </main>
  );
}

function Pane({ who }: { who: Who }) {
  const { ids, rt, indices, fund, register, publish, allowContact } = useSession();
  const id = ids![who];
  const r = rt[who];
  const matched = new Set(r.matches.flatMap((m) => m.indices));
  const posted = new Set(r.posted);
  const states: CellState[] = Array.from({ length: SEGMENT_COUNT }, (_, i) =>
    matched.has(i) ? 'shared' : posted.has(i) ? 'published' : r.proving === i ? 'proving' : 'queued');
  const m = partnerMatch(ids!, rt, who);
  const consent = m ? r.consent[m.counterparty.toBase58()] : undefined;
  const name = who === 'a' ? 'Browser A · you' : 'Browser B · relative';

  let action = null;
  if (r.registered && !r.rootMatches) {
    action = <div className="notice info">A different genome is registered. Upload the same file again, or reset.</div>;
  } else if (r.balance !== null && r.balance < 0.1 && !r.registered) {
    action = <button type="button" className="btn btn-secondary btn-compact" onClick={() => fund(who)} disabled={!!r.busy}>{r.busy ?? 'Fund'}</button>;
  } else if (r.registered === false) {
    action = <button type="button" className="btn btn-primary btn-compact" onClick={() => register(who)} disabled={!!r.busy}>{r.busy ?? 'Register genome'}</button>;
  } else if (r.registered && r.posted.length < indices.length) {
    action = (
      <button type="button" className="btn btn-primary btn-compact" onClick={() => publish(who)} disabled={!!r.busy}>
        {r.busy === 'Publishing' ? `Publishing ${r.posted.length}/${indices.length}` : `Publish ${indices.length} segments`}
      </button>
    );
  } else if (m && !consent?.me) {
    action = <button type="button" className="btn btn-primary btn-compact" onClick={() => allowContact(who, m.counterparty)} disabled={!!r.busy}>{r.busy ?? 'Allow contact'}</button>;
  } else if (consent?.me) {
    action = <div className="notice info">{consent.them ? 'Contact unlocked.' : 'You allowed contact. Waiting for them.'}</div>;
  }

  return (
    <section className="card" aria-label={name}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <div className="big">{name}</div>
        <div className="mono label">{short(id.keypair.publicKey.toBase58())}</div>
      </div>
      <DnaSource who={who} compact />
      <SegmentGrid small states={states} label={`${name}: ${posted.size} segments published, ${matched.size} shared`} />
      <div className="legend" style={{ flexDirection: 'column', gap: 10 }}>
        <span><Swatch color="var(--green)" />Shared segments</span>
        <span><Swatch color="var(--green-soft)" />Published</span>
        <span><Swatch color="var(--cell)" />Not published</span>
      </div>
      <ErrorNotice>{r.error}</ErrorNotice>
      <div className="footer-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <div className="row" style={{ padding: 0, border: 0 }}>
          <span>Tokens posted</span><span className="mono">{r.posted.length} / {indices.length}</span>
        </div>
        {action}
      </div>
    </section>
  );
}
