// Pure form-UI design plan execution internals (PR 5 / #813).
//
// This module is pure — no I/O. It hosts the path/identity guards and the
// pre-flight validators that the adapter-level `apply_form_design_plan`
// invokes BEFORE any writeFile/import_modules call. The contract:
//
//   - `validatePlanIdentity(plan, resolvedFormName)` — non-empty check + case-
//     insensitive trimmed match against the resolved source's parsed form
//     name. Issue #813 acceptance criteria #1 (non-empty) and #2 (no
//     vacuous empty-vs-empty match).
//   - `validatePlanOperationsAgainstContract(plan)` — every non-add/note op
//     must target a control that exists in `plan.sourceContract`. Issue
//     #813 acceptance criterion #3.
//   - `validatePlanPreservesContract(plan)` — refuses operations that would
//     drop a preserved event/binding (delete-control on a control with
//     events[]/bindings[]; rename-control on the same; set-property on the
//     `Name` key). Issue #813 acceptance criterion #4.
//
// These checks are FAIL-CLOSED — they throw `FormUiPlanValidationError`
// with a typed `code` that the adapter translates into a `DysflowError`
// before any file is touched.

import type { FormUiBehaviorMap, FormUiDesignPlan } from "../models/form-ui-builder.js";

export class FormUiPlanValidationError extends Error {
  constructor(
    readonly code:
      | "FORM_UI_PLAN_FORM_NAME_MISSING"
      | "FORM_UI_PLAN_FORM_MISMATCH"
      | "FORM_UI_PLAN_TARGET_MISSING"
      | "FORM_UI_PLAN_PRESERVES_DROPPED",
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "FormUiPlanValidationError";
  }
}

/**
 * Hard-validate `plan.formName` is non-empty AND case-insensitive trimmed
 * equals `resolvedFormName`. VBA identifiers are case-insensitive (AGENTS.md),
 * so a case-only difference MUST NOT refuse a legitimate apply. The non-empty
 * check runs FIRST so two empty/undefined names can never vacuously satisfy
 * the comparison.
 */
export function validatePlanIdentity(plan: FormUiDesignPlan, resolvedFormName: string): void {
  const trimmedPlanName = (plan.formName ?? "").trim();
  if (!trimmedPlanName) {
    throw new FormUiPlanValidationError(
      "FORM_UI_PLAN_FORM_NAME_MISSING",
      "apply_form_design_plan requires plan.formName to be a non-empty string.",
      { formName: plan.formName ?? null },
    );
  }
  const trimmedResolved = (resolvedFormName ?? "").trim();
  if (trimmedPlanName.toLowerCase() !== trimmedResolved.toLowerCase()) {
    throw new FormUiPlanValidationError(
      "FORM_UI_PLAN_FORM_MISMATCH",
      `apply_form_design_plan plan.formName "${trimmedPlanName}" does not match resolved form name "${trimmedResolved}".`,
      {
        planFormName: trimmedPlanName,
        resolvedFormName: trimmedResolved,
      },
    );
  }
}

/**
 * Refuse any non-add/note operation whose `target` is not present in
 * `plan.sourceContract.controls`. `note` ops have no target constraint
 * (they are advisory). `add-control` ops name a NEW control, not an
 * existing one — checked at apply time via `addControl`'s
 * `FORM_DUPLICATE_CONTROL` guard, not here.
 */
export function validatePlanOperationsAgainstContract(plan: FormUiDesignPlan): void {
  const controlsByName = new Map<string, FormUiBehaviorMap["controls"][number]>();
  for (const control of plan.sourceContract.controls) {
    controlsByName.set(control.name, control);
  }
  for (const operation of plan.operations) {
    if (operation.kind === "note") continue;
    if (operation.kind === "add-control") continue;
    const control = controlsByName.get(operation.target);
    if (control === undefined) {
      throw new FormUiPlanValidationError(
        "FORM_UI_PLAN_TARGET_MISSING",
        `Operation target "${operation.target}" (kind: ${operation.kind}) is not present in the source contract.`,
        { target: operation.target, kind: operation.kind },
      );
    }
  }
}

/**
 * Refuse operations that would drop a preserved event/binding the source
 * contract records for the target control. Concretely:
 *   - `delete-control` on a control whose contract entry has any `events`
 *     or `bindings` (deleting would orphan sibling `.cls` handlers).
 *   - `rename-control` on a control whose contract entry has any `events`
 *     or `bindings` (Access event procedure names are control-name
 *     convention-bound).
 *   - `set-property` on the `Name` key (identity change — belongs to
 *     `rename-control`).
 *
 * This is the adapter-level pre-flight; the underlying FormIR primitives
 * (`deleteControl`, `renameControl`) carry the same checks at the IR
 * layer as defense-in-depth, but failing here is faster and produces a
 * typed error the agent can act on without parsing FormIR.
 */
export function validatePlanPreservesContract(plan: FormUiDesignPlan): void {
  const controlsByName = new Map<string, { events: string[]; bindings: string[] }>();
  for (const control of plan.sourceContract.controls) {
    controlsByName.set(control.name, {
      events: control.events,
      bindings: control.bindings,
    });
  }
  for (const operation of plan.operations) {
    if (operation.kind === "note") continue;
    if (operation.kind === "add-control") continue;
    const info = controlsByName.get(operation.target);
    // validatePlanOperationsAgainstContract catches missing targets first;
    // skip silently if absent.
    if (info === undefined) continue;
    const hasPreserved = info.events.length > 0 || info.bindings.length > 0;
    if (operation.kind === "delete-control" && hasPreserved) {
      throw new FormUiPlanValidationError(
        "FORM_UI_PLAN_PRESERVES_DROPPED",
        `delete-control on "${operation.target}" would drop preserved event/binding references. Control has events=[${info.events.join(",")}] bindings=[${info.bindings.join(",")}].`,
        {
          control: operation.target,
          kind: operation.kind,
          events: info.events,
          bindings: info.bindings,
        },
      );
    }
    if (operation.kind === "rename-control" && hasPreserved) {
      throw new FormUiPlanValidationError(
        "FORM_UI_PLAN_PRESERVES_DROPPED",
        `rename-control on "${operation.target}" would drop preserved event/binding references (Access event procedure names are control-name convention-bound). events=[${info.events.join(",")}] bindings=[${info.bindings.join(",")}].`,
        {
          control: operation.target,
          kind: operation.kind,
          events: info.events,
          bindings: info.bindings,
        },
      );
    }
    if (operation.kind === "set-property") {
      const property = operation.params?.property;
      if (property === "Name") {
        throw new FormUiPlanValidationError(
          "FORM_UI_PLAN_PRESERVES_DROPPED",
          `set-property on "${operation.target}" targets the Name key, which would drop the control's identity. Use rename-control for identity changes.`,
          { control: operation.target, kind: operation.kind, property: "Name" },
        );
      }
    }
  }
}
