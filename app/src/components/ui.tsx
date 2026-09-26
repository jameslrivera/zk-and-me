import type { ReactNode } from 'react';
import { short } from '../lib/field';
import { SEGMENT_COUNT } from '../lib/genome';
import { useSession } from '../lib/session';

export type Route = 'genome' | 'publish' | 'match' | 'demo';

export function Header({ route }: { route: Route }) {
  const { ids, rt } = useSession();
  const me = ids?.a.keypair.publicKey.toBase58();
  const bal = rt.a.balance;
  const copy = () => { if (me) void navigator.clipboard?.writeText(me); };
  const link = (to: Route, text: string) => (
    <a href={`#${to}`} aria-current={route === to || (to === 'genome' && route === 'publish') ? 'page' : undefined}>{text}</a>
  );
  return (
    <header className="header">
      <div className="header-left">
        <a className="wordmark" href="#genome"><span>zk</span> and me</a>
        <nav className="nav" aria-label="Main">
          {link('genome', 'Your genome')}
          {link('match', 'Matches')}
          {link('demo', 'Live demo')}
        </nav>
      </div>
      <button type="button" className="pill" onClick={copy} title="Copy your devnet address">
        <span className="dot" aria-hidden="true" />
        <span className="mono">{me ? `Devnet · ${short(me)}` : 'Devnet'}</span>
        {bal !== null && <span className="mono" style={{ color: 'var(--muted)' }}>{bal.toFixed(2)} SOL</span>}
      </button>
    </header>
  );
}

export type CellState = 'idle' | 'queued' | 'proving' | 'posted' | 'published' | 'shared';

export function SegmentGrid({ states, small, label }: { states: CellState[]; small?: boolean; label: string }) {
  return (
    <div className={small ? 'grid16 small' : 'grid16'} role="img" aria-label={label}>
      {Array.from({ length: SEGMENT_COUNT }, (_, i) => (
        <div key={i} className={`cell is-${states[i] ?? 'queued'}`} />
      ))}
    </div>
  );
}

export function Swatch({ color, border }: { color: string; border?: string }) {
  return <span className="swatch" style={{ background: color, border: border ? `2px solid ${border}` : undefined }} />;
}

export function Check({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function Lock() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function Arrow() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" /><path d="M13 6l6 6-6 6" />
    </svg>
  );
}

export function ErrorNotice({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <div className="notice error" role="alert">{children}</div>;
}
