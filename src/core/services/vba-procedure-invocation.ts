import { createDysflowError, type DysflowError } from "../contracts/index.js";
import { parseProcedureName } from "./vba-procedure-name-parser.js";
import { listVbaProcedures } from "./vba-procedure-service.js";

/**
 * #1045 — VBA source-resolution port (see `vba-service.ts` for its history).
 * Both methods MAY return `undefined` / `{}` when no source is available;
 * the preflight treats that as "cannot verify" and forwards the name verbatim.
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
 * Outcome of the source-side procedure preflight shared by `run_vba`
 * (`AccessVbaService`) and `test_vba` (`VbaExecutionAdapter`).
 *
 *   - `absent` — verified missing; carries the typed `PROCEDURE_NOT_FOUND`.
 *   - `declared-in-named-module` — the request's module resolved to a module
 *     of this project AND that module declares the procedure. This is the only
 *     outcome that licenses dropping the module qualifier before the name
 *     reaches `Access.Application.Run` (#1787).
 *   - `found-elsewhere` — the procedure exists somewhere in the source tree
 *     but not (verifiably) in the named module, so a qualifier may name a
 *     referenced database rather than a local module. Forward verbatim.
 *   - `unverifiable` — no resolver, or the resolver produced no source at all.
 *     Forward verbatim and let the runner surface the real failure.
 *
 * `declaringModules` lists the source modules whose declarations matched;
 * it is what lets the not-callable diagnosis spot a module that shares the
 * procedure's name (#1823).
 */
export type ProcedurePreflight =
  | { kind: "absent"; error: DysflowError }
  | { kind: "declared-in-named-module"; declaringModules: readonly string[] }
  | { kind: "found-elsewhere"; declaringModules: readonly string[] }
  | { kind: "unverifiable" };

const UNVERIFIABLE: ProcedurePreflight = { kind: "unverifiable" };

/**
 * The name dysflow will hand `Access.Application.Run`, plus the evidence the
 * not-callable diagnosis needs if Access still refuses it.
 */
export type ProcedureInvocation = {
  /** The caller's name, verbatim. Echoed in envelopes, plans and allowlists. */
  requestedProcedureName: string;
  /** The name that goes on the wire to `Application.Run`. */
  invokedProcedureName: string;
  preflight: ProcedurePreflight;
  /**
   * Set when the caller supplied `<qualifier>.<procedure>` AND the preflight
   * could NOT prove the qualifier names a module of this project, so the name
   * was forwarded verbatim. The one case where qualification is a suspect.
   */
  unverifiedQualifier?: { qualifier: string; procName: string };
  /**
   * #1823 — a source module that declares the procedure and carries the SAME
   * name as it. `Application.Run` cannot resolve such a procedure (Access
   * finds the module, not the procedure), and recompiling does not change that.
   */
  moduleNameCollision?: string;
};

/**
 * Verify the requested procedure is declared in the project's VBA source.
 *
 * #1174 — the lookup uses the parsed `procName` (no module prefix) so
 * `<module>.<procedure>` requests compare against the declarations
 * `listVbaProcedures` actually returns.
 *
 * #1787 — the scan records whether it read the NAMED module's own source or
 * the whole-tree fallback. Only the former proves the qualifier is a local
 * module, which is what licenses dropping it before the COM call.
 */
export async function preflightProcedure(
  request: { procedureName: string; moduleName?: string },
  procName: string,
  resolver: VbaSourceResolver | undefined,
): Promise<ProcedurePreflight> {
  if (resolver === undefined) return UNVERIFIABLE;
  if (typeof procName !== "string" || procName.length === 0) return UNVERIFIABLE;

  const namedModule =
    typeof request.moduleName === "string" && request.moduleName.length > 0
      ? request.moduleName
      : undefined;
  let scannedNamedModule = false;
  let modulesToScan: Record<string, string>;
  if (namedModule !== undefined) {
    const source = await resolver.resolveModuleSource(namedModule);
    if (source === undefined) {
      // Cannot resolve just this module. Fall back to the full tree so an
      // unrelated typo in the module name does not false-positive
      // `PROCEDURE_NOT_FOUND` when the procedure exists in a sibling module.
      modulesToScan = await resolver.resolveAllModuleSources();
    } else {
      modulesToScan = { [namedModule]: source };
      scannedNamedModule = true;
    }
  } else {
    modulesToScan = await resolver.resolveAllModuleSources();
  }

  if (Object.keys(modulesToScan).length === 0) return UNVERIFIABLE;

  const target = procName.toLowerCase();
  const declaringModules = Object.entries(modulesToScan)
    .filter(([, source]) => listVbaProcedures(source).some((p) => p.name.toLowerCase() === target))
    .map(([moduleName]) => moduleName);

  if (declaringModules.length > 0) {
    return scannedNamedModule
      ? { kind: "declared-in-named-module", declaringModules }
      : { kind: "found-elsewhere", declaringModules };
  }

  const moduleSuffix = namedModule !== undefined ? ` (scanned module: '${namedModule}')` : "";
  const message =
    `Procedure '${procName}' was not found in the project's VBA source modules` +
    `${moduleSuffix}. Verify the procedure name and module, or import the procedure into the binary before retrying.`;
  return {
    kind: "absent",
    error: createDysflowError("PROCEDURE_NOT_FOUND", message, {
      details: {
        procedure: procName,
        fullProcedureName: request.procedureName,
        ...(namedModule !== undefined ? { moduleName: namedModule } : {}),
        scannedModules: Object.keys(modulesToScan).length,
      },
    }),
  };
}

/**
 * Decide the name `Access.Application.Run` receives for one procedure.
 *
 * `Application.Run` resolves its `ProcedureName` by procedure name, optionally
 * qualified by the project name of a REFERENCED database. It does NOT accept a
 * MODULE qualifier (#1787). The prefix is dropped ONLY when the preflight
 * proved the qualifier is a module of THIS project that declares the
 * procedure; any other qualifier is forwarded verbatim, which is what the
 * legitimate `referencedProject.procedure` form needs.
 *
 * `qualifier`/`procName` are the parsed parts of `procedureName`
 * (`parseProcedureName`); `moduleName` is the module to scan, which for an
 * unqualified name may be a caller-supplied module or empty.
 */
export async function resolveProcedureInvocation(args: {
  procedureName: string;
  qualifier: string;
  procName: string;
  moduleName?: string;
  resolver: VbaSourceResolver | undefined;
}): Promise<ProcedureInvocation> {
  const { procedureName, qualifier, procName, resolver } = args;
  const preflight = await preflightProcedure(
    { procedureName, moduleName: args.moduleName },
    procName,
    resolver,
  );
  const invokedProcedureName =
    preflight.kind === "declared-in-named-module" ? procName : procedureName;
  const unverifiedQualifier =
    qualifier.length > 0 && preflight.kind !== "declared-in-named-module"
      ? { qualifier, procName }
      : undefined;
  const moduleNameCollision =
    preflight.kind === "declared-in-named-module" || preflight.kind === "found-elsewhere"
      ? preflight.declaringModules.find(
          (moduleName) => moduleName.toLowerCase() === procName.toLowerCase(),
        )
      : undefined;
  return {
    requestedProcedureName: procedureName,
    invokedProcedureName,
    preflight,
    ...(unverifiedQualifier === undefined ? {} : { unverifiedQualifier }),
    ...(moduleNameCollision === undefined ? {} : { moduleNameCollision }),
  };
}

/**
 * Resolve the invocation for a bare manifest/plan name (the `test_vba` shape).
 * A name the parser rejects is forwarded verbatim with an unverifiable
 * preflight, so the runner's own diagnostics still fire.
 */
export async function resolvePlanProcedureInvocation(
  procedureName: string,
  resolver: VbaSourceResolver | undefined,
): Promise<ProcedureInvocation> {
  const parsed = parseProcedureName(procedureName);
  if (!parsed.ok) {
    return {
      requestedProcedureName: procedureName,
      invokedProcedureName: procedureName,
      preflight: UNVERIFIABLE,
    };
  }
  const invocation = await resolveProcedureInvocation({
    procedureName,
    qualifier: parsed.moduleName,
    procName: parsed.procName,
    moduleName: parsed.moduleName,
    resolver,
  });
  // An absent procedure is not test_vba's to refuse; forward it verbatim.
  return invocation.preflight.kind === "absent"
    ? { ...invocation, invokedProcedureName: procedureName }
    : invocation;
}

/** The message/remediation pair for a `PROCEDURE_NOT_CALLABLE` envelope. */
export type NotCallableDiagnosis = {
  message: string;
  remediation: string;
  retryable: boolean;
};

const STALE_PCODE_REMEDIATION = "Recompile in Access VBE (Debug → Compile) and retry.";

/**
 * Explain why Access refused to invoke a procedure, from the preflight's own
 * verdict — never from the shape of the name.
 *
 *   - Module/procedure name collision (#1823): recompiling cannot help, so the
 *     remediation asks for a rename and the failure is not retryable as-is.
 *   - Unverified qualifier (#1787): name the qualifier as the first suspect and
 *     offer at most a TERMINAL retry name, one with nothing left to strip.
 *   - Otherwise the stale-p-code remediation stands.
 */
export function diagnoseNotCallable(
  requestedProcedureName: string,
  invocation: Pick<ProcedureInvocation, "unverifiedQualifier" | "moduleNameCollision">,
): NotCallableDiagnosis {
  const collision = invocation.moduleNameCollision;
  if (collision !== undefined) {
    const remediation =
      `Procedure '${requestedProcedureName}' is declared in a module that is also named ` +
      `'${collision}'. Access.Application.Run resolves that name to the module, not the ` +
      "procedure, and recompiling does not change that. Rename the module or the " +
      "procedure so the two names differ, re-import, and retry.";
    return {
      message: `Procedure '${requestedProcedureName}' could not be invoked by Access COM. ${remediation}`,
      remediation,
      retryable: false,
    };
  }

  const unverified = invocation.unverifiedQualifier;
  if (unverified === undefined) {
    return {
      message:
        `Procedure '${requestedProcedureName}' is present in the binary but Access COM cannot invoke it. ` +
        "recompile in Access VBE (Debug → Compile) and retry.",
      remediation: STALE_PCODE_REMEDIATION,
      retryable: true,
    };
  }

  const { qualifier, procName } = unverified;
  // Only offer a retry name when it is terminal. A name that still carries a
  // dot would come straight back here, which is the loop, not a remedy.
  const terminalRetry = procName.includes(".")
    ? ""
    : ` If '${qualifier}' was meant as a module, retry with procedureName '${procName}'.`;
  return {
    message:
      `Procedure '${requestedProcedureName}' could not be invoked by Access COM, and the ` +
      `qualifier '${qualifier}' does not name a module of this project's source.${terminalRetry}` +
      " If the name is already correct, recompile in Access VBE (Debug → Compile) and retry.",
    remediation:
      `Access resolves 'Application.Run' by procedure name; the only qualifier it accepts ` +
      `is the project name of a referenced database. Check whether '${qualifier}' is a ` +
      `referenced database and that the reference resolves.${terminalRetry} ` +
      "If the name is already correct, recompile in Access VBE (Debug → Compile) and retry.",
    retryable: true,
  };
}
