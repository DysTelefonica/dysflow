import type { DysflowConfig } from "../config/dysflow-config.js";
import type { AccessVbaRequest, OperationResult } from "../contracts/index.js";
import { createDysflowError, failureResult, successResult } from "../contracts/index.js";
import {
  type AccessRunner,
  type AccessRunnerProgressCallback,
  ensureResultShape,
} from "../runner/access-runner.js";
import { isRecord } from "../utils/index.js";
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
};

export class AccessVbaService {
  private readonly runner: AccessRunner;
  private readonly config: DysflowConfig;
  private readonly sourceResolver: VbaSourceResolver | undefined;

  constructor(options: AccessVbaServiceOptions) {
    this.runner = options.runner;
    this.config = options.config;
    this.sourceResolver = options.sourceResolver;
  }

  async execute(
    request: AccessVbaRequest,
    onProgress?: AccessRunnerProgressCallback,
  ): Promise<OperationResult<AccessVbaResult>> {
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
    if (request.dryRun === true) {
      return successResult<AccessVbaPlan>({
        dryRun: true,
        willExecute: false,
        willModifyAccess: false,
        procedureName: request.procedureName,
        moduleName: request.moduleName,
      });
    }

    // #1045 — preflight: when the caller asks for a procedure that is
    // verifiably absent from the project's VBA source tree, return the
    // typed `PROCEDURE_NOT_FOUND` envelope instead of letting the runner
    // open Access, hit a Spanish-localized COM exception, and flatten the
    // cause into a generic `RUNNER_FAILED`.
    //
    // "Verifiably absent" requires at least one resolved source file.
    // When the resolver returns `undefined` / `{}` (e.g. no `destinationRoot`
    // configured, or a non-source-tracked `procedureName`), the service
    // falls through to the runner so the existing diagnostics still fire —
    // this is non-regressive behavior.
    if (this.sourceResolver !== undefined) {
      const preflight = await this.checkProcedureExists(request);
      if (preflight !== undefined) return preflight;
    }

    const result = await this.runner.run<AccessVbaExecutionResult>(
      { kind: "vba", request },
      this.config,
      {
        onProgress,
      },
    );
    return ensureResultShape(result, isRecord);
  }

  /**
   * Verify the requested procedure is declared in the project's VBA source.
   * Returns a failure `OperationResult` when verified absent, `undefined`
   * when the procedure is present OR when the resolver could not produce
   * any source text to verify against (defensive — the runner will surface
   * the real Access-side failure in that case).
   */
  private async checkProcedureExists(
    request: AccessVbaRequest,
  ): Promise<OperationResult<AccessVbaResult> | undefined> {
    const resolver = this.sourceResolver;
    if (resolver === undefined) return undefined;
    if (typeof request.procedureName !== "string" || request.procedureName.length === 0) {
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

    const target = request.procedureName.toLowerCase();
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
      `Procedure '${request.procedureName}' was not found in the project's VBA source modules` +
      `${moduleSuffix}. Verify the procedure name and module, or import the procedure into the binary before retrying.`;

    return failureResult(
      createDysflowError("PROCEDURE_NOT_FOUND", message, {
        details: {
          procedure: request.procedureName,
          ...(typeof request.moduleName === "string" && request.moduleName.length > 0
            ? { moduleName: request.moduleName }
            : {}),
          scannedModules: Object.keys(modulesToScan).length,
        },
      }),
    );
  }
}
