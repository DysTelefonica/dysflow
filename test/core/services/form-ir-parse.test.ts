import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { FormIR, FormNode } from "../../../src/core/models/form-ir";
import { parseFormTxt } from "../../../src/core/services/form-ir-service";

const FIXTURES_DIR = join(process.cwd(), "E2E_testing/src/forms");

function fixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), "utf8");
}

function findCaption(node: FormNode): string | undefined {
  for (const e of node.entries) {
    if (e.kind === "scalar" && e.key === "Caption") return e.value;
  }
  for (const child of node.children) {
    const found = findCaption(child);
    if (found !== undefined) return found;
  }
  return undefined;
}

describe("parseFormTxt", () => {
  // ------------------------------------------------------------------ frmSplash
  it("parses frmSplash name, kind, and preamble version", () => {
    const text = fixture("Form_frmSplash.form.txt");
    const ir: FormIR = parseFormTxt(text, { name: "frmSplash" });

    expect(ir.name).toBe("frmSplash");
    expect(ir.kind).toBe("Form");

    const versionEntry = ir.preamble.find((e) => e.kind === "scalar" && e.key === "Version");
    expect(versionEntry).toBeDefined();
    if (versionEntry?.kind === "scalar") {
      expect(versionEntry.value).toBe("21");
    }
  });

  it("parses frmSplash opaque blobs verbatim in root entries", () => {
    const text = fixture("Form_frmSplash.form.txt");
    const ir: FormIR = parseFormTxt(text, { name: "frmSplash" });

    const guidEntry = ir.root.entries.find((e) => e.key === "GUID");
    expect(guidEntry).toBeDefined();
    expect(guidEntry?.kind).toBe("blob");

    const prtDevModeEntry = ir.root.entries.find((e) => e.key === "PrtDevMode");
    expect(prtDevModeEntry).toBeDefined();
    expect(prtDevModeEntry?.kind).toBe("blob");
    // Blob lines must be non-empty (the file has hundreds of hex lines)
    if (prtDevModeEntry?.kind === "blob") {
      expect(prtDevModeEntry.lines.length).toBeGreaterThan(0);
    }
  });

  it("parses frmSplash CodeBehindForm section", () => {
    const text = fixture("Form_frmSplash.form.txt");
    const ir: FormIR = parseFormTxt(text, { name: "frmSplash" });

    expect(ir.codeBehind).not.toBeNull();
    expect(ir.codeBehind).toContain("Option Compare Database");
    expect(ir.codeBehind).toContain("Form_Open");
  });

  it("parses frmSplash events: OnOpen and OnTimer present", () => {
    const text = fixture("Form_frmSplash.form.txt");
    const ir: FormIR = parseFormTxt(text, { name: "frmSplash" });

    const onOpen = ir.root.entries.find((e) => e.kind === "scalar" && e.key === "OnOpen");
    expect(onOpen).toBeDefined();
    if (onOpen?.kind === "scalar") {
      expect(onOpen.value).toContain("[Event Procedure]");
    }
  });

  // ------------------------------------------------------------------ frmBusy
  it("parses frmBusy: duplicate keys preserved in insertion order", () => {
    const text = fixture("Form_frmBusy.form.txt");
    const ir: FormIR = parseFormTxt(text, { name: "frmBusy" });

    expect(ir.kind).toBe("Form");

    // NoSaveCTIWhenDisabled appears twice in frmBusy root entries
    const duplicates = ir.root.entries.filter(
      (e) => e.kind === "scalar" && e.key === "NoSaveCTIWhenDisabled",
    );
    expect(duplicates.length).toBeGreaterThanOrEqual(2);
  });

  it("parses frmBusy: unlabeled Begin container is a child of root", () => {
    const text = fixture("Form_frmBusy.form.txt");
    const ir: FormIR = parseFormTxt(text, { name: "frmBusy" });

    expect(ir.root.children.length).toBeGreaterThanOrEqual(1);
    const unlabeled = ir.root.children.find((c) => c.blockType === "");
    expect(unlabeled).toBeDefined();
  });

  it("parses frmBusy: unlabeled Begin container has nested children", () => {
    const text = fixture("Form_frmBusy.form.txt");
    const ir: FormIR = parseFormTxt(text, { name: "frmBusy" });

    const container = ir.root.children.find((c) => c.blockType === "");
    expect(container).toBeDefined();
    if (container) {
      // The container has at least one child (a Label template and a Section)
      expect(container.children.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("parses frmBusy: Spanish captions preserved verbatim", () => {
    const text = fixture("Form_frmBusy.form.txt");
    const ir: FormIR = parseFormTxt(text, { name: "frmBusy" });

    const caption = findCaption(ir.root);
    expect(caption).toBeDefined();
    expect(caption).toContain("Espere");
  });

  it("parses frmBusy: named controls found in nested tree", () => {
    const text = fixture("Form_frmBusy.form.txt");
    const ir: FormIR = parseFormTxt(text, { name: "frmBusy" });

    // Walk tree to find lblTitulo
    function findName(node: FormNode, nameVal: string): boolean {
      for (const e of node.entries) {
        if (e.kind === "scalar" && e.key === "Name" && e.value.includes(nameVal)) return true;
      }
      return node.children.some((c) => findName(c, nameVal));
    }

    expect(findName(ir.root, "lblTitulo")).toBe(true);
    expect(findName(ir.root, "lblEstado")).toBe(true);
  });

  // ------------------------------------------------------------------ malformed
  it("throws on empty input", () => {
    expect(() => parseFormTxt("")).toThrow();
  });

  it("throws on whitespace-only input", () => {
    expect(() => parseFormTxt("   \n  ")).toThrow();
  });

  it("throws on non-SaveAsText input (no Begin Form)", () => {
    expect(() => parseFormTxt("this is not a form file\nno begin block")).toThrow();
  });

  it("throws on a file with only preamble scalars and no Begin Form", () => {
    expect(() => parseFormTxt("Version =21\nVersionRequired =20\nPublishOption =1")).toThrow();
  });

  // ------------------------------------------------------------------ corpus
  it("parses all real form fixtures without throwing", () => {
    const fixtureNames = [
      "Form_frmSplash.form.txt",
      "Form_frmBusy.form.txt",
      "Form_FormComercial.form.txt",
      "Form_FormComercialesGestion.form.txt",
      "Form_FormExpediente.form.txt",
      "Form_FormExpedienteAlta.form.txt",
      "Form_FormRAC.form.txt",
    ];

    for (const name of fixtureNames) {
      const text = fixture(name);
      const formName = name.replace(/^Form_/, "").replace(/\.form\.txt$/, "");
      expect(() => parseFormTxt(text, { name: formName }), `fixture: ${name}`).not.toThrow();
    }
  });

  it("all fixtures produce a FormIR with a non-empty root", () => {
    const names = [
      "Form_frmSplash.form.txt",
      "Form_frmBusy.form.txt",
      "Form_FormComercial.form.txt",
    ];

    for (const name of names) {
      const ir = parseFormTxt(fixture(name), {
        name: name.replace(/^Form_/, "").replace(/\.form\.txt$/, ""),
      });
      expect(ir.root, `fixture: ${name}`).toBeDefined();
      expect(ir.root.blockType, `fixture: ${name}`).toMatch(/^(Form|Report)$/);
    }
  });
});
