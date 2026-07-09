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

describe("form UI design plan service", () => {
  it("generates a plan whose operations reference mapped behavior", () => {
    const plan = generateFormUiDesignPlan(map, {
      operations: [
        {
          kind: "rename-caption",
          target: "cmdSave",
          intent: "Clarify save action",
          params: { caption: "Save customer" },
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

  it("applies plans as a dry-run by default and preserves mapped controls", () => {
    const plan: FormUiDesignPlan = generateFormUiDesignPlan(map, {
      operations: [
        {
          kind: "rename-caption",
          target: "cmdSave",
          intent: "Clarify save action",
          params: { caption: "Save customer" },
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

  it("reports drift when an approved plan no longer aligns with the source contract", () => {
    const plan = generateFormUiDesignPlan(map, {
      operations: [
        {
          kind: "rename-caption",
          target: "cmdSave",
          intent: "Clarify save action",
          params: { caption: "Save customer" },
        },
      ],
    });
    const drifted: FormUiBehaviorMap = { ...map, controls: [] };

    const findings = verifyPlanAlignment(plan, drifted);

    expect(findings).toEqual([
      expect.objectContaining({ code: "FORM_UI_PLAN_TARGET_MISSING", controlName: "cmdSave" }),
    ]);
  });
});
