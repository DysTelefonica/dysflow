import { type CleanStaleMarkersResult, cleanStaleMarkers } from "./stale-marker-cleanup.js";
import type { StaleMarkerFileSystemPort } from "./stale-marker-file-system-port.js";

/**
 * Round-12 (#976) — explicit user-callable cleanup of stale `running`
 * markers under `<projectRoot>/.dysflow/runtime/markers/`.
 *
 * Pairs with the #967 auto-cleanup that runs on every operation start:
 * the auto-cleanup is invisible and project-config-driven; this
 * surface is opt-in and parameter-driven.
 *
 * The service is intentionally narrow: it accepts the four flags the
 * MCP `clean_stale_markers` tool advertises (`olderThanMinutes`,
 * `keepFailed`, `dryRun`, `confirm`) — translated here into the
 * milliseconds + boolean shape the core sweep expects. The MCP layer
 * enforces `confirm === true` before allowing a non-dry-run call; the
 * service itself trusts the caller to have already gated that decision.
 */
export type CleanStaleMarkersRequest = {
  /** Absolute path to the project-local markers directory. */
  markersRoot: string;
  /** Stale cutoff in milliseconds (caller converts from minutes). */
  olderThanMs: number;
  /** Default `true`. When false, also reap `status: "failed"` markers beyond threshold. */
  keepFailed?: boolean;
  /** Default `true`. When false, perform real writes (handler enforces confirm gate). */
  dryRun?: boolean;
  /** Inject the wall-clock for deterministic tests. Defaults to `Date.now()`. */
  nowMs?: number;
};

export interface CleanStaleMarkersService {
  run(request: CleanStaleMarkersRequest): Promise<CleanStaleMarkersResult>;
}

/**
 * Production factory. Wires the supplied filesystem port (typically
 * `nodeStaleMarkerFileSystem`) and forwards every request to the core
 * {@link cleanStaleMarkers} function. The function is pure; the service
 * is just a DI seam so the MCP layer can stub it in tests.
 */
export function createCleanStaleMarkersService(args: {
  fileSystem: StaleMarkerFileSystemPort;
}): CleanStaleMarkersService {
  const { fileSystem } = args;
  return {
    async run(request: CleanStaleMarkersRequest): Promise<CleanStaleMarkersResult> {
      return cleanStaleMarkers({
        fileSystem,
        markersRoot: request.markersRoot,
        olderThanMs: request.olderThanMs,
        keepFailed: request.keepFailed,
        dryRun: request.dryRun,
        nowMs: request.nowMs,
      });
    },
  };
}
