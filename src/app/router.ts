/**
 * Hash routes, so the back button and reloads land where expected:
 *   #/               home (the account's trees)
 *   #/arbre/<id>     a tree
 *   #/arbre/<id>/ressources   the tree's resources
 *   #/parametres     settings
 */

import { useCallback, useEffect, useState } from 'react';

export type Route = { name: 'home' } | { name: 'tree'; id: string } | { name: 'resources'; id: string } | { name: 'settings' };

export function parseRoute(hash: string): Route {
  const h = hash.replace(/^#/, '');
  const res = /^\/arbre\/([^/?]+)\/ressources/.exec(h);
  if (res) return { name: 'resources', id: decodeURIComponent(res[1]!) };
  const tree = /^\/arbre\/([^/?]+)/.exec(h);
  if (tree) return { name: 'tree', id: decodeURIComponent(tree[1]!) };
  if (/^\/parametres/.test(h) || /^\/settings/.test(h)) return { name: 'settings' };
  return { name: 'home' };
}

export function routeHash(r: Route): string {
  switch (r.name) {
    case 'home':
      return '#/';
    case 'tree':
      return `#/arbre/${encodeURIComponent(r.id)}`;
    case 'resources':
      return `#/arbre/${encodeURIComponent(r.id)}/ressources`;
    case 'settings':
      return '#/parametres';
  }
}

export function useHashRoute(): [Route, (r: Route, replace?: boolean) => void] {
  const [route, setRoute] = useState<Route>(() => parseRoute(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const navigate = useCallback((r: Route, replace = false) => {
    const hash = routeHash(r);
    if (location.hash === hash) return;
    if (replace) history.replaceState(null, '', hash);
    else location.hash = hash;
    // replaceState does not fire hashchange
    if (replace) setRoute(r);
  }, []);
  return [route, navigate];
}
