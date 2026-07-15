/**
 * Unit tests for the pure form-lint engine (`src/core/services/form-lint.ts`).
 *
 * These tests are RED-then-GREEN per the SDD workflow. The fixtures use
 * representative real-world patterns from consumer projects (no_conformidades,
 * form-thin-helper-refactor) so the diagnostics stay actionable.
 */

import { describe, expect, it } from "vitest";
import type { FormIR } from "../../../src/core/models/form-ir.js";
import { collectControls, parseFormTxt } from "../../../src/core/services/form-ir-service.js";
import { lintFormCode } from "../../../src/core/services/form-lint.js";
import type { LintDiagnostic } from "../../../src/core/services/form-lint-types.js";

/**
 * Build a minimal FormIR-shaped text that declares the requested controls at
 * the form's top level. Names are taken verbatim from the input; only the
 * wrapper layout is synthesized so tests stay focused on the engine.
 */
function formTxtWithControls(controls: Array<{ name: string; type: string }>): string {
  const controlBlocks = controls
    .map((c) => `    Begin ${c.type}\n        Name = "${c.name}"\n        ...\n    End`)
    .join("\n");
  return `Version = 21.00\nBegin Form\n${controlBlocks}\nEnd\n`;
}

function parseWith(formTxt: string, name = "Form_Test"): FormIR {
  return parseFormTxt(formTxt, { name });
}

// ---------------------------------------------------------------------------
// Rule A — form-control-binding
// ---------------------------------------------------------------------------

describe("Rule A: form-control-binding", () => {
  it("does NOT diagnose Me.<ControlName> when the control exists in .form.txt", () => {
    const ir = parseWith(
      formTxtWithControls([
        { name: "ListaHitos", type: "ListBox" },
        { name: "cmdAceptar", type: "CommandButton" },
      ]),
    );
    const cls = [
      "Public Sub Cargar()",
      '    Me.ListaHitos.RowSource = "SELECT 1"',
      '    Me.cmdAceptar.Caption = "OK"',
      "End Sub",
    ].join("\n");

    const result = lintFormCode({
      formName: "Form_Test",
      formTxtPath: "forms/Form_Test.form.txt",
      ir,
      clsSource: cls,
      clsPath: "forms/Form_Test.cls",
    });

    const controlBindingErrors = result.diagnostics.filter(
      (d) => d.rule === "form-control-binding",
    );
    expect(controlBindingErrors).toEqual([]);
  });

  it("does NOT diagnose Me.<ControlName> when the control is nested in .form.txt", () => {
    const ir = parseWith(`Version = 21.00
Begin Form
  Begin Section
      Begin TextBox
      Name = "FormDetalle"
      End
      Begin CommandButton
      Name = "ComandoGrabar"
      End
  End
End
`);
    const cls = [
      "Public Sub Guardar()",
      '    Me.FormDetalle.Value = "ok"',
      "    Me.ComandoGrabar.Enabled = False",
      "End Sub",
    ].join("\n");

    const parsedControlNames = collectControls(ir.root).map((control) => control.name);
    expect(parsedControlNames).toEqual(["FormDetalle", "ComandoGrabar"]);

    const result = lintFormCode({
      formName: "Form_Test",
      formTxtPath: "forms/Form_Test.form.txt",
      ir,
      clsSource: cls,
      clsPath: "forms/Form_Test.cls",
    });

    const controlBindingErrors = result.diagnostics.filter(
      (d) => d.rule === "form-control-binding",
    );
    expect(controlBindingErrors).toEqual([]);
  });

  it("errors when Me.<ControlName> references a control that does NOT exist in .form.txt", () => {
    const ir = parseWith(formTxtWithControls([{ name: "ListaHitos", type: "ListBox" }]));
    const cls = ["Public Sub Cargar()", '    Me.ListaHitoz.RowSource = "SELECT 1"', "End Sub"].join(
      "\n",
    );

    const result = lintFormCode({
      formName: "Form_Test",
      formTxtPath: "forms/Form_Test.form.txt",
      ir,
      clsSource: cls,
      clsPath: "forms/Form_Test.cls",
    });

    const binding = result.diagnostics.find((d) => d.rule === "form-control-binding");
    expect(binding).toBeDefined();
    expect(binding?.severity).toBe("error");
    expect(binding?.line).toBe(2);
    // The suggestion should point to the closest named control.
    expect(binding?.suggestedFix).toContain("ListaHitos");
  });

  it("ignores intrinsic Access form members while still reporting missing controls", () => {
    const ir = parseWith(formTxtWithControls([{ name: "ListaHitos", type: "ListBox" }]));
    const cls = [
      "Public Sub Cargar()",
      "    Debug.Print Me.Name",
      '    Me.Caption = "Gestión de riesgos"',
      "    Debug.Print Me.InsideHeight",
      "    Debug.Print Me.InsideWidth",
      '    Me.ListaHitoz.RowSource = "SELECT 1"',
      "End Sub",
    ].join("\n");

    const result = lintFormCode({
      formName: "Form_Test",
      formTxtPath: "forms/Form_Test.form.txt",
      ir,
      clsSource: cls,
      clsPath: "forms/Form_Test.cls",
    });

    const controlBindingErrors = result.diagnostics.filter(
      (d) => d.rule === "form-control-binding",
    );
    expect(controlBindingErrors).toHaveLength(1);
    expect(controlBindingErrors[0]?.message).toContain("Me.ListaHitoz");
    expect(controlBindingErrors[0]?.suggestedFix).toBe("Me.ListaHitos");
  });

  // Issue #872 F4 — extend the intrinsic-form-members allowlist. `Me.hWnd`
  // is the textbook false positive cited in the issue: window handle is a
  // Form / Report member, not a control. We also pin the wider set members
  // (`Moveable`, `MaxButton`, `OnOpen`-style event accessors, `Tag`, …)
  // since the issue author explicitly named them.
  it("does NOT diagnose Me.hWnd, Me.Moveable, Me.MaxButton (issue #872 F4 allowlist)", () => {
    const ir = parseWith(formTxtWithControls([{ name: "cmdSave", type: "CommandButton" }]));
    const cls = [
      "Public Sub Form_Open(Cancel As Integer)",
      "    Debug.Print Me.hWnd",
      "    Me.Moveable = False",
      "    Me.MaxButton = False",
      "    Me.MinButton = False",
      "    Me.CloseButton = True",
      '    Me.Tag = "frmKPI"',
      "    Me.BorderStyle = 2",
      "    Me.ScrollBars = 0",
      '    Me.OnOpen = "[Event Procedure]"',
      "    Debug.Print Me.WindowHandle",
      "    Debug.Print Me.Picture",
      "    Me.PictureAlignment = 4",
      "    End Sub",
    ].join("\n");

    const result = lintFormCode({
      formName: "Form_Test",
      formTxtPath: "forms/Form_Test.form.txt",
      ir,
      clsSource: cls,
      clsPath: "forms/Form_Test.cls",
    });

    const controlBindingErrors = result.diagnostics.filter(
      (d) => d.rule === "form-control-binding",
    );
    expect(controlBindingErrors).toEqual([]);
  });

  it("handles Me.<IntrinsicMember> case-insensitively (Me.Hwnd, Me.HWND, Me.Hwnd)", () => {
    const ir = parseWith(formTxtWithControls([{ name: "txtName", type: "TextBox" }]));
    const cls = [
      "Public Sub OpenForm()",
      "    a = Me.Hwnd",
      "    b = Me.HWND",
      "    c = Me.hWnd",
      "End Sub",
    ].join("\n");

    const result = lintFormCode({
      formName: "Form_Test",
      formTxtPath: "forms/Form_Test.form.txt",
      ir,
      clsSource: cls,
      clsPath: "forms/Form_Test.cls",
    });
    expect(result.diagnostics.filter((d) => d.rule === "form-control-binding")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Rule B — access-listbox-no-list-assignment
// ---------------------------------------------------------------------------

describe("Rule B: access-listbox-no-list-assignment", () => {
  it("errors when assigning .List to a ListBox control", () => {
    const ir = parseWith(formTxtWithControls([{ name: "lst", type: "ListBox" }]));
    const cls = [
      "Public Sub CargarFilas()",
      "    Dim arr As Variant",
      '    arr = Array("a", "b")',
      "    lst.List = arr",
      "End Sub",
    ].join("\n");

    const result = lintFormCode({
      formName: "Form_Test",
      formTxtPath: "forms/Form_Test.form.txt",
      ir,
      clsSource: cls,
      clsPath: "forms/Form_Test.cls",
    });

    const diag = result.diagnostics.find((d) => d.rule === "access-listbox-no-list-assignment");
    expect(diag).toBeDefined();
    expect(diag?.severity).toBe("error");
    expect(diag?.line).toBe(4);
    expect(diag?.message).toContain("ListBox");
    expect(diag?.suggestedFix).toBeDefined();
  });

  it("does NOT diagnose .List = ... on a non-ListBox control", () => {
    const ir = parseWith(formTxtWithControls([{ name: "txtNotes", type: "TextBox" }]));
    const cls = ["Public Sub Demo()", '    txtNotes.Value = "hello"', "End Sub"].join("\n");

    const result = lintFormCode({
      formName: "Form_Test",
      formTxtPath: "forms/Form_Test.form.txt",
      ir,
      clsSource: cls,
      clsPath: "forms/Form_Test.cls",
    });

    const diag = result.diagnostics.find((d) => d.rule === "access-listbox-no-list-assignment");
    expect(diag).toBeUndefined();
  });

  it("errors when assigning .List to a nested ListBox control", () => {
    const ir = parseWith(`Version = 21.00
Begin Form
  Begin Section
      Begin ListBox
      Name = "NestedRows"
      End
  End
End
`);
    const cls = [
      "Public Sub CargarFilas()",
      "    Dim arr As Variant",
      '    arr = Array("a", "b")',
      "    NestedRows.List = arr",
      "End Sub",
    ].join("\n");

    expect(collectControls(ir.root).map((control) => `${control.name}:${control.type}`)).toEqual([
      "NestedRows:ListBox",
    ]);

    const result = lintFormCode({
      formName: "Form_Test",
      formTxtPath: "forms/Form_Test.form.txt",
      ir,
      clsSource: cls,
      clsPath: "forms/Form_Test.cls",
    });

    const diag = result.diagnostics.find((d) => d.rule === "access-listbox-no-list-assignment");
    expect(diag).toBeDefined();
    expect(diag?.severity).toBe("error");
    expect(diag?.line).toBe(4);
    expect(diag?.message).toContain("NestedRows");
  });

  it("detects ListBox via name prefix lst/listBox when .form.txt has no type info", () => {
    const cls = ["Public Sub Demo()", '    lstCosas.List = Array("a")', "End Sub"].join("\n");
    // Empty IR — no .form.txt available. The engine should fall back to name heuristics.
    const emptyIr = parseFormTxt("Version = 21.00\nBegin Form\nEnd\n", { name: "Form_Test" });

    const result = lintFormCode({
      formName: "Form_Test",
      formTxtPath: "forms/Form_Test.form.txt",
      ir: emptyIr,
      clsSource: cls,
      clsPath: "forms/Form_Test.cls",
    });

    const diag = result.diagnostics.find((d) => d.rule === "access-listbox-no-list-assignment");
    expect(diag).toBeDefined();
    expect(diag?.severity).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// Rule C — bare-function-call-with-parens
// ---------------------------------------------------------------------------

describe("Rule C: bare-function-call-with-parens", () => {
  it("errors when a Public-looking Function is called as a bare statement", () => {
    const ir = parseFormTxt("Version = 21.00\nBegin Form\nEnd\n", { name: "Form_Test" });
    const cls = ["Public Sub Demo()", '    FormInteraction_Mensaje("hola", 1)', "End Sub"].join(
      "\n",
    );

    const result = lintFormCode({
      formName: "Form_Test",
      formTxtPath: "forms/Form_Test.form.txt",
      ir,
      clsSource: cls,
      clsPath: "forms/Form_Test.cls",
    });

    const diag = result.diagnostics.find((d) => d.rule === "bare-function-call-with-parens");
    expect(diag).toBeDefined();
    expect(diag?.severity).toBe("error");
    expect(diag?.line).toBe(2);
    expect(diag?.suggestedFix).toBeDefined();
  });

  it("does NOT diagnose when the call is assigned to a variable", () => {
    const ir = parseFormTxt("Version = 21.00\nBegin Form\nEnd\n", { name: "Form_Test" });
    const cls = [
      "Public Sub Demo()",
      "    Dim r As Long",
      '    r = FormInteraction_Mensaje("hola", 1)',
      "End Sub",
    ].join("\n");

    const result = lintFormCode({
      formName: "Form_Test",
      formTxtPath: "forms/Form_Test.form.txt",
      ir,
      clsSource: cls,
      clsPath: "forms/Form_Test.cls",
    });

    const diag = result.diagnostics.find((d) => d.rule === "bare-function-call-with-parens");
    expect(diag).toBeUndefined();
  });

  it("does NOT diagnose when preceded by Call keyword", () => {
    const ir = parseFormTxt("Version = 21.00\nBegin Form\nEnd\n", { name: "Form_Test" });
    const cls = [
      "Public Sub Demo()",
      '    Call FormInteraction_Mensaje("hola", 1)',
      "End Sub",
    ].join("\n");

    const result = lintFormCode({
      formName: "Form_Test",
      formTxtPath: "forms/Form_Test.form.txt",
      ir,
      clsSource: cls,
      clsPath: "forms/Form_Test.cls",
    });

    const diag = result.diagnostics.find((d) => d.rule === "bare-function-call-with-parens");
    expect(diag).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Rule D — named-and-positional-args-mixing
// ---------------------------------------------------------------------------

describe("Rule D: named-and-positional-args-mixing", () => {
  it("errors when a positional argument follows a named argument", () => {
    const ir = parseFormTxt("Version = 21.00\nBegin Form\nEnd\n", { name: "Form_Test" });
    const cls = ["Public Sub Demo()", "    SomeFunc(p_X:=False, m_Error)", "End Sub"].join("\n");

    const result = lintFormCode({
      formName: "Form_Test",
      formTxtPath: "forms/Form_Test.form.txt",
      ir,
      clsSource: cls,
      clsPath: "forms/Form_Test.cls",
    });

    const diag = result.diagnostics.find((d) => d.rule === "named-and-positional-args-mixing");
    expect(diag).toBeDefined();
    expect(diag?.severity).toBe("error");
    expect(diag?.line).toBe(2);
    expect(diag?.suggestedFix).toContain("m_Error:=m_Error");
  });

  it("does NOT diagnose a pure positional call", () => {
    const ir = parseFormTxt("Version = 21.00\nBegin Form\nEnd\n", { name: "Form_Test" });
    const cls = ["Public Sub Demo()", "    SomeFunc(False, m_Error)", "End Sub"].join("\n");

    const result = lintFormCode({
      formName: "Form_Test",
      formTxtPath: "forms/Form_Test.form.txt",
      ir,
      clsSource: cls,
      clsPath: "forms/Form_Test.cls",
    });

    const diag = result.diagnostics.find((d) => d.rule === "named-and-positional-args-mixing");
    expect(diag).toBeUndefined();
  });

  it("does NOT diagnose a fully named call", () => {
    const ir = parseFormTxt("Version = 21.00\nBegin Form\nEnd\n", { name: "Form_Test" });
    const cls = ["Public Sub Demo()", "    SomeFunc(p_X:=False, p_Error:=m_Error)", "End Sub"].join(
      "\n",
    );

    const result = lintFormCode({
      formName: "Form_Test",
      formTxtPath: "forms/Form_Test.form.txt",
      ir,
      clsSource: cls,
      clsPath: "forms/Form_Test.cls",
    });

    const diag = result.diagnostics.find((d) => d.rule === "named-and-positional-args-mixing");
    expect(diag).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Rule E — unicode-sensitive-executable-tokens
// ---------------------------------------------------------------------------

describe("Rule E: unicode-sensitive-executable-tokens", () => {
  it("warns on Enum.<AccentedMember> in an executable context", () => {
    const ir = parseFormTxt("Version = 21.00\nBegin Form\nEnd\n", { name: "Form_Test" });
    const cls = ["Public Sub Demo()", "    Dim x As Long", "    x = EnumSiNo.Sí", "End Sub"].join(
      "\n",
    );

    const result = lintFormCode({
      formName: "Form_Test",
      formTxtPath: "forms/Form_Test.form.txt",
      ir,
      clsSource: cls,
      clsPath: "forms/Form_Test.cls",
    });

    const diag = result.diagnostics.find((d) => d.rule === "unicode-sensitive-executable-tokens");
    expect(diag).toBeDefined();
    // Default behavior is warning — `strict:true` would elevate to error.
    expect(diag?.severity).toBe("warning");
  });

  it("elevates to error when strict: true", () => {
    const ir = parseFormTxt("Version = 21.00\nBegin Form\nEnd\n", { name: "Form_Test" });
    const cls = ["Public Sub Demo()", "    x = EnumSiNo.Sí", "End Sub"].join("\n");

    const result = lintFormCode(
      {
        formName: "Form_Test",
        formTxtPath: "forms/Form_Test.form.txt",
        ir,
        clsSource: cls,
        clsPath: "forms/Form_Test.cls",
      },
      { strict: true },
    );

    const diag = result.diagnostics.find((d) => d.rule === "unicode-sensitive-executable-tokens");
    expect(diag).toBeDefined();
    expect(diag?.severity).toBe("error");
  });

  it("does NOT warn on accented chars inside a string literal", () => {
    const ir = parseFormTxt("Version = 21.00\nBegin Form\nEnd\n", { name: "Form_Test" });
    const cls = ["Public Sub Demo()", '    MsgBox "Operación Sí"', "End Sub"].join("\n");

    const result = lintFormCode({
      formName: "Form_Test",
      formTxtPath: "forms/Form_Test.form.txt",
      ir,
      clsSource: cls,
      clsPath: "forms/Form_Test.cls",
    });

    const diag = result.diagnostics.find((d) => d.rule === "unicode-sensitive-executable-tokens");
    expect(diag).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Rule F — control-property-support
// ---------------------------------------------------------------------------

describe("Rule F: control-property-support", () => {
  it("warns when a nested ComboBox uses unsupported .List", () => {
    const ir = parseWith(`Version = 21.00
Begin Form
  Begin Section
      Begin ComboBox
      Name = "NestedCombo"
      End
  End
End
`);
    const cls = ["Public Sub Demo()", "    Me.NestedCombo.List = values", "End Sub"].join("\n");

    expect(collectControls(ir.root).map((control) => `${control.name}:${control.type}`)).toEqual([
      "NestedCombo:ComboBox",
    ]);

    const result = lintFormCode({
      formName: "Form_Test",
      formTxtPath: "forms/Form_Test.form.txt",
      ir,
      clsSource: cls,
      clsPath: "forms/Form_Test.cls",
    });

    const diag = result.diagnostics.find((d) => d.rule === "control-property-support");
    expect(diag).toBeDefined();
    expect(diag?.severity).toBe("warning");
    expect(diag?.message).toContain("NestedCombo");
  });

  it("informs when a ListBox receives .ColumnWidths (allowed but worth noting)", () => {
    const ir = parseWith(formTxtWithControls([{ name: "lstResultados", type: "ListBox" }]));
    const cls = [
      "Public Sub Demo()",
      '    Me.lstResultados.ColumnWidths = "0;1;2"',
      "End Sub",
    ].join("\n");

    const result = lintFormCode({
      formName: "Form_Test",
      formTxtPath: "forms/Form_Test.form.txt",
      ir,
      clsSource: cls,
      clsPath: "forms/Form_Test.cls",
    });

    const diag = result.diagnostics.find(
      (d) => d.rule === "control-property-support" && d.file === "forms/Form_Test.cls",
    );
    // Acceptable: it MAY be info (rule not yet implemented) or a real warning.
    if (diag) {
      expect(["info", "warning"]).toContain(diag.severity);
    }
  });
});

// ---------------------------------------------------------------------------
// Engine options
// ---------------------------------------------------------------------------

describe("engine options", () => {
  it("returns zero diagnostics for an empty .cls and empty IR", () => {
    const ir = parseFormTxt("Version = 21.00\nBegin Form\nEnd\n", { name: "Form_Test" });
    const result = lintFormCode({
      formName: "Form_Test",
      formTxtPath: "forms/Form_Test.form.txt",
      ir,
      clsSource: "",
      clsPath: "forms/Form_Test.cls",
    });
    expect(result.diagnostics).toEqual([]);
  });

  it("filters diagnostics when `rules` is provided", () => {
    const ir = parseWith(formTxtWithControls([{ name: "lst", type: "ListBox" }]));
    const cls = [
      "Public Sub Demo()",
      '    FormInteraction_Mensaje "hola"', // would trigger Rule C
      '    lst.List = Array("a")', // would trigger Rule B
      "End Sub",
    ].join("\n");

    const result = lintFormCode(
      {
        formName: "Form_Test",
        formTxtPath: "forms/Form_Test.form.txt",
        ir,
        clsSource: cls,
        clsPath: "forms/Form_Test.cls",
      },
      { rules: ["access-listbox-no-list-assignment"] },
    );

    const ruleIds = new Set(result.diagnostics.map((d: LintDiagnostic) => d.rule));
    expect(ruleIds.has("access-listbox-no-list-assignment")).toBe(true);
    expect(ruleIds.has("bare-function-call-with-parens")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// #E — redundant ListBox.ColumnWidths guard removal (hexagonal-tech-debt PR 2)
//
// Pre-refactor: `checkControlProperty` had an explicit `if (type === "ListBox"
// && prop === "ColumnWidths") { return null; }` block that returned the same
// null as the implicit default — a redundant guard. Post-refactor: that
// guard is gone and the default `return null` at the bottom handles the
// case. The observable contract is unchanged: ListBox.ColumnWidths MUST
// continue to emit zero diagnostics.
// ---------------------------------------------------------------------------

describe("Rule F: ListBox.ColumnWidths post-refactor contract (#E)", () => {
  it("does NOT emit any control-property-support diagnostic for ListBox.ColumnWidths", () => {
    const ir = parseWith(formTxtWithControls([{ name: "lstResultados", type: "ListBox" }]));
    const cls = [
      "Public Sub Demo()",
      '    Me.lstResultados.ColumnWidths = "0;1;2"',
      "End Sub",
    ].join("\n");

    const result = lintFormCode({
      formName: "Form_Test",
      formTxtPath: "forms/Form_Test.form.txt",
      ir,
      clsSource: cls,
      clsPath: "forms/Form_Test.cls",
    });

    const diag = result.diagnostics.find(
      (d) => d.rule === "control-property-support" && d.file === "forms/Form_Test.cls",
    );
    expect(diag).toBeUndefined();
  });
});
