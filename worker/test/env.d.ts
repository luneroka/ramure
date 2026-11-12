/**
 * The test runtime's env is the Worker's own, plus the migrations the config
 * reads from disk. `cloudflare:test` types its `env` as `Cloudflare.Env`, so
 * that is the interface widened here; a declaration file because augmenting a
 * global namespace is the one place a namespace is the right tool.
 */
import type { D1Migration } from 'cloudflare:test';
import type { Env as WorkerEnv } from '../env';

declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
