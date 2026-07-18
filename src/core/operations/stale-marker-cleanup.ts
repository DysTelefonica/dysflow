import { join } from "node:path";
import type { StaleMarkerFileSystemPort } from "./stale-marker-file-system-port.js";

/**
 * #967 — stale marker auto-cleanup.
 *
 * Markers under `<projectRoot>/.dysflow/runtime/markers/{operationId}.json`
 * may linger with `status: "running"` long after the operation that
 * produced them has terminated without a clean `cleaned`/`completed`
 * transition (e.g. aborted PowerShell session, host crash, force-killed
 * MSACCESS.EXE). The pre-write gate (`diagnoseProjectConfig` /
 * `findRunningOperations`) treats any `status: "running"` marker in
 * scope as a blocker — so a stale marker can silently wedge the project
 * for hours.
 *
 * `cleanupStaleMarkers` proactively rewrites stale running markers to
 * `status: "abandoned"` BEFORE `findRunningOperations` runs. `abandoned`
 * markers are ignored by the write-gate, so the auto-cleanup is the
 * canonical remediation that prevents the red-herring pattern.
 *
 * Threshold comes from `capabilities.staleMarkerThresholdMinutes` in
 * `.dysflow/project.json`; the adapter layer (`project-config-diagnostic`)
 * reads it and passes it here.
 */
export const DEFAULT_STALE_MARKER_THRESHOLD_MS = 30 * 60 * 1000;

export type CleanupStaleMarkersOptions = {
  /** Filesystem port. Production wires `nodeStaleMarkerFileSystem`; tests inject a fake. */
  fileSystem: StaleMarkerFileSystemPort;
  /** Absolute path to the project-local markers directory. */
  markersRoot: string;
  /** Stale cutoff in milliseconds; the comparison is `nowMs - updatedAt >= thresholdMs`. */
  thresholdMs: number;
  /** Inject the wall-clock for deterministic tests. Defaults to `Date.now()`. */
  nowMs?: number;
};

export type CleanupStaleMarkersError = {
  file: string;
  message: string;
};

export type CleanupStaleMarkersResult = {
  /** Marker file names (basenames) whose `status` was reaped to `"abandoned"`. */
  cleaned: string[];
  /** Per-file parse / IO failures that did NOT abort the sweep. */
  errors: CleanupStaleMarkersError[];
};

/**
 * Sweep `markersRoot` once, rewriting any `*.json` marker whose `status`
 * is `"running"` AND whose `updatedAt` is older than `thresholdMs` (a
 * wall-clock comparison) with `status: "abandoned"` and an `abandonedAt`
 * timestamp equal to `nowMs` (ISO 8601).
 *
 * Best-effort by design — a single corrupt file surfaces in `errors[]`
 * but does NOT stop the sweep. A missing `markersRoot` returns an empty
 * result with no errors (this is the default for projects that have
 * never run an operation).
 *
 * The function does NOT delete files; it transitions `status` in place.
 * Deletion would lose the audit trail of which ops were once running.
 */
export async function cleanupStaleMarkers(
  options: CleanupStaleMarkersOptions,
): Promise<CleanupStaleMarkersResult> {
  const { fileSystem, markersRoot, thresholdMs } = options;
  const nowMs = options.nowMs ?? Date.now();
  const result: CleanupStaleMarkersResult = { cleaned: [], errors: [] };

  let entries: string[];
  try {
    entries = await fileSystem.readdir(markersRoot);
  } catch (err) {
    // Missing directory is the normal idle case; swallow silently.
    if (isMissingDirError(err)) return result;
    result.errors.push({
      file: markersRoot,
      message: `Unable to read markers directory: ${formatError(err)}`,
    });
    return result;
  }

  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const filePath = join(markersRoot, entry);
    let raw: string;
    try {
      raw = await fileSystem.readFile(filePath);
    } catch (err) {
      if (isMissingFileError(err)) continue;
      result.errors.push({ file: entry, message: `Read failed: ${formatError(err)}` });
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      result.errors.push({ file: entry, message: `JSON.parse failed: ${formatError(err)}` });
      continue;
    }

    if (!isPlainObjectRecord(parsed)) {
      result.errors.push({ file: entry, message: "Marker payload is not a JSON object" });
      continue;
    }

    // Accept either the flat shape `{ status, updatedAt, ... }` or a wrapped
    // `{ marker: { status, updatedAt, ... } }` — `findRunningOperations`
    // unwraps the same shape, and historical marker writers nested their
    // payload under a `marker` key.
    const inner = isPlainObjectRecord(parsed.marker) ? parsed.marker : parsed;

    if (inner.status !== "running") continue;

    const updatedAtMs = parseIsoMs(inner.updatedAt);
    if (updatedAtMs === null) continue;

    if (nowMs - updatedAtMs < thresholdMs) continue;

    const abandonedAtIso = new Date(nowMs).toISOString();
    const next: Record<string, unknown> = {
      ...parsed,
      status: "abandoned",
      abandonedAt: abandonedAtIso,
    };
    // Mirror status/abandonedAt into the inner block too when the
    // payload used the wrapped shape, so consumers that unwrap see the
    // same fields they would for flat markers.
    if (parsed !== inner) {
      next.marker = { ...inner, status: "abandoned", abandonedAt: abandonedAtIso };
    }

    try {
      await fileSystem.writeFile(filePath, JSON.stringify(next));
      result.cleaned.push(entry);
    } catch (err) {
      result.errors.push({ file: entry, message: `Write failed: ${formatError(err)}` });
    }
  }

  return result;
}

export function isPlainObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseIsoMs(value: unknown): number | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isMissingDirError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "ENOENT";
}

function isMissingFileError(err: unknown): boolean {
  return isMissingDirError(err);
}
