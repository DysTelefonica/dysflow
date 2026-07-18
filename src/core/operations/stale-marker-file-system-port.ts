/**
 * Filesystem port for stale marker cleanup (#967).
 *
 * Mirrors the surface `cleanupStaleMarkers` needs: a directory listing,
 * a JSON read, and a JSON write. Lives in `src/core` so the cleanup logic
 * does not import `node:fs` directly. The production adapter is
 * `src/adapters/operations/node-stale-marker-file-system.ts`; tests
 * inject a fake to drive the happy / sad / adversarial branches.
 *
 * `readdir` returns basenames (`string[]`); the cleanup builds absolute
 * paths by joining against `markersRoot`.
 */
export interface StaleMarkerFileSystemPort {
  readdir(path: string): Promise<string[]>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
}
