import {
  createDysflowError,
  type DysflowError,
  failureResult,
  type OperationResult,
  successResult,
} from "../../core/contracts/index.js";
import type { FormFileSystemPort } from "../../core/services/vba-form-service.js";
import { isRecord, stringValue } from "../../core/utils/index.js";
import { importOutputReportsModuleFailure } from "./import-output-inspection.js";
import {
  type ExpectedProperty,
  type MissingProperty,
  verifyControlProperties,
} from "./control-property-verifier.js";
import { captureRollbackOutcome } from "./vba-forms-rollback.js";
import { FORMS_MAPPINGS } from "./vba-forms-tool-mappings.js";
import type { ManagedFormSource, VbaFormsOrchestrator } from "./vba-forms-types.js";

/**
 * Internal seam (PR 4 / #813) for the form-mutation family.
 *
 * Centralizes the **single accumulated write + single guarded import + single
 * rollback-on-failure** orchestration that previously lived duplicated in
 * `mutateForm` (slice 4), `deserializeForm` (slice 3), and `cloneFormFromTemplate`
 * (slice 5). Path resolution, dry-run routing, identity guards, and the new
 * multi-op plan path are NOT this seam's responsibility — they live with their
 * callers and in PR 5 / 6.
 *
 * Contract (pinned by `test/adapters/vba-sync/vba-forms-guarded-write.test.ts`):
 *
 *   1. Writes `newSource` to `source.sourcePath` exactly once.
 *   2. Invokes `import_modules` exactly once with the merged params
 *      `{ ...forwardedParams, sourcePath, destinationRoot, moduleNames,
 *      importMode: "Auto", apply: true, dryRun: false }` and the
 *      `import_modules_gate` mapping.
 *   3. On import success → `successResult({ importResult })`. A gate result
 *      that is `ok:true` but whose payload carries per-module errors (#951)
 *      is NOT a success: it is treated as a gate failure exactly like an
 *      `ok:false` result.
 *   4. On ANY gate failure — an `ok:false` gate result OR an `ok:true` result
 *      whose payload reports per-module errors — the source mutation is
 *      reverted: best-effort restore of `originalSource`, captures
 *      `RollbackOutcome` (targetExisted-aware, #692), and returns
 *      `failureResult(FORM_IMPORT_GATE_FAILED, { details: { cause, rollback,
 *      rollbackApplied } })`.
 *   5. On pre-import write failure → `failureResult(FORM_WRITE_FAILED)` and
 *      import_modules is NEVER invoked.
 *   6. The rollback path is a `writeFile` only — it MUST NOT re-invoke
 *      `import_modules` (otherwise an import failure could trigger a recursive
 *      import loop on restore).
 *
 * Boundary invariant: the seam does not call any path-resolution helper and
 * does not import MCP-layer adapters. The caller is responsible for handing
 * in a fully-resolved `ManagedFormSource` (via `resolveManagedMutationSource`,
 * #718) and pre-validated forwarded params.
 */
export type ApplyGuardedFormWriteInput = {
  orchestrator: VbaFormsOrchestrator;
  fileSystem: FormFileSystemPort;
  source: ManagedFormSource;
  newSource: string;
  originalSource: string;
  /** Exact pre-call bytes when the filesystem adapter supports binary snapshots. */
  originalSourceBytes?: Uint8Array;
  /** #692 — drives `RollbackOutcome.restoredState` / `requiresManualCleanup`. */
  targetExisted: boolean;
  /** Caller-supplied params; merged under the seam's hardcoded fields. */
  forwardedParams: Record<string, unknown>;
  /** New scalar properties that must be present after the import gate. */
  pendingNewProperties?: ExpectedProperty[];
};

export type ApplyGuardedFormWriteSuccess = {
  importResult: unknown;
};

/**
 * issue #951 — derive a typed cause from a gate payload that reported
 * per-module failures inside an `ok:true` gate result. The failure envelope
 * `{ok:false, error:{code,message}}` keeps its own code/message; a bare
 * per-module array (or unwrapped record) is summarized by naming the failed
 * modules.
 */
function deriveNestedGateCause(payload: unknown): DysflowError {
  if (isRecord(payload) && isRecord(payload.error)) {
    return createDysflowError(
      stringValue(payload.error.code) ?? "VBA_IMPORT_FAILED",
      stringValue(payload.error.message) ??
        "The import gate reported per-module failures in its structured result.",
    );
  }
  const entries = Array.isArray(payload) ? payload : [payload];
  const failedModules = entries
    .filter((entry): entry is Record<string, unknown> => isRecord(entry) && entry.status !== "ok")
    .map((entry) => stringValue(entry.module) ?? "<unknown module>");
  return createDysflowError(
    "VBA_IMPORT_FAILED",
    `import_modules reported per-module failures for: ${failedModules.join(", ")}.`,
  );
}

export async function applyGuardedFormWrite(
  input: ApplyGuardedFormWriteInput,
): Promise<OperationResult<ApplyGuardedFormWriteSuccess>> {
  const {
    orchestrator,
    fileSystem,
    source,
    newSource,
    originalSource,
    originalSourceBytes,
    targetExisted,
    forwardedParams,
    pendingNewProperties,
  } = input;

  // Shared gate-failure path (#951): best-effort restore of the pre-apply
  // source, then a single FORM_IMPORT_GATE_FAILED envelope with the rollback
  // outcome surfaced to the consumer (#692). `rollbackApplied` mirrors
  // `rollback.applied` as a top-level convenience boolean.
  const failGateWithRollback = async (
    cause: DysflowError,
  ): Promise<OperationResult<ApplyGuardedFormWriteSuccess>> => {
    const rollbackOutcome = await captureRollbackOutcome(
      () =>
        originalSourceBytes !== undefined && fileSystem.writeBytes !== undefined
          ? fileSystem.writeBytes(source.sourcePath, originalSourceBytes)
          : fileSystem.writeFile(source.sourcePath, originalSource, "utf8"),
      targetExisted,
    );
    return failureResult(
      createDysflowError(
        "FORM_IMPORT_GATE_FAILED",
        `import_modules apply gate failed for "${source.sourcePath}": ${cause.message}`,
        {
          details: {
            cause,
            rollback: rollbackOutcome,
            rollbackApplied: rollbackOutcome.applied,
          },
          remediation:
            "Inspect details.cause and details.rollback, then follow references/error-codes.md#form_import_gate_failed before retrying.",
        },
      ),
    );
  };

  const failPropertyVerification = async (
    missing: readonly MissingProperty[],
    cause?: unknown,
  ): Promise<OperationResult<ApplyGuardedFormWriteSuccess>> => {
    const rollbackOutcome = await captureRollbackOutcome(
      () =>
        originalSourceBytes !== undefined && fileSystem.writeBytes !== undefined
          ? fileSystem.writeBytes(source.sourcePath, originalSourceBytes)
          : fileSystem.writeFile(source.sourcePath, originalSource, "utf8"),
      targetExisted,
    );
    const details = {
      missing: missing.map((entry) => ({
        control: entry.controlName,
        property: entry.propertyName,
        ...(entry.expectedValue === undefined ? {} : { expectedValue: entry.expectedValue }),
        ...(entry.actualValue === undefined ? {} : { actualValue: entry.actualValue }),
      })),
      rollback: rollbackOutcome,
      rollbackApplied: rollbackOutcome.applied,
      ...(cause === undefined ? {} : { cause }),
    };
    return failureResult(
      createDysflowError(
        "PROPERTY_NOT_APPLIED",
        `import_modules completed but did not apply ${missing.length} requested control propert${missing.length === 1 ? "y" : "ies"} in "${source.sourcePath}".`,
        { details },
      ),
    );
  };

  try {
    await fileSystem.writeFile(source.sourcePath, newSource, "utf8");
  } catch (err) {
    return failureResult(
      createDysflowError(
        "FORM_WRITE_FAILED",
        `Cannot write mutated form file at "${source.sourcePath}". ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }

  // 2. Route through the import_modules LoadFromText gate.
  const importParams = {
    ...forwardedParams,
    sourcePath: source.sourcePath,
    destinationRoot: source.destinationRoot,
    moduleNames: [source.moduleName],
    importMode: "Auto",
    apply: true,
    dryRun: false,
  };
  const importResult = await orchestrator.executeMappedTool(
    "import_modules",
    importParams,
    FORMS_MAPPINGS.import_modules_gate,
  );

  // 3. On gate failure, best-effort restore the pre-apply source and surface
  //    the rollback outcome to the consumer (#692).
  if (!importResult.ok) {
    return failGateWithRollback(importResult.error);
  }

  // 4. Defense-in-depth (#951): an ok:true gate result whose payload carries
  //    per-module errors is a gate failure too. The gate's data shape is
  //    `{ result: <parsedOutput>, ...targetDiagnostics }`; trusting the outer
  //    `ok` alone let a silent-success import leave the mutated source on disk
  //    with no rollback and a success envelope hiding the error.
  const gatePayload = isRecord(importResult.data) ? importResult.data.result : undefined;
  if (importOutputReportsModuleFailure(gatePayload)) {
    return failGateWithRollback(deriveNestedGateCause(gatePayload));
  }

  // 4. New control-property additions require a source read-back. Existing
  // property updates intentionally skip this verifier and retain the original
  // guarded-write contract.
  if (pendingNewProperties !== undefined && pendingNewProperties.length > 0) {
    try {
      const verification = await verifyControlProperties(
        source.sourcePath,
        pendingNewProperties,
        (path) => fileSystem.readFile(path),
      );
      if (!verification.ok) return failPropertyVerification(verification.missing);
    } catch (err) {
      return failPropertyVerification(pendingNewProperties, err);
    }
  }

  return successResult({ importResult: importResult.data });
}
