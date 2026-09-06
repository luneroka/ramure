/** IndexedDB implementations of the store interfaces. */

import { kvDelete, kvGet, kvSet, listSnapshots, loadSnapshot, mediaDelete, mediaGet, mediaPut, saveSnapshot, TREE_KEY } from '../db';
import type { MediaStore, SavedTree, Snapshot, SnapshotMeta, TreeStore } from './types';

export class LocalTreeStore implements TreeStore {
  loadCurrent(): Promise<SavedTree | undefined> {
    return kvGet<SavedTree>(TREE_KEY);
  }
  saveCurrent(saved: SavedTree): Promise<void> {
    return kvSet(TREE_KEY, saved);
  }
  clearCurrent(): Promise<void> {
    return kvDelete(TREE_KEY);
  }
  listSnapshots(): Promise<SnapshotMeta[]> {
    return listSnapshots();
  }
  saveSnapshot(gedcom: string, fileName: string, people: number): Promise<void> {
    return saveSnapshot(gedcom, fileName, people);
  }
  loadSnapshot(key: string): Promise<Snapshot | undefined> {
    return loadSnapshot(key);
  }
}

export class LocalMediaStore implements MediaStore {
  put(id: string, blob: Blob): Promise<void> {
    return mediaPut(id, blob);
  }
  get(id: string): Promise<Blob | undefined> {
    return mediaGet(id);
  }
  delete(id: string): Promise<void> {
    return mediaDelete(id);
  }
}
