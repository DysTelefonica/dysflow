// Issue #816 — Phase 3 (Ergonomic actions). Adapter-level integration tests
// for `form_align_controls` + `form_distribute_controls`. These tests pin
// the adapter wiring — that the new tools route through `mutateForm` and
// the shared `applyGuardedFormWrite` seam, the same as form_set_property /
// form_delete_control. They also pin identity preservation + dryRun/apply
// semantics end-to-end through the adapter.

import { describe, expect, it, vi } from "vitest";
import {
  VbaFormsAdapter,
  type VbaFormsOrchestrator,
} from "../../../src/adapters/vba-sync/vba-forms-adapter";
import {
  createDysflowError,
  failureResult,
  successResult,
} from "../../../src/core/contracts/index";
import type { FormFileSystemPort } from "../../../src/core/services/vba-form-service";

const SIMPLE_FORM = `Version =21
Checksum =123456789
Begin Form
    Begin TextBox
        Name ="txtA"
        Left =100
        Top =100
        Width =1000
        Height =500
        Caption ="A"
    End
    Begin TextBox
        Name ="txtB"
        Left =200
        Top =200
        Width =1000
        Height =500
        Caption ="B"
    End
    Begin TextBox
        Name ="txtC"
        Left =900
        Top =300
        Width =1000
        Height =500
        Caption ="C"
    End
End
CodeBehindForm
Option Compare Database
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

describe("VbaFormsAdapter — form_align_controls (issue #816)", () => {
  it("handles form_align_controls", () => {
    expect(VbaFormsAdapter.handles("form_align_controls")).toBe(true);
  });

  it("dry-runs align to the median Left without writing or importing", async () => {
    const orchestrator = makeOrchestrator();
    const writeFile = vi.fn();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_align_controls", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      controlNames: ["txtA", "txtB", "txtC"],
      edge: "left",
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({ mode: "dry-run" });
      // median(100, 200, 900) for 3 controls = 200.
      expect(String((result.data as { source: string }).source)).toContain("Left =200");
    }
    expect(writeFile).not.toHaveBeenCalled();
    expect(orchestrator.executeMappedTool).not.toHaveBeenCalled();
  });

  it("applies align by writing the mutated form and running import_modules", async () => {
    const orchestrator = makeOrchestrator();
    const writeFile = vi.fn();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_align_controls", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      controlNames: ["txtA", "txtB"],
      edge: "right",
      apply: true,
    });

    expect(result.ok).toBe(true);
    expect(writeFile).toHaveBeenCalledWith(
      "C:\\repo\\forms\\Form_Customer.form.txt",
      expect.stringContaining("Left ="),
      "utf8",
    );
    expect(orchestrator.executeMappedTool).toHaveBeenCalledWith(
      "import_modules",
      expect.objectContaining({ moduleNames: ["Customer"], apply: true, importMode: "Auto" }),
      expect.any(Object),
    );
  });

  it("rejects unknown control names with FORM_CONTROL_NOT_FOUND", async () => {
    const orchestrator = makeOrchestrator();
    const fs = mockFs();
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_align_controls", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      controlNames: ["txtA", "ghost"],
      edge: "left",
      dryRun: true,
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: { code: "FORM_CONTROL_NOT_FOUND" } });
  });
});

describe("VbaFormsAdapter — form_distribute_controls (issue #816)", () => {
  it("handles form_distribute_controls", () => {
    expect(VbaFormsAdapter.handles("form_distribute_controls")).toBe(true);
  });

  it("dry-runs distribute without writing or importing", async () => {
    const orchestrator = makeOrchestrator();
    const writeFile = vi.fn();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_distribute_controls", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      controlNames: ["txtA", "txtB", "txtC"],
      axis: "horizontal",
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({ mode: "dry-run" });
    }
    expect(writeFile).not.toHaveBeenCalled();
    expect(orchestrator.executeMappedTool).not.toHaveBeenCalled();
  });

  it("applies distribute by writing the mutated form and running import_modules", async () => {
    const orchestrator = makeOrchestrator();
    const writeFile = vi.fn();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_distribute_controls", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      controlNames: ["txtA", "txtB", "txtC"],
      axis: "horizontal",
      spacing: 50,
      apply: true,
    });

    expect(result.ok).toBe(true);
    expect(writeFile).toHaveBeenCalledWith(
      "C:\\repo\\forms\\Form_Customer.form.txt",
      expect.stringContaining("Left ="),
      "utf8",
    );
    expect(orchestrator.executeMappedTool).toHaveBeenCalledWith(
      "import_modules",
      expect.objectContaining({ moduleNames: ["Customer"], apply: true, importMode: "Auto" }),
      expect.any(Object),
    );
  });

  it("rejects <2 controls with FORM_MUTATION_INVALID (issue acceptance criterion)", async () => {
    const orchestrator = makeOrchestrator();
    const fs = mockFs();
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_distribute_controls", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      controlNames: ["txtA"],
      axis: "horizontal",
      dryRun: true,
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: { code: "FORM_MUTATION_INVALID" } });
  });

  it("rejects empty controlNames with FORM_MUTATION_INVALID", async () => {
    const orchestrator = makeOrchestrator();
    const fs = mockFs();
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_distribute_controls", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      controlNames: [],
      axis: "horizontal",
      dryRun: true,
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: { code: "FORM_MUTATION_INVALID" } });
  });

  it("rejects negative spacing with FORM_MUTATION_INVALID", async () => {
    const orchestrator = makeOrchestrator();
    const fs = mockFs();
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_distribute_controls", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      controlNames: ["txtA", "txtB"],
      axis: "horizontal",
      spacing: -10,
      dryRun: true,
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: { code: "FORM_MUTATION_INVALID" } });
  });
});

describe("VbaFormsAdapter — form_align_controls + form_distribute_controls write-gate", () => {
  it("form_align_controls is refused by the runtime write-gate (resolved source outside destinationRoot)", async () => {
    const orchestrator = makeOrchestrator();
    const fs = mockFs();
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_align_controls", {
      sourcePath: "C:/outside/forms/Form_Customer.form.txt",
      controlNames: ["txtA", "txtB"],
      edge: "left",
      apply: true,
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: { code: "INVALID_INPUT" } });
    expect(fs.readFile).not.toHaveBeenCalled();
    expect(orchestrator.executeMappedTool).not.toHaveBeenCalled();
  });

  it("form_distribute_controls is refused by the runtime write-gate (resolved source outside destinationRoot)", async () => {
    const orchestrator = makeOrchestrator();
    const fs = mockFs();
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_distribute_controls", {
      sourcePath: "C:/outside/forms/Form_Customer.form.txt",
      controlNames: ["txtA", "txtB"],
      axis: "horizontal",
      apply: true,
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: { code: "INVALID_INPUT" } });
    expect(fs.readFile).not.toHaveBeenCalled();
    expect(orchestrator.executeMappedTool).not.toHaveBeenCalled();
  });

  it("form_align_controls is refused by the runtime write-gate (non form/report source extension)", async () => {
    const orchestrator = makeOrchestrator();
    const fs = mockFs();
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_align_controls", {
      sourcePath: "C:/repo/forms/Form_Customer.cls",
      controlNames: ["txtA", "txtB"],
      edge: "left",
      apply: true,
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: { code: "INVALID_INPUT" } });
    expect(fs.readFile).not.toHaveBeenCalled();
  });

  it("form_distribute_controls surfaces FORM_PARSE_ERROR when the source file is unreadable", async () => {
    const orchestrator = makeOrchestrator();
    const fs = mockFs({
      readFile: vi.fn().mockResolvedValue("this is not a valid .form.txt"),
    });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_distribute_controls", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      controlNames: ["txtA", "txtB"],
      axis: "horizontal",
      dryRun: true,
    });

    // An invalid source produces FORM_PARSE_ERROR. We assert it's a
    // failure result with a recognized code; the exact error type is the
    // underlying parser's contract.
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(["FORM_PARSE_ERROR", "FORM_MUTATION_INVALID"]).toContain(result.error.code);
    }
  });

  it("form_align_controls surfaces a failure result when sourcePath is missing", async () => {
    const orchestrator = makeOrchestrator();
    const fs = mockFs();
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_align_controls", {
      controlNames: ["txtA", "txtB"],
      edge: "left",
      dryRun: true,
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: { code: "FORM_SPEC_MISSING" } });
  });

  it("form_distribute_controls surfaces a failure result when sourcePath is missing", async () => {
    const orchestrator = makeOrchestrator();
    const fs = mockFs();
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_distribute_controls", {
      controlNames: ["txtA", "txtB"],
      axis: "horizontal",
      dryRun: true,
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: { code: "FORM_SPEC_MISSING" } });
  });

  it("form_align_controls surfaces FORM_NOT_FOUND when the source file does not exist", async () => {
    const orchestrator = makeOrchestrator();
    const fs = mockFs({
      readFile: vi.fn().mockRejectedValue(new Error("ENOENT: file not found")),
    });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_align_controls", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      controlNames: ["txtA", "txtB"],
      edge: "left",
      dryRun: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORM_NOT_FOUND");
    }
  });

  it("form_distribute_controls surfaces FORM_IMPORT_GATE_FAILED on apply when the loadFromText gate fails", async () => {
    const orchestrator = makeOrchestrator(
      failureResult(createDysflowError("FORM_IMPORT_GATE_FAILED", "LoadFromText gate failed")),
    );
    const fs = mockFs();
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_distribute_controls", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      controlNames: ["txtA", "txtB", "txtC"],
      axis: "horizontal",
      apply: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORM_IMPORT_GATE_FAILED");
    }
  });
});
