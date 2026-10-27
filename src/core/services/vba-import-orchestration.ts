import {
  ACCESS_DATABASE_LOCKED_REMEDIATION,
  VBA_IMPORT_SAVE_FAILED_REMEDIATION,
} from "../contracts/index.js";

export type VbaImportScope = "explicit" | "all";

export type VbaImportRawSuccess = {
  module: string;
  ok: true;
  durationMs: number;
  createdComponentName?: string;
  modifiedDocumentName?: string;
  /** #1912 — an existing standard/class module whose code was replaced; it needs a named save. */
  modifiedComponentName?: string;
  fallbackUsed?: boolean;
  fallbackReason?: string | null;
  verbose?: unknown;
};

export type VbaImportRawFailure = {
  module: string;
  ok: false;
  durationMs: number;
  phase: string;
  message: string;
  data?: unknown;
  databaseLocked?: boolean;
  machine?: string | null;
  user?: string | null;
  rollbackAttempted?: boolean;
  rollbackApplied?: boolean;
  rollbackError?: string | null;
  fallbackUsed?: boolean;
  fallbackReason?: string | null;
};

export type VbaImportRawAttempt = VbaImportRawSuccess | VbaImportRawFailure;

export type VbaImportModuleResult = {
  module: string;
  status: "ok" | "error";
  phase: string | null;
  error: null | {
    code: string;
    message: string;
    data: unknown;
    remediation: string;
    machine: string | null;
    user: string | null;
    rollbackAttempted: boolean;
    rollbackApplied: boolean;
    rollbackError: string | null;
    fallbackUsed: boolean;
    fallbackReason: string | null;
  };
  durationMs: number;
  rollbackApplied: boolean;
  fallbackUsed: boolean;
  fallbackReason: string | null;
  verbose?: unknown;
};

export type VbaImportOrchestrationState = {
  scope: VbaImportScope;
  targets: string[];
  pendingTargets: string[];
  pass: number;
  maxPasses: number;
  lastResults: Record<string, VbaImportModuleResult>;
  createdComponentNames: string[];
  modifiedDocumentNames: string[];
  modifiedComponentNames?: string[];
  /** #1912 — set when the save runs before completing a terminal partial failure. */
  completeAsFailure?: boolean;
};

export type VbaImportCompletion = {
  exitCode: 0 | 1;
  result:
    | VbaImportModuleResult[]
    | {
        ok: false;
        error: { code: "VBA_IMPORT_FAILED"; message: string };
        modules: VbaImportModuleResult[];
      };
  summary: {
    CreatedComponentNames: string[];
    ModifiedDocumentNames: string[];
    Total: number;
    HasErrors: boolean;
    ErrorMessage?: string;
  };
  saveWarning?: string;
};

export type VbaImportDecision =
  | {
      kind: "run-pass";
      state: VbaImportOrchestrationState;
      moduleNames: string[];
      rollbackOnMutationFailure: true;
    }
  | {
      kind: "save";
      state: VbaImportOrchestrationState;
      moduleNames: string[];
    }
  | {
      /** #1912 — undo the session mutations of these modules, then complete the failure. */
      kind: "rollback";
      state: VbaImportOrchestrationState;
      moduleNames: string[];
    }
  | ({ kind: "complete"; state: VbaImportOrchestrationState } & VbaImportCompletion);

export type VbaImportPassPort = {
  runPass(
    moduleNames: readonly string[],
    rollbackOnMutationFailure: boolean,
  ): Promise<{ attempts: readonly VbaImportRawAttempt[] }>;
  /** `error` reports a save failure that persisted nothing (the exclusive-access lock). */
  save(moduleNames: readonly string[]): Promise<{ warning?: string; error?: string }>;
  rollback?(
    moduleNames: readonly string[],
  ): Promise<{ outcomes: readonly VbaImportRollbackOutcome[] }>;
};

export type VbaImportRollbackOutcome = {
  module: string;
  applied: boolean;
  error?: string | null;
};

const ERROR_REMEDIATION: Readonly<Record<string, string>> = {
  VB_NAME_MISMATCH: "Make Attribute VB_Name match the target module name before retrying.",
  DUPLICATE_OPTION_DIRECTIVE: "Keep only one copy of each Option directive before retrying.",
  IMPORT_TRUNCATED: "Restore the complete module source and retry the import.",
  VBA_IMPORT_ROLLBACK_SNAPSHOT_FAILED:
    "Resolve the snapshot failure before retrying; the import was not started safely.",
  FORM_NAME_RESOLUTION_FAILED:
    "Rename the form/report source so its module name resolves to a non-empty Access object name before retrying.",
  FORM_VBNAME_PREFIX_MISMATCH:
    "Rename the source files to use the prefixed form name (Form_<base> or Report_<base>) or delete the legacy prefixed form from the binary before retrying.",
  FORM_SOURCE_MALFORMED:
    "Repair the malformed form/report source before retrying; the binary was not mutated.",
  ACCESS_DATABASE_LOCKED: ACCESS_DATABASE_LOCKED_REMEDIATION,
  VBA_IMPORT_SAVE_FAILED: VBA_IMPORT_SAVE_FAILED_REMEDIATION,
  VBA_IMPORT_PHASE_FAILED:
    "The Access parser rejected the module source. See references/error-codes.md#vba_import_phase_failed for diagnostic decoding.",
};

const TYPED_PREFIXES = [
  "VB_NAME_MISMATCH",
  "FORM_SOURCE_MALFORMED",
  "DUPLICATE_OPTION_DIRECTIVE",
  "IMPORT_TRUNCATED",
  "VBA_IMPORT_ROLLBACK_SNAPSHOT_FAILED",
  "FORM_NAME_RESOLUTION_FAILED",
  "FORM_VBNAME_PREFIX_MISMATCH",
] as const;

export function startVbaImportOrchestration(
  targets: readonly string[],
  scope: VbaImportScope = "explicit",
): VbaImportDecision {
  const normalizedTargets = targets.map(String);
  const state: VbaImportOrchestrationState = {
    scope,
    targets: normalizedTargets,
    pendingTargets: normalizedTargets,
    pass: 0,
    maxPasses: normalizedTargets.length > 1 ? Math.max(2, normalizedTargets.length) : 1,
    lastResults: {},
    createdComponentNames: [],
    modifiedDocumentNames: [],
  };
  return normalizedTargets.length === 0 ? completeSuccess(state) : runPass(state);
}

export function advanceVbaImportAfterPass(
  state: VbaImportOrchestrationState,
  attempts: readonly VbaImportRawAttempt[],
): VbaImportDecision {
  assertPassMatchesPendingTargets(state.pendingTargets, attempts);
  const next = cloneState(state);
  next.pass += 1;
  const failed: string[] = [];
  let progress = false;

  for (const attempt of attempts) {
    next.lastResults[attempt.module] = mapAttempt(attempt);
    if (attempt.ok) {
      progress = true;
      addUnique(next.createdComponentNames, attempt.createdComponentName);
      addUnique(next.modifiedDocumentNames, attempt.modifiedDocumentName);
      next.modifiedComponentNames = next.modifiedComponentNames ?? [];
      addUnique(next.modifiedComponentNames, attempt.modifiedComponentName);
    } else {
      failed.push(attempt.module);
    }
  }

  // #1912 — without exclusive access Access cannot save any module of the
  // session, so a lock on one module means no module of the batch persists.
  const lockFailure = attempts
    .map((attempt) => next.lastResults[attempt.module])
    .find((result) => result?.error?.code === "ACCESS_DATABASE_LOCKED");
  if (lockFailure !== undefined) return failBatchOnLock(next, lockFailure);

  next.pendingTargets = failed;
  if (next.targets.length > 1 && failed.length > 0 && progress && next.pass < next.maxPasses) {
    return runPass(next);
  }

  // #1912 — a module is `ok` only once its save succeeded. A terminal partial
  // failure therefore saves its successful modules before completing; the
  // Access close would otherwise persist them unreported, or drop them.
  const saveNames = unique([
    ...next.createdComponentNames,
    ...(next.modifiedComponentNames ?? []),
    ...next.modifiedDocumentNames,
  ]);
  if (failed.length > 0) {
    if (saveNames.length === 0) return completeFailure(next);
    next.completeAsFailure = true;
  }
  return saveNames.length > 0
    ? { kind: "save", state: next, moduleNames: saveNames }
    : completeSuccess(next);
}

export function advanceVbaImportAfterSave(
  state: VbaImportOrchestrationState,
  warning?: string,
  error?: string,
): VbaImportDecision {
  const next = cloneState(state);
  if (error !== undefined && error.length > 0) {
    return failBatchOnLock(next, {
      module: "save",
      error: { message: error, machine: null, user: null },
    });
  }
  if (next.completeAsFailure !== true) return completeSuccess(next, warning);
  if (warning !== undefined && warning.length > 0) {
    for (const moduleName of next.targets) {
      if (next.lastResults[moduleName]?.status === "ok") {
        next.lastResults[moduleName] = notSavedResult(moduleName, warning);
      }
    }
  }
  return completeFailure(next);
}

/** #1912 — record the outcome of a lock rollback, then complete the failure. */
export function advanceVbaImportAfterRollback(
  state: VbaImportOrchestrationState,
  outcomes: readonly VbaImportRollbackOutcome[],
): VbaImportDecision {
  const next = cloneState(state);
  for (const outcome of outcomes) {
    const result = next.lastResults[outcome.module];
    if (result?.error === null || result?.error === undefined) continue;
    next.lastResults[outcome.module] = {
      ...result,
      rollbackApplied: outcome.applied,
      error: {
        ...result.error,
        rollbackAttempted: true,
        rollbackApplied: outcome.applied,
        rollbackError: outcome.error ?? null,
      },
    };
  }
  return completeFailure(next);
}

export async function orchestrateVbaImport(
  targets: readonly string[],
  port: VbaImportPassPort,
  scope: VbaImportScope = "explicit",
): Promise<VbaImportCompletion> {
  let decision = startVbaImportOrchestration(targets, scope);
  while (decision.kind !== "complete") {
    if (decision.kind === "run-pass") {
      const pass = await port.runPass(decision.moduleNames, decision.rollbackOnMutationFailure);
      decision = advanceVbaImportAfterPass(decision.state, pass.attempts);
    } else if (decision.kind === "save") {
      const save = await port.save(decision.moduleNames);
      decision = advanceVbaImportAfterSave(decision.state, save.warning, save.error);
    } else {
      const rollback =
        port.rollback === undefined
          ? {
              outcomes: decision.moduleNames.map((module) => ({
                module,
                applied: false,
                error: "The import port offers no rollback.",
              })),
            }
          : await port.rollback(decision.moduleNames);
      decision = advanceVbaImportAfterRollback(decision.state, rollback.outcomes);
    }
  }
  return decision;
}

function runPass(state: VbaImportOrchestrationState): VbaImportDecision {
  return {
    kind: "run-pass",
    state,
    moduleNames: [...state.pendingTargets],
    rollbackOnMutationFailure: true,
  };
}

function completeSuccess(
  state: VbaImportOrchestrationState,
  saveWarning?: string,
): VbaImportDecision {
  const result = orderedResults(state);
  return {
    kind: "complete",
    state,
    exitCode: 0,
    result,
    summary: {
      CreatedComponentNames: [...state.createdComponentNames],
      ModifiedDocumentNames: [...state.modifiedDocumentNames],
      Total: state.targets.length,
      HasErrors: false,
    },
    ...(saveWarning === undefined ? {} : { saveWarning }),
  };
}

function completeFailure(state: VbaImportOrchestrationState): VbaImportDecision {
  const modules = orderedResults(state);
  const details = state.pendingTargets
    .map((moduleName) => {
      const result = state.lastResults[moduleName];
      return result?.error === null || result?.error === undefined
        ? moduleName
        : `${moduleName}: ${result.error.message}`;
    })
    .join("; ");
  const scopeLabel =
    state.scope === "all" ? "Import-all" : state.targets.length === 0 ? "Import-plan" : "Import";
  const errorMessage = `${scopeLabel} no pudo completar algunos modulos tras ${state.pass} pasada(s): ${details}`;
  return {
    kind: "complete",
    state,
    exitCode: 1,
    result: {
      ok: false,
      error: { code: "VBA_IMPORT_FAILED", message: errorMessage },
      modules,
    },
    summary: {
      CreatedComponentNames: [],
      ModifiedDocumentNames: [...state.modifiedDocumentNames],
      Total: state.targets.length,
      HasErrors: true,
      ErrorMessage: errorMessage,
    },
  };
}

function mapAttempt(attempt: VbaImportRawAttempt): VbaImportModuleResult {
  const fallbackUsed = attempt.fallbackUsed === true;
  const fallbackReason = attempt.fallbackReason ?? null;
  if (attempt.ok) {
    const result: VbaImportModuleResult = {
      module: attempt.module,
      status: "ok",
      phase: null,
      error: null,
      durationMs: attempt.durationMs,
      rollbackApplied: false,
      fallbackUsed,
      fallbackReason,
    };
    if (attempt.verbose !== undefined && attempt.verbose !== null) result.verbose = attempt.verbose;
    return result;
  }

  const code = classifyError(attempt);
  const rollbackApplied = attempt.rollbackApplied === true;
  return {
    module: attempt.module,
    status: "error",
    phase: attempt.phase,
    error: {
      code,
      message: attempt.message,
      data: attempt.data ?? null,
      remediation: ERROR_REMEDIATION[code] ?? ERROR_REMEDIATION.VBA_IMPORT_PHASE_FAILED ?? "",
      machine: attempt.machine ?? null,
      user: attempt.user ?? null,
      rollbackAttempted: attempt.rollbackAttempted === true,
      rollbackApplied,
      rollbackError: attempt.rollbackError ?? null,
      fallbackUsed,
      fallbackReason,
    },
    durationMs: attempt.durationMs,
    rollbackApplied,
    fallbackUsed,
    fallbackReason,
  };
}

type LockEvidence = {
  module: string;
  error: { message: string; machine: string | null; user: string | null } | null;
};

/**
 * #1912 — without exclusive access Access cannot save any module of the
 * session: every module of the batch fails, and the ones already imported are
 * rolled back before the failure completes.
 */
function failBatchOnLock(
  state: VbaImportOrchestrationState,
  lock: LockEvidence,
): VbaImportDecision {
  const imported = state.targets.filter(
    (moduleName) => state.lastResults[moduleName]?.status === "ok",
  );
  for (const moduleName of state.targets) {
    if (state.lastResults[moduleName]?.status !== "error") {
      state.lastResults[moduleName] = lockedBatchResult(moduleName, lock);
    }
  }
  state.pendingTargets = [...state.targets];
  state.completeAsFailure = true;
  return imported.length > 0
    ? { kind: "rollback", state, moduleNames: imported }
    : completeFailure(state);
}

function lockedBatchResult(moduleName: string, lock: LockEvidence): VbaImportModuleResult {
  const source =
    lock.module === "save" ? "the save of this batch" : `module '${lock.module}' of the same batch`;
  return failedResult(
    moduleName,
    "ACCESS_DATABASE_LOCKED",
    `Not saved: ${source} reported that Access has no exclusive access to the database (${lock.error?.message ?? "lock"}).`,
    ACCESS_DATABASE_LOCKED_REMEDIATION,
    lock.error?.machine ?? null,
    lock.error?.user ?? null,
  );
}

function notSavedResult(moduleName: string, warning: string): VbaImportModuleResult {
  return failedResult(
    moduleName,
    "VBA_IMPORT_SAVE_FAILED",
    `Imported but not saved; the batch also had failures and the save did not complete: ${warning}`,
    ERROR_REMEDIATION.VBA_IMPORT_SAVE_FAILED ?? "",
    null,
    null,
  );
}

function failedResult(
  moduleName: string,
  code: string,
  message: string,
  remediation: string,
  machine: string | null,
  user: string | null,
): VbaImportModuleResult {
  return {
    module: moduleName,
    status: "error",
    phase: "save",
    error: {
      code,
      message,
      data: null,
      remediation,
      machine,
      user,
      rollbackAttempted: false,
      rollbackApplied: false,
      rollbackError: null,
      fallbackUsed: false,
      fallbackReason: null,
    },
    durationMs: 0,
    rollbackApplied: false,
    fallbackUsed: false,
    fallbackReason: null,
  };
}

function classifyError(attempt: VbaImportRawFailure): string {
  for (const prefix of TYPED_PREFIXES) {
    if (attempt.message.startsWith(`${prefix}:`)) return prefix;
  }
  return attempt.databaseLocked === true || isExclusiveAccessLossMessage(attempt.message)
    ? "ACCESS_DATABASE_LOCKED"
    : "VBA_IMPORT_PHASE_FAILED";
}

/**
 * #1912 — Access reports a missing exclusive access in the host UI language
 * ("You do not have exclusive access to the database..." /
 * "No tiene acceso exclusivo a la base de datos..."). It is a lock condition,
 * never a parser rejection, whether or not the runner tagged the attempt.
 */
function isExclusiveAccessLossMessage(message: string): boolean {
  return /You do not have exclusive access to the database|No tiene acceso exclusivo a la base de datos/i.test(
    message,
  );
}

function orderedResults(state: VbaImportOrchestrationState): VbaImportModuleResult[] {
  return state.targets.map(
    (moduleName) =>
      state.lastResults[moduleName] ?? {
        module: moduleName,
        status: "ok",
        phase: null,
        error: null,
        durationMs: 0,
        rollbackApplied: false,
        fallbackUsed: false,
        fallbackReason: null,
      },
  );
}

function assertPassMatchesPendingTargets(
  pendingTargets: readonly string[],
  attempts: readonly VbaImportRawAttempt[],
): void {
  if (
    attempts.length !== pendingTargets.length ||
    attempts.some((attempt, index) => attempt.module !== pendingTargets[index])
  ) {
    throw new Error(
      `Import primitive pass did not preserve the requested module order: expected ${JSON.stringify(pendingTargets)}, received ${JSON.stringify(attempts.map((attempt) => attempt.module))}.`,
    );
  }
}

function cloneState(state: VbaImportOrchestrationState): VbaImportOrchestrationState {
  return {
    ...state,
    targets: [...state.targets],
    pendingTargets: [...state.pendingTargets],
    lastResults: { ...state.lastResults },
    createdComponentNames: [...state.createdComponentNames],
    modifiedDocumentNames: [...state.modifiedDocumentNames],
    modifiedComponentNames: [...(state.modifiedComponentNames ?? [])],
  };
}

function addUnique(target: string[], value: string | undefined): void {
  if (value !== undefined && value.length > 0 && !target.includes(value)) target.push(value);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
