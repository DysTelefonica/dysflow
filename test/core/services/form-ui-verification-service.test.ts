import { describe, expect, it } from "vitest";
import type { FormUiBehaviorMap } from "../../../src/core/models/form-ui-builder";
import { verifyFormUi } from "../../../src/core/services/form-ui-verification-service";

const source: FormUiBehaviorMap = {
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

describe("verifyFormUi", () => {
  it("passes when applied output preserves mapped controls and handlers", () => {
    const report = verifyFormUi(source, source);

    expect(report).toMatchObject({ ok: true, formName: "Customer", findings: [] });
    expect(report.checkedControls).toEqual(["cmdSave"]);
  });

  it("fails with actionable drift when a mapped handler is removed", () => {
    const commandButton = source.controls[0];
    const report = verifyFormUi(source, {
      ...source,
      controls: commandButton ? [{ ...commandButton, events: [] }] : [],
    });

    expect(report.ok).toBe(false);
    expect(report.findings).toEqual([
      expect.objectContaining({
        code: "FORM_UI_EVENT_DRIFT",
        severity: "error",
        controlName: "cmdSave",
      }),
    ]);
  });
});
