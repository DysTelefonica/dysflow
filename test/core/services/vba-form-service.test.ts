import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  type FormClockPort,
  type FormFileSystemPort,
  VbaFormService,
} from "../../../src/core/services/vba-form-service";

describe("VbaFormService", () => {
  // --- resolveFormSpec branches ---

  it("returns FORM_SPEC_MISSING when neither spec nor specPath is provided", async () => {
    const service = new VbaFormService({ cwd: process.cwd() });
    const result = await service.validateFormSpec({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORM_SPEC_MISSING");
  });

  it("loads spec from specPath when spec object is not provided", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-specpath-"));
    const specFile = join(root, "form.json");
    await writeFile(
      specFile,
      JSON.stringify({ name: "Form_FromFile", kind: "Form", controls: [] }),
      "utf8",
    );
    const service = new VbaFormService({ cwd: root });
    const result = await service.validateFormSpec({ specPath: specFile });
    expect(result.ok).toBe(true);
    if (result.ok) expect((result.data as { name: string }).name).toBe("Form_FromFile");
  });

  it("falls back to params.name when spec object has no name field", async () => {
    const service = new VbaFormService({ cwd: process.cwd() });
    const result = await service.validateFormSpec({
      spec: { kind: "Form", controls: [] },
      name: "Form_ParamName",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect((result.data as { name: string }).name).toBe("Form_ParamName");
  });

  it("infers kind as Report when name starts with Report_", async () => {
    const service = new VbaFormService({ cwd: process.cwd() });
    const result = await service.validateFormSpec({
      spec: { name: "Report_Sales", controls: [] },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect((result.data as { kind: string }).kind).toBe("Report");
  });

  it("falls back to params.kind when spec has no kind and name does not start with Report_", async () => {
    const service = new VbaFormService({ cwd: process.cwd() });
    const result = await service.validateFormSpec({
      spec: { name: "MyForm", controls: [] },
      kind: "Report",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect((result.data as { kind: string }).kind).toBe("Report");
  });

  it("returns FORM_SPEC_INVALID for unsupported form kind", async () => {
    const service = new VbaFormService({ cwd: process.cwd() });
    const result = await service.validateFormSpec({
      spec: { name: "BadForm", kind: "Subform", controls: [] },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORM_SPEC_INVALID");
  });

  it("filters out controls without a name and maps controlType fallback", async () => {
    const service = new VbaFormService({ cwd: process.cwd() });
    const result = await service.validateFormSpec({
      spec: {
        name: "Form_Controls",
        kind: "Form",
        controls: [
          { name: "ctrl1", controlType: "TextBox" }, // uses controlType fallback
          { name: "", type: "Button" }, // filtered out (empty name)
          { type: "Label" }, // filtered out (no name key)
          { name: "ctrl2", type: "ComboBox" }, // normal
        ],
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { controls: Array<{ name: string; type: string }> };
      expect(data.controls).toHaveLength(2);
      expect(data.controls[0]).toMatchObject({ name: "ctrl1", type: "TextBox" });
      expect(data.controls[1]).toMatchObject({ name: "ctrl2", type: "ComboBox" });
    }
  });

  it("returns type Unknown when control has neither type nor controlType", async () => {
    const service = new VbaFormService({ cwd: process.cwd() });
    const result = await service.validateFormSpec({
      spec: {
        name: "Form_Unknown",
        kind: "Form",
        controls: [{ name: "myCtrl" }],
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { controls: Array<{ type: string }> };
      expect(data.controls[0]?.type).toBe("Unknown");
    }
  });

  // --- generateForm branches ---

  it("generates a Report .json file when kind is Report", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-gen-report-"));
    const service = new VbaFormService({ cwd: root });
    const result = await service.generateForm({
      spec: { name: "Report_Sales", kind: "Report", controls: [] },
      destinationRoot: root,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { outputPath: string };
      expect(data.outputPath).toContain("Report_Sales.report.json");
    }
  });

  it("uses projectRoot as destinationRoot when destinationRoot is absent", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-gen-projectroot-"));
    const service = new VbaFormService({ cwd: root });
    const result = await service.generateForm({
      spec: { name: "Form_PR", kind: "Form", controls: [] },
      projectRoot: root,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { outputPath: string };
      expect(data.outputPath).toContain("Form_PR.form.json");
    }
  });

  it("uses service cwd as destinationRoot when neither destinationRoot nor projectRoot given", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-gen-cwd-"));
    const service = new VbaFormService({ cwd: root });
    const result = await service.generateForm({
      spec: { name: "Form_CWD", kind: "Form", controls: [] },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { outputPath: string };
      expect(data.outputPath).toContain("Form_CWD.form.json");
    }
  });

  it("defaults to dry-run for generateForm when dryRun/apply parameters are omitted", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-gen-default-dryrun-"));
    const service = new VbaFormService({ cwd: root });
    const result = await service.generateForm({
      spec: { name: "Form_Default", kind: "Form", controls: [] },
      destinationRoot: root,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { dryRun: boolean; generated: boolean };
      expect(data.dryRun).toBe(true);
      expect(data.generated).toBe(false);
    }
  });

  it("generateForm executes and generates file when apply: true is passed", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-gen-apply-"));
    const service = new VbaFormService({ cwd: root });
    const result = await service.generateForm({
      spec: { name: "Form_Apply", kind: "Form", controls: [] },
      destinationRoot: root,
      apply: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { generated: boolean };
      expect(data.generated).toBe(true);
    }
  });

  it("generateForm returns failure when spec is invalid", async () => {
    const service = new VbaFormService({ cwd: process.cwd() });
    const result = await service.generateForm({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORM_SPEC_MISSING");
  });

  // --- catalogAddControl branches ---

  it("returns FORM_SPEC_INVALID when catalogAddControl spec is missing", async () => {
    const service = new VbaFormService({ cwd: process.cwd() });
    const result = await service.catalogAddControl({
      controlName: "btn",
      controlType: "Button",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORM_SPEC_MISSING");
  });

  it("returns FORM_SPEC_INVALID when controlName is missing", async () => {
    const service = new VbaFormService({ cwd: process.cwd() });
    const result = await service.catalogAddControl({
      spec: { name: "Form_X", kind: "Form", controls: [] },
      controlType: "TextBox",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORM_SPEC_INVALID");
  });

  it("returns FORM_SPEC_INVALID when controlType is missing", async () => {
    const service = new VbaFormService({ cwd: process.cwd() });
    const result = await service.catalogAddControl({
      spec: { name: "Form_X", kind: "Form", controls: [] },
      controlName: "ctrl1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORM_SPEC_INVALID");
  });

  // ─── DELTA-007 (mcp-reliability-fix) — dryRun/apply parity with generateForm ───

  it("catalogAddControl defaults to dry-run when both flags absent (does NOT write)", async () => {
    const writtenFiles: Array<{ path: string; data: string }> = [];
    const fs = makeFs({
      writeFile: vi.fn().mockImplementation(async (p: string, d: string) => {
        writtenFiles.push({ path: p, data: d });
      }),
    });
    const service = new VbaFormService({ fileSystem: fs });

    const result = await service.catalogAddControl({
      spec: { name: "Form_DefaultDry", kind: "Form", controls: [] },
      controlName: "ctrl1",
      controlType: "TextBox",
      catalogPath: "/fake/forms/catalog.json",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { dryRun: boolean };
      expect(data.dryRun).toBe(true);
    }
    expect(writtenFiles).toHaveLength(0);
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it("catalogAddControl apply:true disables dry-run and writes the catalog", async () => {
    const writtenFiles: Array<{ path: string; data: string }> = [];
    const fs = makeFs({
      writeFile: vi.fn().mockImplementation(async (p: string, d: string) => {
        writtenFiles.push({ path: p, data: d });
      }),
    });
    const service = new VbaFormService({ fileSystem: fs });

    const result = await service.catalogAddControl({
      spec: { name: "Form_Apply", kind: "Form", controls: [] },
      controlName: "ctrl1",
      controlType: "TextBox",
      catalogPath: "/fake/forms/catalog.json",
      apply: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { controlCount: number };
      expect(data.controlCount).toBe(1);
    }
    expect(writtenFiles).toHaveLength(1);
  });

  it("catalogAddControl dryRun:true explicit does NOT write", async () => {
    const writtenFiles: Array<{ path: string; data: string }> = [];
    const fs = makeFs({
      writeFile: vi.fn().mockImplementation(async (p: string, d: string) => {
        writtenFiles.push({ path: p, data: d });
      }),
    });
    const service = new VbaFormService({ fileSystem: fs });

    const result = await service.catalogAddControl({
      spec: { name: "Form_ExplicitDry", kind: "Form", controls: [] },
      controlName: "ctrl1",
      controlType: "TextBox",
      catalogPath: "/fake/forms/catalog.json",
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { dryRun: boolean };
      expect(data.dryRun).toBe(true);
    }
    expect(writtenFiles).toHaveLength(0);
  });

  it("catalogAddControl apply:true takes precedence over dryRun:true", async () => {
    const writtenFiles: Array<{ path: string; data: string }> = [];
    const fs = makeFs({
      writeFile: vi.fn().mockImplementation(async (p: string, d: string) => {
        writtenFiles.push({ path: p, data: d });
      }),
    });
    const service = new VbaFormService({ fileSystem: fs });

    const result = await service.catalogAddControl({
      spec: { name: "Form_ApplyPrevails", kind: "Form", controls: [] },
      controlName: "ctrl1",
      controlType: "TextBox",
      catalogPath: "/fake/forms/catalog.json",
      apply: true,
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { controlCount: number };
      expect(data.controlCount).toBe(1);
    }
    expect(writtenFiles).toHaveLength(1);
  });

  it("uses params.name as controlName fallback and params.type as controlType fallback", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-catalog-fallback-"));
    const service = new VbaFormService({ cwd: root });
    const result = await service.catalogAddControl({
      spec: { name: "Form_Fallback", kind: "Form", controls: [] },
      name: "fallbackCtrl",
      type: "Label",
      catalogPath: join(root, "forms", "catalog.json"),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { controlCount: number };
      expect(data.controlCount).toBe(1);
    }
  });

  it("appends to existing catalog entries for the same form", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-catalog-append-"));
    const catalogPath = join(root, "forms", "catalog.json");
    const service = new VbaFormService({ cwd: root });

    // Add first control
    await service.catalogAddControl({
      spec: { name: "Form_Multi", kind: "Form", controls: [] },
      controlName: "ctrl1",
      controlType: "TextBox",
      catalogPath,
    });

    // Add second control
    const result = await service.catalogAddControl({
      spec: { name: "Form_Multi", kind: "Form", controls: [] },
      controlName: "ctrl2",
      controlType: "ComboBox",
      catalogPath,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { controlCount: number };
      expect(data.controlCount).toBe(2);
    }
    const cat = JSON.parse(await readFile(catalogPath, "utf8"));
    expect(cat.forms.Form_Multi).toHaveLength(2);
  });

  // --- harvestFormCatalog branches ---

  it("skips .json files that are not .form.json or .report.json", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-harvest-skip-"));
    const formsDir = join(root, "forms");
    await mkdir(formsDir, { recursive: true });
    await writeFile(join(formsDir, "other.json"), JSON.stringify({ name: "Other" }), "utf8");
    await writeFile(
      join(formsDir, "Real.form.json"),
      JSON.stringify({ name: "Real", kind: "Form", controls: [] }),
      "utf8",
    );
    const service = new VbaFormService({ cwd: root });
    const result = await service.harvestFormCatalog({ destinationRoot: root });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { total: number };
      expect(data.total).toBe(1);
    }
  });

  it("uses entry filename as name fallback when spec has no name", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-harvest-noname-"));
    const formsDir = join(root, "forms");
    await mkdir(formsDir, { recursive: true });
    await writeFile(
      join(formsDir, "Unnamed.form.json"),
      JSON.stringify({ kind: "Form", controls: [] }),
      "utf8",
    );
    const service = new VbaFormService({ cwd: root });
    const result = await service.harvestFormCatalog({ destinationRoot: root });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { forms: Array<{ name: string }> };
      expect(data.forms[0]?.name).toBe("Unnamed");
    }
  });

  it("uses folder kind as fallback when spec has no kind field", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-harvest-kindfall-"));
    const formsDir = join(root, "forms");
    await mkdir(formsDir, { recursive: true });
    await writeFile(
      join(formsDir, "KindFallback.form.json"),
      JSON.stringify({ name: "KindFallback", controls: [] }),
      "utf8",
    );
    const service = new VbaFormService({ cwd: root });
    const result = await service.harvestFormCatalog({ destinationRoot: root });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { forms: Array<{ kind: string }> };
      expect(data.forms[0]?.kind).toBe("Form");
    }
  });

  it("uses spec.controls.length=0 when controls is not an array", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-harvest-nocontrols-"));
    const formsDir = join(root, "forms");
    await mkdir(formsDir, { recursive: true });
    await writeFile(
      join(formsDir, "NoControls.form.json"),
      JSON.stringify({ name: "NoControls", kind: "Form" }),
      "utf8",
    );
    const service = new VbaFormService({ cwd: root });
    const result = await service.harvestFormCatalog({ destinationRoot: root });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { forms: Array<{ controls: number }> };
      expect(data.forms[0]?.controls).toBe(0);
    }
  });

  it("uses projectRoot as destinationRoot for harvestFormCatalog when destinationRoot absent", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-harvest-projroot-"));
    const formsDir = join(root, "forms");
    await mkdir(formsDir, { recursive: true });
    const service = new VbaFormService({ cwd: root });
    const result = await service.harvestFormCatalog({ projectRoot: root });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { total: number };
      expect(data.total).toBe(0);
    }
  });

  it("can validate a correct form spec", async () => {
    const service = new VbaFormService({ cwd: process.cwd() });

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
    const service = new VbaFormService({ cwd: process.cwd() });

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
    const service = new VbaFormService({ cwd: root });

    const result = await service.generateForm({
      spec: {
        name: "Form_Generated",
        kind: "Form",
        controls: [{ name: "btnClick", type: "CommandButton" }],
      },
      destinationRoot: root,
      apply: true,
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
    const service = new VbaFormService({ cwd: root });

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

    const service = new VbaFormService({ cwd: root });

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

    const service = new VbaFormService({ cwd: root });

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

  // --- Fake-port tests (Strict TDD: RED phase — written before port-based implementation) ---

  describe("fake-port based tests (FormFileSystemPort + FormClockPort)", () => {
    function makeFs(overrides: Partial<FormFileSystemPort> = {}): FormFileSystemPort {
      return {
        mkdir: vi.fn().mockResolvedValue(undefined),
        readdir: vi.fn().mockResolvedValue([]),
        readFile: vi.fn().mockRejectedValue(new Error("not found")),
        readJson: vi.fn().mockRejectedValue(new Error("not found")),
        writeFile: vi.fn().mockResolvedValue(undefined),
        ...overrides,
      };
    }

    function makeClock(isoString = "2025-01-01T00:00:00.000Z"): FormClockPort {
      return { nowIso: () => isoString };
    }

    // --- Task 1.2: generateForm path, JSON payload, deterministic generatedAt ---

    it("generateForm writes JSON payload via fileSystem port and returns outputPath", async () => {
      const writtenFiles: Array<{ path: string; data: string }> = [];
      const fs = makeFs({
        writeFile: vi.fn().mockImplementation(async (p: string, d: string) => {
          writtenFiles.push({ path: p, data: d });
        }),
      });
      const clock = makeClock("2025-06-01T12:00:00.000Z");

      const service = new VbaFormService({ fileSystem: fs, clock });

      const result = await service.generateForm({
        spec: { name: "Form_FakePort", kind: "Form", controls: [{ name: "btn", type: "Button" }] },
        destinationRoot: "/fake/root",
        apply: true,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as {
          outputPath: string;
          generated: boolean;
          controlCount: number;
        };
        expect(data.generated).toBe(true);
        expect(data.controlCount).toBe(1);
        expect(data.outputPath).toContain("Form_FakePort.form.json");
      }

      expect(fs.mkdir).toHaveBeenCalledWith(expect.stringContaining("forms"), { recursive: true });
      expect(writtenFiles).toHaveLength(1);
      const firstWritten = writtenFiles[0];
      expect(firstWritten).toBeDefined();
      if (!firstWritten) throw new Error("Expected written file");
      const payload = JSON.parse(firstWritten.data);
      expect(payload).toMatchObject({
        name: "Form_FakePort",
        kind: "Form",
        controls: [{ name: "btn", type: "Button" }],
        generatedAt: "2025-06-01T12:00:00.000Z",
      });
    });

    it("generateForm with dryRun:true returns a plan without writing through the fileSystem port", async () => {
      const fs = makeFs();
      const service = new VbaFormService({ fileSystem: fs });

      const result = await service.generateForm({
        spec: { name: "Form_DryRun", kind: "Form", controls: [{ name: "txt", type: "TextBox" }] },
        destinationRoot: "/fake/root",
        dryRun: true,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toMatchObject({
          dryRun: true,
          generated: false,
          wouldGenerate: true,
          outputPath: expect.stringContaining("Form_DryRun.form.json"),
          name: "Form_DryRun",
          kind: "Form",
          controlCount: 1,
        });
      }
      expect(fs.mkdir).not.toHaveBeenCalled();
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it("generateForm with dryRun:true and apply:true writes through the fileSystem port", async () => {
      const writtenFiles: Array<{ path: string; data: string }> = [];
      const fs = makeFs({
        writeFile: async (path: string, data: string) => {
          writtenFiles.push({ path, data });
        },
      });
      const service = new VbaFormService({ fileSystem: fs });

      const result = await service.generateForm({
        spec: { name: "Form_ApplyDryRun", kind: "Form", controls: [] },
        destinationRoot: "/fake/root",
        dryRun: true,
        apply: true,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toMatchObject({
          generated: true,
          outputPath: expect.stringContaining("Form_ApplyDryRun.form.json"),
        });
      }
      expect(fs.mkdir).toHaveBeenCalledWith(expect.stringContaining("forms"), {
        recursive: true,
      });
      expect(writtenFiles).toHaveLength(1);
      expect(writtenFiles[0]?.path).toContain("Form_ApplyDryRun.form.json");
    });

    it("generateForm uses clock.nowIso() for deterministic generatedAt timestamp", async () => {
      const writtenFiles: Array<{ path: string; data: string }> = [];
      const fs = makeFs({
        writeFile: vi.fn().mockImplementation(async (p: string, d: string) => {
          writtenFiles.push({ path: p, data: d });
        }),
      });
      const clock = makeClock("2099-12-31T23:59:59.999Z");

      const service = new VbaFormService({ fileSystem: fs, clock });

      await service.generateForm({
        spec: { name: "Form_TS", kind: "Form", controls: [] },
        destinationRoot: "/fake",
        apply: true,
      });

      const firstWritten = writtenFiles[0];
      expect(firstWritten).toBeDefined();
      if (!firstWritten) throw new Error("Expected written file");
      const payload = JSON.parse(firstWritten.data);
      expect(payload.generatedAt).toBe("2099-12-31T23:59:59.999Z");
    });

    it("generateForm propagates fileSystem.writeFile failure as a thrown error", async () => {
      const fs = makeFs({
        writeFile: vi.fn().mockRejectedValue(new Error("disk full")),
      });
      const service = new VbaFormService({ fileSystem: fs });

      await expect(
        service.generateForm({
          spec: { name: "Form_Fail", kind: "Form", controls: [] },
          destinationRoot: "/fake",
          apply: true,
        }),
      ).rejects.toThrow("disk full");
    });

    // --- Task 1.3: catalogAddControl fake-port tests ---

    it("catalogAddControl appends to existing catalog via fileSystem port", async () => {
      const existingCatalog = { forms: { Form_Cat: [{ name: "existing", type: "Label" }] } };
      const writtenFiles: Array<{ path: string; data: string }> = [];
      const fs = makeFs({
        readJson: vi.fn().mockResolvedValue(existingCatalog),
        writeFile: vi.fn().mockImplementation(async (p: string, d: string) => {
          writtenFiles.push({ path: p, data: d });
        }),
      });

      const service = new VbaFormService({ fileSystem: fs });

      const result = await service.catalogAddControl({
        spec: { name: "Form_Cat", kind: "Form", controls: [] },
        controlName: "newCtrl",
        controlType: "TextBox",
        catalogPath: "/fake/forms/catalog.json",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { controlCount: number };
        expect(data.controlCount).toBe(2);
      }
      const firstWritten = writtenFiles[0];
      expect(firstWritten).toBeDefined();
      if (!firstWritten) throw new Error("Expected written file");
      const written = JSON.parse(firstWritten.data);
      expect(written.forms.Form_Cat).toHaveLength(2);
      expect(written.forms.Form_Cat[1]).toEqual({ name: "newCtrl", type: "TextBox" });
    });

    it("catalogAddControl uses empty catalog when readJson rejects (missing catalog)", async () => {
      const writtenFiles: Array<{ path: string; data: string }> = [];
      const fs = makeFs({
        readJson: vi.fn().mockRejectedValue(new Error("ENOENT")),
        writeFile: vi.fn().mockImplementation(async (p: string, d: string) => {
          writtenFiles.push({ path: p, data: d });
        }),
      });

      const service = new VbaFormService({ fileSystem: fs });

      const result = await service.catalogAddControl({
        spec: { name: "Form_New", kind: "Form", controls: [] },
        controlName: "btn",
        controlType: "Button",
        catalogPath: "/fake/forms/catalog.json",
      });

      expect(result.ok).toBe(true);
      const firstWritten = writtenFiles[0];
      expect(firstWritten).toBeDefined();
      if (!firstWritten) throw new Error("Expected written file");
      const written = JSON.parse(firstWritten.data);
      expect(written.forms.Form_New).toEqual([{ name: "btn", type: "Button" }]);
    });

    it("catalogAddControl returns VBA_CATALOG_WRITE_FAILED when fileSystem.writeFile rejects", async () => {
      const fs = makeFs({
        readJson: vi.fn().mockRejectedValue(new Error("ENOENT")),
        writeFile: vi.fn().mockRejectedValue(new Error("permission denied")),
      });

      const service = new VbaFormService({ fileSystem: fs });

      const result = await service.catalogAddControl({
        spec: { name: "Form_WriteErr", kind: "Form", controls: [] },
        controlName: "ctrl",
        controlType: "Label",
        catalogPath: "/fake/forms/catalog.json",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("VBA_CATALOG_WRITE_FAILED");
      }
    });

    // --- Task 1.4: harvestFormCatalog fake-port tests ---

    it("harvestFormCatalog filters form and report JSON files via fileSystem port", async () => {
      const fs = makeFs({
        readdir: vi.fn().mockImplementation(async (path: string) => {
          if (path.includes("forms")) return ["MyForm.form.json", "skip.json"];
          if (path.includes("reports")) return ["MyReport.report.json"];
          return [];
        }),
        readJson: vi.fn().mockImplementation(async (path: string) => {
          if (path.includes("MyForm")) return { name: "MyForm", kind: "Form", controls: [1, 2] };
          if (path.includes("MyReport"))
            return { name: "MyReport", kind: "Report", controls: [1, 2, 3] };
          throw new Error("not found");
        }),
      });

      const service = new VbaFormService({ fileSystem: fs });

      const result = await service.harvestFormCatalog({ destinationRoot: "/fake/root" });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as {
          forms: Array<{ name: string; controls: number }>;
          reports: Array<{ name: string; controls: number }>;
          total: number;
        };
        expect(data.total).toBe(2);
        expect(data.forms).toHaveLength(1);
        expect(data.forms[0]?.name).toBe("MyForm");
        expect(data.forms[0]?.controls).toBe(2);
        expect(data.reports[0]?.name).toBe("MyReport");
        expect(data.reports[0]?.controls).toBe(3);
      }
    });

    it("harvestFormCatalog skips files that are not .form.json or .report.json", async () => {
      const fs = makeFs({
        readdir: vi.fn().mockImplementation(async (path: string) => {
          if (path.includes("forms")) return ["skip.json", "also-skip.txt", "Good.form.json"];
          return []; // reports dir is empty
        }),
        readJson: vi.fn().mockResolvedValue({ name: "Good", kind: "Form", controls: [] }),
      });

      const service = new VbaFormService({ fileSystem: fs });

      const result = await service.harvestFormCatalog({ destinationRoot: "/fake" });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { total: number };
        expect(data.total).toBe(1);
      }
    });

    it("harvestFormCatalog skips files whose readJson rejects (invalid JSON)", async () => {
      const fs = makeFs({
        readdir: vi.fn().mockImplementation(async (path: string) => {
          if (path.includes("forms")) return ["Invalid.form.json", "Valid.form.json"];
          return []; // reports dir is empty
        }),
        readJson: vi.fn().mockImplementation(async (path: string) => {
          if (path.includes("Invalid")) throw new Error("bad json");
          return { name: "Valid", kind: "Form", controls: [] };
        }),
      });

      const service = new VbaFormService({ fileSystem: fs });

      const result = await service.harvestFormCatalog({ destinationRoot: "/fake" });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { total: number };
        expect(data.total).toBe(1);
      }
    });

    it("harvestFormCatalog returns empty catalog when readdir rejects (missing directory)", async () => {
      const fs = makeFs({
        readdir: vi.fn().mockRejectedValue(new Error("ENOENT")),
      });

      const service = new VbaFormService({ fileSystem: fs });

      const result = await service.harvestFormCatalog({ destinationRoot: "/nonexistent" });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.data as { total: number };
        expect(data.total).toBe(0);
      }
    });
  });
});
