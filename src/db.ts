/**
 * Tiny IndexedDB key-value store. The tree is kept as the original GEDCOM
 * text plus the focus person, so nothing is lost and the schema stays trivial
 * until the editor arrives in phase 2.
 */

const DB_NAME = 'ramure';
const STORE = 'kv';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await open();
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* storage unavailable: the app still works for the session */ }
}

export async function kvDelete(key: string): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* ignore */ }
}

export interface SavedTree {
  gedcom: string;
  fileName: string;
  focusId?: string;
  savedAt: number;
}

export const TREE_KEY = 'tree';

export interface Snapshot {
  key: string;
  savedAt: number;
  fileName: string;
  people: number;
  gedcom: string;
}

const SNAP_PREFIX = 'snap:';
const MAX_SNAPSHOTS = 24;

async function allKeys(): Promise<string[]> {
  try {
    const db = await open();
    return await new Promise<string[]>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAllKeys();
      req.onsuccess = () => resolve((req.result as IDBValidKey[]).map(String));
      req.onerror = () => reject(req.error);
    });
  } catch { return []; }
}

/** Keep a dated copy of the tree. Oldest copies are pruned beyond MAX_SNAPSHOTS. */
export async function saveSnapshot(gedcom: string, fileName: string, people: number): Promise<void> {
  const savedAt = Date.now();
  const key = SNAP_PREFIX + savedAt;
  await kvSet(key, { key, savedAt, fileName, people, gedcom } satisfies Snapshot);
  const keys = (await allKeys()).filter((k) => k.startsWith(SNAP_PREFIX)).sort();
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_SNAPSHOTS))) await kvDelete(old);
}

export async function listSnapshots(): Promise<Array<Omit<Snapshot, 'gedcom'>>> {
  const keys = (await allKeys()).filter((k) => k.startsWith(SNAP_PREFIX)).sort().reverse();
  const out: Array<Omit<Snapshot, 'gedcom'>> = [];
  for (const k of keys) {
    const s = await kvGet<Snapshot>(k);
    if (s) out.push({ key: s.key, savedAt: s.savedAt, fileName: s.fileName, people: s.people });
  }
  return out;
}

export async function loadSnapshot(key: string): Promise<Snapshot | undefined> {
  return kvGet<Snapshot>(key);
}
