import {
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
} from "../../core/contracts/index.js";
import type { FormIR } from "../../core/models/form-ir.js";
import type {
  CodeGraphBehaviorEvidence,
  FormUiBehaviorMap,
  FormUiDesignPlan,
  ReferencePatternInput,
} from "../../core/models/form-ui-builder.js";
import { parseFormTxt } from "../../core/services/form-ir-service.js";
import { analyzeFormUi } from "../../core/services/form-ui-analysis-service.js";
import { buildFormUiBehaviorMap } from "../../core/services/form-ui-behavior-map-service.js";
import {
  applyFormUiDesignOperations,
  applyFormUiDesignPlan,
  generateFormUiDesignPlan,
} from "../../core/services/form-ui-design-plan-service.js";
import { copyFormUiPattern } from "../../core/services/form-ui-pattern-copy-service.js";
import {
  FormUiPlanValidationError,
  validatePlanIdentity,
  validatePlanOperationsAgainstContract,
  validatePlanPreservesContract,
} from "../../core/services/form-ui-plan-execution.js";
import { verifyFormUi } from "../../core/services/form-ui-verification-service.js";
import type { FormFileSystemPort } from "../../core/services/vba-form-service.js";
import { stringValue } from "../../core/utils/index.js";
import { applyGuardedFormWrite } from "./vba-forms-guarded-write.js";
import { resolveManagedMutationSource } from "./vba-forms-managed-source.js";
import { deriveFormName } from "./vba-forms-paths.js";
import type { VbaFormsOrchestrator } from "./vba-forms-types.js";

export type FormUiBuilderToolName =
  | "analyze_form_ui"
  | "map_form_behavior"
  | "generate_form_design_plan"
  | "apply_form_design_plan"
  | "copy_form_ui_pattern"
  | "verify_form_ui";

export async function executeFormUiBuilderTool(args: {
  fileSystem: FormFileSystemPort;
  orchestrator: VbaFormsOrchestrator;
  toolName: FormUiBuilderToolName;
  params: Record<string, unknown>;
}): Promise<OperationResult<unknown>> {
  const { fileSystem, orchestrator, toolName, params } = args;
  if (toolName === "analyze_form_ui") return analyzeFromFile(fileSystem, params);
  if (toolName === "map_form_behavior") return mapFromFile(fileSystem, params);
  if (toolName === "generate_form_design_plan") return generatePlan(params);
  if (toolName === "apply_form_design_plan") return applyPlan({ orchestrator, fileSystem, params });
  if (toolName === "copy_form_ui_pattern") return copyPattern(params);
  if (toolName === "verify_form_ui") return verifyUi(params);
  return failureResult(
    createDysflowError("TOOL_NOT_IMPLEMENTED", `Tool ${toolName} not supported.`),
  );
}

async function analyzeFromFile(
  fileSystem: FormFileSystemPort,
  params: Record<string, unknown>,
): Promise<OperationResult<unknown>> {
  const sourcePath = stringValue(params.sourcePath) ?? stringValue(params.path);
  if (!sourcePath) {
    return failureResult(
      createDysflowError("FORM_SPEC_MISSING", "analyze_form_ui requires sourcePath."),
    );
  }
  try {
    const text = await fileSystem.readFile(sourcePath);
    const ir = parseFormTxt(text, { name: deriveFormName(sourcePath) });
    return successResult(analyzeFormUi(ir));
  } catch (err) {
    return failureResult(
      createDysflowError(
        "FORM_UI_ANALYSIS_FAILED",
        err instanceof Error ? err.message : String(err),
      ),
    );
  }
}

async function mapFromFile(
  fileSystem: FormFileSystemPort,
  params: Record<string, unknown>,
): Promise<OperationResult<unknown>> {
  const analysis = await analyzeFromFile(fileSystem, params);
  if (!analysis.ok) return analysis;
  return successResult(
    buildFormUiBehaviorMap(
      analysis.data as ReturnType<typeof analyzeFormUi>,
      readEvidence(params.codegraphEvidence),
    ),
  );
}

function generatePlan(params: Record<string, unknown>): OperationResult<unknown> {
  const behaviorMap = readObject<FormUiBehaviorMap>(params.behaviorMap);
  const plan = readObject<{ operations?: unknown[]; referencePattern?: ReferencePatternInput }>(
    params.plan,
  );
  if (behaviorMap === undefined) {
    return failureResult(
      createDysflowError("FORM_SPEC_MISSING", "generate_form_design_plan requires behaviorMap."),
    );
  }
  return successResult(
    generateFormUiDesignPlan(behaviorMap, {
      operations: Array.isArray(plan?.operations)
        ? (plan.operations as Parameters<typeof generateFormUiDesignPlan>[1]["operations"])
        : [],
      referencePattern: plan?.referencePattern,
    }),
  );
}

async function applyPlan(args: {
  orchestrator: VbaFormsOrchestrator;
  fileSystem: FormFileSystemPort;
  params: Record<string, unknown>;
}): Promise<OperationResult<unknown>> {
  const { orchestrator, fileSystem, params } = args;
  const plan = readObject<FormUiDesignPlan>(params.plan);
  if (plan === undefined) {
    return failureResult(
      createDysflowError("FORM_SPEC_MISSING", "apply_form_design_plan requires plan."),
    );
  }

  // Pre-flight checks (pure, no I/O). These run BEFORE any file read/write so
  // a malformed plan is rejected at minimum cost.
  const preflight = runPreflight(plan);
  if (!preflight.ok) return preflight;

  const rawSourcePath = stringValue(params.sourcePath) ?? stringValue(params.path);
  if (!rawSourcePath) {
    return failureResult(
      createDysflowError(
        "FORM_SPEC_MISSING",
        "apply_form_design_plan requires sourcePath (or path) to the .form.txt file.",
      ),
    );
  }

  // Resolve managed source path via #718 + form-source-resolver. Enforces
  // managed extension (.form.txt / .report.txt), runtime-dir refusal, and
  // containment in destinationRoot / projectRoot.
  const source = await resolveManagedMutationSource({
    orchestrator,
    toolName: "apply_form_design_plan",
    params,
    rawSourcePath,
  });
  if (!source.ok) return source;

  // Identity guard: case-insensitive trimmed match against the resolved form
  // name. Non-empty check runs first inside validatePlanIdentity.
  try {
    validatePlanIdentity(plan, source.data.moduleName);
  } catch (err) {
    if (err instanceof FormUiPlanValidationError) {
      return failureResult(createDysflowError(err.code, err.message, { details: err.details }));
    }
    return failureResult(
      createDysflowError("FORM_UI_PLAN_INVALID", err instanceof Error ? err.message : String(err)),
    );
  }

  // Read original source for parse + restore-on-failure.
  let originalSource: string;
  try {
    originalSource = await fileSystem.readFile(source.data.sourcePath);
  } catch (err) {
    return failureResult(
      createDysflowError(
        "FORM_NOT_FOUND",
        `Cannot read form file at "${source.data.sourcePath}". ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }

  // Parse the source IR — pure.
  let ir: FormIR;
  try {
    ir = parseFormTxt(originalSource, { name: source.data.moduleName });
  } catch (err) {
    return failureResult(
      createDysflowError(
        "FORM_PARSE_ERROR",
        `Failed to parse "${source.data.sourcePath}": ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }

  // Fold operations onto the in-memory IR. This is the same fold the core
  // uses for the in-memory contract view; the adapter layers I/O on top.
  let folded: { ir: FormIR; source: string; advisories: string[] };
  try {
    folded = applyFormUiDesignOperations(ir, plan.operations);
  } catch (err) {
    return failureResult(
      createDysflowError("FORM_MUTATION_INVALID", err instanceof Error ? err.message : String(err)),
    );
  }

  const apply = params.apply === true || params.dryRun === false;
  if (!apply) {
    // Dry-run: return the would-be-written source + advisory list. No write,
    // no import. Preserves the contract-only envelope (`mode`, `formName`,
    // `operationsApplied`, `preservedControls`, `warnings`).
    const dryRunResult = applyFormUiDesignPlan(plan, { apply: false });
    return successResult({
      ...dryRunResult,
      advisories: folded.advisories,
      source: folded.source,
      filesystemApplied: false,
      importGate: "not-run",
    });
  }

  // Apply: a SINGLE write + a SINGLE import_modules gate via the seam.
  const write = await applyGuardedFormWrite({
    orchestrator,
    fileSystem,
    source: source.data,
    newSource: folded.source,
    originalSource,
    targetExisted: true, // resolveManagedMutationSource + readFile both succeeded
    forwardedParams: params,
  });
  if (!write.ok) return write;

  const applyResult = applyFormUiDesignPlan(plan, { apply: true });
  return successResult({
    ...applyResult,
    advisories: folded.advisories,
    filesystemApplied: true,
    importGate: "passed",
    importResult: write.data.importResult,
  });
}

function planValidationFailure(err: unknown): OperationResult<undefined> {
  if (err instanceof FormUiPlanValidationError) {
    return failureResult(createDysflowError(err.code, err.message, { details: err.details }));
  }
  return failureResult(
    createDysflowError("FORM_UI_PLAN_INVALID", err instanceof Error ? err.message : String(err)),
  );
}

/**
 * Run pure pre-flight checks against the plan before any I/O. The order is:
 *   1. `validatePlanPreservesContract` — fast fail on operations that would
 *      drop a preserved event/binding (delete/rename on a control with
 *      events[]/bindings[], or set-property on the `Name` key).
 *   2. `validatePlanOperationsAgainstContract` — fail on operations whose
 *      target is not in the source contract.
 * Both checks throw `FormUiPlanValidationError` with a typed `code`; the
 * adapter translates to a `DysflowError`.
 */
function runPreflight(plan: FormUiDesignPlan): OperationResult<undefined> {
  try {
    validatePlanPreservesContract(plan);
    validatePlanOperationsAgainstContract(plan);
    return successResult(undefined);
  } catch (err) {
    return planValidationFailure(err);
  }
}

function copyPattern(params: Record<string, unknown>): OperationResult<unknown> {
  const behaviorMap = readObject<FormUiBehaviorMap>(params.behaviorMap);
  const referencePattern = readObject<ReferencePatternInput>(params.referencePattern);
  if (behaviorMap === undefined || referencePattern === undefined) {
    return failureResult(
      createDysflowError(
        "FORM_SPEC_MISSING",
        "copy_form_ui_pattern requires behaviorMap and referencePattern.",
      ),
    );
  }
  return successResult(copyFormUiPattern(behaviorMap, referencePattern));
}

function verifyUi(params: Record<string, unknown>): OperationResult<unknown> {
  const sourceContract = readObject<FormUiBehaviorMap>(params.sourceContract);
  const appliedContract = readObject<FormUiBehaviorMap>(params.appliedContract);
  if (sourceContract === undefined || appliedContract === undefined) {
    return failureResult(
      createDysflowError(
        "FORM_SPEC_MISSING",
        "verify_form_ui requires sourceContract and appliedContract.",
      ),
    );
  }
  return successResult(verifyFormUi(sourceContract, appliedContract));
}

function readEvidence(value: unknown): CodeGraphBehaviorEvidence[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is CodeGraphBehaviorEvidence => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return false;
    const candidate = item as Record<string, unknown>;
    return (
      typeof candidate.handler === "string" &&
      Array.isArray(candidate.callPath) &&
      candidate.callPath.every((entry) => typeof entry === "string") &&
      optionalStringArray(candidate.tables) &&
      optionalStringArray(candidate.effects)
    );
  });
}

function optionalStringArray(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) && value.every((entry) => typeof entry === "string"))
  );
}

function readObject<T>(value: unknown): T | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as T)
    : undefined;
}
