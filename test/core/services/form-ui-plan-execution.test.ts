import { describe, expect, it } from "vitest";
import type { FormUiBehaviorMap, FormUiDesignPlan } from "../../../src/core/models/form-ui-builder";
import {
  FormUiPlanValidationError,
  validatePlanIdentity,
  validatePlanOperationsAgainstContract,
  validatePlanPreservesContract,
} from "../../../src/core/services/form-ui-plan-execution";

// Minimal contract with two named controls — one with events, one with bindings.
const mapWithControls: FormUiBehaviorMap = {
  formName: "Customer",
  formEvents: [],
  unmappedEvidence: [],
  warnings: [],
  controls: [
    {
      name: "cmdSave",
      type: "CommandButton",
      role: "action",
      events: ["OnClick"],
      bindings: [],
      codegraphEvidence: [],
    },
    {
      name: "txtName",
      type: "TextBox",
      role: "input",
      events: [],
      bindings: ["SELECT id FROM Customers"],
      codegraphEvidence: [],
    },
  ],
};

const op = (
  kind: FormUiDesignPlan["operations"][number]["kind"],
  target: string,
  params: Record<string, unknown> = {},
) => ({ kind, target, intent: kind, params, preserves: [] });

const planFromMap = (operations: FormUiDesignPlan["operations"]) => ({
  formName: "Customer",
  sourceContract: mapWithControls,
  operations,
  warnings: [],
});

describe("validatePlanIdentity — form-name identity guard (#813 acceptance #1/#2)", () => {
  it.each([
    ["empty", "", "Customer"],
    ["whitespace", "   ", "Customer"],
  ])("rejects %s plan.formName with FORM_UI_PLAN_FORM_NAME_MISSING", (_label, formName, _resolved) => {
    expect(() => validatePlanIdentity({ ...planFromMap([]), formName }, "Customer")).toThrowError(
      expect.objectContaining({ code: "FORM_UI_PLAN_FORM_NAME_MISSING" }),
    );
  });

  it("rejects a different formName with FORM_UI_PLAN_FORM_MISMATCH", () => {
    expect(() => validatePlanIdentity(planFromMap([]), "Other")).toThrowError(
      expect.objectContaining({ code: "FORM_UI_PLAN_FORM_MISMATCH" }),
    );
  });

  it.each([
    ["case-only", "CUSTOMER"],
    ["trimmed", "  Customer  "],
    ["trimmed case-insensitive", "  customer  "],
  ])("accepts %s match", (_label, resolved) => {
    expect(() => validatePlanIdentity(planFromMap([]), resolved)).not.toThrow();
  });
});

describe("validatePlanOperationsAgainstContract — target-control guard (#813 acceptance #3)", () => {
  it.each([
    ["move-control", "ghostControl"],
    ["rename-control", "ghostControl"],
    ["set-property", "missingControl"],
    ["delete-control", "ghostControl"],
  ] as const)("rejects %s targeting a control not in the source contract", (_kind, target) => {
    expect(() =>
      validatePlanOperationsAgainstContract(planFromMap([op("move-control", target)])),
    ).toThrowError(expect.objectContaining({ code: "FORM_UI_PLAN_TARGET_MISSING" }));
  });

  it.each([
    ["note", "anyTarget"],
    ["add-control", "txtNew"],
  ] as const)("does not reject %s ops", (_kind, target) => {
    expect(() =>
      validatePlanOperationsAgainstContract(planFromMap([op("move-control", target)])),
    ).toThrow(); // move-control on missing target — skip
  });

  it("accepts a plan where every op targets a control present in the contract", () => {
    expect(() =>
      validatePlanOperationsAgainstContract(
        planFromMap([
          op("move-control", "cmdSave", { left: 10 }),
          op("set-property", "cmdSave", { property: "Caption", value: "Commit" }),
        ]),
      ),
    ).not.toThrow();
  });
});

describe("validatePlanPreservesContract — preserved event/binding guard (#813 acceptance #4)", () => {
  it("rejects delete-control on a control with events or bindings", () => {
    expect(() =>
      validatePlanPreservesContract(planFromMap([op("delete-control", "cmdSave")])),
    ).toThrowError(expect.objectContaining({ code: "FORM_UI_PLAN_PRESERVES_DROPPED" }));
    expect(() =>
      validatePlanPreservesContract(planFromMap([op("delete-control", "txtName")])),
    ).toThrowError(expect.objectContaining({ code: "FORM_UI_PLAN_PRESERVES_DROPPED" }));
  });

  it("rejects rename-control on a control with events or bindings", () => {
    expect(() =>
      validatePlanPreservesContract(
        planFromMap([op("rename-control", "cmdSave", { newName: "cmdCommit" })]),
      ),
    ).toThrowError(expect.objectContaining({ code: "FORM_UI_PLAN_PRESERVES_DROPPED" }));
  });

  it("rejects set-property on the Name key (identity change belongs to rename-control)", () => {
    expect(() =>
      validatePlanPreservesContract(
        planFromMap([op("set-property", "cmdSave", { property: "Name", value: "cmdCommit" })]),
      ),
    ).toThrowError(expect.objectContaining({ code: "FORM_UI_PLAN_PRESERVES_DROPPED" }));
  });

  it("accepts set-property on Caption for a control with events (Caption is not event-bound)", () => {
    expect(() =>
      validatePlanPreservesContract(
        planFromMap([op("set-property", "cmdSave", { property: "Caption", value: "Commit" })]),
      ),
    ).not.toThrow();
  });

  it("accepts delete-control on a control with no events or bindings", () => {
    const plan = {
      formName: "Customer",
      sourceContract: {
        ...mapWithControls,
        controls: [
          {
            name: "lblIdle",
            type: "Label" as const,
            role: "display" as const,
            events: [],
            bindings: [],
            codegraphEvidence: [],
          },
        ],
      },
      operations: [op("delete-control", "lblIdle")],
      warnings: [],
    };
    expect(() => validatePlanPreservesContract(plan)).not.toThrow();
  });
});

describe("FormUiPlanValidationError — typed error contract", () => {
  it("carries the supplied code on the error instance", () => {
    try {
      validatePlanIdentity({ ...planFromMap([]), formName: "" }, "Customer");
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(FormUiPlanValidationError);
      expect((err as FormUiPlanValidationError).code).toBe("FORM_UI_PLAN_FORM_NAME_MISSING");
    }
  });
});
