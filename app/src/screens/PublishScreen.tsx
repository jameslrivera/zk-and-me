import { explorerTx } from '../lib/chain';
import { short } from '../lib/field';
import { SEGMENT_COUNT } from '../lib/genome';
import { useSession } from '../lib/session';
import { Arrow, ErrorNotice, SegmentGrid, Swatch, type CellState } from '../components/ui';

export function PublishScreen() {
  const { ids, rt, indices, publish } = useSession();
  if (!ids) return null;
  const r = rt.a;
  const selected = new Set(indices);
  const posted = new Set(r.posted);
  const states: CellState[] = Array.from({ length: SEGMENT_COUNT }, (_, i) => {
    if (!selected.has(i)) return 'idle';
    if (posted.has(i)) return 'posted';
    if (r.proving === i) return 'proving';
    return 'queued';
  });
  const done = r.posted.length;
  const total = indices.length;
  const complete = done >= total;
  const matched = r.matches.length > 0;

  return (
    <main className="layout">
      <section className="card hero">
        <div className="stack" style={{ gap: 14 }}>
          <div className="label">Publishing{r.epoch !== null ? `, epoch ${r.epoch}` : ''}</div>
          <h1 className="h1">Proving each segment.</h1>
        </div>
        <div className="stack" style={{ gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
            <div className="big">{done} of {total} posted</div>
            <div className="label" style={{ fontSize: 15 }}>
              {r.busy === 'Publishing' ? 'Keep this tab open while proofs run' : complete ? 'All selected segments are on-chain' : 'Ready to publish'}
            </div>
          </div>
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
            <div style={{ width: `${(done / total) * 100}%` }} />
          </div>
        </div>
        <SegmentGrid states={states} label={`${done} of ${total} selected segments posted`} />
        <div className="footer-row">
          <div className="legend">
            <span><Swatch color="var(--green)" />Posted on-chain</span>
            <span><Swatch color="#fff" border="var(--green)" />Proving now</span>
            <span><Swatch color="var(--cell)" />Queued</span>
            <span><Swatch color="var(--cell-faint)" />Not published in this demo</span>
          </div>
        </div>
      </section>

      <aside className="stack">
        <div className="card" style={{ gap: 12 }}>
          <div className="label">Transactions</div>
          <div>
            {r.log.length === 0 && <p className="note">Nothing posted yet.</p>}
            {r.log.slice(0, 7).map((l) => (
              <div className="tx" key={`${l.index}-${l.status}-${l.sig ?? ''}`}>
                <span className="mono" style={{ color: 'var(--muted)' }}>#{String(l.index).padStart(3, '0')}</span>
                <span className="mono">post_token</span>
                <span className="mono" style={{ color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {l.sig ? <a href={explorerTx(l.sig)} target="_blank" rel="noreferrer">{short(l.sig)}</a> : l.status === 'proving' ? 'proving in browser…' : l.error}
                </span>
                <span className={l.status === 'confirmed' ? 'status-ok' : l.status === 'failed' ? 'status-bad' : 'status-wait'}>
                  {l.status === 'confirmed' ? 'Confirmed' : l.status === 'failed' ? 'Failed' : 'Proving'}
                </span>
              </div>
            ))}
          </div>
          <p className="note">Each transaction is one token and its proof. Click one to see it on Solana Explorer.</p>
        </div>

        <ErrorNotice>{r.error}</ErrorNotice>
        <div className="btn-row">
          {matched && (
            <a className="btn btn-dark" href="#match">
              <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span className="dot" style={{ width: 10, height: 10, borderRadius: 999, background: '#3FBF92' }} />
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  A shared segment was found<small>Nothing is shared until you choose</small>
                </span>
              </span>
              <Arrow />
            </a>
          )}
          {!complete && (
            <button type="button" className="btn btn-primary" onClick={() => publish('a')} disabled={!!r.busy || !r.registered}>
              {r.busy === 'Publishing' ? 'Publishing…' : done > 0 ? 'Resume publishing' : 'Start publishing'}
              <small>{r.registered ? `${total - done} proofs left` : 'Register your genome first'}</small>
            </button>
          )}
        </div>
      </aside>
    </main>
  );
}
