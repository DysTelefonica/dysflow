import type { FormIR, FormMutationResult, FormNode, PropertyEntry } from "../models/form-ir.js";
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
  collectControls,
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

export function applyFormUiDesignPlan(plan: FormUiDesignPlan): FormUiPlanApplicationResult {
  // This core function is PURE: it folds the plan onto an in-memory FormIR and
  // returns the resulting contract preview. It never touches the filesystem,
  // so it always reports `mode: "dry-run"`, `filesystemApplied: false`, and
  // `importGate: "not-run"`. The ACTUAL guarded write + import gate — and the
  // `mode: "apply"` / `filesystemApplied: true` result — are owned by the
  // adapter (`applyGuardedFormWrite` in `vba-forms-ai-tools`). Keeping the
  // "apply" label out of the core removes the previous footgun where a direct
  // core caller could get `mode: "apply"` alongside `filesystemApplied: false`.
  //
  // Issue #829 — derive `appliedContract` from the SAME mutated FormIR that
  // apply writes through, not from a parallel implementation. Eliminates the
  // dual-implementation drift risk that previously let the dry-run preview
  // silently lie about what apply would actually write.
  const initialIr = buildIrFromBehaviorMap(plan.sourceContract);
  const { ir, advisories } = applyFormUiDesignOperations(initialIr, plan.operations);
  const appliedContract = buildBehaviorMapFromIr(ir, plan.sourceContract, plan.operations);

  return {
    mode: "dry-run",
    formName: plan.formName,
    operationsApplied: plan.operations,
    preservedControls: plan.sourceContract.controls.map((control) => control.name),
    warnings: plan.warnings,
    advisories,
    filesystemApplied: false,
    importGate: "not-run",
    appliedContract,
  };
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

// ---------------------------------------------------------------------------
// Internal: FormIR <-> FormUiBehaviorMap bridge (issue #829)
// ---------------------------------------------------------------------------

/**
 * Build a minimal FormIR from a `FormUiBehaviorMap` so the same
 * `addControl` / `moveControl` / `renameControl` / `setProperty` /
 * `deleteControl` primitives that the adapter-level apply path uses can be
 * folded over the source contract in-memory — no disk I/O. The result is the
 * single source of truth from which the dry-run `appliedContract` is then
 * re-derived (see `buildBehaviorMapFromIr`).
 *
 * The synthetic IR keeps just enough surface for the primitives to work:
 * a `Begin Form` root, each source control as a direct child with a `Name`
 * scalar and the contract's declared `properties` (excluding `Name`).
 */
function buildIrFromBehaviorMap(contract: FormUiBehaviorMap): FormIR {
  const children: FormNode[] = contract.controls.map((control) => {
    const entries: PropertyEntry[] = [{ kind: "scalar", key: "Name", value: `"${control.name}"` }];
    for (const [key, value] of Object.entries(control.properties ?? {})) {
      if (key === "Name") continue;
      entries.push({ kind: "scalar", key, value: String(value) });
    }
    return { blockType: control.type, entries, children: [] };
  });
  return {
    name: contract.formName,
    kind: "Form",
    preamble: [],
    root: { blockType: "Form", entries: [], children },
    codeBehind: null,
  };
}

/**
 * Read a `FormUiBehaviorMap` back out of the post-fold FormIR. Renamed
 * controls inherit their role/events/bindings/codegraphEvidence from the
 * source contract via the rename chain; newly added controls use the
 * `unknown` role with empty bindings.
 *
 * The `Name` scalar that every control exposes in the IR is stripped from
 * `properties` so it never shadows the contract's first-class `name` field.
 */
function buildBehaviorMapFromIr(
  ir: FormIR,
  source: FormUiBehaviorMap,
  operations: readonly FormUiDesignOperation[],
): FormUiBehaviorMap {
  // Track rename chains so a control named `cmdCommit` can still inherit the
  // role/events/codegraphEvidence of the original `cmdSave` entry.
  const renamedFrom = new Map<string, string>();
  for (const op of operations) {
    if (op.kind !== "rename-control") continue;
    const newName = requiredString(op.params.newName);
    if (!newName) continue;
    const original = renamedFrom.get(op.target) ?? op.target;
    renamedFrom.set(newName, original);
  }

  const sourceByName = new Map(source.controls.map((control) => [control.name, control]));
  const irControls = collectControls(ir.root);

  return {
    formName: source.formName,
    formEvents: source.formEvents,
    unmappedEvidence: source.unmappedEvidence,
    warnings: source.warnings,
    controls: irControls.map((control) => {
      const lookupName = renamedFrom.get(control.name) ?? control.name;
      const original = sourceByName.get(lookupName);
      // FormIR exposes the control's Name as a scalar entry alongside the
      // blockType-derived type; strip it from properties so it doesn't
      // shadow the contract's first-class `name` field.
      const { Name: _name, ...serialized } = control.properties;
      const rest = Object.fromEntries(
        Object.entries(serialized).map(([key, value]) => [key, decodeScalar(value)]),
      );
      const properties = Object.keys(rest).length === 0 ? undefined : rest;
      if (original !== undefined) {
        return {
          name: control.name,
          type: control.type,
          role: original.role,
          events: original.events,
          bindings: original.bindings,
          codegraphEvidence: original.codegraphEvidence,
          properties,
        };
      }
      return {
        name: control.name,
        type: control.type,
        role: "unknown",
        events: [],
        bindings: [],
        codegraphEvidence: [],
        properties,
      };
    }),
  };
}

function decodeScalar(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1).replaceAll('""', '"')
    : trimmed;
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
