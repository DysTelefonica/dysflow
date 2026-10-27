import { describe, expect, it } from "vitest";
import { addControl, parseFormTxt } from "../../../src/core/services/form-ir-service.js";

// Issue #1868 — add-control (form_add_control, apply_form_design_plan) wrote
// every value that looked like a token raw: `Caption =7400` lost its quotes,
// and `Visible =true` reached LoadFromText, which rejected it with
// "Esperado: Valor" in a real Access run.

const FORM = [
  "Version =21",
  "Begin Form",
  "    AutoResize = NotDefault",
  "    Begin Section",
  '        Name ="Detalle"',
  "    End",
  "End",
  "CodeBehindForm",
  "",
].join("\r\n");

function add(properties: Record<string, string | number | boolean>) {
  return addControl(parseFormTxt(FORM), {
    targetSectionName: "Detalle",
    control: { name: "lblNew", type: "Label", properties },
  });
}

describe("addControl writes each value by its property type (#1868)", () => {
  it("keeps a numeric-looking caption quoted", () => {
    expect(add({ Caption: "7400" }).source).toMatch(/Caption ="7400"/);
  });

  it("writes geometry passed as strings raw", () => {
    const source = add({ Left: "300", Width: "2000" }).source;

    expect(source).toMatch(/Left =300\b/);
    expect(source).toMatch(/Width =2000\b/);
  });

  it("rejects a bare true for a toggle property", () => {
    expect(() => add({ Visible: "true" })).toThrow(
      expect.objectContaining({ code: "FORM_PROPERTY_VALUE_INVALID" }),
    );
  });
});
