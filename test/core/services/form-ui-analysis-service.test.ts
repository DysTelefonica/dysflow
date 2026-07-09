import { describe, expect, it } from "vitest";
import type { FormIR } from "../../../src/core/models/form-ir";
import { analyzeFormUi } from "../../../src/core/services/form-ui-analysis-service";

const IR: FormIR = {
  name: "Customer",
  kind: "Form",
  preamble: [],
  root: {
    blockType: "Form",
    entries: [
      { kind: "scalar", key: "OnOpen", value: '"[Event Procedure]"' },
      { kind: "scalar", key: "RecordSource", value: '"Customers"' },
    ],
    children: [
      {
        blockType: "",
        entries: [],
        children: [
          {
            blockType: "CommandButton",
            entries: [
              { kind: "scalar", key: "Name", value: '"cmdSave"' },
              { kind: "scalar", key: "Caption", value: '"Save"' },
              { kind: "scalar", key: "OnClick", value: '"[Event Procedure]"' },
            ],
            children: [],
          },
          {
            blockType: "TextBox",
            entries: [
              { kind: "scalar", key: "Name", value: '"txtCustomerName"' },
              { kind: "scalar", key: "ControlSource", value: '"CustomerName"' },
            ],
            children: [],
          },
        ],
      },
    ],
  },
  codeBehind: null,
};

describe("analyzeFormUi", () => {
  it("returns semantic controls, roles, events, and bindings from FormIR", () => {
    const report = analyzeFormUi(IR);

    expect(report).toMatchObject({ formName: "Customer", kind: "Form", source: "FormIR" });
    expect(report.formEvents).toEqual(["OnOpen"]);
    expect(report.controls).toEqual([
      expect.objectContaining({
        name: "cmdSave",
        type: "CommandButton",
        role: "action",
        caption: "Save",
        events: ["OnClick"],
        bindings: [],
      }),
      expect.objectContaining({
        name: "txtCustomerName",
        type: "TextBox",
        role: "input",
        controlSource: "CustomerName",
        events: [],
        bindings: ["CustomerName"],
      }),
    ]);
  });

  it("warns when no behavior-relevant controls are found", () => {
    const report = analyzeFormUi({
      ...IR,
      root: { blockType: "Form", entries: [], children: [] },
    });

    expect(report.controls).toEqual([]);
    expect(report.warnings).toContain("No named controls were found in the FormIR.");
  });

  it("ignores a named root form/report node as a control", () => {
    const report = analyzeFormUi({
      ...IR,
      name: "CustomerView",
      root: {
        blockType: "Form",
        entries: [
          { kind: "scalar", key: "Name", value: '"Form_CustomerView"' },
          { kind: "scalar", key: "OnOpen", value: '"[Event Procedure]"' },
        ],
        children: [
          {
            blockType: "TextBox",
            entries: [
              { kind: "scalar", key: "Name", value: '"txtCustomerName"' },
              { kind: "scalar", key: "ControlSource", value: '"CustomerName"' },
            ],
            children: [],
          },
        ],
      },
      codeBehind: null,
    });

    expect(report.formName).toBe("CustomerView");
    expect(report.formEvents).toEqual(["OnOpen"]);
    expect(report.controls).toEqual([
      expect.objectContaining({
        name: "txtCustomerName",
      }),
    ]);
    expect(report.controls).not.toContainEqual(
      expect.objectContaining({
        name: "Form_CustomerView",
      }),
    );
  });
});
