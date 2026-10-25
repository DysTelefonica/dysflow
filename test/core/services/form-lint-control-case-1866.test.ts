/**
 * Issue #1866 item 2 — VBA identifiers are case-insensitive, so `Me.Descripcion`
 * binds to a control declared as `DESCRIPCION`. form-control-binding must not
 * report a case-only difference as a missing control.
 */

import { describe, expect, it } from "vitest";
import { collectControls, parseFormTxt } from "../../../src/core/services/form-ir-service.js";
import { lintFormCode } from "../../../src/core/services/form-lint.js";

function formTxtWithControl(name: string): string {
  return `Version = 21.00\nBegin Form\n    Begin TextBox\n        Name = "${name}"\n    End\nEnd\n`;
}

function bindingErrors(controlName: string, clsSource: string) {
  const ir = parseFormTxt(formTxtWithControl(controlName), { name: "Form_Test" });
  expect(collectControls(ir.root).map((c) => c.name)).toContain(controlName);
  return lintFormCode({
    formName: "Form_Test",
    formTxtPath: "forms/Form_Test.form.txt",
    ir,
    clsSource,
    clsPath: "forms/Form_Test.cls",
  }).diagnostics.filter((d) => d.rule === "form-control-binding");
}

describe("form-control-binding is case-insensitive (#1866 item 2)", () => {
  it("accepts Me.<name> when the control differs only by case", () => {
    const diagnostics = bindingErrors(
      "DESCRIPCION",
      ["Public Sub Cargar()", '    Me.Descripcion.Value = "x"', "End Sub"].join("\n"),
    );
    expect(diagnostics).toEqual([]);
  });

  it("still reports a name that does not exist under any casing", () => {
    const diagnostics = bindingErrors(
      "DESCRIPCION",
      ["Public Sub Cargar()", '    Me.Observaciones.Value = "x"', "End Sub"].join("\n"),
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain("Me.Observaciones");
  });
});
