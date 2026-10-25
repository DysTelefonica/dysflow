import { describe, expect, it } from "vitest";
import { compareFormCodeBehind } from "../../../src/core/services/form-code-behind-guard.js";

// Issue #1865 — a form's code lives in forms/<Name>.cls and is copied into the
// CodeBehindForm section of forms/Form_<Name>.form.txt. The guard compares the
// two copies with the verify_code classifier, so case, whitespace and encoding
// noise never count as a divergence.

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

describe("compareFormCodeBehind (#1865)", () => {
  it("reports a divergence when the form copy has a functional line the .cls does not", () => {
    const formText = formWithCodeBehind(
      [
        'Attribute VB_Name = "Form_Sana"',
        "Option Compare Database",
        "Private Sub Form_Load()",
        '    Debug.Print "edited only in the form"',
        "End Sub",
        "",
      ].join("\r\n"),
    );

    const result = compareFormCodeBehind({ formText, clsText: CLS });

    expect(result.diverges).toBe(true);
    if (!result.diverges) throw new Error("expected a divergence");
    expect(result.firstDifferences.join("\n")).toContain("edited only in the form");
  });

  it("ignores case-only differences in the code-behind copy", () => {
    const formText = formWithCodeBehind(CLS.replace("Private Sub Form_Load()", "PRIVATE SUB FORM_LOAD()"));
    expect(compareFormCodeBehind({ formText, clsText: CLS }).diverges).toBe(false);
  });

  it("ignores whitespace-only differences in the code-behind copy", () => {
    const formText = formWithCodeBehind(CLS.replace('    Debug.Print "cls"', '        Debug.Print "cls"'));
    expect(compareFormCodeBehind({ formText, clsText: CLS }).diverges).toBe(false);
  });

  it("reports nothing when the form has no CodeBehindForm section", () => {
    const formText = ["Version =21", "Begin Form", "End", ""].join("\r\n");
    expect(compareFormCodeBehind({ formText, clsText: CLS }).diverges).toBe(false);
  });

  it("reports nothing when both copies are identical", () => {
    expect(compareFormCodeBehind({ formText: formWithCodeBehind(CLS), clsText: CLS }).diverges).toBe(
      false,
    );
  });
});
