import { FUND_SOL, explorerAccount, genomePda } from '../lib/chain';
import { short, shortHex, toBE32 } from '../lib/field';
import { SEGMENT_COUNT, WINDOW } from '../lib/genome';
import { useSession } from '../lib/session';
import { Check, ErrorNotice, Lock, SegmentGrid } from '../components/ui';
import { DnaSource } from '../components/DnaSource';

const MIN_SOL = 0.2;

export function GenomeScreen() {
  const { ids, rt, indices, fund, register, reset } = useSession();
  if (!ids) return null;
  const me = ids.a;
  const r = rt.a;
  const root = toBE32(me.genome.root);

  let action;
  if (!r.rootMatches) {
    action = (
      <button type="button" className="btn btn-secondary" onClick={reset}>
        Start a new session<small>Or upload the same DNA file again</small>
      </button>
    );
  } else if (r.balance !== null && r.balance < MIN_SOL && !r.registered) {
    action = (
      <button type="button" className="btn btn-primary" onClick={() => fund('a')} disabled={!!r.busy}>
        {r.busy ?? 'Create account'}<small>Adds {FUND_SOL} test SOL to pay Solana fees</small>
      </button>
    );
  } else if (r.registered === false) {
    action = (
      <button type="button" className="btn btn-primary" onClick={() => register('a')} disabled={!!r.busy}>
        {r.busy ?? 'Register genome'}<small>Saves your genome's root on Solana</small>
      </button>
    );
  } else if (r.registered && r.matches.length && r.posted.length >= indices.length) {
    action = (
      <a className="btn btn-primary" href="#match">
        View your match<small>{r.matches[0].indices.length} shared segments found on Solana</small>
      </a>
    );
  } else if (r.registered) {
    action = (
      <a className="btn btn-primary" href="#publish">
        Publish segment tokens<small>{indices.length} proofs, generated in this browser</small>
      </a>
    );
  } else {
    action = <button type="button" className="btn btn-secondary" disabled>Checking Solana…</button>;
  }

  return (
    <main className="layout">
      <section className="card hero">
        <div className="stack" style={{ gap: 14 }}>
          <div className="label">On this device</div>
          <h1 className="h1">Your genome stays here.</h1>
          <p className="lead">
            {(SEGMENT_COUNT * WINDOW).toLocaleString()} markers in {SEGMENT_COUNT} segments. None of it leaves this browser.
          </p>
        </div>
        <SegmentGrid states={Array(SEGMENT_COUNT).fill('queued')} label="All 128 segments withheld on this device" />
        <div className="footer-row">
          <span className="label" style={{ display: 'inline-flex', gap: 10, alignItems: 'center', fontSize: 15 }}>
            <Lock /> Kept in memory only
          </span>
          <span className="label">1 segment = {WINDOW} markers</span>
        </div>
      </section>

      <aside className="stack">
        <div className="card"><DnaSource who="a" /></div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="label">Lab attestation</div>
            {me.genome.signatureValid
              ? <span className="chip ok"><Check /> Signature valid</span>
              : <span className="chip bad">Signature invalid</span>}
          </div>
          <div><div className="label">Signed by</div><div className="big">Demo DNA Lab</div><div className="note">Test signing key, used for this demo</div></div>
          <div><div className="label">Genome commitment (Merkle root)</div><div className="mono">{shortHex(root)}</div></div>
        </div>

        <div className="card">
          <div className="label">On Solana devnet</div>
          <div className="rows">
            <div className="row"><span>Profile account</span>{r.registered
              ? <a className="mono" href={explorerAccount(genomePda(me.keypair.publicKey))} target="_blank" rel="noreferrer">{short(genomePda(me.keypair.publicKey).toBase58())} ↗</a>
              : <span className="mono">{short(genomePda(me.keypair.publicKey).toBase58())}</span>}</div>
            <div className="row"><span>Registered root</span><span className="mono">{r.registered ? shortHex(root) : 'Not registered'}</span></div>
            <div className="row"><span>Balance</span><span className="mono">{r.balance === null ? '—' : `${r.balance.toFixed(3)} SOL`}</span></div>
            <div className="row"><span>Tokens published</span><span className="mono">{r.posted.length} of {indices.length}</span></div>
          </div>
          <p className="note">Only this 32-byte root is stored on Solana.</p>
        </div>

        <ErrorNotice>{r.error}</ErrorNotice>
        <div className="btn-row">{action}</div>
      </aside>
    </main>
  );
}
