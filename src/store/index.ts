/**
 * The app's stores. One place to swap implementations: when sync arrives,
 * these become a synced tree store and a caching media store, and no
 * component changes.
 */

import { LocalMediaStore, LocalTreeStore } from './local';
import type { MediaStore, TreeStore } from './types';

export const treeStore: TreeStore = new LocalTreeStore();
export const localMedia: MediaStore = new LocalMediaStore();

let active: MediaStore = localMedia;

/** The media store of the tree currently open: local for the device tree, cache-through for a cloud tree. */
export const mediaStore: MediaStore = {
  put: (id, blob) => active.put(id, blob),
  get: (id) => active.get(id),
  delete: (id) => active.delete(id),
};

export function setActiveMediaStore(store: MediaStore | null): void {
  active = store ?? localMedia;
}

export type { MediaStore, SavedTree, Snapshot, SnapshotMeta, TreeStore } from './types';
