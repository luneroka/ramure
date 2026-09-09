/**
 * The open tree: its sync engine, its media store and its identity. Opening
 * carries a generation counter so a slower open never binds the screen to
 * the wrong engine.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Tree } from '@/gedcom/model';
import { CloudMediaStore } from '@/store/cloudMedia';
import { setActiveMediaStore } from '@/store';
import type { Role } from '@/sync/api';
import { SyncEngine, type EngineEvent, type SyncStatus } from '@/sync/engine';
import { setPendingEdits } from '@/sync/pendingEdits';

/** The open tree. Every tree lives in the account; the device keeps a synced copy. */
export interface Source {
  id: string;
  name: string;
  role: Role;
}

export const LAST_TREE_KEY = 'ramure.lastTree';

export function readLastTree(): Source | null {
  try {
    return JSON.parse(localStorage.getItem(LAST_TREE_KEY) ?? 'null') as Source | null;
  } catch {
    return null;
  }
}

export function useTreeSession(onEvent: (e: EngineEvent, engine: SyncEngine) => void) {
  const engine = useRef<SyncEngine | null>(null);
  const generation = useRef(0);
  const [source, setSource] = useState<Source | null>(null);
  const [sync, setSync] = useState<{ status: SyncStatus; pending: number }>({ status: 'synced', pending: 0 });
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const close = useCallback(() => {
    generation.current++;
    engine.current?.dispose();
    engine.current = null;
    setActiveMediaStore(null);
    setSource(null);
    setSync({ status: 'synced', pending: 0 });
    setPendingEdits(0);
    localStorage.removeItem(LAST_TREE_KEY);
  }, []);

  /** Open a tree; resolves with its working copy, or null when a newer open superseded this one. */
  const open = useCallback(async (id: string, name: string, role: Role): Promise<Tree | null> => {
    const gen = ++generation.current;
    engine.current?.dispose();
    const eng = new SyncEngine(id, role === 'viewer');
    engine.current = eng;
    setActiveMediaStore(new CloudMediaStore(id));
    eng.subscribe((e) => {
      if (gen !== generation.current) return;
      setSync({ status: e.status, pending: e.pending });
      setPendingEdits(e.pending);
      onEventRef.current(e, eng);
    });
    try {
      const opened = await eng.open();
      if (gen !== generation.current) {
        eng.dispose();
        return null;
      }
      setSource({ id, name, role });
      localStorage.setItem(LAST_TREE_KEY, JSON.stringify({ id, name, role }));
      return opened;
    } catch (err) {
      if (gen === generation.current) {
        eng.dispose();
        engine.current = null;
        setActiveMediaStore(null);
        localStorage.removeItem(LAST_TREE_KEY);
      }
      throw err;
    }
  }, []);

  const rename = useCallback((name: string) => {
    setSource((s) => {
      if (!s) return s;
      const next = { ...s, name };
      localStorage.setItem(LAST_TREE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return useMemo(() => ({ engine, source, sync, open, close, rename }), [source, sync, open, close, rename]);
}
