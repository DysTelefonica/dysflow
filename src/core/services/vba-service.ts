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
            ? `Procedure name is empty. Pass a procedure name, e.g. 'Foo', or the ` +
                `'<module>.<procedure>' form, e.g. 'Module.Foo'.`
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
    const preflight =
      preflightResolver === undefined
        ? UNVERIFIABLE
        : await this.checkProcedureExists(
            normalizedRequest,
            parsedName.procName,
            preflightResolver,
          );
    if (preflight.kind === "absent") return preflight.result;

    // #1787 — hand Access a name it can actually resolve.
    //
    // `Access.Application.Run` resolves its `ProcedureName` argument by
    // procedure name, optionally qualified by the project/database name of a
    // REFERENCED database (`referencedProject.procedure`). It does NOT accept
    // a MODULE qualifier. Forwarding `MyModule.RunMe` verbatim therefore
    // always failed with "can't find the procedure", which the reclassifier
    // below turned into `PROCEDURE_NOT_CALLABLE` plus a "recompile" hint that
    // could not possibly help — an unterminating loop for the caller.
    //
    // The prefix is dropped ONLY when the preflight proved the qualifier is a
    // module of THIS project and that module declares the procedure. When the
    // qualifier does not resolve locally (or nothing could be verified), the
    // name goes out verbatim, which is what the legitimate
    // `referencedProject.procedure` form needs.
    const invokedProcedureName =
      preflight.kind === "declared-in-named-module"
        ? parsedName.procName
        : normalizedRequest.procedureName;
    const runnerRequest: AccessVbaRequest =
      invokedProcedureName === normalizedRequest.procedureName
        ? normalizedRequest
        : { ...normalizedRequest, procedureName: invokedProcedureName };

    const result = await this.runner.run<AccessVbaExecutionResult>(
      { kind: "vba", request: runnerRequest },
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
    //
    // #1787 — the caller's ORIGINAL name stays in the envelope; the name that
    // actually went on the wire is reported alongside it so the remediation
    // can name the right suspect.
    //
    // A qualifier the preflight could not tie to a local module is the one
    // case where qualification is a live suspect. Hand the verdict over
    // rather than letting the reclassifier re-derive it from the string.
    const unverifiedQualifier =
      parsedName.moduleName.length > 0 && preflight.kind !== "declared-in-named-module"
        ? { qualifier: parsedName.moduleName, procName: parsedName.procName }
        : undefined;
    return reclassifyRunnerFailure(
      ensured,
      normalizedRequest,
      invokedProcedureName,
      unverifiedQualifier,
    );
  }

  /**
   * Verify the requested procedure is declared in the project's VBA source.
   *
   * #1787 — the outcome is a discriminated value rather than
   * `OperationResult | undefined`, because the caller now needs to know HOW
   * the procedure was found, not merely THAT it was:
   *
   *   - `absent` — verified missing; carries the typed `PROCEDURE_NOT_FOUND`.
   *   - `declared-in-named-module` — the request's `moduleName` resolved to a
   *     module of this project AND that module declares the procedure. This
   *     is the only outcome that licenses dropping the module qualifier
   *     before the name reaches `Access.Application.Run`.
   *   - `found-elsewhere` — the procedure exists somewhere in the source tree
   *     but not (verifiably) in the named module, so the qualifier may name a
   *     referenced database rather than a local module. Forward verbatim.
   *   - `unverifiable` — no resolver, or the resolver produced no source at
   *     all. Forward verbatim and let the runner surface the real failure.
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
  ): Promise<ProcedurePreflight> {
    if (resolver === undefined) return UNVERIFIABLE;
    if (typeof procName !== "string" || procName.length === 0) {
      return UNVERIFIABLE;
    }

    // #1787 — track whether the scan is the NAMED module's own source or the
    // whole-tree fallback. Only the former proves the qualifier is a local
    // module, which is what licenses dropping it before the COM call.
    let scannedNamedModule = false;
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
        scannedNamedModule = true;
      }
    } else {
      modulesToScan = await resolver.resolveAllModuleSources();
    }

    if (Object.keys(modulesToScan).length === 0) return UNVERIFIABLE;

    const target = procName.toLowerCase();
    let found = false;
    for (const source of Object.values(modulesToScan)) {
      const procedures = listVbaProcedures(source);
      if (procedures.some((p) => p.name.toLowerCase() === target)) {
        found = true;
        break;
      }
    }

    if (found) return scannedNamedModule ? DECLARED_IN_NAMED_MODULE : FOUND_ELSEWHERE;

    const moduleSuffix =
      typeof request.moduleName === "string" && request.moduleName.length > 0
        ? ` (scanned module: '${request.moduleName}')`
        : "";
    const message =
      `Procedure '${procName}' was not found in the project's VBA source modules` +
      `${moduleSuffix}. Verify the procedure name and module, or import the procedure into the binary before retrying.`;

    const absent = failureResult(
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
    return { kind: "absent", result: absent as OperationResult<AccessVbaResult> };
  }
}

/**
 * #1787 — outcome of the source-side procedure preflight. See
 * `AccessVbaService.checkProcedureExists` for what each variant means and
 * why the caller needs the distinction.
 */
type ProcedurePreflight =
  | { kind: "absent"; result: OperationResult<AccessVbaResult> }
  | { kind: "declared-in-named-module" }
  | { kind: "found-elsewhere" }
  | { kind: "unverifiable" };

const UNVERIFIABLE: ProcedurePreflight = { kind: "unverifiable" };
const DECLARED_IN_NAMED_MODULE: ProcedurePreflight = { kind: "declared-in-named-module" };
const FOUND_ELSEWHERE: ProcedurePreflight = { kind: "found-elsewhere" };

/**
 * #1174 / #1681 — reclassify a generic `RUNNER_FAILED` into the typed
 * envelope that names what actually went wrong on the Access side.
 *
 * Two outcomes are possible once the runner has handed Access the
 * procedure, and they need opposite remediations:
 *
 *   - `PROCEDURE_NOT_CALLABLE` — Access refused to invoke the procedure at
 *     all. Remediation: recompile and retry before further diagnosis.
 *   - `VBA_RUNTIME_ERROR` (#1681) — the procedure was invoked, it ran, and
 *     it raised. Remediation: fix the procedure or the state it depends on.
 *     Recompiling is useless here, and telling the caller to recompile sends
 *     them into a loop that cannot terminate.
 *
 * The discriminator is the INNER Access message, never the PowerShell
 * wrapper around it. #1174 matched the wrapper —
 * `Excepci[oó]n al llamar a "Run"` — which the VBA dispatch in
 * `scripts/dysflow-access-runner.ps1` produces for EVERY exception the
 * invoked procedure can throw, because it calls `$access.Run.Invoke(...)`
 * without a `try`/`catch` and lets the script's global catch stringify the
 * method-invocation exception. Matching it made every `Err.Raise` inside a
 * consumer's procedure look like stale p-code (#1681).
 *
 * Returns the original `OperationResult` unchanged when no pattern matches,
 * so genuine runner failures (`RUNNER_FAILED`, `VBA_MANAGER_TIMEOUT`,
 * `VBA_MANAGER_FAILED`, etc.) propagate verbatim.
 */
function reclassifyRunnerFailure<T>(
  result: OperationResult<T>,
  request: AccessVbaRequest,
  invokedProcedureName: string = request.procedureName,
  /**
   * #1787 — set when the caller supplied a `<qualifier>.<procedure>` name AND
   * the preflight could NOT prove the qualifier names a module of this
   * project, so the name was forwarded to COM verbatim. `undefined` means
   * either the prefix was stripped (qualification ruled out) or none was
   * supplied. Passing the preflight's verdict in is what keeps this function
   * from guessing the cause from the shape of a string.
   */
  unverifiedQualifier?: { qualifier: string; procName: string },
): OperationResult<T> {
  if (result.ok) return result;
  const message = result.error.message;
  const sharedDetails = {
    procedure: request.procedureName,
    moduleName: request.moduleName,
    invokedProcedureName,
    runnerCode: result.error.code,
    runnerMessage: message,
  };

  const classification = classifyVbaRunnerFailure(message);
  if (classification?.code === "PROCEDURE_NOT_CALLABLE") {
    // #1787 — WHO to blame is decided by the preflight outcome the service
    // already computed, never by looking for a `.` in the invoked name.
    //
    // An earlier cut of this branch sniffed `invokedProcedureName.includes(".")`
    // and adversarial review corroborated two defects in that heuristic:
    //
    //   - Misattribution. `found-elsewhere` and `unverifiable` forward the
    //     caller's name verbatim, so a legitimate `referencedDatabase.procedure`
    //     call was told to "retry unqualified" — advice that silently retargets
    //     the call from the referenced database to a same-named local
    //     procedure.
    //   - The retry loop this issue exists to kill. The suggested name was cut
    //     at the FIRST dot, so a multi-segment name produced another dotted
    //     name that re-entered this same branch on retry.
    //
    // So: when the prefix WAS stripped, qualification is ruled out by
    // construction and the stale-p-code remediation is correct regardless of
    // what the procedure name looks like. When a qualifier was supplied but
    // could NOT be verified, name both real possibilities and offer at most a
    // terminal retry name — one that has nothing left to strip.
    if (unverifiedQualifier === undefined) {
      return failureResult(
        createDysflowError(
          "PROCEDURE_NOT_CALLABLE",
          `Procedure '${request.procedureName}' is present in the binary but Access COM cannot invoke it. ` +
            "recompile in Access VBE (Debug → Compile) and retry.",
          { retryable: true, details: sharedDetails, remediation: classification.remediation },
        ),
      ) as OperationResult<T>;
    }

    const { qualifier, procName } = unverifiedQualifier;
    // Only offer a retry name when it is terminal. A name that still carries a
    // dot would come straight back here, which is the loop, not a remedy.
    const terminalRetry = procName.includes(".")
      ? ""
      : ` If '${qualifier}' was meant as a module, retry with procedureName '${procName}'.`;
    return failureResult(
      createDysflowError(
        "PROCEDURE_NOT_CALLABLE",
        `Procedure '${request.procedureName}' could not be invoked by Access COM, and the ` +
          `qualifier '${qualifier}' does not name a module of this project's source.${terminalRetry}` +
          " If the name is already correct, recompile in Access VBE (Debug → Compile) and retry.",
        {
          retryable: true,
          details: sharedDetails,
          remediation:
            `Access resolves 'Application.Run' by procedure name; the only qualifier it accepts ` +
            `is the project name of a referenced database. Check whether '${qualifier}' is a ` +
            `referenced database and that the reference resolves.${terminalRetry} ` +
            "If the name is already correct, recompile in Access VBE (Debug → Compile) and retry.",
        },
      ),
    ) as OperationResult<T>;
  }

  // The procedure was reached and raised. Hand the caller the VBA error the
  // procedure itself emitted — that text is the only actionable thing here.
  if (classification?.code !== "VBA_RUNTIME_ERROR") return result;

  return failureResult(
    createDysflowError(
      "VBA_RUNTIME_ERROR",
      `Procedure '${request.procedureName}' was invoked and raised an error in VBA: ${classification.vbaMessage}`,
      {
        retryable: false,
        details: { ...sharedDetails, vbaMessage: classification.vbaMessage },
      },
    ),
  ) as OperationResult<T>;
}

/**
 * Access's own "I cannot invoke this" messages, in both localizations the
 * runner has been observed to emit. These are inner messages: they appear
 * inside the PowerShell invocation wrapper, or on their own when the VBA
 * manager surfaces the COM error directly.
 */
const NOT_CALLABLE_PATTERNS: readonly RegExp[] = [
  /Cannot run (?:the )?macro/i,
  /No se puede ejecutar la macro/i,
  /object that is closed or doesn't exist/i,
  /se refiere a un objeto que est[áa] cerrado o que no existe/i,
  /can'?t find the procedure/i,
  /no encuentra el procedimiento/i,
];

export type VbaRunnerFailureClassification =
  | { code: "PROCEDURE_NOT_CALLABLE"; retryable: true; remediation: string }
  | { code: "VBA_RUNTIME_ERROR"; retryable: false; vbaMessage: string };

/**
 * Classifies runner-visible Access invocation failures for both `run_vba` and
 * `test_vba`. The callers retain their own outer result contracts; this seam
 * only centralizes the Access-message recognition and prevents phrase-table
 * drift between the two tools.
 */
export function classifyVbaRunnerFailure(
  message: string,
): VbaRunnerFailureClassification | undefined {
  if (NOT_CALLABLE_PATTERNS.some((pattern) => pattern.test(message))) {
    return {
      code: "PROCEDURE_NOT_CALLABLE",
      retryable: true,
      remediation: "Recompile in Access VBE (Debug → Compile) and retry.",
    };
  }
  const vbaMessage = extractInvocationInnerMessage(message);
  return vbaMessage === undefined
    ? undefined
    : { code: "VBA_RUNTIME_ERROR", retryable: false, vbaMessage };
}

/**
 * PowerShell wraps a throwing COM call as
 * `Excepci[oó]n al llamar a "Run" con "N" argumento(s): "<inner>"` (or the
 * English `Exception calling "Run" with "N" argument(s): "<inner>"`). Pull
 * out `<inner>` — the message VBA actually raised.
 *
 * Returns the untouched runner message when the wrapper is present but
 * carries no quoted inner text (truncated stderr), and `undefined` when the
 * failure is not an Access invocation at all, which leaves the caller's
 * original envelope alone.
 */
function extractInvocationInnerMessage(message: string): string | undefined {
  const wrapper = RUN_INVOCATION_WRAPPER.exec(message);
  if (wrapper === null) return undefined;

  const tail = message.slice(wrapper.index + wrapper[0].length);
  const open = tail.indexOf(': "');
  const close = tail.lastIndexOf('"');
  if (open === -1 || close <= open + 2) return message;

  const inner = tail.slice(open + 3, close).trim();
  return inner.length > 0 ? inner : message;
}

const RUN_INVOCATION_WRAPPER = /(?:Excepci[oó]n al llamar a|Exception calling)\s+["']Run["']/i;
