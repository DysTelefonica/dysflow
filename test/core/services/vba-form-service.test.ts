import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { VbaFormService } from "../../../src/core/services/vba-form-service";

describe("VbaFormService", () => {
  it("can validate a correct form spec", async () => {
    const service = new VbaFormService({
      cwd: process.cwd(),
      env: {},
      executor: vi.fn(),
    });

    const result = await service.validateFormSpec({
      spec: {
        name: "Form_Main",
        kind: "Form",
        controls: [{ name: "txtInput", type: "TextBox" }],
      },
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        valid: true,
        name: "Form_Main",
        kind: "Form",
        controlCount: 1,
        controls: [{ name: "txtInput", type: "TextBox" }],
      },
    });
  });

  it("returns FORM_SPEC_INVALID when validateFormSpec spec has no name", async () => {
    const service = new VbaFormService({
      cwd: process.cwd(),
      env: {},
      executor: vi.fn(),
    });

    const result = await service.validateFormSpec({
      spec: {
        kind: "Form",
        controls: [],
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORM_SPEC_INVALID");
    }
  });

  it("can generate form JSON file in forms directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-form-gen-"));
    const service = new VbaFormService({
      cwd: root,
      env: {},
      executor: vi.fn(),
    });

    const result = await service.generateForm({
      spec: {
        name: "Form_Generated",
        kind: "Form",
        controls: [{ name: "btnClick", type: "CommandButton" }],
      },
      destinationRoot: root,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const expectedPath = join(root, "forms", "Form_Generated.form.json");
      expect(result.data).toMatchObject({
        generated: true,
        outputPath: expectedPath,
        name: "Form_Generated",
        kind: "Form",
        controlCount: 1,
      });

      const fileContent = JSON.parse(await readFile(expectedPath, "utf8"));
      expect(fileContent).toMatchObject({
        name: "Form_Generated",
        kind: "Form",
        controls: [{ name: "btnClick", type: "CommandButton" }],
      });
    }
  });

  it("can catalog control and update forms/catalog.json", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-catalog-test-"));
    const service = new VbaFormService({
      cwd: root,
      env: {},
      executor: vi.fn(),
    });

    const catalogPath = join(root, "forms", "catalog.json");
    const result = await service.catalogAddControl({
      spec: { name: "Form_Cataloged", kind: "Form", controls: [] },
      catalogPath,
      controlName: "txtUser",
      controlType: "TextBox",
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        catalogPath,
        formName: "Form_Cataloged",
        controlCount: 1,
      },
    });

    const catalogContent = JSON.parse(await readFile(catalogPath, "utf8"));
    expect(catalogContent.forms.Form_Cataloged).toEqual([{ name: "txtUser", type: "TextBox" }]);
  });

  it("propagates mkdir failure as VBA_CATALOG_WRITE_FAILED when catalog parent dir is a file", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-catalog-mkdir-fail-unit-"));
    const formsFile = join(root, "forms");
    await writeFile(formsFile, "I am a file not a dir", "utf8");
    const catalogPath = join(root, "forms", "catalog.json");

    const service = new VbaFormService({
      cwd: root,
      env: {},
      executor: vi.fn(),
    });

    const result = await service.catalogAddControl({
      spec: { name: "TestForm", kind: "Form", controls: [] },
      catalogPath,
      controlName: "btnOK",
      controlType: "CommandButton",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "VBA_CATALOG_WRITE_FAILED" },
    });
  });

  it("can harvest forms and reports from forms and reports directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-harvest-test-"));
    const formsDir = join(root, "forms");
    const reportsDir = join(root, "reports");
    await mkdir(formsDir, { recursive: true });
    await mkdir(reportsDir, { recursive: true });

    await writeFile(
      join(formsDir, "MyForm.form.json"),
      JSON.stringify({ name: "MyForm", kind: "Form", controls: [1, 2] }),
      "utf8",
    );
    await writeFile(
      join(reportsDir, "MyReport.report.json"),
      JSON.stringify({ name: "MyReport", kind: "Report", controls: [1, 2, 3] }),
      "utf8",
    );

    const service = new VbaFormService({
      cwd: root,
      env: {},
      executor: vi.fn(),
    });

    const result = await service.harvestFormCatalog({
      destinationRoot: root,
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        destinationRoot: root,
        forms: [{ name: "MyForm", kind: "Form", controls: 2 }],
        reports: [{ name: "MyReport", kind: "Report", controls: 3 }],
        total: 2,
      },
    });
  });
});
