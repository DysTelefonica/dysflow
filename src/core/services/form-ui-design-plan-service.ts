import type { FormIR, FormMutationResult } from "../models/form-ir.js";
import type {
  FormUiBehaviorMap,
  FormUiDesignOperation,
  FormUiDesignPlan,
  FormUiPlanApplicationResult,
  FormUiVerificationFinding,
  ReferencePatternInput,
} from "../models/form-ui-builder.js";
import {
  addControl,
  deleteControl,
  moveControl,
  renameControl,
  serializeFormTxt,
  setProperty,
} from "./form-ir-service.js";

export class FormUiPlanError extends Error {
  readonly code = "FORM_UI_UNSUPPORTED_OPERATION";

  constructor(kind: unknown) {
    super(`Unsupported form UI design operation: ${String(kind)}.`);
    this.name = "FormUiPlanError";
  }
}

export type FormUiDesignOperationsResult = { ir: FormIR; source: string; advisories: string[] };

export type GenerateFormUiDesignPlanInput = {
  operations: Array<Omit<FormUiDesignOperation, "preserves">>;
  referencePattern?: ReferencePatternInput;
};

export function generateFormUiDesignPlan(
  sourceContract: FormUiBehaviorMap,
  input: GenerateFormUiDesignPlanInput,
): FormUiDesignPlan {
  const warnings: string[] = [];
  const operations: FormUiDesignOperation[] = [];

  for (const operation of input.operations) {
    const control = sourceContract.controls.find(
      (candidate) => candidate.name === operation.target,
    );
    if (control === undefined && operation.kind !== "add-control" && operation.kind !== "note") {
      warnings.push(`Operation target "${operation.target}" is not present in the behavior map.`);
      continue;
    }
    operations.push({
      ...operation,
      preserves:
        control === undefined
          ? []
          : [
              ...control.events,
              ...control.bindings,
              ...control.codegraphEvidence.map((evidence) => evidence.handler),
            ],
    });
  }

  return {
    formName: sourceContract.formName,
    sourceContract,
    operations,
    referencePattern: input.referencePattern,
    warnings,
  };
}

export function applyFormUiDesignPlan(
  plan: FormUiDesignPlan,
  options: { apply?: boolean } = {},
): FormUiPlanApplicationResult {
  return {
    mode: options.apply === true ? "apply" : "dry-run",
    formName: plan.formName,
    operationsApplied: plan.operations,
    preservedControls: plan.sourceContract.controls.map((control) => control.name),
    warnings: plan.warnings,
    advisories: plan.operations.filter(({ kind }) => kind === "note").map(({ intent }) => intent),
    filesystemApplied: false,
    importGate: "not-run",
    appliedContract: deriveAppliedContract(plan),
  };
}

function deriveAppliedContract(plan: FormUiDesignPlan): FormUiBehaviorMap {
  const controls = plan.sourceContract.controls.map((control) =>
    control.properties ? { ...control, properties: { ...control.properties } } : { ...control },
  );
  for (const operation of plan.operations) {
    const index = controls.findIndex(({ name }) => name === operation.target);
    if (operation.kind === "note") continue;
    if (operation.kind === "add-control") {
      controls.push({
        name: operation.target,
        type: requiredString(operation.params.type),
        role: "unknown",
        events: [],
        bindings: [],
        codegraphEvidence: [],
        properties: Object.fromEntries(
          Object.entries((operation.params.properties ?? {}) as Record<string, unknown>).map(
            ([key, value]) => [key, mutationValue(value)],
          ),
        ),
      });
    } else if (operation.kind === "delete-control") controls.splice(index, 1);
    else if (operation.kind === "rename-control") {
      const current = controls[index];
      if (!current) continue;
      controls[index] = { ...current, name: requiredString(operation.params.newName) };
    } else {
      const current = controls[index];
      if (!current) continue;
      const properties = { ...current.properties };
      if (operation.kind === "move-control") {
        if (operation.params.left !== undefined)
          properties.Left = mutationValue(operation.params.left);
        if (operation.params.top !== undefined)
          properties.Top = mutationValue(operation.params.top);
      } else if (operation.kind === "set-property")
        properties[requiredString(operation.params.property)] = mutationValue(
          operation.params.value,
        );
      else throw new FormUiPlanError((operation as { kind?: unknown }).kind);
      controls[index] = { ...current, properties };
    }
  }
  return { ...plan.sourceContract, controls };
}

export function applyFormUiDesignOperations(
  initialIr: FormIR,
  operations: FormUiDesignOperation[],
): FormUiDesignOperationsResult {
  let ir = initialIr;
  const advisories: string[] = [];

  for (const operation of operations) {
    if (operation.kind === "note") {
      advisories.push(operation.intent);
      continue;
    }
    const mutation = dispatchOperation(ir, operation);
    ir = mutation.ir;
  }

  return { ir, source: serializeFormTxt(ir), advisories };
}

function dispatchOperation(ir: FormIR, operation: FormUiDesignOperation): FormMutationResult {
  const params = operation.params;
  switch (operation.kind) {
    case "add-control":
      return addControl(ir, {
        targetSectionName: optionalString(params.targetSectionName),
        control: {
          name: operation.target,
          type: requiredString(params.type),
          properties: params.properties as Record<string, string | number | boolean> | undefined,
        },
      });
    case "move-control":
      return moveControl(ir, {
        controlName: operation.target,
        left: optionalNumber(params.left),
        top: optionalNumber(params.top),
      });
    case "rename-control":
      return renameControl(ir, {
        controlName: operation.target,
        newName: requiredString(params.newName),
      });
    case "set-property":
      return setProperty(ir, {
        controlName: operation.target,
        property: requiredString(params.property),
        value: requiredMutationValue(params.value),
      });
    case "delete-control":
      return deleteControl(ir, { controlName: operation.target });
    default:
      throw new FormUiPlanError((operation as { kind?: unknown }).kind);
  }
}

function requiredString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function requiredMutationValue(value: unknown): string | number | boolean {
  return ["string", "number", "boolean"].includes(typeof value)
    ? (value as string | number | boolean)
    : "";
}

export function verifyPlanAlignment(
  plan: FormUiDesignPlan,
  currentContract: FormUiBehaviorMap,
): FormUiVerificationFinding[] {
  const findings: FormUiVerificationFinding[] = [];
  const control = (name: string) => currentContract.controls.find((item) => item.name === name);
  const mismatch = (code: string, name: string, detail = "") =>
    findings.push({
      code,
      severity: "error",
      controlName: name,
      message: `${code}: ${name} ${detail}`,
    });
  for (const operation of plan.operations) {
    if (operation.kind === "add-control") {
      const added = currentContract.controls.find((control) => control.name === operation.target);
      if (added === undefined) {
        mismatch("FORM_UI_ADDED_CONTROL_MISSING", operation.target);
      } else if (added.type !== requiredString(operation.params.type)) {
        mismatch("FORM_UI_ADDED_CONTROL_MISMATCH", operation.target);
      } else {
        const planned = operation.params.properties as Record<string, string | number | boolean>;
        for (const [property, value] of Object.entries(planned ?? {})) {
          const expected = mutationValue(value);
          if (added.properties?.[property] !== expected) {
            mismatch("FORM_UI_ADDED_CONTROL_PROPERTY_MISMATCH", operation.target, property);
          }
        }
      }
      continue;
    }
    if (operation.kind === "note") continue;
    if (operation.kind === "delete-control") {
      if (control(operation.target)) mismatch("FORM_UI_DELETED_CONTROL_PRESENT", operation.target);
      continue;
    }
    if (operation.kind === "rename-control") {
      const renamed = requiredString(operation.params.newName);
      const expected = plan.sourceContract.controls.find((item) => item.name === operation.target);
      if (
        control(operation.target) ||
        !control(renamed) ||
        control(renamed)?.type !== expected?.type
      )
        mismatch("FORM_UI_RENAMED_CONTROL_MISMATCH", operation.target);
      continue;
    }
    if (operation.kind !== "move-control" && operation.kind !== "set-property")
      throw new FormUiPlanError((operation as { kind?: unknown }).kind);
    const renamed = plan.operations.find(
      (item) => item.kind === "rename-control" && item.target === operation.target,
    );
    const targetName = renamed ? requiredString(renamed.params.newName) : operation.target;
    const target = control(targetName);
    if (!target) {
      mismatch("FORM_UI_PLAN_TARGET_MISSING", targetName);
      continue;
    }
    const properties =
      operation.kind === "move-control"
        ? { Left: operation.params.left, Top: operation.params.top }
        : { [requiredString(operation.params.property)]: operation.params.value };
    for (const [property, value] of Object.entries(properties)) {
      if (value !== undefined && target.properties?.[property] !== mutationValue(value))
        mismatch("FORM_UI_PLAN_PROPERTY_MISMATCH", targetName, property);
    }
  }
  return findings;
}

function mutationValue(value: unknown): string {
  return typeof value === "boolean" ? (value ? "NotDefault" : "0") : String(value);
}
