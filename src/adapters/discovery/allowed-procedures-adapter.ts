/**
 * PR-3 (issue #658) — Node-backed adapter for the default
 * `allowedProcedures` discovery service.
 *
 * The PURE scanner lives in `src/core/services/allowed-procedures-discovery.ts`;
 * this adapter supplies:
 *
 *   - the `nodeFileSystem` / `nodeSyncFileSystem` ports (real `node:fs` reads),
 *   - `createNodeDiscoverFromSrcRoot()` — a `DiscoverFromSrcRootSync` factory
 *     that the Node config composition root can hand to `buildProjectConfig`.
 *
 * The adapter keeps the architectural ratchet
 * (`test/architecture/core-boundary.test.ts`) honest: no `node:fs` /
 * `node:fs/promises` lives in `src/core/`.
 */

import { readdirSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import {
  type AllowedProceduresDiscoveryPort,
  type AllowedProceduresDiscoveryResult,
  type AllowedProceduresDiscoverySyncPort,
  type DiscoverAllowedProceduresOptions,
  type DiscoverAllowedProceduresSyncOptions,
  type DiscoverFromSrcRootSync,
  discoverAllowedProcedures,
  discoverAllowedProceduresSync,
} from "../../core/services/allowed-procedures-discovery.js";

/**
 * Real-Node async port. Walks the `node:fs/promises` API and produces
 * `Dirent` objects that already match the `DiscoveryDirent` shape.
 */
export const nodeFileSystem: AllowedProceduresDiscoveryPort = {
  readdir: async (path) => readdir(path, { withFileTypes: true }),
  readFile: async (path) => readFile(path, "utf8"),
};

/**
 * Real-Node sync port. Walks the `node:fs` API directly so the config
 * builder (sync) can perform the discovery without re-entering the event
 * loop. The sync variant is intentionally separate from the async one
 * because each path uses a distinct API surface — mixing them up at
 * runtime is a foot-gun.
 */
export const nodeSyncFileSystem: AllowedProceduresDiscoverySyncPort = {
  readdirSync: (path) => readdirSync(path, { withFileTypes: true }),
  readFileSync: (path) => readFileSync(path, "utf8"),
};

/**
 * Convenience wrapper: the async discovery entry point with the Node port
 * pre-wired. Use this when calling Dysflow from the async loader chain.
 */
export function discoverAllowedProceduresWithNodeIo(
  srcRoot: string,
  options: Omit<DiscoverAllowedProceduresOptions, "fileSystem"> = {},
): Promise<AllowedProceduresDiscoveryResult> {
  return discoverAllowedProcedures(srcRoot, {
    fileSystem: nodeFileSystem,
    ...options,
  });
}

/**
 * Convenience wrapper: the sync discovery entry point with the Node port
 * pre-wired. Use this from `buildProjectConfig` via the
 * `DiscoverFromSrcRootSync` factory below.
 */
export function discoverAllowedProceduresSyncWithNodeIo(
  srcRoot: string,
  options: Omit<DiscoverAllowedProceduresSyncOptions, "syncFileSystem"> = {},
): AllowedProceduresDiscoveryResult {
  return discoverAllowedProceduresSync(srcRoot, {
    syncFileSystem: nodeSyncFileSystem,
    ...options,
  });
}

/**
 * The default `DiscoverFromSrcRootSync` the Node composition root hands to
 * `buildProjectConfig` when the caller has not supplied its own. Returns
 * the procedure list rather than the full result — the config builder
 * only needs the names.
 */
export function createNodeDiscoverFromSrcRoot(): DiscoverFromSrcRootSync {
  return (srcRoot) => discoverAllowedProceduresSyncWithNodeIo(srcRoot).procedures;
}
