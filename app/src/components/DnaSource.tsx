import { useMemo, useRef } from 'react';
import { sessionSamples } from '../lib/dnaFile';
import { useSession, type Who } from '../lib/session';

// save generated text as a file
function save(file: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: file });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// where this identity's genome came from, with upload and sample files
export function DnaSource({ who, compact }: { who: Who; compact?: boolean }) {
  const { rt, loadFile, seed } = useSession();
  const samples = useMemo(() => (seed === null ? [] : sessionSamples(seed)), [seed]);
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
            {samples.map((s, i) => (
              <span key={s.file}>{i > 0 && ' · '}<button type="button" className="link" onClick={() => save(s.file, s.text)}>{s.name}</button></span>
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
