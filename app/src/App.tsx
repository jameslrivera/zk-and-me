import { useEffect, useState } from 'react';
import { Header, type Route } from './components/ui';
import { useSession } from './lib/session';
import { DemoScreen } from './screens/DemoScreen';
import { GenomeScreen } from './screens/GenomeScreen';
import { MatchScreen } from './screens/MatchScreen';
import { PublishScreen } from './screens/PublishScreen';

const ROUTES: Route[] = ['genome', 'publish', 'match', 'demo'];
const parse = (): Route => {
  const h = window.location.hash.slice(1) as Route;
  return ROUTES.includes(h) ? h : 'genome';
};

export function App() {
  const [route, setRoute] = useState<Route>(parse);
  const { ready, bootError } = useSession();

  useEffect(() => {
    const on = () => { setRoute(parse()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  return (
    <div className="app">
      <Header route={route} />
      {bootError ? (
        <div className="notice error" role="alert">{bootError}</div>
      ) : !ready ? (
        <p className="note" role="status">Loading…</p>
      ) : route === 'publish' ? <PublishScreen />
        : route === 'match' ? <MatchScreen />
        : route === 'demo' ? <DemoScreen />
        : <GenomeScreen />}
    </div>
  );
}
