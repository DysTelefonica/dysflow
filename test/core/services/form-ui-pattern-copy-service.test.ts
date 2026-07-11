import { describe, expect, it } from "vitest";
import type { FormUiBehaviorMap } from "../../../src/core/models/form-ui-builder";
import { copyFormUiPattern } from "../../../src/core/services/form-ui-pattern-copy-service";

const targetMap: FormUiBehaviorMap = {
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
  ],
};

describe("copyFormUiPattern", () => {
  it("records reference pattern intent as a traceable plan input", () => {
    const plan = copyFormUiPattern(targetMap, {
      sourceForm: "Order",
      intent: "Use footer action grouping",
      mappedControls: { cmdCommit: "cmdSave" },
    });

    expect(plan.referencePattern).toEqual({
      sourceForm: "Order",
      intent: "Use footer action grouping",
      mappedControls: { cmdCommit: "cmdSave" },
    });
    expect(plan.operations).toEqual([
      expect.objectContaining({
        kind: "note",
        target: "cmdSave",
        intent: "Use footer action grouping",
      }),
    ]);
  });

  it("does not erase the target behavior map when copying a pattern", () => {
    const plan = copyFormUiPattern(targetMap, {
      sourceForm: "Order",
      intent: "Use footer action grouping",
      mappedControls: { cmdCommit: "cmdSave" },
    });

    expect(plan.sourceContract.controls[0]?.events).toEqual(["OnClick"]);
  });
});
