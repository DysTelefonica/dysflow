import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  normalizeLineEndings,
  parseFormTxt,
  serializeFormTxt,
} from "../../../src/core/services/form-ir-service";

const FIXTURES_DIR = join(process.cwd(), "E2E_testing/src/forms");

function fixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), "utf8");
}

function allFixtureNames(): string[] {
  return readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".form.txt"));
}

// ---------------------------------------------------------------------------
// Round-trip property tests — by construction, these must all be GREEN
// ---------------------------------------------------------------------------

describe("serializeFormTxt — round-trip guarantee", () => {
  it("round-trips frmBusy byte-for-byte (after line-ending normalization)", () => {
    const raw = fixture("Form_frmBusy.form.txt");
    const ir = parseFormTxt(raw, { name: "frmBusy" });
    expect(serializeFormTxt(ir)).toBe(normalizeLineEndings(raw));
  });

  it("round-trips frmSplash byte-for-byte", () => {
    const raw = fixture("Form_frmSplash.form.txt");
    const ir = parseFormTxt(raw, { name: "frmSplash" });
    expect(serializeFormTxt(ir)).toBe(normalizeLineEndings(raw));
  });

  it("round-trips FormComercial byte-for-byte", () => {
    const raw = fixture("Form_FormComercial.form.txt");
    const ir = parseFormTxt(raw, { name: "FormComercial" });
    expect(serializeFormTxt(ir)).toBe(normalizeLineEndings(raw));
  });

  it("round-trips FormExpedienteDocumentacion (has empty lines in structured section)", () => {
    const raw = fixture("Form_FormExpedienteDocumentacion.form.txt");
    const ir = parseFormTxt(raw, { name: "FormExpedienteDocumentacion" });
    expect(serializeFormTxt(ir)).toBe(normalizeLineEndings(raw));
  });

  it("round-trips FormExpedienteGeneral (many empty lines in structured section)", () => {
    const raw = fixture("Form_FormExpedienteGeneral.form.txt");
    const ir = parseFormTxt(raw, { name: "FormExpedienteGeneral" });
    expect(serializeFormTxt(ir)).toBe(normalizeLineEndings(raw));
  });

  it("round-trips FormE2EGestionBatch (empty lines in structured section)", () => {
    const raw = fixture("Form_FormE2EGestionBatch.form.txt");
    const ir = parseFormTxt(raw, { name: "FormE2EGestionBatch" });
    expect(serializeFormTxt(ir)).toBe(normalizeLineEndings(raw));
  });

  it("round-trips Form0BDOpciones (empty lines in structured section)", () => {
    const raw = fixture("Form_Form0BDOpciones.form.txt");
    const ir = parseFormTxt(raw, { name: "Form0BDOpciones" });
    expect(serializeFormTxt(ir)).toBe(normalizeLineEndings(raw));
  });

  it("round-trips ALL 47+ real fixtures without exception", () => {
    const names = allFixtureNames();
    expect(names.length).toBeGreaterThanOrEqual(47);

    for (const name of names) {
      const raw = fixture(name);
      const formName = name.replace(/^Form_/, "").replace(/\.form\.txt$/, "");
      const ir = parseFormTxt(raw, { name: formName });
      expect(serializeFormTxt(ir), `round-trip failed for fixture: ${name}`).toBe(
        normalizeLineEndings(raw),
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Structural correctness tests (verify the serializer output shape)
// ---------------------------------------------------------------------------

describe("serializeFormTxt — structural correctness", () => {
  it("preamble scalars are emitted at indent 0 (no leading whitespace)", () => {
    const raw = fixture("Form_frmBusy.form.txt");
    const ir = parseFormTxt(raw, { name: "frmBusy" });
    const out = serializeFormTxt(ir);
    const firstLine = out.split("\n")[0] ?? "";
    expect(firstLine).toBe("Version =21");
    expect(firstLine.startsWith(" ")).toBe(false);
  });

  it("root Begin Form is at indent 0", () => {
    const raw = fixture("Form_frmBusy.form.txt");
    const ir = parseFormTxt(raw, { name: "frmBusy" });
    const out = serializeFormTxt(ir);
    const formLine = out.split("\n").find((l) => l.startsWith("Begin Form"));
    expect(formLine).toBe("Begin Form");
  });

  it("root entries are indented 4 spaces", () => {
    const raw = fixture("Form_frmBusy.form.txt");
    const ir = parseFormTxt(raw, { name: "frmBusy" });
    const out = serializeFormTxt(ir);
    // PopUp is the first entry of frmBusy root
    const popUpLine = out.split("\n").find((l) => l.trimStart().startsWith("PopUp ="));
    expect(popUpLine).toBe("    PopUp = NotDefault");
  });

  it("CodeBehindForm marker appears after root End", () => {
    const raw = fixture("Form_frmBusy.form.txt");
    const ir = parseFormTxt(raw, { name: "frmBusy" });
    const out = serializeFormTxt(ir);
    const outLines = out.split("\n");
    const cbIdx = outLines.findIndex((l: string) => l === "CodeBehindForm");
    expect(cbIdx).toBeGreaterThan(0);
    // The line immediately before CodeBehindForm must be the root End
    expect(outLines[cbIdx - 1]).toBe("End");
  });

  it("VBA codeBehind is reproduced verbatim after CodeBehindForm", () => {
    const raw = fixture("Form_frmBusy.form.txt");
    const ir = parseFormTxt(raw, { name: "frmBusy" });
    expect(ir.codeBehind).not.toBeNull();

    const out = serializeFormTxt(ir);
    const outLines = out.split("\n");
    const cbIdx = outLines.indexOf("CodeBehindForm");
    const afterCb = outLines.slice(cbIdx + 1).join("\n");
    expect(afterCb).toBe(ir.codeBehind);
  });

  it("duplicate scalar keys preserved in insertion order (frmBusy NoSaveCTIWhenDisabled x2)", () => {
    const raw = fixture("Form_frmBusy.form.txt");
    const ir = parseFormTxt(raw, { name: "frmBusy" });
    const out = serializeFormTxt(ir);
    const outLines = out.split("\n");
    const firstIdx = outLines.findIndex((l: string) => l.includes("NoSaveCTIWhenDisabled"));
    // Find the second occurrence by searching after firstIdx
    const secondIdx =
      firstIdx >= 0
        ? outLines.slice(firstIdx + 1).findIndex((l: string) => l.includes("NoSaveCTIWhenDisabled"))
        : -1;
    expect(firstIdx).toBeGreaterThan(-1);
    expect(secondIdx).toBeGreaterThan(-1); // second occurrence found after first
  });

  it("unlabeled Begin block serialized as 'Begin' (no blockType)", () => {
    const raw = fixture("Form_frmBusy.form.txt");
    const ir = parseFormTxt(raw, { name: "frmBusy" });
    const out = serializeFormTxt(ir);
    // frmBusy has an unlabeled child Begin container inside the root Form
    const unlabeledLine = out
      .split("\n")
      .find((l) => l.trimStart() === "Begin" && l.startsWith("    Begin"));
    expect(unlabeledLine).toBeDefined();
    expect(unlabeledLine).toBe("    Begin");
  });

  it("blob entry lines are emitted verbatim (preserves original indentation)", () => {
    const raw = fixture("Form_frmSplash.form.txt");
    const ir = parseFormTxt(raw, { name: "frmSplash" });
    const out = serializeFormTxt(ir);
    // RecSrcDt blob has a single hex line with 8-space indent
    expect(out).toContain("    RecSrcDt = Begin\n        0x881c5c679a6ee640\n    End");
  });

  it("Spanish captions serialized verbatim", () => {
    const raw = fixture("Form_frmBusy.form.txt");
    const ir = parseFormTxt(raw, { name: "frmBusy" });
    const out = serializeFormTxt(ir);
    expect(out).toContain('"Espere..."');
    expect(out).toContain('"Procesando..."');
    expect(out).toContain('"Espere por favor..."');
  });

  it("normalizeLineEndings converts CRLF to LF only", () => {
    expect(normalizeLineEndings("a\r\nb\r\nc")).toBe("a\nb\nc");
    expect(normalizeLineEndings("a\nb\nc")).toBe("a\nb\nc");
    expect(normalizeLineEndings("")).toBe("");
  });
});
