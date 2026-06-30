import { describe, expect, it, vi } from "vitest";
import {
  VbaFormsAdapter,
  type VbaFormsOrchestrator,
} from "../../../src/adapters/vba-sync/vba-forms-adapter";
import { failureResult, successResult } from "../../../src/core/contracts/index";
import type { FormFileSystemPort } from "../../../src/core/services/vba-form-service";

const SIMPLE_FORM = `Version =21
Checksum =123456789
Begin Form
    Begin
        Begin TextBox
            Name ="txtName"
            Left =100
            Top =200
        End
    End
End
`;

function makeOrchestrator(importResult = successResult({ imported: true })): VbaFormsOrchestrator {
  return {
    executor: vi.fn(),
    env: { DYSFLOW_HOME: "C:/runtime/dysflow" },
    cwd: "C:/repo",
    resolveExecutionTarget: vi.fn().mockResolvedValue(
      successResult({
        accessPath: "C:/repo/App.accdb",
        destinationRoot: "C:/repo",
        projectRoot: "C:/repo",
        timeoutMs: 30000,
        configSource: "explicit-request",
      }),
    ),
    validateStrictContext: vi.fn(() => successResult(undefined)),
    executeMappedTool: vi.fn().mockResolvedValue(importResult),
  };
}

function mockFs(overrides: Partial<FormFileSystemPort> = {}): FormFileSystemPort {
  return {
    mkdir: vi.fn(),
    readdir: vi.fn(),
    readFile: vi.fn().mockResolvedValue(SIMPLE_FORM),
    readJson: vi.fn(),
    writeFile: vi.fn(),
    ...overrides,
  };
}

describe("VbaFormsAdapter — form mutation tools", () => {
  it("handles public form mutation tools", () => {
    expect(VbaFormsAdapter.handles("dysflow_form_add_control")).toBe(true);
    expect(VbaFormsAdapter.handles("dysflow_form_move_control")).toBe(true);
    expect(VbaFormsAdapter.handles("dysflow_form_rename_control")).toBe(true);
  });

  it("dry-runs add-control without writing or importing", async () => {
    const orchestrator = makeOrchestrator();
    const writeFile = vi.fn();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("dysflow_form_add_control", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      controlName: "cmdSave",
      controlType: "CommandButton",
      properties: { Caption: '"Save"', Left: "300", Top: "400" },
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({ mode: "dry-run", changedControlName: "cmdSave" });
      expect(String((result.data as { source: string }).source)).toContain('Name ="cmdSave"');
    }
    expect(writeFile).not.toHaveBeenCalled();
    expect(orchestrator.executeMappedTool).not.toHaveBeenCalled();
  });

  it("applies move-control by writing the mutated form and running import_modules as the LoadFromText gate", async () => {
    const orchestrator = makeOrchestrator();
    const writeFile = vi.fn();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("dysflow_form_move_control", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      controlName: "txtName",
      left: 800,
      top: 900,
      apply: true,
    });

    expect(result.ok).toBe(true);
    expect(writeFile).toHaveBeenCalledWith(
      "C:\\repo\\forms\\Form_Customer.form.txt",
      expect.stringContaining("Left =800\n            Top =900"),
      "utf8",
    );
    expect(orchestrator.executeMappedTool).toHaveBeenCalledWith(
      "import_modules",
      expect.objectContaining({ moduleNames: ["Customer"], apply: true, importMode: "Auto" }),
      expect.any(Object),
    );
  });

  it("rejects apply when sourcePath is outside the resolved destinationRoot", async () => {
    const orchestrator = makeOrchestrator();
    const fs = mockFs();
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("dysflow_form_move_control", {
      sourcePath: "C:/outside/forms/Form_Customer.form.txt",
      controlName: "txtName",
      left: 800,
      apply: true,
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: { code: "INVALID_INPUT" } });
    expect(fs.readFile).not.toHaveBeenCalled();
    expect(orchestrator.executeMappedTool).not.toHaveBeenCalled();
  });

  it("rejects production runtime sourcePath before reading or writing", async () => {
    const orchestrator = makeOrchestrator();
    vi.mocked(orchestrator.resolveExecutionTarget).mockResolvedValueOnce(
      successResult({
        accessPath: "C:/runtime/dysflow/App.accdb",
        destinationRoot: "C:/runtime/dysflow",
        projectRoot: "C:/runtime/dysflow",
        timeoutMs: 30000,
        configSource: "explicit-request",
      }),
    );
    const fs = mockFs();
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("dysflow_form_add_control", {
      sourcePath: "C:/runtime/dysflow/forms/Form_Customer.form.txt",
      controlName: "cmdSave",
      controlType: "CommandButton",
      apply: true,
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: { code: "INVALID_INPUT" } });
    expect(fs.readFile).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it("rejects non form/report source extensions", async () => {
    const orchestrator = makeOrchestrator();
    const fs = mockFs();
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("dysflow_form_add_control", {
      sourcePath: "C:/repo/forms/Form_Customer.cls",
      controlName: "cmdSave",
      controlType: "CommandButton",
      apply: true,
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: { code: "INVALID_INPUT" } });
    expect(fs.readFile).not.toHaveBeenCalled();
  });

  it("writes and imports the canonical resolved target even when sourcePath uses relative segments", async () => {
    const orchestrator = makeOrchestrator();
    const writeFile = vi.fn();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("dysflow_form_move_control", {
      sourcePath: "forms/../forms/Form_Customer.form.txt",
      controlName: "txtName",
      left: 800,
      apply: true,
    });

    expect(result.ok).toBe(true);
    expect(writeFile).toHaveBeenCalledWith(
      "C:\\repo\\forms\\Form_Customer.form.txt",
      expect.stringContaining("Left =800"),
      "utf8",
    );
    expect(orchestrator.executeMappedTool).toHaveBeenCalledWith(
      "import_modules",
      expect.objectContaining({
        sourcePath: "C:\\repo\\forms\\Form_Customer.form.txt",
        destinationRoot: "C:\\repo",
        moduleNames: ["Customer"],
      }),
      expect.any(Object),
    );
  });

  it("restores the original source when the import_modules apply gate fails", async () => {
    const orchestrator = makeOrchestrator(
      failureResult({ code: "IMPORT_FAILED", message: "import_modules failed", retryable: false }),
    );
    const writeFile = vi.fn();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("dysflow_form_rename_control", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      controlName: "txtName",
      newName: "txtCustomerName",
      apply: true,
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: { code: "FORM_IMPORT_GATE_FAILED" } });
    expect(writeFile).toHaveBeenLastCalledWith(
      "C:\\repo\\forms\\Form_Customer.form.txt",
      SIMPLE_FORM,
      "utf8",
    );
  });
});
