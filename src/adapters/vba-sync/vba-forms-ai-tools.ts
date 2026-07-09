import {
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
} from "../../core/contracts/index.js";
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
  applyFormUiDesignPlan,
  generateFormUiDesignPlan,
} from "../../core/services/form-ui-design-plan-service.js";
import { copyFormUiPattern } from "../../core/services/form-ui-pattern-copy-service.js";
import { verifyFormUi } from "../../core/services/form-ui-verification-service.js";
import type { FormFileSystemPort } from "../../core/services/vba-form-service.js";
import { stringValue } from "../../core/utils/index.js";
import { deriveFormName } from "./vba-forms-paths.js";

export type FormUiBuilderToolName =
  | "analyze_form_ui"
  | "map_form_behavior"
  | "generate_form_design_plan"
  | "apply_form_design_plan"
  | "copy_form_ui_pattern"
  | "verify_form_ui";

export async function executeFormUiBuilderTool(args: {
  fileSystem: FormFileSystemPort;
  toolName: FormUiBuilderToolName;
  params: Record<string, unknown>;
}): Promise<OperationResult<unknown>> {
  const { fileSystem, toolName, params } = args;
  if (toolName === "analyze_form_ui") return analyzeFromFile(fileSystem, params);
  if (toolName === "map_form_behavior") return mapFromFile(fileSystem, params);
  if (toolName === "generate_form_design_plan") return generatePlan(params);
  if (toolName === "apply_form_design_plan") return applyPlan(params);
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

function applyPlan(params: Record<string, unknown>): OperationResult<unknown> {
  const plan = readObject<FormUiDesignPlan>(params.plan);
  if (plan === undefined) {
    return failureResult(
      createDysflowError("FORM_SPEC_MISSING", "apply_form_design_plan requires plan."),
    );
  }
  const apply = params.apply === true || params.dryRun === false;
  const result = applyFormUiDesignPlan(plan, { apply });
  return successResult({
    ...result,
    // First-slice safety contract: applying a design plan applies the plan
    // contract in memory only. It never writes arbitrary form text or imports
    // a binary until specific FormIR mutation operations exist.
    filesystemApplied: false,
    importGate: "not-run",
  });
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
