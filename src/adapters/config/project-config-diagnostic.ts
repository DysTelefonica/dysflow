import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { Remediation } from "../../core/contracts/remediation.js";
import {
  remediationForCapabilitiesDisallowWrite,
  remediationForDestinationRootNotFound,
  remediationForMissingProjectConfig,
  remediationForProjectIdMismatch,
  remediationForWriteLockedByRunningOp,
} from "../../core/contracts/remediation.js";
import { DEFAULT_STALE_MARKER_THRESHOLD_MS } from "../../core/operations/stale-marker-cleanup.js";

export type ProjectConfigStatus =
  | "valid"
  | "missing"
  | "id-mismatch"
  | "path-mismatch"
  | "outside-project-root"
  | "destination-root-not-found"
  | "write-locked-by-running-op"
  | "capabilities-disallow-write"
  | "target-not-found"
  | "ambiguous";

export type ProjectConfigDiagnostic = {
  status: ProjectConfigStatus;
  cwd: string;
  configPath: string;
  projectRoot: string;
  projectId: string | null;
  accessPath: string | null;
  backendPath: string | null;
  destinationRoot: string | null;
  writeReady: boolean;
  /**
   * v2.12.0 (#873) — owning worktree identity. `"cwd"` when the configured
   * target lives inside the active worktree (the historical happy path).
   * `"sibling:<abs-canonical-sibling-root>"` when the target lives in a
   * real sibling Git worktree (same parent + own `.git` + different
   * identity, AND the accessPath is NOT a reparse point). Omitted on
   * failure modes where `writeReady` is `false`.
   */
  owningWorktree?: "cwd" | string;
  diagnostics: readonly {
    code: string;
    severity: "error" | "warning";
    message: string;
    /**
     * Issue #970 — structured remediation. Accepts either a legacy plain
     * string (treated as `description` by `structureRemediation`) or the
     * new structured shape (`{description, command, platform, ...}`).
     */
    remediation?: Remediation | string;
  }[];
  remediation: string | null;
};

export type ProjectConfigRequest = {
  operation?: string;
  projectId?: string;
  accessPath?: string;
  accessDbPath?: string;
  databasePath?: string;
  sourcePath?: string;
  backendPath?: string;
  destinationRoot?: string;
  projectRoot?: string;
  contextId?: string;
  /**
   * Issue #968 — opt-in flag that lets read-only-side tools target an
   * `.accdb` outside the active worktree. Honored ONLY when the operation
   * does not mutate the binary (`mutatesBinary === false`); writes to a
   * foreign `.accdb` stay gated because that is precisely the risk
   * `OUTSIDE_PROJECT_ROOT` exists to prevent.
   *
   * Defaults to `false` (omit the field) so backward compat is preserved:
   * external accessPath targets fall through to the current
   * `OUTSIDE_PROJECT_ROOT` verdict.
   */
  allowExternalAccessPath?: boolean;
  /**
   * Issue #968 — forwarded by the MCP dispatcher from
   * `MCP_TOOL_ROUTES[name].mutatesBinary`. When true, `allowExternalAccessPath`
   * is ignored regardless of the caller's intent; when false (and the flag
   * is true), the `OUTSIDE_PROJECT_ROOT` verdict on the accessPath override
   * is bypassed so consumers can read release binaries without copying them
   * into the worktree.
   *
   * Forwarded explicitly instead of imported from
   * `adapters/mcp/dispatch-routes` to keep the diagnostic module
   * independent of MCP-layer routing semantics.
   */
  mutatesBinary?: boolean;
};

const normalize = (value: string): string => resolve(value).replaceAll("\\", "/");
const identity = (value: string): string =>
  process.platform === "win32" ? normalize(value).toLowerCase() : normalize(value);
const canonical = (value: string): string => normalize(realpathSync(value));
const within = (child: string, root: string): boolean => {
  const rel = relative(root, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};

function worktreeRoot(cwd: string): string | null {
  let cursor = resolve(cwd);
  while (true) {
    if (existsSync(join(cursor, ".git"))) return cursor;
    const parent = dirname(cursor);
    if (parent === cursor) return null;
    cursor = parent;
  }
}

export function diagnoseProjectConfig(
  cwdInput: string,
  request: ProjectConfigRequest = {},
  candidateConfig?: Record<string, unknown>,
): ProjectConfigDiagnostic {
  const cwd = normalize(cwdInput);
  const projectRootNative = worktreeRoot(cwdInput);
  if (projectRootNative === null) {
    return {
      status: "outside-project-root",
      cwd,
      configPath: normalize(join(cwdInput, ".dysflow", "project.json")),
      projectRoot: cwd,
      projectId: null,
      accessPath: null,
      backendPath: null,
      destinationRoot: null,
      writeReady: false,
      diagnostics: [
        {
          code: "OUTSIDE_PROJECT_ROOT",
          severity: "error",
          message: "The requested cwd is not inside a Git worktree.",
        },
      ],
      remediation: `Run Dysflow from the intended Git worktree or pass its path with \`--cwd\`.`,
    };
  }
  const projectRoot = normalize(projectRootNative);
  const canonicalProjectRoot = canonical(projectRootNative);
  const configCandidate = join(projectRootNative, ".dysflow", "project.json");
  const legacy = join(projectRootNative, "dysflow.project.json");
  const present = [
    ...(candidateConfig === undefined ? [configCandidate].filter(existsSync) : [configCandidate]),
    ...[legacy].filter(existsSync),
  ];
  const base = {
    cwd,
    configPath: normalize(configCandidate),
    projectRoot,
    projectId: null,
    accessPath: null,
    backendPath: null,
    destinationRoot: null,
  };
  const fail = (
    status: ProjectConfigStatus,
    message: string,
    remediation: Remediation | string,
  ): ProjectConfigDiagnostic => {
    const descText = typeof remediation === "string" ? remediation : remediation.description;
    return {
      ...base,
      status,
      writeReady: false,
      diagnostics: [
        {
          code: status.toUpperCase().replaceAll("-", "_"),
          severity: "error",
          message,
          remediation,
        },
      ],
      remediation: descText,
    };
  };
  if (present.length === 0)
    return fail(
      "missing",
      "No per-worktree .dysflow/project.json was found.",
      remediationForMissingProjectConfig(cwd),
    );
  if (present.length > 1)
    return fail(
      "ambiguous",
      "Both project.json and legacy dysflow.project.json exist in this worktree.",
      `Remove the legacy ${normalize(legacy)} after migrating its settings to ${normalize(configCandidate)}.`,
    );
  const selectedConfig = present[0];
  if (selectedConfig === undefined)
    return fail(
      "missing",
      "No project config selected.",
      `Run \`dysflow setup --cwd ${cwd} --apply --access-path <path>\`.`,
    );
  try {
    if (!within(canonical(dirname(selectedConfig)), canonicalProjectRoot)) throw new Error();
  } catch {
    return fail(
      "outside-project-root",
      "The project config path is redirected outside the owning worktree.",
      `Replace ${normalize(dirname(selectedConfig))} with a directory owned by ${projectRoot}.`,
    );
  }
  let parsed: Record<string, unknown>;
  try {
    const value: unknown = candidateConfig ?? JSON.parse(readFileSync(selectedConfig, "utf8"));
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error();
    parsed = value as Record<string, unknown>;
  } catch {
    return fail(
      "ambiguous",
      "The project config is not valid JSON.",
      `Run \`dysflow doctor --cwd ${cwd}\` and repair ${normalize(selectedConfig)}.`,
    );
  }
  const pathValue = (key: string): string | null =>
    typeof parsed[key] === "string" && parsed[key]
      ? normalize(resolve(projectRootNative, parsed[key] as string))
      : null;
  const projectId = typeof parsed.id === "string" && parsed.id ? parsed.id : null;
  const accessPath = pathValue("accessPath");
  const backendPath = pathValue("backendPath");
  const destinationRoot = pathValue("destinationRoot") ?? normalize(join(projectRootNative, "src"));
  Object.assign(base, {
    configPath: normalize(selectedConfig),
    projectId,
    accessPath,
    backendPath,
    destinationRoot,
  });
  // v2.12.0 (#873) — sibling-worktree recognition. Three-way AND criterion:
  //   1. the accessPath itself is NOT a reparse point (lexical === canonical);
  //   2. canonical-access walks up to a directory that owns a `.git` (real Git worktree);
  //   3. that directory is at the SAME parent as `canonicalProjectRoot` and has
  //      a different identity than `canonicalProjectRoot` itself.
  // All three must hold for `siblingRoot` to be non-null. The lexical-vs-canonical
  // comparison stays fail-closed against Windows junctions / symlinks.
  const repoSiblingRoot = (): string | null => {
    if (
      accessPath === null ||
      parsed.accessPath === undefined ||
      typeof parsed.accessPath !== "string"
    )
      return null;
    let canonicalAccess: string;
    try {
      canonicalAccess = canonical(accessPath);
    } catch {
      return null;
    }
    const lexical = normalize(resolve(projectRootNative, parsed.accessPath));
    if (identity(lexical) !== identity(canonicalAccess)) return null;
    const sibling = worktreeRoot(dirname(canonicalAccess));
    if (sibling === null) return null;
    if (!existsSync(join(sibling, ".git"))) return null;
    const normalizedSibling = normalize(sibling);
    if (dirname(canonicalProjectRoot) !== dirname(normalizedSibling)) return null;
    if (identity(normalizedSibling) === identity(canonicalProjectRoot)) return null;
    return normalizedSibling;
  };
  const siblingRoot = repoSiblingRoot();
  const effectiveOwning = siblingRoot !== null ? canonical(siblingRoot) : canonicalProjectRoot;
  const requestedId = request.projectId;
  if (requestedId !== undefined && requestedId !== projectId)
    return failWith(
      base,
      "id-mismatch",
      `Requested project identity '${requestedId}' does not match '${projectId ?? "(missing)"}'.`,
      remediationForProjectIdMismatch(projectId),
      "PROJECT_ID_MISMATCH",
    );
  const capabilities = parsed.capabilities;
  if (
    capabilities !== null &&
    typeof capabilities === "object" &&
    !Array.isArray(capabilities) &&
    (capabilities as Record<string, unknown>).allowWrites === false
  )
    return failWith(
      base,
      "capabilities-disallow-write",
      `Project '${projectId ?? "(missing)"}' has capabilities.allowWrites = false.`,
      remediationForCapabilitiesDisallowWrite(base.configPath),
    );
  if (
    accessPath === null ||
    (siblingRoot === null &&
      (!within(accessPath, projectRootNative) || !within(destinationRoot, projectRootNative)))
  )
    return failWith(
      base,
      "path-mismatch",
      "Configured accessPath or destinationRoot is outside the owning worktree.",
      `Move the target under ${projectRoot} or update ${base.configPath}.`,
    );
  if (!existsSync(destinationRoot))
    return failWith(
      base,
      "destination-root-not-found",
      `Configured destinationRoot directory does not exist: ${destinationRoot}.`,
      remediationForDestinationRootNotFound(destinationRoot),
    );
  try {
    const canonicalDestinationRoot = canonical(destinationRoot);
    const destinationWorktree = identity(worktreeRoot(canonicalDestinationRoot) ?? "");
    const destinationOwningRoot =
      destinationWorktree === identity(effectiveOwning)
        ? effectiveOwning
        : destinationWorktree === identity(canonicalProjectRoot)
          ? canonicalProjectRoot
          : null;
    if (destinationOwningRoot === null || !within(canonicalDestinationRoot, destinationOwningRoot))
      throw new Error();
  } catch {
    return failWith(
      base,
      "outside-project-root",
      "Configured destinationRoot cannot be canonically owned by this worktree.",
      `Create or move destinationRoot under ${projectRoot}.`,
    );
  }
  if (request.projectRoot !== undefined) {
    try {
      if (
        identity(canonical(resolve(projectRootNative, request.projectRoot))) ===
        identity(canonicalProjectRoot)
      ) {
        // Continue with the canonical owning worktree.
      } else throw new Error();
    } catch {
      return failWith(
        base,
        "outside-project-root",
        "Requested projectRoot is not the active worktree.",
        `Use projectRoot '${projectRoot}'.`,
      );
    }
  }
  const sourcePathTargetsDatabase =
    request.operation === undefined ||
    (!request.operation.startsWith("form_") &&
      request.operation !== "apply_form_design_plan" &&
      request.operation !== "create_form_from_template");
  const targetAliases = [
    request.accessPath,
    request.accessDbPath,
    request.databasePath,
    request.backendPath,
    ...(sourcePathTargetsDatabase ? [request.sourcePath] : []),
  ].filter((value): value is string => value !== undefined);
  const targets = new Set(
    targetAliases.map((value) => identity(resolve(projectRootNative, value))),
  );
  if (targets.size > 1)
    return failWith(
      base,
      "ambiguous",
      "Conflicting Access target aliases were supplied.",
      "Pass exactly one of accessPath, accessDbPath, databasePath, or sourcePath.",
    );
  const requestedTarget = targetAliases[0];
  // Issue #968 — `allowExternalAccessPath` opt-in flag. When the caller
  // supplies `allowExternalAccessPath: true` AND the operation is
  // explicitly declared non-binary-mutating (the dispatcher forwards
  // `MCP_TOOL_ROUTES[name].mutatesBinary === false`), the `OUTSIDE_PROJECT_ROOT`
  // verdict on the accessPath override is skipped — the binary is being READ,
  // not written, so the safety guarantee the gate normally enforces (don't
  // mutate a foreign .accdb) is moot. Binary-mutating tools (`mutatesBinary
  // === true`) and tools that omit the field (treated as unknown-default)
  // both ignore the flag — fail-closed by construction.
  const externalAccessPathAllowedByFlag =
    request.allowExternalAccessPath === true && request.mutatesBinary === false;
  if (!existsSync(accessPath))
    return failWith(
      base,
      "target-not-found",
      `Configured accessPath does not exist: ${accessPath}.`,
      `Create or correct the Access target in ${base.configPath}.`,
    );
  let canonicalAccess: string;
  try {
    canonicalAccess = canonical(accessPath);
    if (identity(worktreeRoot(dirname(canonicalAccess)) ?? "") !== identity(effectiveOwning))
      throw new Error("different worktree");
  } catch {
    return failWith(
      base,
      "outside-project-root",
      "Configured Access target cannot be canonically owned by this worktree.",
      `Move the target under ${projectRoot}.`,
    );
  }
  let canonicalBackend: string | null = null;
  if (backendPath !== null) {
    try {
      canonicalBackend = canonical(backendPath);
    } catch {
      return failWith(
        base,
        "target-not-found",
        `Configured backendPath does not exist: ${backendPath}.`,
        `Create or correct the backend target in ${base.configPath}.`,
      );
    }
  }
  if (requestedTarget !== undefined) {
    const target = normalize(resolve(projectRootNative, requestedTarget));
    // When a sibling is recognized as the binary's owning tree, "outside"
    // is judged against the sibling, not against cwd. This lets a write-class
    // tool call (e.g. import_modules) override its target to point at the
    // sibling's actual .accdb without falling into the cross-worktree gate.
    const ownershipRoot = siblingRoot ?? projectRootNative;
    const outsideWorktree = !within(target, ownershipRoot);
    const namesConfiguredBackend =
      backendPath !== null && identity(target) === identity(backendPath);
    if (
      !existsSync(target) &&
      outsideWorktree &&
      !namesConfiguredBackend &&
      !externalAccessPathAllowedByFlag
    )
      return failWith(
        base,
        "outside-project-root",
        `Requested target '${target}' is outside this worktree.`,
        `The accessPath override must be inside projectRoot '${projectRoot}'. Run \`dysflow doctor --cwd ${projectRoot}\` and retry with a path owned by that worktree.`,
      );
    let canonicalTarget: string;
    try {
      canonicalTarget = canonical(target);
    } catch {
      return failWith(
        base,
        "target-not-found",
        `Requested target does not exist: ${target}.`,
        `Correct the target path.`,
      );
    }
    const isConfiguredBackend =
      canonicalBackend !== null && identity(canonicalTarget) === identity(canonicalBackend);
    if (!isConfiguredBackend && outsideWorktree && !externalAccessPathAllowedByFlag)
      return failWith(
        base,
        "outside-project-root",
        `Requested target '${target}' is outside this worktree.`,
        `The accessPath override must be inside projectRoot '${projectRoot}'. Run \`dysflow doctor --cwd ${projectRoot}\` and retry with a path owned by that worktree.`,
      );
    if (!isConfiguredBackend && !externalAccessPathAllowedByFlag) {
      if (
        identity(worktreeRoot(dirname(canonicalTarget)) ?? "") !== identity(effectiveOwning) ||
        identity(canonicalTarget) !== identity(canonicalAccess)
      )
        return failWith(
          base,
          "outside-project-root",
          `Requested target '${target}' is not owned by this worktree config.`,
          `Run \`dysflow doctor --cwd ${normalize(dirname(target))}\` and call that worktree's MCP process.`,
        );
    }
  }
  if (
    request.destinationRoot !== undefined &&
    identity(resolve(projectRootNative, request.destinationRoot)) !== identity(destinationRoot)
  )
    return failWith(
      base,
      "outside-project-root",
      "Requested destinationRoot is not owned by this worktree config.",
      `Use destinationRoot '${destinationRoot}'.`,
    );
  const thresholdMs = resolveStaleMarkerThresholdMs(capabilities);
  reapStaleMarkerFiles(join(projectRootNative, ".dysflow", "runtime", "markers"), thresholdMs);
  reapStaleOperationsRegistry(projectRootNative, thresholdMs);
  const blockingOperations = findRunningOperations(projectRootNative, accessPath);
  if (blockingOperations.length > 0)
    return failWith(
      base,
      "write-locked-by-running-op",
      `Running Access operations block this write: ${blockingOperations.join(", ")}.`,
      remediationForWriteLockedByRunningOp(blockingOperations),
    );
  return {
    ...base,
    status: "valid",
    writeReady: true,
    diagnostics: [],
    remediation: null,
    owningWorktree: siblingRoot !== null ? `sibling:${siblingRoot}` : "cwd",
  };
}

/**
 * Issue #967 — read the stale-marker threshold from
 * `capabilities.staleMarkerThresholdMinutes` in `.dysflow/project.json`,
 * falling back to {@link DEFAULT_STALE_MARKER_THRESHOLD_MS} (30 min) when
 * absent or malformed. Returns a value in milliseconds because the
 * downstream `cleanupStaleMarkers` does wall-clock comparison in ms.
 */
export function resolveStaleMarkerThresholdMs(capabilities: unknown): number {
  if (capabilities === null || typeof capabilities !== "object" || Array.isArray(capabilities)) {
    return DEFAULT_STALE_MARKER_THRESHOLD_MS;
  }
  const raw = (capabilities as Record<string, unknown>).staleMarkerThresholdMinutes;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_STALE_MARKER_THRESHOLD_MS;
  }
  return Math.floor(raw * 60 * 1000);
}

/**
 * Reap stale `status: "running"` records from `<projectRoot>/.dysflow/runtime/operations.json`,
 * flipping them to `status: "abandoned"`. Pairs with `cleanupStaleMarkers`
 * to cover both data sources that {@link findRunningOperations} reads.
 *
 * Returns the number of records flipped. A missing or malformed file is
 * treated as zero reaped and surfaces in `errors[]` (silent on read —
 * never blocks the pre-write gate on diagnostics noise).
 *
 * SYNC by design — same rationale as {@link reapStaleMarkerFiles}.
 */
export function reapStaleOperationsRegistry(
  projectRoot: string,
  thresholdMs: number,
  options: { nowMs?: number } = {},
): { reaped: number; errors: string[] } {
  const registryPath = join(projectRoot, ".dysflow", "runtime", "operations.json");
  const result: { reaped: number; errors: string[] } = { reaped: 0, errors: [] };
  if (!existsSync(registryPath)) return result;

  const nowMs = options.nowMs ?? Date.now();
  let raw: string;
  try {
    raw = readFileSync(registryPath, "utf8");
  } catch (err) {
    result.errors.push(`operations.json read failed: ${formatError(err)}`);
    return result;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Malformed registry is not our concern here — it's the registry's
    // contract to handle corruption (quarantine). Skip silently.
    return result;
  }

  if (!isPlainObjectRecord(parsed)) return result;

  const wrapped = Array.isArray(parsed.records);
  if (!wrapped && !Array.isArray(parsed)) return result;

  const records = (wrapped ? parsed.records : parsed) as unknown[];
  let mutated = false;
  const abandonedAtIso = new Date(nowMs).toISOString();
  for (const entry of records) {
    if (!isPlainObjectRecord(entry)) continue;
    if (entry.status !== "running") continue;
    const updatedAtMs = Date.parse(typeof entry.updatedAt === "string" ? entry.updatedAt : "");
    if (!Number.isFinite(updatedAtMs)) continue;
    if (nowMs - updatedAtMs < thresholdMs) continue;
    entry.status = "abandoned";
    entry.abandonedAt = abandonedAtIso;
    mutated = true;
    result.reaped += 1;
  }

  if (mutated) {
    try {
      writeFileSync(registryPath, JSON.stringify(parsed), "utf8");
    } catch (err) {
      result.errors.push(`operations.json write failed: ${formatError(err)}`);
      result.reaped = 0;
    }
  }
  return result;
}

function isPlainObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function findRunningOperations(projectRoot: string, accessPath: string): string[] {
  const candidates: { value: unknown; fallbackId: string }[] = [];
  const registryPath = join(projectRoot, ".dysflow", "runtime", "operations.json");
  if (existsSync(registryPath)) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(registryPath, "utf8"));
      const parsedObject =
        parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : null;
      const records = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsedObject?.records)
          ? parsedObject.records
          : [];
      for (const record of records)
        candidates.push({ value: record, fallbackId: "operations.json" });
    } catch {}
  }
  const markerRoot = join(projectRoot, ".dysflow", "runtime", "markers");
  if (existsSync(markerRoot)) {
    try {
      for (const name of readdirSync(markerRoot)) {
        if (!name.endsWith(".json")) continue;
        try {
          candidates.push({
            value: JSON.parse(readFileSync(join(markerRoot, name), "utf8")),
            fallbackId: name,
          });
        } catch {}
      }
    } catch {}
  }
  return [
    ...new Set(
      candidates.flatMap(({ value, fallbackId }) => {
        if (value === null || typeof value !== "object" || Array.isArray(value)) return [];
        const record = value as Record<string, unknown>;
        const marker =
          record.marker !== null &&
          typeof record.marker === "object" &&
          !Array.isArray(record.marker)
            ? (record.marker as Record<string, unknown>)
            : record;
        if (marker.status !== "running") return [];
        if (
          typeof marker.projectRootAbs === "string" &&
          identity(marker.projectRootAbs) !== identity(projectRoot)
        )
          return [];
        if (
          typeof marker.accessPath === "string" &&
          identity(marker.accessPath) !== identity(accessPath)
        )
          return [];
        return [
          typeof marker.operationId === "string" && marker.operationId.length > 0
            ? marker.operationId
            : fallbackId,
        ];
      }),
    ),
  ];
}

function failWith(
  base: Omit<ProjectConfigDiagnostic, "status" | "writeReady" | "diagnostics" | "remediation">,
  status: ProjectConfigStatus,
  message: string,
  remediation: Remediation | string,
  code: string = status.toUpperCase().replaceAll("-", "_"),
): ProjectConfigDiagnostic {
  const descText = typeof remediation === "string" ? remediation : remediation.description;
  return {
    ...base,
    status,
    writeReady: false,
    diagnostics: [{ code, severity: "error", message, remediation }],
    remediation: descText,
  };
}

/**
 * Issue #967 — `findRunningOperations` with stale-marker auto-cleanup
 * pre-applied. Runs `cleanupStaleMarkers` over the project-local markers
 * folder, then `reapStaleOperationsRegistry` over `operations.json`,
 * BEFORE listing blockers. Best-effort: a single corrupt file surfaces
 * via the inner `errors[]` arrays but never prevents the gate from
 * rendering a verdict.
 *
 * SYNC by design — `diagnoseProjectConfig` runs synchronously on every
 * tool call and adding an async hop there would force the function to
 * become `Promise<...>` and ripple through every caller (MCP resolver,
 * CLI commands, tests). The async port-backed
 * {@link cleanupStaleMarkers} (the unit-testable pure function) is still
 * available for callers that want async semantics — this inlined version
 * uses the same algorithm but mirrored onto sync filesystem I/O.
 */
function reapStaleMarkerFiles(markersRoot: string, thresholdMs: number): void {
  if (!existsSync(markersRoot)) return;
  const nowMs = Date.now();
  let entries: string[];
  try {
    entries = readdirSync(markersRoot);
  } catch {
    return;
  }
  const abandonedAtIso = new Date(nowMs).toISOString();
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const filePath = join(markersRoot, entry);
    let raw: string;
    try {
      raw = readFileSync(filePath, "utf8");
    } catch {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!isPlainObjectRecord(parsed)) continue;
    const record = isPlainObjectRecord(parsed.marker) ? parsed.marker : parsed;
    if (record.status !== "running") continue;
    const updatedAtMs = typeof record.updatedAt === "string" ? Date.parse(record.updatedAt) : NaN;
    if (!Number.isFinite(updatedAtMs)) continue;
    if (nowMs - updatedAtMs < thresholdMs) continue;
    const next: Record<string, unknown> = {
      ...parsed,
      status: "abandoned",
      abandonedAt: abandonedAtIso,
    };
    if (parsed.marker !== undefined) {
      next.marker = { ...record, status: "abandoned", abandonedAt: abandonedAtIso };
    }
    try {
      writeFileSync(filePath, JSON.stringify(next), "utf8");
    } catch {
      // Best-effort: a single write failure is not a gate-stopping event.
    }
  }
}
