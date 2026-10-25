import { describe, expect, it } from "vitest";
import { parseFormTxt } from "../../../src/core/services/form-ir-service.js";
import { lintFormCode } from "../../../src/core/services/form-lint.js";
import { ALL_LINT_RULE_IDS } from "../../../src/core/services/form-lint-types.js";

// Issue #1865 — lint_form_code reports the same CodeBehindForm divergence that
// import_modules refuses, so an agent sees it before importing.

const CLS = [
  'Attribute VB_Name = "Form_Sana"',
  "Option Compare Database",
  "Private Sub Form_Load()",
  '    Debug.Print "cls"',
  "End Sub",
  "",
].join("\r\n");

function formWithCodeBehind(code: string): string {
  return [
    "Version =21",
    "Begin Form",
    "    AutoResize = NotDefault",
    "End",
    "CodeBehindForm",
    code,
  ].join("\r\n");
}

function lintWith(codeBehind: string) {
  const ir = parseFormTxt(formWithCodeBehind(codeBehind));
  return lintFormCode(
    {
      formName: "Form_Sana",
      formTxtPath: "forms/Form_Sana.form.txt",
      ir,
      clsSource: CLS,
      clsPath: "forms/Sana.cls",
    },
    { rules: ["code-behind-divergence"] },
  );
}

describe("lint_form_code — code-behind-divergence (#1865)", () => {
  it("is one of the default lint rules", () => {
    expect(ALL_LINT_RULE_IDS).toContain("code-behind-divergence");
  });

  it("flags a functional line that exists only in the CodeBehindForm copy", () => {
    const result = lintWith(
      CLS.replace('    Debug.Print "cls"', '    Debug.Print "edited only in the form"'),
    );

    const hits = result.diagnostics.filter((d) => d.rule === "code-behind-divergence");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.file).toBe("forms/Sana.cls");
    expect(hits[0]?.message).toContain("edited only in the form");
  });

  it("reports nothing for a case-only difference", () => {
    const result = lintWith(CLS.replace("Private Sub Form_Load()", "PRIVATE SUB FORM_LOAD()"));
    expect(result.diagnostics.filter((d) => d.rule === "code-behind-divergence")).toEqual([]);
  });
});
