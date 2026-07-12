import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { DysflowConfig } from "../../core/config/dysflow-config.js";
import { resolveExecutionTarget as resolveExecutionTargetInCore } from "../../core/config/execution-target.js";
import {
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
  type VbaSyncPort,
} from "../../core/contracts/index.js";
import {
  type AccessOperationPreflightCleanup,
  type AccessOperationPreflightCleanupResult,
  diagnosticsFromPreflightCleanup,
  reapOrphanedAccessOnTimeout,
} from "../../core/operations/access-operation-preflight.js";
import {
  type AccessOperationRecord,
  type AccessOperationRegistry,
  createAccessOperationId,
} from "../../core/operations/access-operation-registry.js";
import { extractResultPayload, RESULT_MARKER } from "../../core/runner/ps-result-channel.js";
import { isRecord, sanitizeSecrets, stringValue, truthy } from "../../core/utils/index.js";
import { logSwallowedIoError } from "../../core/utils/log-swallowed-io-error.js";
import { findPackageRootNear } from "../../core/utils/package-info.js";
import type { CodeGraphVbaInvoker } from "../codegraph-vba/index.js";
import { nodeConfigFileSystem } from "../config/dysflow-config-node.js";
import type { AllowedProcedures } from "../mcp/allowed-procedures-resolver.js";
import { POWERSHELL_EXE, spawnPowerShellProcess } from "../powershell/default-executor.js";
import {
  runSyncBinary,
  type SyncBinaryAdapterLike,
  type SyncBinaryExecution,
  type SyncBinaryPlan,
  type SyncBinarySuccessResult,
  type SyncVerifySummary,
} from "./sync-binary.js";
import { VbaExecutionAdapter } from "./vba-execution-adapter.js";
import { VbaFormsAdapter } from "./vba-forms-adapter.js";
import { VbaModulesAdapter } from "./vba-modules-adapter.js";
import type { VbaOperationsCleanupService } from "./vba-operations-adapter.js";
import { VbaOperationsAdapter } from "./vba-operations-adapter.js";
import type { DirectMapping } from "./vba-sync-types.js";

export type {
  VbaSourceComparisonEntry,
  VbaSourceComparisonFile,
  VbaSourceDiffEntry,
  VbaVerifyResult,
} from "../../core/services/vba-source-comparison.js";

export type VbaManagerExecutionRequest = {
  scriptPath: string;
  action: string;
  accessPath?: string;
  destinationRoot: string;
  moduleNames: readonly string[];
  /**
   * Set to true when the upstream caller explicitly provided a moduleNames
   * list (including an empty array). Lets the PowerShell script distinguish
   * "explicit empty" (R4 no-op plan) from "not provided" (import-all
   * fallback). When undefined or false, the script applies the legacy
   * "ModuleNamesJson absent -> import everything under ModulesPath" rule.
   */
  moduleNamesProvided?: boolean;
  password?: string;
  json: boolean;
  extra: Record<string, string | boolean | number | undefined>;
  timeoutMs: number;
  operationId?: string;
  operationFile?: string;
  cwd?: string;
  env?: Record<string, string | undefined>;
  signal?: AbortSignal;
};

export type VbaManagerExecutionResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  /**
   * #781 P2 — propagated from `spawnPowerShellProcess` when the underlying
   * `child_process.spawn` itself failed (e.g. ENOENT, EACCES). Distinct from
   * `timedOut: true`. When set, the executor layer in `executeMappedTool`
   * surfaces a `POWERSHELL_SPAWN_FAILED` diagnostic instead of falling
   * through to the generic exit-code failure path.
   */
  spawnError?: string;
};

type TrackedVbaManagerOperation = {
  operationId: string;
  operationFile: string;
  record: AccessOperationRecord;
};

type VbaManagerOperationMarker = {
  accessPid?: number;
  processStartTime?: string;
};

export type VbaManagerExecutor = (
  request: VbaManagerExecutionRequest,
) => Promise<VbaManagerExecutionResult>;

export type VbaSyncAdapterOptions = {
  executor?: VbaManagerExecutor;
  operationRegistry?: AccessOperationRegistry;
  cleanupService?: VbaOperationsCleanupService;
  preflightCleanup?: AccessOperationPreflightCleanup;
  scriptPath?: string;
  env?: Record<string, string | undefined>;
  cwd?: string;
  accessPath?: string;
  destinationRoot?: string;
  accessPassword?: string;
  timeoutMs?: number;
  /**
   * PR1b (#621 F1) — `allowedProcedures` allowlist forwarded to
   * `VbaExecutionAdapter` so the `test_vba` default-deny gate can enforce it
   * at the adapter boundary. When undefined or empty, `test_vba` refuses
   * execution unless the caller passes `dryRun: true` (the same semantics
   * as the MCP-handler gate in `canonical-handlers.ts:ensureProcedureAllowed`,
   * which already covers `run_vba`).
   *
   * #757 (F7) — accepts a per-input RESOLVER (function) as well as a frozen
   * array. The composition root passes a resolver so `test_vba` re-reads the
   * project's allowlist from `.dysflow/project.json` on every call instead of
   * freezing it at service-factory time (which the service cache then reused,
   * ignoring mid-session config edits until a server restart).
   */
  allowedProcedures?: AllowedProcedures;
  /**
   * Issue #830 — optional internal CodeGraph-VBA invoker. One-way only
   * (dysflow → codegraph-vba). When supplied, the `map_form_behavior`
   * tool's `autoFetchCodeGraph:true` opt-in path consults it. When
   * absent, that path falls back to the legacy `.form.txt`-only behavior
   * (no throw). The composition root in stdio.ts can opt in via this
   * option; tests inject fakes.
   */
  codeGraphVbaInvoker?: CodeGraphVbaInvoker;
};

const VBA_MANAGER_EXTRA_KEYS = new Set([
  "backendPath",
  "erdPath",
  "importMode",
  "location",
  "proceduresJson",
  "procedureName",
  "argsJson",
  "force",
  // issue #752 — opt-in verbose contract. The script's switch is named
  // -VerboseContract (because [CmdletBinding()]$Verbose is the common
  // Write-Verbose parameter). The dispatch rewrites `verbose` → `-VerboseContract`
  // below to keep the JSON contract on the consumer side while the PS surface
  // stays unambiguous.
  "verbose",
]);
const TOOL_NOT_IMPLEMENTED_MESSAGE =
  "This tool is tracked for parity but is not implemented by this service yet.";

export const MIN_PS_TIMEOUT_MS = 5_000;
const ABSURDLY_SMALL_TIMEOUT_MS = 1_000;

/**
 * Derives the per-call PowerShell timeout (ms) for executeMappedTool.
 *
 * Contract: the result is at least MIN_PS_TIMEOUT_MS (5 s). If effectiveTimeoutMs
 * is absurdly small (< 1 s), it is clamped to MIN_PS_TIMEOUT_MS so the wrapper
 * always has a meaningful budget for bookkeeping.
 *
 * The full effectiveTimeoutMs is available for the PowerShell spawn; the 25 s
 * hard-cap that existed before (#485) has been removed — the project's timeoutMs
 * is now honored end-to-end.
 */
export function derivePsTimeoutMs(effectiveTimeoutMs: number, preflightElapsedMs: number): number {
  if (effectiveTimeoutMs < ABSURDLY_SMALL_TIMEOUT_MS) {
    return MIN_PS_TIMEOUT_MS;
  }
  return Math.max(MIN_PS_TIMEOUT_MS, effectiveTimeoutMs - preflightElapsedMs);
}

// ─── #757 (F3): structured VBA_MANAGER_TIMEOUT envelope helpers ──────────────
// The bare `{ code, message }` timeout envelope forced a consuming agent to
// manually audit MSACCESS.EXE processes and .laccdb locks after every stall.
// These helpers enrich it with the phase, whether a write was in flight, the
// PIDs dysflow already reaped, and a remediation pointer — all derived from data
// dysflow already has (no new OS scans).

/** Maps a tool name to the coarse timeout phase a consumer can branch on. */
const TIMEOUT_PHASE_BY_TOOL: Readonly<Record<string, string>> = {
  export_all: "export",
  export_modules: "export",
  import_all: "import",
  import_modules: "import",
  compile_vba: "compile",
  verify_code: "verify",
  link_tables: "link",
  relink_tables: "link",
  relink_directory: "link",
  unlink_table: "link",
  localize_backend_links: "link",
  run_vba: "execute",
  test_vba: "execute",
  vba_inline_execution: "execute",
};

export function deriveTimeoutPhase(toolName: string): string {
  return TIMEOUT_PHASE_BY_TOOL[toolName] ?? "other";
}

/** Tools whose timeout may have left a partially-committed write behind. */
const TIMEOUT_WRITE_TOOLS = new Set([
  "import_modules",
  "import_all",
  "delete_module",
  "compile_vba",
  "export_all",
  "export_modules",
  "fix_encoding",
  "generate_erd",
]);

/**
 * Derives the lock file that MAY linger for an Access binary. This is a pure
 * path derivation, NOT a filesystem scan — it tells the consumer which file to
 * check, without asserting it exists.
 */
export function deriveExpectedLockFile(accessPath: string | undefined): string | undefined {
  if (accessPath === undefined) return undefined;
  const lower = accessPath.toLowerCase();
  if (lower.endsWith(".accdb")) return `${accessPath.slice(0, -".accdb".length)}.laccdb`;
  if (lower.endsWith(".mdb")) return `${accessPath.slice(0, -".mdb".length)}.ldb`;
  return undefined;
}

export class VbaSyncAdapter implements VbaSyncPort {
  public readonly executor: VbaManagerExecutor;
  public readonly scriptPath: string;
  public readonly env: Record<string, string | undefined>;
  public readonly cwd: string;
  public readonly accessPath?: string;
  public readonly destinationRoot?: string;
  public readonly accessPassword?: string;
  public readonly timeoutMs: number;
  /**
   * PR1b (#621 F1) — allowlist forwarded to `VbaExecutionAdapter` so the
   * `test_vba` default-deny gate can enforce it. Kept on the adapter for
   * inspection / debugging; the gate logic lives in
   * `VbaExecutionAdapter.ensureTestProceduresAllowed`. #757 (F7) — may be a
   * per-input resolver function, not just a frozen array.
   */
  public readonly allowedProcedures?: AllowedProcedures;

  private readonly operationsAdapter: VbaOperationsAdapter;
  private readonly operationRegistry?: AccessOperationRegistry;
  private readonly executionAdapter: VbaExecutionAdapter;
  private readonly formsAdapter: VbaFormsAdapter;
  private readonly modulesAdapter: VbaModulesAdapter;

  constructor(options: VbaSyncAdapterOptions = {}) {
    this.env = options.env ?? process.env;
    this.executor = options.executor ?? spawnVbaManager;
    this.scriptPath = options.scriptPath ?? resolveDefaultVbaManagerScriptPath(this.env);
    this.cwd = options.cwd ?? process.cwd();
    this.accessPath = stringValue(options.accessPath);
    this.destinationRoot = stringValue(options.destinationRoot);
    this.accessPassword =
      stringValue(options.accessPassword) ?? stringValue(this.env.DYSFLOW_ACCESS_PASSWORD);
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.operationRegistry = options.operationRegistry;
    this.allowedProcedures = options.allowedProcedures;

    // Sub-adapters instantiation delegating orchestrator context
    this.operationsAdapter = new VbaOperationsAdapter({
      operationRegistry: options.operationRegistry,
      cleanupService: options.cleanupService,
      preflightCleanup: options.preflightCleanup,
      cwd: this.cwd,
    });
    this.executionAdapter = new VbaExecutionAdapter(
      {
        cwd: this.cwd,
        env: this.env,
        executeMappedTool: (toolName, params, mapping) =>
          this.executeMappedTool(toolName, params, mapping),
        resolveExecutionTarget: (params) => this.resolveExecutionTarget(params),
      },
      undefined, // fileSystem: use the adapter's default (Node fs/promises)
      options.allowedProcedures, // PR1b: forward allowlist for the test_vba gate
    );
    this.formsAdapter = new VbaFormsAdapter(
      {
        executor: this.executor,
        env: this.env,
        cwd: this.cwd,
        resolveExecutionTarget: (params) => this.resolveExecutionTarget(params),
        validateStrictContext: (params, target) =>
          this.validateStrictContext(
            params,
            target as { accessPath?: string; destinationRoot: string; projectRoot?: string },
          ),
        executeMappedTool: (toolName, params, mapping) =>
          this.executeMappedTool(toolName, params, mapping),
        // Issue #830 — one-way: dysflow → codegraph-vba. Threaded through
        // from the composition root (stdio.ts) when an invoker is wired.
        codeGraphVbaInvoker: options.codeGraphVbaInvoker,
      },
      undefined, // fileSystem — VbaFormsAdapter defaults to Node fs.
      options.codeGraphVbaInvoker !== undefined
        ? { codeGraphVbaInvoker: options.codeGraphVbaInvoker }
        : undefined,
    );
    this.modulesAdapter = new VbaModulesAdapter({
      scriptPath: this.scriptPath,
      accessPassword: this.accessPassword,
      cwd: this.cwd,
      resolveExecutionTarget: (params) => this.resolveExecutionTarget(params),
      validateStrictContext: (params, target) => this.validateStrictContext(params, target),
      runPreflightCleanup: (target) => this.runPreflightCleanup(target),
      executor: this.executor,
      executeMappedTool: (toolName, params, mapping) =>
        this.executeMappedTool(toolName, params, mapping),
    });
  }

  async execute(toolName: string, input: unknown): Promise<OperationResult<unknown>> {
    const params = isRecord(input) ? input : {};

    // Issue #809 - `sync_binary` is the workflow that composes verify_code +
    // import_modules + export_modules. It is handled at the orchestrator
    // level (NOT inside any single sub-adapter) so it can fan out to the
    // three primitives through the existing sub-adapter seam. This keeps
    // the compose layer pure and testable (sync-binary.ts has zero I/O
    // imports); only the adapter bridge here touches Access / PowerShell.
    if (toolName === "sync_binary") {
      return this.executeSyncBinary(params);
    }

    if (VbaOperationsAdapter.handles(toolName)) {
      return this.operationsAdapter.execute(toolName, params);
    }
    if (VbaExecutionAdapter.handles(toolName)) {
      return this.executionAdapter.execute(toolName, params);
    }
    if (VbaFormsAdapter.handles(toolName)) {
      return this.formsAdapter.execute(toolName, params);
    }
    if (VbaModulesAdapter.handles(toolName)) {
      return this.modulesAdapter.execute(toolName, params);
    }

    return failureResult(createDysflowError("TOOL_NOT_IMPLEMENTED", TOOL_NOT_IMPLEMENTED_MESSAGE));
  }

  /**
   * Issue #809 - `sync_binary` orchestrator bridge.
   *
   * Composes the three existing primitives through `runSyncBinary` (the
   * pure compose layer in `./sync-binary.ts`). Each primitive is invoked
   * through `this.modulesAdapter.execute(...)` so the same write-gate /
   * preflight cleanup / registry tracking the direct tools get applies
   * to every sub-call. The adapter does NOT thread `compile:true` to any
   * inner call (the runtime does not compile; the human compiles in
   * Access, see feat-759-no-compile).
   *
   * Errors:
   *   - Pre-verify failure -> propagate the DysflowError envelope.
   *   - Chunk failure (apply:true, onChunkError:'abort') -> propagate.
   *   - Post-verify failure -> propagate.
   *   - Chunk failure (apply:true, onChunkError:'continue') -> the chunk
   *     error is recorded on `execution.importResult` / `execution.exportResult`
   *     and the next chunk proceeds; the final post-verify surfaces the
   *     real state.
   *
   * The orchestrator NEVER short-circuits to a TOOL_NOT_IMPLEMENTED: the
   * whole point of sync_binary is to compose primitives that already
   * exist; the bridge just routes the calls.
   */
  private async executeSyncBinary(
    params: Record<string, unknown>,
  ): Promise<OperationResult<unknown>> {
    const startTime = Date.now();
    const adapter = this.buildSyncBinaryAdapter();
    const result = await runSyncBinary({
      adapter,
      input: {
        direction: readDirection(params.direction),
        scope: readScope(params.scope),
        moduleNames: readStringArray(params.moduleNames),
        directoryPath: stringValue(params.directoryPath),
        recursive: params.recursive === undefined ? undefined : params.recursive === true,
        includeTests: params.includeTests === undefined ? undefined : params.includeTests === true,
        includeForms: params.includeForms === undefined ? undefined : params.includeForms === true,
        strict: params.strict === undefined ? undefined : params.strict === true,
        dryRun: params.dryRun === true,
        apply: params.apply === true,
        batchSize: typeof params.batchSize === "number" ? params.batchSize : undefined,
        onChunkError:
          params.onChunkError === "continue" || params.onChunkError === "abort"
            ? params.onChunkError
            : undefined,
        returnFullDiff: params.returnFullDiff === true,
        // Forward everything except the sync-binary-specific keys so the
        // inner verify_code / import_modules / export_modules calls
        // resolve the project the same way the dispatch layer did
        // (projectId / contextId / accessPath / strictContext / etc.).
        forward: stripSyncBinaryOwnParams(params),
      },
    });
    const durationMs = Date.now() - startTime;
    // The failure branch carries `error`; the success branch carries
    // the full envelope (with `ok: boolean` reflecting post-sync state).
    if ("error" in result) {
      return failureResult(result.error, { durationMs });
    }
    return successResult(toSyncBinaryResponse(result), { durationMs });
  }

  /**
   * Build the `SyncBinaryAdapterLike` seam that `runSyncBinary` consumes.
   * Every method forwards to `this.modulesAdapter.execute(...)` so the
   * existing write-gate / preflight / registry tracking applies uniformly.
   */
  private buildSyncBinaryAdapter(): SyncBinaryAdapterLike {
    return {
      runVerify: (verifyParams) => this.runSyncBinaryVerify(verifyParams),
      runImportModules: (importParams) =>
        this.modulesAdapter.execute("import_modules", importParams),
      runExportModules: (exportParams) =>
        this.modulesAdapter.execute("export_modules", exportParams),
    };
  }

  private async runSyncBinaryVerify(
    params: Record<string, unknown>,
  ): Promise<
    | { ok: true; summary: SyncVerifySummary }
    | { ok: false; error: import("../../core/contracts/index.js").DysflowError }
  > {
    const verifyResult = await this.modulesAdapter.execute("verify_code", params);
    if (!verifyResult.ok) {
      return { ok: false, error: verifyResult.error };
    }
    return { ok: true, summary: projectVerifyToSyncSummary(verifyResult.data) };
  }

  private async executeMappedTool(
    toolName: string,
    params: Record<string, unknown>,
    mapping: DirectMapping,
  ): Promise<OperationResult<unknown>> {
    const target = await this.resolveExecutionTarget(params);
    if (!target.ok) return target;
    const strict = this.validateStrictContext(params, target.data);
    if (!strict.ok) return strict;
    const accessPath = target.data.accessPath;
    const destinationRoot = target.data.destinationRoot;
    const password = this.accessPassword;
    const explicitTimeoutMs =
      typeof params.timeoutMs === "number" && params.timeoutMs > 0 ? params.timeoutMs : undefined;
    const effectiveTimeoutMs = explicitTimeoutMs ?? target.data.timeoutMs;
    const moduleNames = mapping.moduleNames(params);
    // moduleNamesProvided is the consumer-request signal that the upstream
    // caller actually wanted PowerShell to receive `-ModuleNamesJson`.
    //
    // Two valid shapes collapse into one rule:
    //   1. `import_all` with an explicit empty `moduleNames: []` payload
    //      (R4 no-op plan) — preserve the explicit-empty contract by checking
    //      the literal key presence only for `import_all`.
    //   2. Any other tool whose mapping produced a non-empty `moduleNames`
    //      array (singular `moduleName`/`name` aliases for `exists` and
    //      `delete_module` resolve to an array inside the mapping).
    //
    // Before this rule the check was `Object.hasOwn(params, "moduleNames")`,
    // which only saw the literal plural key. Singular inputs returned
    // `false` even when the mapping produced a non-empty array, sending
    // PowerShell an empty module list and triggering the `Exists requiere
    // exactamente un nombre de módulo/objeto.` throw from
    // dysflow-vba-manager.ps1:4150.
    // optional-presence-guard: allow
    const moduleNamesProvided =
      // optional-presence-guard: allow
      (toolName === "import_all" && Object.hasOwn(params, "moduleNames")) || moduleNames.length > 0;
    const request: VbaManagerExecutionRequest = {
      scriptPath: this.scriptPath,
      action: mapping.action,
      accessPath,
      destinationRoot,
      moduleNames,
      moduleNamesProvided,
      password,
      json: mapping.json ?? false,
      extra: mapping.extra(params),
      timeoutMs: effectiveTimeoutMs,
      cwd: target.data.projectRoot ?? this.cwd,
      env:
        password === undefined
          ? undefined
          : { DYSFLOW_ACCESS_PASSWORD: password, ACCESS_VBA_PASSWORD: password },
    };
    const extraValidation = validateVbaManagerExtra(request.extra);
    if (!extraValidation.ok) return extraValidation;

    const preflightStart = Date.now();
    const preflightDiagnostics = diagnosticsFromPreflightCleanup(
      await this.runPreflightCleanup(target.data),
    );
    const preflightElapsedMs = Date.now() - preflightStart;

    const psTimeoutMs =
      explicitTimeoutMs !== undefined
        ? effectiveTimeoutMs
        : derivePsTimeoutMs(effectiveTimeoutMs, preflightElapsedMs);
    const timedRequest =
      psTimeoutMs !== effectiveTimeoutMs ? { ...request, timeoutMs: psTimeoutMs } : request;
    const trackedOperation = await this.startTrackedOperation(
      toolName,
      mapping.action,
      timedRequest,
      target.data,
    );
    const trackedRequest = trackedOperation
      ? {
          ...timedRequest,
          operationId: trackedOperation.operationId,
          operationFile: trackedOperation.operationFile,
        }
      : timedRequest;
    // Issue #673: try to advance the registry record from "starting" to
    // "running" the moment we have a PID. The PowerShell marker file may
    // not exist yet (process still spinning up) — `transitionToRunning`
    // is a best-effort no-op in that case, and the final `finishTrackedOperation`
    // call below will still stamp the terminal status with whatever PID is
    // eventually recorded.
    await this.transitionToRunning(trackedOperation);
    let result: VbaManagerExecutionResult;
    try {
      result = await this.executor(trackedRequest);
    } catch (error) {
      await this.finishTrackedOperation(trackedOperation, { status: "failed" });
      try {
        await reapOrphanedAccessOnTimeout(() => this.runPreflightCleanup(target.data));
      } catch {
        // Ignore errors during cleanup
      }
      throw error;
    }
    await this.finishTrackedOperation(trackedOperation, {
      status: result.timedOut ? "timed_out" : result.exitCode === 0 ? "completed" : "failed",
    });
    const secrets = [password].filter((secret): secret is string => Boolean(secret));
    // #781 P2 — surface a spawn failure (e.g. ENOENT for `pwsh` not on PATH,
    // EACCES on Windows) with a specific diagnostic code instead of letting it
    // fall through to the generic exit-code failure path. The result has
    // `exitCode: null` and `timedOut: false` — a shape that historically was
    // indistinguishable from a clean timeout-kill, which made spawn errors
    // surface as opaque "exited with code unknown" messages.
    if (result.spawnError !== undefined) {
      return failureResult(
        createDysflowError(
          "POWERSHELL_SPAWN_FAILED",
          `${toolName} could not start PowerShell worker: ${result.spawnError}`,
          {
            details: {
              toolName,
              durationMs: result.durationMs,
              spawnError: result.spawnError,
              stderrTail: result.stderr.slice(-2000),
            },
          },
        ),
        { diagnostics: preflightDiagnostics, durationMs: result.durationMs },
      );
    }
    if (result.timedOut) {
      // The PowerShell process is killed on timeout, but the Access COM process it
      // spawned survives as an orphan. Reap it immediately via the path/lock
      // cleanup so a timeout never leaks an Access process (otherwise it lingers
      // until the next operation's preflight).
      // #757 (F3) — capture the RAW cleanup result (not just its diagnostics)
      // so the timeout envelope can report which orphaned Access PIDs dysflow
      // reaped and which it could not, letting a consumer act without a manual
      // OS audit. Defensive: a timeout is already a failure path, so a cleanup
      // throw degrades to a warning rather than masking the timeout.
      let cleanupResult: AccessOperationPreflightCleanupResult;
      try {
        cleanupResult = await this.runPreflightCleanup(target.data);
      } catch (error) {
        cleanupResult = {
          cleaned: [],
          killed: [],
          orphanedKilled: [],
          errors: [
            {
              operationId: "orphan_cleanup",
              message: `orphan cleanup after timeout failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
      const timeoutCleanupDiagnostics = diagnosticsFromPreflightCleanup(cleanupResult);
      const reapedProcessPids = [...cleanupResult.killed, ...cleanupResult.orphanedKilled];
      const expectedLockFile = deriveExpectedLockFile(accessPath);
      const remediation =
        `dysflow already attempted to reap the orphaned Access process on this timeout. ` +
        `If an MSACCESS.EXE still holds ${accessPath ?? "the target binary"}, list orphans with ` +
        `access_force_cleanup_orphaned (no confirmPid = read-only list), then retry. ` +
        `Consider raising timeoutMs for large projects.`;
      return failureResult(
        createDysflowError(
          "VBA_MANAGER_TIMEOUT",
          `${toolName} timed out after ${result.durationMs}ms`,
          {
            retryable: true,
            remediation,
            details: {
              phase: deriveTimeoutPhase(toolName),
              wasApply: TIMEOUT_WRITE_TOOLS.has(toolName) && params.dryRun !== true,
              operationTimeoutMs: effectiveTimeoutMs,
              durationMs: result.durationMs,
              // Orphaned Access PIDs dysflow reaped on this timeout — the
              // consumer does NOT need to clean these.
              reapedProcessPids,
              // Cleanup steps that could NOT complete (refused/suppressed kills,
              // enumeration failures) — a process here may still be lingering.
              cleanupWarnings: cleanupResult.errors.map(
                (error) => `${error.operationId}: ${error.message}`,
              ),
              ...(expectedLockFile !== undefined ? { expectedLockFile } : {}),
            },
          },
        ),
        {
          diagnostics: [...preflightDiagnostics, ...timeoutCleanupDiagnostics],
          durationMs: result.durationMs,
        },
      );
    }
    let parsedOutput: unknown;
    try {
      parsedOutput = parseOutput(result.stdout, secrets);
    } catch (error) {
      if (result.exitCode !== 0 || isImportTool(toolName)) {
        return failureResult(failureFromUnexpectedRunnerExit(toolName, result, error, secrets), {
          diagnostics: preflightDiagnostics,
          durationMs: result.durationMs,
        });
      }
      return failureResult(
        createDysflowError(
          "VBA_MANAGER_INVALID_OUTPUT",
          `${toolName} produced output with no ${RESULT_MARKER.trim()} sentinel line.`,
        ),
        { diagnostics: preflightDiagnostics, durationMs: result.durationMs },
      );
    }
    if (result.exitCode !== 0) {
      const structuredFailure = failureFromStructuredRunnerResult(
        toolName,
        result,
        parsedOutput,
        secrets,
      );
      return failureResult(structuredFailure, {
        diagnostics: preflightDiagnostics,
        durationMs: result.durationMs,
      });
    }
    if (toolName === "import_all" || toolName === "import_modules") {
      return successResult(
        {
          result: parsedOutput,
          ...buildTargetDiagnostics(toolName, params, target.data, true),
        },
        { diagnostics: preflightDiagnostics, durationMs: result.durationMs },
      );
    }

    return successResult(parsedOutput, {
      diagnostics: preflightDiagnostics,
      durationMs: result.durationMs,
    });
  }

  private async runPreflightCleanup(target: {
    accessPath?: string;
    projectRoot?: string;
  }): Promise<AccessOperationPreflightCleanupResult> {
    return this.operationsAdapter.runPreflightCleanup(target);
  }

  private async startTrackedOperation(
    toolName: string,
    managerAction: string,
    request: VbaManagerExecutionRequest,
    target: Pick<DysflowConfig, "projectRoot" | "accessDbPath"> & {
      accessPath?: string;
      destinationRoot: string;
    },
  ): Promise<TrackedVbaManagerOperation | undefined> {
    if (this.operationRegistry === undefined || target.accessPath === undefined) return undefined;

    const operationId = createAccessOperationId();
    const operationFile = join(
      target.projectRoot ?? request.cwd ?? this.cwd,
      ".dysflow",
      "runtime",
      "markers",
      `${operationId}.json`,
    );
    const record = await this.operationRegistry.create({
      operationId,
      action: "vba",
      accessPath: target.accessPath,
      destinationRootAbs: target.destinationRoot,
      projectRootAbs: target.projectRoot ?? request.cwd ?? this.cwd,
      accessPid: null,
      processStartTime: null,
      status: "starting",
      metadata: {
        toolName,
        managerAction,
        moduleNames: [...request.moduleNames],
      },
      updatedAt: new Date().toISOString(),
    });
    return { operationId, operationFile, record };
  }

  private async finishTrackedOperation(
    operation: TrackedVbaManagerOperation | undefined,
    update: { status: AccessOperationRecord["status"] },
  ): Promise<void> {
    if (operation === undefined || this.operationRegistry === undefined) return;
    const marker = await readVbaManagerOperationMarker(operation.operationFile);
    await this.operationRegistry.update(operation.operationId, {
      accessPid: marker.accessPid ?? operation.record.accessPid,
      processStartTime: marker.processStartTime ?? operation.record.processStartTime,
      status: update.status,
      updatedAt: new Date().toISOString(),
    });
    await rm(operation.operationFile, { force: true }).catch(() => undefined);
  }

  /**
   * Issue #673: while a VBA manager execution is in flight, the registry
   * record MUST reach `status: "running"` so the orphan-ownership guards
   * (`ORPHAN_CLEANUP_REGISTRY_OWNED` and the preflight cleanup scan) can
   * see the operation as live. Without this transition, the record stays
   * at `status: "starting"` and `accessPid: null`, so a `confirmPid` kill
   * from another session can wipe a real in-flight import.
   *
   * Best-effort: reads the PowerShell-written marker file. If the marker
   * is not yet present (PowerShell hasn't started yet), this is a no-op —
   * the followup `finishTrackedOperation` call will still produce the
   * final status with whatever PID was discovered by then. Swallows
   * errors so a failed transition never breaks the underlying executor.
   */
  private async transitionToRunning(
    operation: TrackedVbaManagerOperation | undefined,
  ): Promise<void> {
    if (operation === undefined || this.operationRegistry === undefined) return;
    try {
      const marker = await readVbaManagerOperationMarker(operation.operationFile);
      if (marker.accessPid === undefined) return;
      await this.operationRegistry.update(operation.operationId, {
        accessPid: marker.accessPid,
        processStartTime: marker.processStartTime ?? null,
        status: "running",
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      logSwallowedIoError("vba-sync-adapter:transition-to-running", err);
    }
  }

  private async resolveExecutionTarget(params: Record<string, unknown>) {
    return resolveExecutionTargetInCore(params, {
      env: this.env,
      cwd: this.cwd,
      accessPath: this.accessPath,
      destinationRoot: this.destinationRoot,
      timeoutMs: this.timeoutMs,
      fileSystem: nodeConfigFileSystem,
    });
  }

  private validateStrictContext(
    params: Record<string, unknown>,
    target: { accessPath?: string; destinationRoot: string; projectRoot?: string },
  ): OperationResult<undefined> {
    if (!truthy(params.strictContext) && !truthy(params.strictWrite))
      return successResult(undefined);
    const checks: Array<[string, string | undefined, string | undefined]> = [
      ["expectedAccessPath", stringValue(params.expectedAccessPath), target.accessPath],
      [
        "expectedDestinationRoot",
        stringValue(params.expectedDestinationRoot),
        target.destinationRoot,
      ],
      ["expectedProjectRoot", stringValue(params.expectedProjectRoot), target.projectRoot],
    ];
    for (const [name, expected, actual] of checks) {
      if (expected !== undefined && actual === undefined) {
        return failureResult(
          createDysflowError(
            "STRICT_CONTEXT_MISMATCH",
            `${name} was provided but the resolved target has no matching value.`,
          ),
        );
      }
      if (expected !== undefined && actual !== undefined && resolve(expected) !== resolve(actual)) {
        return failureResult(
          createDysflowError(
            "STRICT_CONTEXT_MISMATCH",
            `${name} does not match resolved target. Expected ${expected}; resolved ${actual}.`,
          ),
        );
      }
    }
    return successResult(undefined);
  }
}

function validateVbaManagerExtra(
  extra: Record<string, string | boolean | number | undefined>,
): OperationResult<undefined> {
  for (const key of Object.keys(extra)) {
    if (!VBA_MANAGER_EXTRA_KEYS.has(key)) {
      return failureResult(
        createDysflowError(
          "VBA_MANAGER_EXTRA_NOT_ALLOWED",
          `Unsupported VBA manager option: ${key}.`,
        ),
      );
    }
  }
  return successResult(undefined);
}

// ─── sync_binary helpers (#809) ────────────────────────────────────────────

/**
 * sync_binary-specific parameter keys. Stripped from the payload the
 * orchestrator forwards to inner verify_code / import_modules /
 * export_modules calls so those primitives never see sync-binary-shaped
 * noise. Context keys (projectId / contextId / accessPath / ...),
 * strictContext, expectedAccessPath, and timeoutMs are kept - the inner
 * primitives resolve the project the same way the dispatch layer did.
 */
const SYNC_BINARY_OWN_PARAMS = new Set([
  "direction",
  "scope",
  "directoryPath",
  "recursive",
  "includeTests",
  "includeForms",
  "dryRun",
  "apply",
  "batchSize",
  "onChunkError",
  "parallelChunks",
  "returnFullDiff",
]);

function readDirection(value: unknown): "src-to-binary" | "binary-to-src" | "both" | undefined {
  if (value === "src-to-binary" || value === "binary-to-src" || value === "both") return value;
  return undefined;
}

function readScope(
  value: unknown,
): { actionableOnly?: boolean; includeBothChanged?: boolean } | undefined {
  if (!isRecord(value)) return undefined;
  const scope: { actionableOnly?: boolean; includeBothChanged?: boolean } = {};
  if (typeof value.actionableOnly === "boolean") scope.actionableOnly = value.actionableOnly;
  if (typeof value.includeBothChanged === "boolean") {
    scope.includeBothChanged = value.includeBothChanged;
  }
  return scope;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string" && entry.length > 0) out.push(entry);
  }
  return out;
}

function stripSyncBinaryOwnParams(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (SYNC_BINARY_OWN_PARAMS.has(key)) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Project a `VbaVerifyResult` (full verify_code payload) onto the
 * `SyncVerifySummary` the compose layer consumes. Pure projection - no
 * I/O. Reads only the additive semantic fields, defaults to safe zeros
 * when the runtime ran in strict mode (which omits the summary).
 *
 * `bothChangedEntries` is derived from `actionableDifferent` filtered by
 * `classification === 'bothChanged'`. Strict mode has no
 * `actionableDifferent`; bothChangedEntries defaults to [].
 */
function projectVerifyToSyncSummary(value: unknown): SyncVerifySummary {
  const result = (value ?? {}) as {
    ok?: boolean;
    missingInBinary?: ReadonlyArray<{ moduleName: string }>;
    missingInSource?: ReadonlyArray<{ moduleName: string }>;
    actionableDifferent?: ReadonlyArray<{
      moduleName: string;
      classification?: string;
    }>;
    nonActionableDifferent?: ReadonlyArray<unknown>;
    hasFunctionalDifferences?: boolean;
    recommendedAction?: string;
    recommendation?: string;
    summaryStructured?: {
      actionable?: { total: number; sourceNewer: number; binaryNewer: number; bothChanged: number };
      nonActionable?: { total: number };
    };
  };
  const missingInBinary = (result.missingInBinary ?? []).map((entry) => ({
    moduleName: entry.moduleName,
  }));
  const missingInSource = (result.missingInSource ?? []).map((entry) => ({
    moduleName: entry.moduleName,
  }));
  const actionable = result.summaryStructured?.actionable ?? {
    total: 0,
    sourceNewer: 0,
    binaryNewer: 0,
    bothChanged: 0,
  };
  const nonActionable = result.summaryStructured?.nonActionable ?? { total: 0 };
  const bothChangedEntries = (result.actionableDifferent ?? [])
    .filter((entry) => entry.classification === "bothChanged")
    .map((entry) => ({ moduleName: entry.moduleName }));
  return {
    ok: result.ok === true,
    missingInBinary,
    missingInSource,
    actionable,
    nonActionable,
    hasFunctionalDifferences: result.hasFunctionalDifferences === true,
    recommendedAction: result.recommendedAction ?? "no_action",
    recommendation: result.recommendation ?? "",
    bothChangedEntries,
  };
}

/**
 * Wrap the pure `SyncBinarySuccessResult` in a response-friendly envelope.
 * The MCP-side translation (`translateCoreResultToMcpContent`) reads
 * `result.data` verbatim; we shape it so a consumer reading
 * `sync_binary` output sees the same flat shape the issue spec lists.
 */
function toSyncBinaryResponse(result: SyncBinarySuccessResult): {
  ok: true;
  dryRun: boolean;
  preSync: SyncVerifySummary;
  plan: SyncBinaryPlan;
  execution: SyncBinaryExecution | null;
  postSync: SyncVerifySummary | null;
  recommendation: string;
} {
  return {
    ok: true,
    dryRun: result.dryRun,
    preSync: result.preSync,
    plan: result.plan,
    execution: result.execution,
    postSync: result.postSync,
    recommendation: result.recommendation,
  };
}

export function resolveDefaultVbaManagerScriptPath(
  env: Record<string, string | undefined> = process.env,
): string {
  const home = env.DYSFLOW_HOME;
  if (home !== undefined && home.trim().length > 0) {
    return `${home.replace(/\\$/, "")}/app/scripts/dysflow-vba-manager.ps1`;
  }
  // No DYSFLOW_HOME (dev / tests): resolve an ABSOLUTE path from the package root so the script
  // is found regardless of the spawn's working directory. The bare relative default broke when
  // an operation spawned PowerShell with a project-directory cwd (list_objects E2E:
  // "scripts/dysflow-vba-manager.ps1 ... no existe").
  const root = findPackageRootNear(import.meta.url);
  return root !== undefined
    ? join(root, "scripts", "dysflow-vba-manager.ps1")
    : "scripts/dysflow-vba-manager.ps1";
}

function buildTargetDiagnostics(
  operation: string,
  params: Record<string, unknown>,
  target: Pick<DysflowConfig, "backendPath" | "configSource" | "projectId" | "projectRoot"> & {
    accessPath?: string;
    destinationRoot: string;
  },
  willModifyAccess: boolean,
): Record<string, unknown> {
  return {
    operation,
    dryRun: false,
    willModifyAccess,
    requestedProjectId: stringValue(params.projectId),
    requestedContextId: stringValue(params.contextId),
    resolvedProjectId: target.projectId,
    configSource:
      target.configSource === "explicit-request" ? "explicit-overrides" : target.configSource,
    projectRoot: target.projectRoot,
    accessPath: target.accessPath,
    backendPath: target.backendPath,
    destinationRoot: target.destinationRoot,
  };
}

function isImportTool(toolName: string): boolean {
  return toolName === "import_all" || toolName === "import_modules";
}

/**
 * Strict sentinel-based output extractor (issue #440).
 * Result MUST be on a `DYSFLOW_RESULT <compact-json>` line.
 * Throws RunnerResultChannelError on missing/duplicate sentinel,
 * or SyntaxError on malformed payload. No silent fallback.
 */
function parseOutput(stdout: string, secrets: readonly string[]): unknown {
  return extractResultPayload(stdout, secrets);
}

function failureFromStructuredRunnerResult(
  toolName: string,
  result: VbaManagerExecutionResult,
  parsedOutput: unknown,
  secrets: readonly string[],
) {
  const outputDetails = buildRunnerFailureOutputDetails(result, secrets);
  if (isRecord(parsedOutput) && parsedOutput.ok === false && isRecord(parsedOutput.error)) {
    const code = stringValue(parsedOutput.error.code) ?? "VBA_MANAGER_FAILED";
    const message =
      stringValue(parsedOutput.error.message) ?? "VBA manager returned a failed result.";
    const suffix =
      outputDetails.displayOutput.trim().length > 0
        ? ` Output: ${outputDetails.displayOutput}`
        : "";
    // Forward the fine-grained error metadata (machine, user, remediation)
    // when the script's structured envelope carries them. ACCESS_DATABASE_LOCKED
    // (R5 of the consumer request) relies on this so the MCP caller can
    // render an actionable remediation message ("close interactive Access on
    // machine 'X' (user 'Y')"). Keys are intentionally narrow — unknown
    // fields stay in the raw envelope under data.result.error, not in the
    // DysflowError contract.
    const extraDetails: Record<string, unknown> = { ...outputDetails.details };
    const machine = stringValue(parsedOutput.error.machine);
    const user = stringValue(parsedOutput.error.user);
    const remediation = stringValue(parsedOutput.error.remediation);
    if (machine !== undefined) extraDetails.machine = machine;
    if (user !== undefined) extraDetails.user = user;
    if (remediation !== undefined) extraDetails.remediation = remediation;
    const firstCompileError = compileErrorContextFromRunnerResult(parsedOutput);
    if (firstCompileError !== undefined) {
      extraDetails.firstError = firstCompileError;
    }
    return createDysflowError(code, `${message}${suffix}`, { details: extraDetails });
  }

  return createDysflowError(
    "VBA_MANAGER_FAILED",
    `${toolName} failed with exit code ${result.exitCode ?? "unknown"}: ${outputDetails.displayOutput}`,
    { details: outputDetails.details },
  );
}

function compileErrorContextFromRunnerResult(
  parsedOutput: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const component = stringValue(parsedOutput.component);
  const line = numberValue(parsedOutput.line);
  const column = numberValue(parsedOutput.column);
  const endLine = numberValue(parsedOutput.endLine);
  const endColumn = numberValue(parsedOutput.endColumn);
  const sourceLine = rawStringValue(parsedOutput.sourceLine);
  if (
    component === undefined &&
    line === undefined &&
    column === undefined &&
    endLine === undefined &&
    endColumn === undefined &&
    sourceLine === undefined
  ) {
    return undefined;
  }

  return {
    ...(component !== undefined ? { module: component, component } : {}),
    ...(line !== undefined ? { line } : {}),
    ...(column !== undefined ? { column } : {}),
    ...(endLine !== undefined ? { endLine } : {}),
    ...(endColumn !== undefined ? { endColumn } : {}),
    ...(sourceLine !== undefined ? { sourceLine } : {}),
  };
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function rawStringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function failureFromUnexpectedRunnerExit(
  toolName: string,
  result: VbaManagerExecutionResult,
  parseError: unknown,
  secrets: readonly string[],
) {
  const outputDetails = buildRunnerFailureOutputDetails(result, secrets);
  const parseDetails = describeParseError(parseError);
  return createDysflowError(
    "VBA_MANAGER_UNEXPECTED_EXIT",
    `${toolName} exited with code ${result.exitCode ?? "unknown"} before producing valid ${RESULT_MARKER.trim()} output. Output: ${outputDetails.displayOutput}`,
    {
      details: {
        ...outputDetails.details,
        parseError: parseDetails,
      },
    },
  );
}

function describeParseError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    message: String(error),
  };
}

function buildRunnerFailureOutputDetails(
  result: VbaManagerExecutionResult,
  secrets: readonly string[],
): { displayOutput: string; details: Record<string, unknown> } {
  const stdout = sanitizeSecrets(result.stdout, secrets);
  const stderr = sanitizeSecrets(result.stderr, secrets);
  const displayOutput =
    stderr.trim().length > 0 ? stderr : stdout.trim().length > 0 ? stdout : "No output.";

  return {
    displayOutput,
    details: {
      exitCode: result.exitCode,
      stdout,
      stderr,
    },
  };
}

async function readVbaManagerOperationMarker(
  operationFile: string,
): Promise<VbaManagerOperationMarker> {
  const raw = await readFile(operationFile, "utf8").catch((err: unknown) => {
    if (isPathMissingError(err)) return undefined;
    logSwallowedIoError("vba-sync-adapter:operation-marker-read", err);
    return undefined;
  });
  if (raw === undefined) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return {};
    const accessPid = typeof parsed.accessPid === "number" ? parsed.accessPid : undefined;
    const processStartTime = stringValue(parsed.processStartTime);
    return { accessPid, processStartTime };
  } catch (err) {
    logSwallowedIoError("vba-sync-adapter:operation-marker-parse", err);
    return {};
  }
}

function isPathMissingError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "ENOENT";
}

/**
 * Inline length above which `proceduresJson` is offloaded to a temp file passed
 * via `-ProceduresJsonFile` instead of inline `-ProceduresJson`. Windows caps a
 * process command line at ~32K chars; a full VBA test plan (one entry per test,
 * with args) easily blows past that once enough tests accumulate, and Node's
 * `spawn` then throws `ENAMETOOLONG` before MSACCESS.EXE ever starts. Offloading
 * keeps the command line bounded. Kept well below the OS limit so the rest of the
 * arguments (paths, flags) can never tip the total over.
 */
const PROCEDURES_JSON_INLINE_LIMIT = 8_000;

export const spawnVbaManager: VbaManagerExecutor = async (request) => {
  const args = [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    request.scriptPath,
    "-Action",
    request.action,
    "-DestinationRoot",
    request.destinationRoot,
  ];
  if (request.accessPath) args.push("-AccessPath", request.accessPath);
  // Always forward moduleNames when the caller provided it, including an empty
  // array — that is the consumer-request contract: an explicit `moduleNames: []`
  // is a "no-op plan" (R4) and must NOT be silently expanded to import-all.
  // The script distinguishes "explicit empty" via $PSBoundParameters on
  // -ModuleNamesJson (bound with "[]") from "not provided" (parameter absent).
  if (request.moduleNamesProvided) {
    args.push("-ModuleNamesJson", JSON.stringify(request.moduleNames));
  }
  if (request.json) args.push("-Json");
  if (request.operationId !== undefined) args.push("-OperationId", request.operationId);
  if (request.operationFile !== undefined) args.push("-OperationFile", request.operationFile);

  let proceduresJsonFile: string | undefined;
  for (const [key, value] of Object.entries(request.extra)) {
    if (value === undefined) continue;
    // A large test plan would overflow the Windows command line (spawn
    // ENAMETOOLONG). Write it to a temp file the PS script reads via
    // -ProceduresJsonFile; cleaned up in the finally below.
    if (
      key === "proceduresJson" &&
      typeof value === "string" &&
      value.length > PROCEDURES_JSON_INLINE_LIMIT
    ) {
      proceduresJsonFile = join(tmpdir(), `dysflow-procedures-${randomUUID()}.json`);
      await writeFile(proceduresJsonFile, value, "utf8");
      args.push("-ProceduresJsonFile", proceduresJsonFile);
      continue;
    }
    const flag = `-${key.charAt(0).toUpperCase()}${key.slice(1)}`;
    // Booleans map to PowerShell [switch] params: emit the bare flag for true,
    // omit it entirely for false. Never "-Flag true", which a switch rejects.
    if (typeof value === "boolean") {
      if (value) {
        // issue #752 — rename the JSON key `verbose` to the PS switch
        // `-VerboseContract`. The script uses `-VerboseContract` because
        // [CmdletBinding()]$Verbose is the common Write-Verbose parameter
        // and reusing the name would collide with the Write-Verbose surface.
        args.push(key === "verbose" ? "-VerboseContract" : flag);
      }
      continue;
    }
    args.push(key === "verbose" ? "-VerboseContract" : flag, String(value));
  }

  try {
    return await spawnPowerShellProcess({
      command: POWERSHELL_EXE,
      args,
      timeoutMs: request.timeoutMs,
      cwd: request.cwd,
      env: request.env,
      signal: request.signal,
    });
  } finally {
    if (proceduresJsonFile !== undefined) {
      await rm(proceduresJsonFile, { force: true }).catch(() => undefined);
    }
  }
};
