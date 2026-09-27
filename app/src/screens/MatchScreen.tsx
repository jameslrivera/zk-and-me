import { useEffect, useState } from 'react';
import { short } from '../lib/field';
import { partnerMatch, useSession } from '../lib/session';
import { explorerAccount } from '../lib/chain';
import { Check, ErrorNotice } from '../components/ui';

export function MatchScreen() {
  const { ids, rt, indices, allowContact, refresh } = useSession();
  const [declined, setDeclined] = useState(false);
  const ready = !!ids;
  // read the chain again whenever this screen opens, so matches a relative made since are included
  useEffect(() => { if (ready) void refresh('a'); }, [ready, refresh]);
  if (!ids) return null;
  const r = rt.a;
  const m = partnerMatch(ids, rt, 'a');

  if (!m) {
    return (
      <main className="layout">
        <section className="card hero">
          <div className="label">Matches</div>
          <h1 className="h1">No matches yet.</h1>
          <p className="lead">
            A match appears when a relative publishes the same segment of DNA as you. Then press Check again.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a className="btn btn-primary btn-compact" style={{ width: 'auto' }} href="#demo">Open the live demo</a>
            <button type="button" className="btn btn-secondary btn-compact" style={{ width: 'auto' }} onClick={() => refresh('a')}>Check again</button>
          </div>
        </section>
      </main>
    );
  }

  const them = m.counterparty.toBase58();
  const consent = r.consent[them] ?? { me: false, them: false };
  const unlocked = consent.me && consent.them;

  return (
    <main className="layout">
      <section className="card hero" style={{ gap: 32 }}>
        <div className="stack" style={{ gap: 14 }}>
          <div className="label green">Match{r.epoch !== null ? `, epoch ${r.epoch}` : ''}</div>
          <h1 className="h1" style={{ maxWidth: '18ch' }}>You share segments of DNA with another account.</h1>
        </div>
        <div className="stats">
          <div className="stat accent"><span>Shared segments</span><span className="v">{m.indices.length} of {indices.length}</span></div>
          <div className="stat"><span className="label">Their account</span><span className="v mono">{short(them)}</span></div>
          <div className="stat"><span className="label">Segment positions</span><span className="v mono">{m.indices.join(', ')}</span></div>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <div className="label">On Solana Explorer</div>
          <div className="explorer-links">
            {m.accounts.map((a, k) => (
              <a key={a.toBase58()} className="mono" href={explorerAccount(a)} target="_blank" rel="noreferrer">Segment {m.indices[k]} ↗</a>
            ))}
            <button type="button" className="link" onClick={() => refresh('a')} disabled={!!r.busy}>Check again</button>
          </div>
        </div>
        <div className="twocol footer-row" style={{ alignItems: 'start' }}>
          <div className="stack" style={{ gap: 14 }}>
            <div style={{ fontWeight: 500 }}>Public on-chain</div>
            <ul>
              <li>That these two accounts share segments</li>
              <li>Which segment positions matched</li>
              <li>Token hashes and each genome's root</li>
            </ul>
          </div>
          <div className="stack" style={{ gap: 14 }}>
            <div style={{ fontWeight: 500 }}>Never leaves your device</div>
            <ul>
              <li>Your markers, in any segment</li>
              <li>Anything that reconstructs your genome</li>
            </ul>
          </div>
        </div>
      </section>

      <aside className="card" style={{ padding: 32, gap: 24 }}>
        <div className="stack" style={{ gap: 10 }}>
          <div className="label">Contact</div>
          <h2 className="h2">{unlocked ? 'Contact unlocked.' : 'Both of you decide.'}</h2>
        </div>
        <div className="rows">
          <div className="row"><span>You</span><ConsentChip ok={consent.me} /></div>
          <div className="row"><span className="mono">{short(them)}</span><ConsentChip ok={consent.them} /></div>
        </div>
        <p className="note" style={{ fontSize: 15 }}>
          {unlocked
            ? 'You both allowed contact. It is recorded on Solana.'
            : declined
              ? 'Nothing was sent. You can allow contact later.'
              : "Contact opens only when both of you allow it."}
        </p>
        <ErrorNotice>{r.error}</ErrorNotice>
        {!consent.me && (
          <div className="btn-row">
            <button type="button" className="btn btn-primary btn-compact" onClick={() => allowContact('a', m.counterparty)} disabled={!!r.busy}>
              {r.busy ?? 'Allow contact'}
            </button>
            {!declined && (
              <button type="button" className="btn btn-secondary btn-compact" onClick={() => setDeclined(true)}>Not now</button>
            )}
          </div>
        )}
      </aside>
    </main>
  );
}

function ConsentChip({ ok }: { ok: boolean }) {
  return ok ? <span className="chip ok"><Check /> Allowed</span> : <span className="chip">Not yet</span>;
}
