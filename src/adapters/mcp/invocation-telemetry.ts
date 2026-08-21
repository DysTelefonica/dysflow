import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readdir, rename, rm, rmdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import type { WriteExecutionPolicy } from "../../core/runtime/write-execution-policy.js";
import type {
  InvocationFailureClass,
  InvocationTelemetryEntry,
  InvocationTelemetryRecorder,
  InvocationWriteIntent,
} from "../../core/telemetry/invocation-telemetry.js";
import type {
  SchemaAdvertisementEntry,
  SchemaAdvertisementRecorder,
} from "../../core/telemetry/schema-advertisement.js";
import { isTransientLockContentionError, lockErrorCode } from "../../core/utils/lock-errors.js";
import { effectiveDryRunDefaultForTool, isWriteIntentTool } from "./mcp-tool-risks.js";
import type { McpToolResult } from "./result-translation.js";

export type {
  InvocationTelemetryEntry,
  InvocationTelemetryRecorder,
  InvocationWriteIntent,
} from "../../core/telemetry/invocation-telemetry.js";

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_FILES = 3;
const DEFAULT_LOCK_TIMEOUT_MS = 5_000;
const DEFAULT_STALE_LOCK_MS = 30_000;
const LOCK_RETRY_MS = 10;
const PENDING_LOCK_REAP_LIMIT = 32;
const MAX_NAME_LENGTH = 128;
const MAX_PARAMETER_NAMES = 256;
const MAX_AUDIT_EVENT_LENGTH = 256;
const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

export type InvocationTelemetryTarget = {
  cwd: string;
  enabled: boolean;
  writeExecutionPolicy: WriteExecutionPolicy;
};

export type InvocationTelemetryContext = {
  recorder: InvocationTelemetryRecorder;
  writeExecutionPolicy: WriteExecutionPolicy;
};

export type InvocationTelemetryContextResolver = ((
  args: unknown,
) => Promise<InvocationTelemetryContext>) & {
  /** Resolve recorder evidence from a project root authenticated by a handler. */
  resolveAuthenticatedProjectRoot?: (
    projectRoot: string,
  ) => Promise<InvocationTelemetryContext | undefined>;
};

const CONTRACT_FAILURE_CODES = new Set([
  "MCP_INPUT_INVALID",
  "MCP_TOOL_NOT_FOUND",
  "MCP_WRITES_DISABLED",
  "PROJECT_CONFIG_NOT_WRITE_READY",
  "RESULT_CONTRACT_VIOLATION",
]);

function boundedName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  return normalized.slice(0, MAX_NAME_LENGTH);
}

function boundedAuditEvent(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (
    normalized.length > MAX_AUDIT_EVENT_LENGTH ||
    !normalized.startsWith("trio-consumed:") ||
    normalized === "trio-consumed:" ||
    [...normalized].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  )
    return null;
  return normalized;
}

function parameterNames(args: unknown): string[] {
  if (args === null || typeof args !== "object" || Array.isArray(args)) return [];
  return Object.keys(args as Record<string, unknown>)
    .map((name) => boundedName(name))
    .filter((name): name is string => name !== null)
    .sort()
    .slice(0, MAX_PARAMETER_NAMES);
}

function rejectedParameterNames(result: McpToolResult): string[] {
  const error = result.error;
  if (error === undefined) return [];
  const candidates = [
    ...(Array.isArray(error.rejectedFlags) ? error.rejectedFlags : []),
    error.rejectedFlag,
  ];
  return [...new Set(candidates.map(boundedName).filter((name): name is string => name !== null))]
    .sort()
    .slice(0, MAX_PARAMETER_NAMES);
}

function missingParameterNames(result: McpToolResult): string[] {
  const missingParam = boundedName(result.error?.missingParam);
  return missingParam === null ? [] : [missingParam];
}

function failureClassFor(
  toolKnown: boolean,
  result: McpToolResult,
  errorCode: string | null,
): InvocationFailureClass {
  if (!result.isError) return "none";
  if (!toolKnown) return "contract";
  if (
    errorCode !== null &&
    (CONTRACT_FAILURE_CODES.has(errorCode) ||
      errorCode.startsWith("CONFIG_") ||
      errorCode.startsWith("DYSFLOW_CONFIG_"))
  ) {
    return "contract";
  }
  return "runtime";
}

function operationIdFromResult(result: McpToolResult): string | null {
  return boundedName(result.operation?.operationId);
}

/**
 * Stable compatibility family retained alongside the real MCP tool name.
 * This taxonomy is deliberately coarse: callers filter by `tool` for the
 * exact surface and by `action` only for the historical family view.
 */
export function invocationActionForTool(toolName: string): string {
  if (toolName.startsWith("import_")) return "import";
  if (toolName.startsWith("test_")) return "test";
  if (toolName.startsWith("run_")) return "run";
  if (
    toolName === "doctor" ||
    toolName === "diagnose" ||
    toolName === "logs" ||
    toolName === "state" ||
    toolName === "schema" ||
    toolName === "get_capabilities" ||
    toolName === "describe_tool" ||
    toolName === "resolve_project"
  ) {
    return "diagnostics";
  }
  if (
    toolName.includes("query") ||
    toolName.includes("table") ||
    toolName.includes("schema") ||
    toolName.includes("sql") ||
    toolName.startsWith("link_") ||
    toolName.startsWith("relink_") ||
    toolName === "compact_repair"
  ) {
    return "query";
  }
  return "vba";
}

export function resolveInvocationWriteIntent(
  toolName: string,
  toolKnown: boolean,
  args: unknown,
  policy: WriteExecutionPolicy = "safe-by-default",
): InvocationWriteIntent {
  if (!toolKnown || !isWriteIntentTool(toolName)) return "read";
  const params =
    args !== null && typeof args === "object" && !Array.isArray(args)
      ? (args as Record<string, unknown>)
      : {};
  if (params.apply === true || params.dryRun === false || params.diff === false) return "apply";
  if (params.apply === false || params.dryRun === true || params.diff === true) return "dryRun";
  return effectiveDryRunDefaultForTool(toolName, policy) ? "dryRun" : "apply";
}

export function buildInvocationTelemetryEntry(input: {
  toolName: string;
  toolKnown: boolean;
  args: unknown;
  result: McpToolResult;
  durationMs: number;
  writeIntent: InvocationWriteIntent;
  auditEvents?: readonly string[];
  timestamp?: string;
}): InvocationTelemetryEntry {
  const tool = boundedName(input.toolName) ?? "(invalid-tool-name)";
  const projectId =
    input.args !== null && typeof input.args === "object" && !Array.isArray(input.args)
      ? boundedName((input.args as Record<string, unknown>).projectId)
      : null;
  const errorCode = input.toolKnown
    ? (boundedName(input.result.error?.code ?? input.result.error?.errorCode) ??
      (input.result.isError ? "MCP_TOOL_HANDLER_ERROR" : null))
    : "MCP_TOOL_NOT_FOUND";
  return {
    timestamp: input.timestamp ?? new Date().toISOString(),
    tool,
    action: invocationActionForTool(tool),
    operationId: operationIdFromResult(input.result),
    projectId,
    outcome: input.result.isError ? "error" : "ok",
    failureClass: failureClassFor(input.toolKnown, input.result, errorCode),
    errorCode,
    durationMs: Math.max(0, Math.round(input.durationMs)),
    writeIntent: input.writeIntent,
    paramNamesPresent: parameterNames(input.args),
    missingParams: missingParameterNames(input.result),
    rejectedParams: rejectedParameterNames(input.result),
    unknownToolName: input.toolKnown ? null : tool,
    ...(input.auditEvents !== undefined && input.auditEvents.length > 0
      ? {
          auditEvents: input.auditEvents
            .map((event) => boundedAuditEvent(event))
            .filter((event): event is string => event !== null),
        }
      : {}),
  };
}

export type JsonlTelemetrySinkOptions = {
  cwd: string;
  enabled?: boolean;
  maxBytes?: number;
  maxFiles?: number;
  lockTimeoutMs?: number;
  staleLockMs?: number;
  /** Test seam; production probes a PID without signalling it. */
  isProcessAlive?: (pid: number) => boolean;
};

/**
 * Append-and-rotate JSONL sink under `<cwd>/.dysflow/runtime/<fileName>`.
 *
 * The record type is a parameter because #1459 needs a second, separate
 * stream for schema-advertisement accounting: one advertisement is not one
 * invocation, so the two must never share a file. Everything else — the
 * cross-process lock, stale-lock reclamation, and size rotation — is
 * identical, and duplicating it would mean maintaining two copies of the
 * concurrency-sensitive half.
 */
export function createJsonlTelemetrySink<TEntry>(
  fileName: string,
  options: JsonlTelemetrySinkOptions,
): { record(entry: TEntry): Promise<void> } {
  const enabled = options.enabled !== false;
  const maxBytes = Math.max(512, Math.floor(options.maxBytes ?? DEFAULT_MAX_BYTES));
  const maxFiles = Math.max(1, Math.floor(options.maxFiles ?? DEFAULT_MAX_FILES));
  const lockTimeoutMs = Math.max(
    LOCK_RETRY_MS,
    Math.floor(options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS),
  );
  const staleLockMs = Math.max(1, Math.floor(options.staleLockMs ?? DEFAULT_STALE_LOCK_MS));
  const runtimePath = join(options.cwd, ".dysflow", "runtime");
  const sinkPath = join(runtimePath, fileName);
  const lockPath = `${sinkPath}.lock`;
  const isProcessAlive = options.isProcessAlive ?? processIsAlive;
  let pending = Promise.resolve();
  let reapCursor = 0;

  const rotateIfNeeded = async (incomingBytes: number): Promise<void> => {
    let currentBytes = 0;
    try {
      currentBytes = (await stat(sinkPath)).size;
    } catch {}
    if (currentBytes === 0 || currentBytes + incomingBytes <= maxBytes) return;
    for (let generation = maxFiles; generation >= 1; generation -= 1) {
      const destination = `${sinkPath}.${generation}`;
      if (generation === maxFiles) {
        await rm(destination, { force: true });
      }
      const source = generation === 1 ? sinkPath : `${sinkPath}.${generation - 1}`;
      try {
        await rename(source, destination);
      } catch {}
    }
  };

  return {
    record: async (entry) => {
      if (!enabled) return;
      const line = `${JSON.stringify(entry)}\n`;
      const write = async (): Promise<void> => {
        await mkdir(runtimePath, { recursive: true });
        reapCursor = await reapPendingLocks(lockPath, staleLockMs, isProcessAlive, reapCursor);
        await withInvocationFileLock(
          lockPath,
          lockTimeoutMs,
          staleLockMs,
          isProcessAlive,
          async () => {
            await rotateIfNeeded(Buffer.byteLength(line, "utf8"));
            await appendFile(sinkPath, line, { encoding: "utf8", mode: 0o600 });
          },
        );
      };
      pending = pending.catch(() => undefined).then(write);
      await pending;
    },
  };
}

/**
 * The invocation stream (#1197). Public signature is unchanged; the body now
 * delegates to the shared JSONL sink.
 */
export function createInvocationTelemetryRecorder(
  options: JsonlTelemetrySinkOptions,
): InvocationTelemetryRecorder {
  return createJsonlTelemetrySink<InvocationTelemetryEntry>("invocations.jsonl", options);
}

/**
 * The schema-advertisement stream (#1459). Deliberately a sibling file rather
 * than a discriminated field inside the invocation stream: a consumer counting
 * invocations must never have to filter advertisements out first.
 */
export function createSchemaAdvertisementRecorder(
  options: JsonlTelemetrySinkOptions,
): SchemaAdvertisementRecorder {
  return createJsonlTelemetrySink<SchemaAdvertisementEntry>("schema-advertisements.jsonl", options);
}

export function createInvocationTelemetryContextResolver(options: {
  fallback: InvocationTelemetryTarget;
  resolveTarget: (args: unknown) => Promise<InvocationTelemetryTarget | undefined>;
}): InvocationTelemetryContextResolver {
  const recorders = new Map<string, InvocationTelemetryRecorder>();
  const contextFor = (target: InvocationTelemetryTarget): InvocationTelemetryContext => {
    const cwd = resolve(target.cwd);
    const key = `${cwd}\0${target.enabled ? "on" : "off"}`;
    let recorder = recorders.get(key);
    if (recorder === undefined) {
      recorder = createInvocationTelemetryRecorder({ cwd, enabled: target.enabled });
      recorders.set(key, recorder);
    }
    return { recorder, writeExecutionPolicy: target.writeExecutionPolicy };
  };
  const fallbackFor = (args: unknown) =>
    contextFor(
      hasExplicitTelemetryTarget(args) ? { ...options.fallback, enabled: false } : options.fallback,
    );

  const resolver: InvocationTelemetryContextResolver = async (args) => {
    if (hasInvalidExplicitContextId(args)) return fallbackFor(args);
    try {
      const target = await options.resolveTarget(args);
      return target === undefined ? fallbackFor(args) : contextFor(target);
    } catch {
      return fallbackFor(args);
    }
  };
  resolver.resolveAuthenticatedProjectRoot = async (projectRoot) => {
    if (projectRoot.trim().length === 0) return undefined;
    try {
      const target = await options.resolveTarget({ cwd: projectRoot });
      if (target === undefined || !sameResolvedPath(target.cwd, projectRoot)) return undefined;
      return contextFor(target);
    } catch {
      return undefined;
    }
  };
  return resolver;
}

function sameResolvedPath(left: string, right: string): boolean {
  const resolvedLeft = resolve(left);
  const resolvedRight = resolve(right);
  return process.platform === "win32"
    ? resolvedLeft.toLowerCase() === resolvedRight.toLowerCase()
    : resolvedLeft === resolvedRight;
}

function hasInvalidExplicitContextId(args: unknown): boolean {
  if (args === null || typeof args !== "object" || Array.isArray(args)) return false;
  const values = args as Record<string, unknown>;
  if (!Object.hasOwn(values, "contextId")) return false;
  return typeof values.contextId !== "string" || values.contextId.trim().length === 0;
}

function hasExplicitTelemetryTarget(args: unknown): boolean {
  if (args === null || typeof args !== "object" || Array.isArray(args)) return false;
  const values = args as Record<string, unknown>;
  return [
    "projectId",
    "contextId",
    "cwd",
    "projectRoot",
    "accessPath",
    "accessDbPath",
    "databasePath",
    "sourcePath",
    "backendPath",
    "destinationRoot",
  ].some((field) => Object.hasOwn(values, field));
}

async function withInvocationFileLock<T>(
  lockPath: string,
  timeoutMs: number,
  staleLockMs: number,
  _isProcessAlive: (pid: number) => boolean,
  operation: () => Promise<T>,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  const ownerMarkerName = `owner-${process.pid}-${randomUUID()}`;
  const pendingPath = `${lockPath}.pending-${process.pid}-${randomUUID()}`;
  while (true) {
    try {
      await mkdir(pendingPath);
      await writeFile(join(pendingPath, ownerMarkerName), "", { encoding: "utf8", flag: "wx" });
      try {
        await stat(lockPath);
        throw Object.assign(new Error("Invocation telemetry lock already exists"), {
          code: "EEXIST",
        });
      } catch (error) {
        if (lockErrorCode(error) !== "ENOENT") throw error;
      }
      await rename(pendingPath, lockPath);
      break;
    } catch (error) {
      await rm(pendingPath, { recursive: true, force: true }).catch(() => undefined);
      if (!isTransientLockContentionError(error) && lockErrorCode(error) !== "ENOTEMPTY")
        throw error;
      await reclaimStaleInvocationLock(lockPath, staleLockMs);
      if (Date.now() >= deadline) {
        throw new Error(`Timed out acquiring invocation telemetry lock: ${lockPath}`);
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, LOCK_RETRY_MS));
    }
  }

  try {
    return await operation();
  } finally {
    await removeInvocationLockByOwner(lockPath, ownerMarkerName, "release");
  }
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM and unfamiliar platform errors are not evidence that a PID is dead.
    return lockErrorCode(error) !== "ESRCH";
  }
}

function escapedRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Reaps only abandoned sibling directories from interrupted lock acquisition.
 * The stable lock path is intentionally never a candidate for recursive removal.
 */
async function reapPendingLocks(
  lockPath: string,
  staleLockMs: number,
  isProcessAlive: (pid: number) => boolean,
  cursor: number,
): Promise<number> {
  const parentPath = dirname(lockPath);
  const pendingName = new RegExp(
    `^${escapedRegExp(basename(lockPath))}\\.pending-([1-9]\\d*)-${UUID_PATTERN}$`,
  );
  let candidates: Array<{ name: string }>;
  try {
    candidates = (await readdir(parentPath, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && pendingName.test(entry.name))
      .sort((left, right) => left.name.localeCompare(right.name));
  } catch {
    return cursor;
  }
  const start = candidates.length === 0 ? 0 : cursor % candidates.length;
  candidates.push(...candidates.splice(0, start));
  const batch = candidates.slice(0, PENDING_LOCK_REAP_LIMIT);

  for (const candidate of batch) {
    const match = pendingName.exec(candidate.name);
    const pid = match?.[1] === undefined ? Number.NaN : Number(match[1]);
    if (!Number.isSafeInteger(pid) || pid <= 0) continue;

    const pendingPath = join(parentPath, candidate.name);
    let entries: string[];
    let latestMtimeMs: number;
    try {
      const [directory, children] = await Promise.all([stat(pendingPath), readdir(pendingPath)]);
      if (!directory.isDirectory()) continue;
      entries = children;
      latestMtimeMs = directory.mtimeMs;
      if (entries.length === 1 && entries[0] !== undefined) {
        const ownerMarker = new RegExp(`^owner-${pid}-${UUID_PATTERN}$`);
        if (!ownerMarker.test(entries[0])) continue;
        const marker = await stat(join(pendingPath, entries[0]));
        if (!marker.isFile()) continue;
        latestMtimeMs = Math.max(latestMtimeMs, marker.mtimeMs);
      } else if (entries.length !== 0) {
        continue;
      }
    } catch {
      continue;
    }
    if (Date.now() - latestMtimeMs < staleLockMs) continue;

    let alive: boolean;
    try {
      alive = isProcessAlive(pid);
    } catch {
      continue;
    }
    if (alive) continue;
    await rm(pendingPath, { recursive: true, force: true }).catch(() => undefined);
  }
  return candidates.length === 0 ? 0 : (start + batch.length) % candidates.length;
}

async function reclaimStaleInvocationLock(lockPath: string, staleLockMs: number): Promise<void> {
  let entries: string[];
  let mtimeMs: number;
  try {
    entries = await readdir(lockPath);
    const stats = await Promise.all([
      stat(lockPath),
      ...entries.map((name) => stat(join(lockPath, name))),
    ]);
    mtimeMs = Math.max(...stats.map((entry) => entry.mtimeMs));
  } catch {
    return;
  }
  if (Date.now() - mtimeMs < staleLockMs) return;

  const owners = entries.filter((name) => name.startsWith("owner-"));
  if (owners.length === 1 && owners[0] !== undefined) {
    await removeInvocationLockByOwner(lockPath, owners[0], "stale");
    return;
  }
  if (
    owners.length > 0 ||
    entries.some((name) => !name.startsWith("release-") && !name.startsWith("stale-"))
  ) {
    return;
  }

  for (const marker of entries) {
    await rm(join(lockPath, marker), { force: true }).catch(() => undefined);
  }
  await rmdir(lockPath).catch(() => undefined);
}

async function removeInvocationLockByOwner(
  lockPath: string,
  ownerMarkerName: string,
  reason: "release" | "stale",
): Promise<void> {
  const claimedMarker = join(lockPath, `${reason}-${process.pid}-${randomUUID()}`);
  try {
    await rename(join(lockPath, ownerMarkerName), claimedMarker);
  } catch {
    return;
  }
  await rm(claimedMarker, { force: true }).catch(() => undefined);
  await rmdir(lockPath).catch(() => undefined);
}
