import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  VbaFormsAdapter,
  type VbaFormsOrchestrator,
} from "../../../src/adapters/vba-sync/vba-forms-adapter";
import { successResult } from "../../../src/core/contracts/index";

describe("VbaFormsAdapter", () => {
  it("handles form tools", () => {
    expect(VbaFormsAdapter.handles("generate_erd")).toBe(true);
    expect(VbaFormsAdapter.handles("validate_form_spec")).toBe(true);
    expect(VbaFormsAdapter.handles("generate_form")).toBe(true);
    expect(VbaFormsAdapter.handles("catalog_add_control")).toBe(true);
    expect(VbaFormsAdapter.handles("harvest_form_catalog")).toBe(true);
    expect(VbaFormsAdapter.handles("export_modules")).toBe(false);
  });

  it("delegates generate_erd to orchestrator executeMappedTool", async () => {
    const executeMappedTool = vi.fn().mockResolvedValue(successResult({ ok: true }));
    const orchestrator: VbaFormsOrchestrator = {
      executor: vi.fn(),
      env: {},
      cwd: "C:/repo",
      resolveExecutionTarget: vi.fn(),
      validateStrictContext: vi.fn(),
      executeMappedTool,
    };
    const adapter = new VbaFormsAdapter(orchestrator);

    const result = await adapter.execute("generate_erd", {
      backendPath: "C:/db/backend.accdb",
      erdPath: "C:/repo/erd.json",
    });

    expect(result).toMatchObject({ ok: true });
    expect(executeMappedTool).toHaveBeenCalledWith(
      "generate_erd",
      { backendPath: "C:/db/backend.accdb", erdPath: "C:/repo/erd.json" },
      expect.objectContaining({ action: "Generate-ERD", json: false }),
    );
  });

  it("delegates validation and control cataloging to form service", async () => {
    const orchestrator: VbaFormsOrchestrator = {
      executor: vi.fn(),
      env: {},
      cwd: "C:/repo",
      resolveExecutionTarget: vi.fn(),
      validateStrictContext: vi.fn(),
      executeMappedTool: vi.fn(),
    };
    const adapter = new VbaFormsAdapter(orchestrator);

    const validateSpy = vi
      .spyOn(adapter.formService, "validateFormSpec")
      .mockResolvedValue(successResult({ valid: true }));
    const result = await adapter.execute("validate_form_spec", { spec: { name: "TestForm" } });

    expect(validateSpy).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: true, data: { valid: true } });
    validateSpy.mockRestore();
  });

  it("returns FORM_SPEC_INVALID when catalog_add_control is called without controlName", async () => {
    const orchestrator: VbaFormsOrchestrator = {
      executor: vi.fn(),
      env: {},
      cwd: "C:/repo",
      resolveExecutionTarget: vi.fn(),
      validateStrictContext: vi.fn(),
      executeMappedTool: vi.fn(),
    };
    const adapter = new VbaFormsAdapter(orchestrator);

    const result = await adapter.execute("catalog_add_control", {
      spec: { name: "TestForm", kind: "Form", controls: [] },
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "FORM_SPEC_INVALID" },
    });
  });

  it("propagates mkdir failure as VBA_CATALOG_WRITE_FAILED in catalog_add_control", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-catalog-mkdir-fail-adapter-"));
    const formsFile = join(root, "forms");
    await writeFile(formsFile, "I am a file not a dir", "utf8");
    const catalogPath = join(root, "forms", "catalog.json");

    const orchestrator: VbaFormsOrchestrator = {
      executor: vi.fn(),
      env: {},
      cwd: root,
      resolveExecutionTarget: vi.fn(),
      validateStrictContext: vi.fn(),
      executeMappedTool: vi.fn(),
    };
    const adapter = new VbaFormsAdapter(orchestrator);

    const result = await adapter.execute("catalog_add_control", {
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
});
