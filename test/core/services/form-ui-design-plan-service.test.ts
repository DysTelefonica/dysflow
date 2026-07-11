import { describe, expect, it } from "vitest";
import type { FormUiBehaviorMap, FormUiDesignPlan } from "../../../src/core/models/form-ui-builder";
import {
  applyFormUiDesignPlan,
  generateFormUiDesignPlan,
  verifyPlanAlignment,
} from "../../../src/core/services/form-ui-design-plan-service";

const map: FormUiBehaviorMap = {
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
      codegraphEvidence: [
        { handler: "cmdSave_Click", callPath: ["cmdSave_Click", "SaveCustomer"] },
      ],
    },
  ],
};
const sourceControl = map.controls[0] as FormUiBehaviorMap["controls"][number];

const op = (kind: FormUiDesignPlan["operations"][number]["kind"], target: string, params = {}) => ({
  kind,
  target,
  params,
  intent: kind,
});
describe("form UI design plan service", () => {
  it("generates a plan whose operations reference mapped behavior", () => {
    const plan = generateFormUiDesignPlan(map, {
      operations: [
        {
          kind: "set-property",
          target: "cmdSave",
          intent: "Clarify save action",
          params: { property: "Caption", value: "Save customer" },
        },
      ],
    });

    expect(plan.operations).toEqual([
      expect.objectContaining({
        target: "cmdSave",
        preserves: ["OnClick", "cmdSave_Click"],
      }),
    ]);
    expect(plan.warnings).toEqual([]);
  });

  it("rejects operations that target controls outside the behavior map", () => {
    const plan = generateFormUiDesignPlan(map, {
      operations: [
        { kind: "move-control", target: "cmdDelete", intent: "Move delete", params: { left: 10 } },
      ],
    });

    expect(plan.operations).toEqual([]);
    expect(plan.warnings).toContain(
      'Operation target "cmdDelete" is not present in the behavior map.',
    );
  });

  it("retains an advisory note when its target is absent", () => {
    const plan = generateFormUiDesignPlan(map, {
      operations: [op("note", "missingControl")],
    });
    const result = applyFormUiDesignPlan(plan, { apply: true });

    expect(plan.operations).toHaveLength(1);
    expect(plan.warnings).toEqual([]);
    expect(result).toMatchObject({
      operationsApplied: plan.operations,
      advisories: ["note"],
      filesystemApplied: false,
      importGate: "not-run",
    });
    expect(result.appliedContract).toEqual(plan.sourceContract);
    expect(verifyPlanAlignment(plan, result.appliedContract)).toEqual([]);
  });

  it("applies plans as a dry-run by default and preserves mapped controls", () => {
    const plan: FormUiDesignPlan = generateFormUiDesignPlan(map, {
      operations: [
        {
          kind: "set-property",
          target: "cmdSave",
          intent: "Clarify save action",
          params: { property: "Caption", value: "Save customer" },
        },
      ],
    });

    const result = applyFormUiDesignPlan(plan, { apply: false });

    expect(result).toMatchObject({
      mode: "dry-run",
      formName: "Customer",
      preservedControls: ["cmdSave"],
    });
    expect(result.operationsApplied).toHaveLength(1);
  });

  it("generates, applies, derives, and verifies all six operation kinds", () => {
    const plan = generateFormUiDesignPlan(
      {
        ...map,
        controls: [...map.controls, { ...sourceControl, name: "lblDelete", type: "Label" }],
      },
      {
        operations: [
          op("add-control", "txtName", { type: "TextBox", properties: { Left: 100 } }),
          op("move-control", "cmdSave", { left: 30, top: 40 }),
          op("set-property", "cmdSave", { property: "Caption", value: "Commit" }),
          op("rename-control", "cmdSave", { newName: "cmdCommit" }),
          op("delete-control", "lblDelete"),
          op("note", "cmdSave"),
        ],
      },
    );
    const application = applyFormUiDesignPlan(plan, { apply: true });
    // biome-ignore format: Keep the independent literal contract within the review budget.
    const expected: FormUiBehaviorMap = { formName: "Customer", formEvents: [], unmappedEvidence: [], warnings: [], controls: [
      { name: "cmdCommit", type: "CommandButton", role: "action", events: ["OnClick"], bindings: [], codegraphEvidence: [{ handler: "cmdSave_Click", callPath: ["cmdSave_Click", "SaveCustomer"] }], properties: { Left: "30", Top: "40", Caption: "Commit" } },
      { name: "txtName", type: "TextBox", role: "unknown", events: [], bindings: [], codegraphEvidence: [], properties: { Left: "100" } },
    ] };
    expect([application.advisories, application.appliedContract]).toEqual([["note"], expected]);
    expect(verifyPlanAlignment(plan, expected)).toEqual([]);
  });

  it.each([
    ["rename", op("rename-control", "cmdSave", { newName: "cmdCommit" }), map],
  ])("finds a wrong %s result", (_label, operation, wrong) => {
    const plan = generateFormUiDesignPlan(wrong, { operations: [operation] });
    expect(verifyPlanAlignment(plan, wrong)).toHaveLength(1);
  });

  it("fails closed for an operation kind deserialized outside the supported union", () => {
    const unsupported = {
      kind: "group-controls",
      target: "cmdSave",
      intent: "Legacy operation",
      params: {},
      preserves: [],
    } as unknown as FormUiDesignPlan["operations"][number];

    expect(() =>
      applyFormUiDesignPlan({
        ...generateFormUiDesignPlan(map, { operations: [] }),
        operations: [unsupported],
      }),
    ).toThrowError(expect.objectContaining({ code: "FORM_UI_UNSUPPORTED_OPERATION" }));
  });

  it("reports drift when an approved plan no longer aligns with the source contract", () => {
    const plan = generateFormUiDesignPlan(map, {
      operations: [
        {
          kind: "set-property",
          target: "cmdSave",
          intent: "Clarify save action",
          params: { property: "Caption", value: "Save customer" },
        },
      ],
    });
    const findings = verifyPlanAlignment(plan, { ...map, controls: [] });

    expect(findings).toEqual([
      expect.objectContaining({ code: "FORM_UI_PLAN_TARGET_MISSING", controlName: "cmdSave" }),
    ]);
  });
});
