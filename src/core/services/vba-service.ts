import type { DysflowConfig } from "../config/dysflow-config.js";
import type { AccessVbaRequest, OperationResult } from "../contracts/index.js";
import { createDysflowError, failureResult, successResult } from "../contracts/index.js";
import {
  type AccessRunner,
  type AccessRunnerProgressCallback,
  ensureResultShape,
} from "../runner/access-runner.js";
import { isRecord } from "../utils/index.js";
import { parseProcedureName } from "./vba-procedure-name-parser.js";
import { listVbaProcedures } from "./vba-procedure-service.js";

/**
 * Real-execution result shape. PowerShell returns the procedure's return
 * value (or nothing for `Sub` procedures). All other fields from the Access
 * runner are flattened onto the `OperationResult` envelope (diagnostics,
 * durationMs, operation metadata) — `data` stays the slim value carrier.
 */
type AccessVbaExecutionResult = {
  returnValue?: unknown;
};

/**
 * Plan-only result shape for `dryRun: true` requests. Mirrors the import-
 * plan shape used by `VbaModulesAdapter.planImport` (`import_all` /
 * `import_modules` dry-run path): the consumer is told WHAT would have run,
 * without ever spawning PowerShell or opening Access. The #748 fix closes
 * the contract-truth gap where `AccessVbaService.execute({dryRun:true})`
 * silently ignored the flag and still invoked the runner.
 */
type AccessVbaPlan = {
  dryRun: true;
  willExecute: false;
  willModifyAccess: false;
  procedureName: string;
  moduleName: string;
};

/**
 * The runtime result of `AccessVbaService.execute(...)`. Two shapes, one per
 * branch the service can take:
 *
 *  - real execution → `{ returnValue?: unknown }` (Access runner output)
 *  - dry-run plan    → `{ dryRun: true, willExecute: false, willModifyAccess: false, procedureName, moduleName }`
 *
 * Consumers branch on `data.dryRun === true` to render a "would have run"
 * preview without parsing the content text.
 */
export type AccessVbaResult = AccessVbaExecutionResult | AccessVbaPlan;

/**
 * #1045 — VBA source-resolution port. The `AccessVbaService` resolves the
 * module's source text (or all modules in the project's source tree) and
 * verifies the requested procedure exists before launching the PowerShell
 * runner. Without this preflight, a missing procedure caused the runner to
 * open Access, fail with a Spanish-localized `Excepción`, and surface as a
 * generic `RUNNER_FAILED` (with mojibake for the non-ASCII characters).
 *
 * The port lives in core (no `node:fs` import here). The adapter layer
 * (src/adapters/mcp/stdio.ts, http-services-factory.ts, etc.) provides the
 * concrete Node-backed implementation that walks the configured
 * `destinationRoot`. Tests inject a fake.
 *
 * Both methods MAY return `undefined` / `{}` when no source is available —
 * the service treats that as "cannot verify absence" and proceeds with the
 * runner so the existing runner-based diagnostics still fire.
 */
export type VbaSourceResolver = {
  /**
   * Resolve source text for a single module by name. Returns `undefined`
   * when the module cannot be resolved (no source on disk, mismatched
   * destination root, etc.).
   *
   * The module name follows the convention used by `resolveVbaSourceFile`:
   * the `.bas`/`.cls` basename without extension. Adapter impls probe
   * `modules/`, `classes/`, `forms/`, `reports/` in priority order.
   */
  resolveModuleSource(moduleName: string): Promise<string | undefined>;
  /**
   * Resolve every module in the project's source tree. Returns an empty
   * record when the source tree is unavailable. Used as a fallback when
   * the request omits `moduleName` (e.g. the legacy `dysflow_vba_execute`
   * shape that does not carry it).
   */
  resolveAllModuleSources(): Promise<Record<string, string>>;
};

/**
 * #1440 — per-call source-resolver factory. The preflight resolver is
 * frozen at service construction, but the caller can override
 * `destinationRoot` per call. The factory builds a fresh resolver around
 * the caller's destinationRoot so the preflight reads the source the
 * caller actually targeted, not the startup root the cached service
 * captured.
 */
export type CreateSourceResolver = (destinationRoot: string) => VbaSourceResolver;

export type AccessVbaServiceOptions = {
  runner: AccessRunner;
  config: DysflowConfig;
  /**
   * #1045 — optional source resolver for the procedure-existence preflight.
   * When omitted (defensive default), the service skips the preflight and
   * delegates directly to the runner — preserving the legacy behavior for
   * callers that have not yet wired a resolver.
   */
  sourceResolver?: VbaSourceResolver;
  /**
   * #1440 — optional factory that produces a fresh resolver around a
   * per-call `destinationRoot`. The preflight uses the result when the
   * request carries an explicit destinationRoot, falling back to the
   * static `sourceResolver` otherwise. When neither is provided, the
   * preflight is a no-op (defensive — preserves the legacy behavior).
   */
  createSourceResolver?: CreateSourceResolver;
};

export class AccessVbaService {
  private readonly runner: AccessRunner;
  private readonly config: DysflowConfig;
  private readonly sourceResolver: VbaSourceResolver | undefined;
  private readonly createSourceResolver: CreateSourceResolver | undefined;

  constructor(options: AccessVbaServiceOptions) {
    this.runner = options.runner;
    this.config = options.config;
    this.sourceResolver = options.sourceResolver;
    this.createSourceResolver = options.createSourceResolver;
  }

  /**
   * #1440 — pick the resolver to feed the preflight. The static
   * `sourceResolver` is the default; a per-call override via
   * `createSourceResolver` wins whenever the request carries an explicit
   * non-empty `destinationRoot`. Returning `undefined` signals "no resolver
   * wired; the preflight is a no-op", which preserves the legacy
   * behavior for callers that have not wired a resolver.
   */
  private resolveSourceResolver(request: AccessVbaRequest): VbaSourceResolver | undefined {
    if (
      this.createSourceResolver !== undefined &&
      typeof request.destinationRoot === "string" &&
      request.destinationRoot.length > 0
    ) {
      return this.createSourceResolver(request.destinationRoot);
    }
    return this.sourceResolver;
  }

  async execute(
    request: AccessVbaRequest,
    onProgress?: AccessRunnerProgressCallback,
  ): Promise<OperationResult<AccessVbaResult>> {
    // #1174 — parse `procedureName` into the module / procedure pair BEFORE
    // branching on dry-run so the dry-run plan and the apply-path preflight
    // produce identical values for the same input. Without this, the
    // adapter forwarded `moduleName: ""` while the apply path scanned every
    // module — the asymmetry the bug report describes.
    const parsedName = parseProcedureName(request.procedureName);
    if (!parsedName.ok) {
      // Empty / malformed procedureName short-circuits with the typed
      // envelope BEFORE the runner is spawned, so both paths fail
      // identically instead of dry-run succeeding silently.
      return failureResult(
        createDysflowError(
          "PROCEDURE_NOT_FOUND",
          parsedName.code === "PROCEDURE_NAME_EMPTY"
            ? `Procedure name is empty. Pass a '<module>.<procedure>' name, e.g. 'Module.Foo'.`
            : parsedName.message,
          {
            details: {
              procedure: request.procedureName,
              parseError: parsedName.code,
            },
          },
        ),
      );
    }
    // #1174 — when the caller supplied `<module>.<procedure>`, the parsed
    // `moduleName` is authoritative. When the procedureName is unqualified
    // (legacy `dysflow_vba_execute` shape) keep the explicit `moduleName`
    // the caller already passed in — otherwise the parser would silently
    // downgrade it to `""` and the apply path's all-modules fallback would
    // mask the caller's intent.
    const normalizedRequest: AccessVbaRequest = {
      ...request,
      ...(parsedName.moduleName.length > 0 ? { moduleName: parsedName.moduleName } : {}),
      procedureName: parsedName.original,
    };

    // Round-3 Item 2 (#748) — honor the documented `dryRun: true` escape
    // hatch. Previously this branch delegated to the runner, which spawned
    // PowerShell even though no Access side-effect was intended. With
    // `allowedProcedures` configured the upstream `ensureProcedureAllowed`
    // gate lets `dryRun: true` through, so callers expected the service to
    // honor the flag and produce a plan; instead they got the
    // `OpenCurrentDatabase failed` PowerShell error. Returning the plan
    // shape here brings the service into line with the PR1a contract.
    //
    // #1045 — the preflight MUST be skipped on the dry-run path. A dry-run
    // is a "would have run" preview and the caller has not asked us to
    // execute anything; surfacing `PROCEDURE_NOT_FOUND` for an intentionally
    // absent procedure would defeat the contract.
    //
    // #1174 — the plan echoes the parsed `moduleName` so dry-run and apply
    // produce identical values for the same input. Previously this branch
    // echoed `request.moduleName` (always `""`) which masked the
    // adapter-vs-preflight asymmetry.
    if (normalizedRequest.dryRun === true) {
      return successResult<AccessVbaPlan>({
        dryRun: true,
        willExecute: false,
        willModifyAccess: false,
        procedureName: normalizedRequest.procedureName,
        moduleName: normalizedRequest.moduleName,
      });
    }

    // #1045 — preflight: when the caller asks for a procedure that is
    // verifiably absent from the project's VBA source tree, return the
    // typed `PROCEDURE_NOT_FOUND` envelope instead of letting the runner
    // open Access, hit a Spanish-localized COM exception, and flatten the
    // cause into a generic `RUNNER_FAILED`.
    //
    // #1440 — the preflight resolver is per-call when the caller supplies
    // an explicit `destinationRoot` on the request. The static
    // `sourceResolver` captured at construction was bound to the startup
    // `config.destinationRoot`; if the caller targets a different root
    // (per-call override), the static resolver would read the wrong path.
    // When `createSourceResolver` is wired, the per-call root wins.
    const preflightResolver = this.resolveSourceResolver(normalizedRequest);
    //
    // "Verifiably absent" requires at least one resolved source file.
    // When the resolver returns `undefined` / `{}` (e.g. no `destinationRoot`
    // configured, or a non-source-tracked `procedureName`), the service
    // falls through to the runner so the existing diagnostics still fire —
    // this is non-regressive behavior.
    if (preflightResolver !== undefined) {
      const preflight = await this.checkProcedureExists(
        normalizedRequest,
        parsedName.procName,
        preflightResolver,
      );
      if (preflight !== undefined) return preflight;
    }

    const result = await this.runner.run<AccessVbaExecutionResult>(
      { kind: "vba", request: normalizedRequest },
      this.config,
      {
        onProgress,
      },
    );
    const ensured = ensureResultShape(result, isRecord);
    // #1174 — distinguish "procedure exists in source but Access COM cannot
    // call it" (PROCEDURE_NOT_CALLABLE) from "procedure is not in source"
    // (PROCEDURE_NOT_FOUND). Without this, both surface as RUNNER_FAILED
    // with a Spanish-localized COM message and agents cannot tell whether
    // to re-import (no-op) or recompile (the actual fix).
    return reclassifyRunnerFailure(ensured, normalizedRequest);
  }

  /**
   * Verify the requested procedure is declared in the project's VBA source.
   * Returns a failure `OperationResult` when verified absent, `undefined`
   * when the procedure is present OR when the resolver could not produce
   * any source text to verify against (defensive — the runner will surface
   * the real Access-side failure in that case).
   *
   * #1174 — the lookup uses the parser-supplied `procName` (no module
   * prefix) so `<module>.<procedure>` requests compare against the
   * declarations `listVbaProcedures` actually returns. Previously the
   * service compared the FULL `<module>.<procedure>` string against the
   * bare procedure name, always missing — the silent lookup bug at the
   * heart of issue #1174.
   *
   * #1440 — the resolver is passed in (per-call) rather than read from
   * `this.sourceResolver` so the caller can target a different
   * `destinationRoot` than the one captured at service construction.
   * When `undefined`, the preflight is skipped.
   */
  private async checkProcedureExists(
    request: AccessVbaRequest,
    procName: string,
    resolver: VbaSourceResolver | undefined,
  ): Promise<OperationResult<AccessVbaResult> | undefined> {
    if (resolver === undefined) return undefined;
    if (typeof procName !== "string" || procName.length === 0) {
      return undefined;
    }

    let modulesToScan: Record<string, string>;
    if (typeof request.moduleName === "string" && request.moduleName.length > 0) {
      const source = await resolver.resolveModuleSource(request.moduleName);
      if (source === undefined) {
        // Cannot resolve just this module. Try the full-tree scan as a
        // fallback so the procedure might still be found in a sibling
        // module — otherwise an unrelated typo in `moduleName` would
        // false-positive `PROCEDURE_NOT_FOUND` even when the procedure
        // exists elsewhere in the project.
        modulesToScan = await resolver.resolveAllModuleSources();
      } else {
        modulesToScan = { [request.moduleName]: source };
      }
    } else {
      modulesToScan = await resolver.resolveAllModuleSources();
    }

    if (Object.keys(modulesToScan).length === 0) return undefined;

    const target = procName.toLowerCase();
    let found = false;
    for (const source of Object.values(modulesToScan)) {
      const procedures = listVbaProcedures(source);
      if (procedures.some((p) => p.name.toLowerCase() === target)) {
        found = true;
        break;
      }
    }

    if (found) return undefined;

    const moduleSuffix =
      typeof request.moduleName === "string" && request.moduleName.length > 0
        ? ` (scanned module: '${request.moduleName}')`
        : "";
    const message =
      `Procedure '${procName}' was not found in the project's VBA source modules` +
      `${moduleSuffix}. Verify the procedure name and module, or import the procedure into the binary before retrying.`;

    return failureResult(
      createDysflowError("PROCEDURE_NOT_FOUND", message, {
        details: {
          procedure: procName,
          fullProcedureName: request.procedureName,
          ...(typeof request.moduleName === "string" && request.moduleName.length > 0
            ? { moduleName: request.moduleName }
            : {}),
          scannedModules: Object.keys(modulesToScan).length,
        },
      }),
    );
  }
}

/**
 * #1174 — reclassify a generic `RUNNER_FAILED` into the typed
 * `PROCEDURE_NOT_CALLABLE` envelope when the underlying Access COM error
 * pattern indicates the procedure is present in the binary but cannot be
 * invoked (typical cause: stale p-code after source edits without a VBE
 * recompile).
 *
 * Patterns detected:
 *   - Spanish-localized: `Excepci[oó]n al llamar a "Run"` (Access VBA manager
 *     emits this when `$AccessApplication.Run($ProcedureName)` throws — the
 *     procedure exists in the project's VBComponents but the compiled
 *     token is missing or stale).
 *   - English fallback: `Cannot run the macro` / `The expression you
 *     entered refers to an object that is closed or doesn't exist` (rare,
 *     but the same root cause when the VBE is in a non-compiled state).
 *
 * Returns the original `OperationResult` unchanged when no pattern matches
 * so genuine runner failures (`RUNNER_FAILED`, `VBA_MANAGER_TIMEOUT`,
 * `VBA_MANAGER_FAILED`, etc.) propagate verbatim.
 */
function reclassifyRunnerFailure<T>(
  result: OperationResult<T>,
  request: AccessVbaRequest,
): OperationResult<T> {
  if (result.ok) return result;
  const message = result.error.message;
  if (!isCallableFailureMessage(message)) return result;
  return failureResult(
    createDysflowError(
      "PROCEDURE_NOT_CALLABLE",
      `Procedure '${request.procedureName}' is present in the binary but Access COM cannot invoke it. ` +
        "The binary's compiled p-code is likely stale — recompile in Access VBE (Debug → Compile) and retry.",
      {
        retryable: true,
        details: {
          procedure: request.procedureName,
          moduleName: request.moduleName,
          runnerCode: result.error.code,
          runnerMessage: message,
        },
      },
    ),
  ) as OperationResult<T>;
}

const CALLABLE_FAILURE_PATTERNS: readonly RegExp[] = [
  /Excepci[oó]n al llamar a\s+["']Run["']/i,
  /Cannot run (?:the )?macro/i,
  /object that is closed or doesn't exist/i,
];

function isCallableFailureMessage(message: string): boolean {
  return CALLABLE_FAILURE_PATTERNS.some((pattern) => pattern.test(message));
}
