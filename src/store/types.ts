/**
 * Storage behind interfaces. The app talks to a TreeStore and a MediaStore;
 * today both are local (IndexedDB), later a remote pair syncs with the
 * server while the local pair stays as the cache and offline copy.
 */

export interface SavedTree {
  /** The tree as GEDCOM text: lossless for Ramure's own model. */
  gedcom: string;
  fileName: string;
  focusId?: string;
  savedAt: number;
}

export interface SnapshotMeta {
  key: string;
  savedAt: number;
  fileName: string;
  people: number;
}

export interface Snapshot extends SnapshotMeta {
  gedcom: string;
}

export interface TreeStore {
  loadCurrent(): Promise<SavedTree | undefined>;
  saveCurrent(saved: SavedTree): Promise<void>;
  listSnapshots(): Promise<SnapshotMeta[]>;
  saveSnapshot(gedcom: string, fileName: string, people: number): Promise<void>;
  loadSnapshot(key: string): Promise<Snapshot | undefined>;
}

export interface MediaStore {
  put(id: string, blob: Blob): Promise<void>;
  get(id: string): Promise<Blob | undefined>;
  delete(id: string): Promise<void>;
}
