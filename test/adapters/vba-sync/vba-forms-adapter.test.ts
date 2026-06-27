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

  it("routes validate_form_spec through the form service and returns its result", async () => {
    const orchestrator: VbaFormsOrchestrator = {
      executor: vi.fn(),
      env: {},
      cwd: "C:/repo",
      resolveExecutionTarget: vi.fn(),
      validateStrictContext: vi.fn(),
      executeMappedTool: vi.fn(),
    };
    const adapter = new VbaFormsAdapter(orchestrator);

    const result = await adapter.execute("validate_form_spec", { spec: { name: "TestForm" } });

    expect(result).toMatchObject({ ok: true, data: { valid: true } });
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
      apply: true,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "VBA_CATALOG_WRITE_FAILED" },
    });
  });

  // --- Task 3.2: form tools must NOT call runner-only orchestrator functions ---

  it("validate_form_spec does not call resolveExecutionTarget or validateStrictContext", async () => {
    const resolveExecutionTarget = vi.fn();
    const validateStrictContext = vi.fn();
    const orchestrator: VbaFormsOrchestrator = {
      executor: vi.fn(),
      env: {},
      cwd: "C:/repo",
      resolveExecutionTarget,
      validateStrictContext,
      executeMappedTool: vi.fn(),
    };
    const adapter = new VbaFormsAdapter(orchestrator);

    await adapter.execute("validate_form_spec", {
      spec: { name: "Form_NoRunner", kind: "Form", controls: [] },
    });

    expect(resolveExecutionTarget).not.toHaveBeenCalled();
    expect(validateStrictContext).not.toHaveBeenCalled();
  });

  it("generate_form does not call resolveExecutionTarget or validateStrictContext", async () => {
    const resolveExecutionTarget = vi.fn();
    const validateStrictContext = vi.fn();
    const root = await mkdtemp(join(tmpdir(), "dysflow-gen-no-runner-"));
    const orchestrator: VbaFormsOrchestrator = {
      executor: vi.fn(),
      env: {},
      cwd: root,
      resolveExecutionTarget,
      validateStrictContext,
      executeMappedTool: vi.fn(),
    };
    const adapter = new VbaFormsAdapter(orchestrator);

    await adapter.execute("generate_form", {
      spec: { name: "Form_NoRunner", kind: "Form", controls: [] },
      destinationRoot: root,
    });

    expect(resolveExecutionTarget).not.toHaveBeenCalled();
    expect(validateStrictContext).not.toHaveBeenCalled();
  });

  it("catalog_add_control does not call resolveExecutionTarget or validateStrictContext", async () => {
    const resolveExecutionTarget = vi.fn();
    const validateStrictContext = vi.fn();
    const root = await mkdtemp(join(tmpdir(), "dysflow-catalog-no-runner-"));
    const orchestrator: VbaFormsOrchestrator = {
      executor: vi.fn(),
      env: {},
      cwd: root,
      resolveExecutionTarget,
      validateStrictContext,
      executeMappedTool: vi.fn(),
    };
    const adapter = new VbaFormsAdapter(orchestrator);

    await adapter.execute("catalog_add_control", {
      spec: { name: "Form_NoRunner", kind: "Form", controls: [] },
      controlName: "btn",
      controlType: "Button",
    });

    expect(resolveExecutionTarget).not.toHaveBeenCalled();
    expect(validateStrictContext).not.toHaveBeenCalled();
  });

  it("harvest_form_catalog does not call resolveExecutionTarget or validateStrictContext", async () => {
    const resolveExecutionTarget = vi.fn();
    const validateStrictContext = vi.fn();
    const orchestrator: VbaFormsOrchestrator = {
      executor: vi.fn(),
      env: {},
      cwd: "C:/repo",
      resolveExecutionTarget,
      validateStrictContext,
      executeMappedTool: vi.fn(),
    };
    const adapter = new VbaFormsAdapter(orchestrator);

    await adapter.execute("harvest_form_catalog", { destinationRoot: "C:/repo" });

    expect(resolveExecutionTarget).not.toHaveBeenCalled();
    expect(validateStrictContext).not.toHaveBeenCalled();
  });

  it("generate_erd still calls executeMappedTool (runner path stays intact)", async () => {
    const executeMappedTool = vi.fn().mockResolvedValue({ ok: true, data: {} });
    const resolveExecutionTarget = vi.fn();
    const validateStrictContext = vi.fn();
    const orchestrator: VbaFormsOrchestrator = {
      executor: vi.fn(),
      env: {},
      cwd: "C:/repo",
      resolveExecutionTarget,
      validateStrictContext,
      executeMappedTool,
    };
    const adapter = new VbaFormsAdapter(orchestrator);

    await adapter.execute("generate_erd", {
      backendPath: "C:/db/backend.accdb",
      erdPath: "C:/repo/erd.json",
    });

    expect(executeMappedTool).toHaveBeenCalledTimes(1);
    expect(executeMappedTool).toHaveBeenCalledWith(
      "generate_erd",
      expect.any(Object),
      expect.objectContaining({ action: "Generate-ERD" }),
    );
  });
});
