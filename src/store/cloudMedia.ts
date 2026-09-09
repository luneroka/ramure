/**
 * Media store for a cloud tree: the local IndexedDB copy is the cache and
 * the offline source; uploads go to the server and are retried on the next
 * opportunity if they fail.
 */

import { kvGet, kvSet, mediaGet, mediaPut } from '../db';
import { api } from '../sync/api';
import type { MediaStore } from './types';

interface UploadQueue {
  ids: string[];
}

export class CloudMediaStore implements MediaStore {
  constructor(private treeId: string) {
    void this.flush();
    window.addEventListener('online', () => void this.flush());
  }

  private queueKey(): string {
    return `media-queue:${this.treeId}`;
  }

  async put(id: string, blob: Blob): Promise<void> {
    await mediaPut(id, blob);
    try {
      await api.putMedia(this.treeId, id, blob);
    } catch {
      const q = (await kvGet<UploadQueue>(this.queueKey())) ?? { ids: [] };
      if (!q.ids.includes(id)) await kvSet(this.queueKey(), { ids: [...q.ids, id] });
    }
  }

  async get(id: string): Promise<Blob | undefined> {
    const local = await mediaGet(id);
    if (local) return local;
    try {
      const remote = await api.getMedia(this.treeId, id);
      if (remote) await mediaPut(id, remote);
      return remote;
    } catch {
      return undefined;
    }
  }

  /** The server marks the file; the local copy stays so an undo shows it at once. */
  async delete(id: string): Promise<void> {
    try {
      await api.deleteMedia(this.treeId, id);
    } catch {
      /* not reachable now: the nightly reaper only takes what the document no longer references */
    }
  }

  /** Retry queued uploads. */
  async flush(): Promise<void> {
    const q = await kvGet<UploadQueue>(this.queueKey());
    if (!q?.ids.length) return;
    const remaining: string[] = [];
    for (const id of q.ids) {
      const blob = await mediaGet(id);
      if (!blob) continue;
      try {
        await api.putMedia(this.treeId, id, blob);
      } catch {
        remaining.push(id);
      }
    }
    await kvSet(this.queueKey(), { ids: remaining });
  }
}
