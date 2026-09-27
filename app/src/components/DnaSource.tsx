import { useRef } from 'react';
import { useSession, type Who } from '../lib/session';

const SAMPLES = [
  ['cousin-a.txt', 'Cousin A'],
  ['cousin-b.txt', 'Cousin B'],
  ['stranger.txt', 'Stranger'],
];

// where this identity's genome came from, with upload and sample files
export function DnaSource({ who, compact }: { who: Who; compact?: boolean }) {
  const { rt, loadFile } = useSession();
  const input = useRef<HTMLInputElement>(null);
  const r = rt[who];
  const locked = r.registered === true && r.rootMatches;

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void loadFile(who, file);
  };

  return (
    <div className={compact ? 'dna-source compact' : 'dna-source'}>
      <div className="dna-source-head">
        <div>
          <div className="label">DNA source</div>
          <div className={compact ? 'mono' : 'big'}>{r.source ?? 'Generated in this browser'}</div>
        </div>
        {!locked && (
          <>
            <input ref={input} type="file" accept=".txt,.csv,text/plain" onChange={pick} hidden />
            <button type="button" className="btn btn-secondary btn-compact" onClick={() => input.current?.click()} disabled={!!r.busy}>
              {r.busy === 'Reading file' ? 'Reading…' : 'Upload DNA file'}
            </button>
          </>
        )}
      </div>
      {locked ? (
        <p className="note">Registered on Solana. Reset the demo to use a different file.</p>
      ) : (
        <>
          <p className="note">
            Read in this browser, never uploaded. Sample files:{' '}
            {SAMPLES.map(([file, name], i) => (
              <span key={file}>{i > 0 && ' · '}<a href={`/sample-dna/${file}`} download>{name}</a></span>
            ))}
          </p>
          {!compact && (
            <p className="note">Synthetic files only. Tokens are published on a public chain, so never use a real DNA file.</p>
          )}
        </>
      )}
    </div>
  );
}
