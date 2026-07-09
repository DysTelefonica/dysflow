import { describe, expect, it } from "vitest";
import type { FormUiAnalysisReport } from "../../../src/core/models/form-ui-builder";
import { buildFormUiBehaviorMap } from "../../../src/core/services/form-ui-behavior-map-service";

const analysis: FormUiAnalysisReport = {
  formName: "Customer",
  kind: "Form",
  source: "FormIR",
  formEvents: ["OnOpen"],
  warnings: [],
  controls: [
    {
      name: "cmdSave",
      type: "CommandButton",
      role: "action",
      caption: "Save",
      events: ["OnClick"],
      bindings: [],
    },
  ],
};

describe("buildFormUiBehaviorMap", () => {
  it("merges control events with caller-supplied CodeGraph-VBA evidence", () => {
    const map = buildFormUiBehaviorMap(analysis, [
      {
        handler: "cmdSave_Click",
        callPath: ["cmdSave_Click", "SaveCustomer"],
        tables: ["Customers"],
      },
    ]);

    expect(map.controls).toEqual([
      expect.objectContaining({
        name: "cmdSave",
        events: ["OnClick"],
        codegraphEvidence: [
          expect.objectContaining({
            handler: "cmdSave_Click",
            callPath: ["cmdSave_Click", "SaveCustomer"],
          }),
        ],
      }),
    ]);
    expect(map.unmappedEvidence).toEqual([]);
  });

  it("keeps unmatched evidence explicit instead of inventing control links", () => {
    const map = buildFormUiBehaviorMap(analysis, [
      { handler: "Form_Open", callPath: ["Form_Open", "LoadCustomer"] },
    ]);

    expect(map.controls[0]?.codegraphEvidence).toEqual([]);
    expect(map.unmappedEvidence).toEqual([
      expect.objectContaining({ handler: "Form_Open", callPath: ["Form_Open", "LoadCustomer"] }),
    ]);
  });
});
