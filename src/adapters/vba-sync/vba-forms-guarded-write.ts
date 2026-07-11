import {
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
} from "../../core/contracts/index.js";
import type { FormFileSystemPort } from "../../core/services/vba-form-service.js";
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
 *   3. On import success → `successResult({ importResult })`.
 *   4. On import failure → best-effort restore of `originalSource`, captures
 *      `RollbackOutcome` (targetExisted-aware, #692), and returns
 *      `failureResult(FORM_IMPORT_GATE_FAILED, { details: { cause, rollback } })`.
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
  /** #692 — drives `RollbackOutcome.restoredState` / `requiresManualCleanup`. */
  targetExisted: boolean;
  /** Caller-supplied params; merged under the seam's hardcoded fields. */
  forwardedParams: Record<string, unknown>;
};

export type ApplyGuardedFormWriteSuccess = {
  importResult: unknown;
};

export async function applyGuardedFormWrite(
  input: ApplyGuardedFormWriteInput,
): Promise<OperationResult<ApplyGuardedFormWriteSuccess>> {
  const {
    orchestrator,
    fileSystem,
    source,
    newSource,
    originalSource,
    targetExisted,
    forwardedParams,
  } = input;

  // 1. Write the new source.
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
    const rollbackOutcome = await captureRollbackOutcome(
      () => fileSystem.writeFile(source.sourcePath, originalSource, "utf8"),
      targetExisted,
    );
    return failureResult(
      createDysflowError(
        "FORM_IMPORT_GATE_FAILED",
        `import_modules apply gate failed for "${source.sourcePath}": ${importResult.error.message}`,
        { details: { cause: importResult.error, rollback: rollbackOutcome } },
      ),
    );
  }

  return successResult({ importResult: importResult.data });
}