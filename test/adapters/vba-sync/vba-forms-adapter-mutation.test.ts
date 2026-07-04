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

  // #692 — rollback success must be reported in error details
  it("reports rollback success in error details when import gate fails (deserializeForm)", async () => {
    const orchestrator = makeOrchestrator(
      failureResult({ code: "IMPORT_FAILED", message: "import_modules failed", retryable: false }),
    );
    const writeFile = vi.fn();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    // Valid IR that serializes to something different from SIMPLE_FORM.
    const ir = {
      name: "Form_Customer",
      kind: "Form" as const,
      preamble: [],
      root: {
        blockType: "Form",
        entries: [],
        children: [
          {
            blockType: "",
            entries: [{ kind: "scalar" as const, key: "Name", value: '"txtName"' }],
            children: [],
          },
        ],
      },
      codeBehind: null,
    };

    const result = await adapter.execute("dysflow_form_deserialize", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      ir,
      apply: true,
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: { code: "FORM_IMPORT_GATE_FAILED" } });
    if (!result.ok) {
      expect(result.error.details).toMatchObject({
        cause: expect.objectContaining({ code: "IMPORT_FAILED" }),
        rollback: { attempted: true, applied: true, targetExisted: true },
      });
    }
  });

  // #692 — rollback failure must be reported in error details with the error message
  it("reports rollback failure in error details when restore write throws (deserializeForm)", async () => {
    const orchestrator = makeOrchestrator(
      failureResult({ code: "IMPORT_FAILED", message: "import_modules failed", retryable: false }),
    );
    const writeFile = vi.fn().mockImplementation(async (_path: string) => {
      // First call is the mutation write (succeeds), second is the rollback write (fails).
      if (writeFile.mock.calls.length === 1) return; // mutation write succeeds
      throw new Error("ENOSPC: no space left on device");
    });
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const ir = {
      name: "Form_Customer",
      kind: "Form" as const,
      preamble: [],
      root: {
        blockType: "Form",
        entries: [],
        children: [
          {
            blockType: "",
            entries: [{ kind: "scalar" as const, key: "Name", value: '"txtName"' }],
            children: [],
          },
        ],
      },
      codeBehind: null,
    };

    const result = await adapter.execute("dysflow_form_deserialize", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      ir,
      apply: true,
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: { code: "FORM_IMPORT_GATE_FAILED" } });
    if (!result.ok) {
      expect(result.error.details).toMatchObject({
        cause: expect.objectContaining({ code: "IMPORT_FAILED" }),
        rollback: {
          attempted: true,
          applied: false,
          targetExisted: true,
          error: { message: expect.stringContaining("ENOSPC") },
        },
      });
    }
  });

  it("applies deserializeForm (ir -> text -> import gate) and returns success", async () => {
    const orchestrator = makeOrchestrator();
    const writeFile = vi.fn();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const ir = {
      name: "Form_Customer",
      kind: "Form" as const,
      preamble: [],
      root: {
        blockType: "Form",
        entries: [],
        children: [
          {
            blockType: "",
            entries: [{ kind: "scalar" as const, key: "Name", value: '"txtName"' }],
            children: [],
          },
        ],
      },
      codeBehind: null,
    };

    const result = await adapter.execute("dysflow_form_deserialize", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      ir,
      apply: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({ mode: "apply", loadFromTextGate: "passed" });
    }
    expect(writeFile).toHaveBeenCalledTimes(1); // only the mutation write, no rollback needed
  });
});

// ---------------------------------------------------------------------------
// slice 5 (issue #618) — `dysflow_create_form_from_template`
// ---------------------------------------------------------------------------
//
// Fixture used for the clone engine: contains `{{FormName}}` and
// `{{TitleCaption}}` placeholders in layout scalars and a PreservedKey
// (`PrtDevMode`) that does NOT carry tokens.
const CLONE_SOURCE_FORM = `Version =21
Checksum =-1482272507
Begin Form
    Caption ="{{TitleCaption}}"
    DefaultValue ="hello {{FormName}}"
    PrtDevMode = Begin
        0xDEADBEEF
    End
    Begin TextBox
        Name ="txt{{FormName}}"
    End
End`;

const CLONE_BENCH_SOURCE_PATH = "C:\\bench\\forms\\Form_CloneSource.form.txt";
const CLONE_BENCH_TARGET_PATH = "C:\\bench\\forms\\Form_CloneTarget.form.txt";
const CLONE_PROJECT_SOURCE_PATH = "C:\\repo\\forms\\Form_CloneSource.form.txt";
const CLONE_BENCH_ROOT = "C:\\bench\\forms";

describe("VbaFormsAdapter — dysflow_create_form_from_template (slice 5)", () => {
  it("handles dysflow_create_form_from_template", () => {
    expect(VbaFormsAdapter.handles("dysflow_create_form_from_template")).toBe(true);
  });

  it("dry-runs with bench-first resolution: reads bench source, never writes or imports", async () => {
    const orchestrator = makeOrchestrator();
    const writeFile = vi.fn();
    const readFile = vi.fn().mockImplementation(async (path: string) => {
      if (path === CLONE_BENCH_SOURCE_PATH) return Promise.resolve(CLONE_SOURCE_FORM);
      if (path === CLONE_PROJECT_SOURCE_PATH) {
        throw new Error("FileSystemPort: bench-first should not have read projectRoot");
      }
      throw new Error(`unexpected read: ${path}`);
    });
    const fs = mockFs({ readFile, writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs, { benchCacheRoot: CLONE_BENCH_ROOT });

    const result = await adapter.execute("dysflow_create_form_from_template", {
      sourceForm: "Form_CloneSource",
      targetForm: "Form_CloneTarget",
      tokenMap: { FormName: "CloneTarget", TitleCaption: "Cloned Caption" },
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Slice 5 envelope: sourcePath, targetPath, mode, importGate, appliedTokens, missingTokens, warnings
      expect(result.data).toMatchObject({ mode: "dry-run", importGate: "not-run" });
      expect(result.data).toMatchObject({
        sourcePath: CLONE_BENCH_SOURCE_PATH,
      });
      const data = result.data as { appliedTokens: string[]; targetSource: string };
      expect(data.appliedTokens).toEqual(expect.arrayContaining(["FormName", "TitleCaption"]));
      // Post-replacement text replaces tokens inside layout scalars.
      expect(data.targetSource).toContain('Caption ="Cloned Caption"');
      expect(data.targetSource).toContain("txtCloneTarget");
      // PrtDevMode bytes remain unchanged.
      expect(data.targetSource).toContain("0xDEADBEEF");
    }
    expect(readFile).toHaveBeenCalledWith(CLONE_BENCH_SOURCE_PATH);
    expect(readFile).not.toHaveBeenCalledWith(CLONE_PROJECT_SOURCE_PATH);
    expect(writeFile).not.toHaveBeenCalled();
    expect(orchestrator.executeMappedTool).not.toHaveBeenCalled();
  });

  it("falls back to projectRoot when bench cache does not have the source form", async () => {
    const orchestrator = makeOrchestrator();
    const writeFile = vi.fn();
    const readFile = vi.fn().mockImplementation(async (path: string) => {
      if (path === CLONE_BENCH_SOURCE_PATH) {
        throw new Error("ENOENT");
      }
      if (path === CLONE_PROJECT_SOURCE_PATH) return Promise.resolve(CLONE_SOURCE_FORM);
      throw new Error(`unexpected read: ${path}`);
    });
    const fs = mockFs({ readFile, writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs, { benchCacheRoot: CLONE_BENCH_ROOT });

    const result = await adapter.execute("dysflow_create_form_from_template", {
      sourceForm: "Form_CloneSource",
      targetForm: "Form_CloneTarget",
      tokenMap: { FormName: "CloneTarget" },
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    expect(readFile).toHaveBeenCalledWith(CLONE_BENCH_SOURCE_PATH);
    expect(readFile).toHaveBeenCalledWith(CLONE_PROJECT_SOURCE_PATH);
    // Projectroot fallback was used. Result echoes the resolved source.
    if (result.ok) {
      expect(result.data).toMatchObject({ sourcePath: CLONE_PROJECT_SOURCE_PATH });
    }
  });

  it("apply: writes the token-replaced target and invokes import_modules as the LoadFromText gate", async () => {
    const orchestrator = makeOrchestrator();
    const writeFile = vi.fn();
    const readFile = vi.fn().mockImplementation(async (path: string) => {
      if (path === CLONE_BENCH_SOURCE_PATH) return Promise.resolve(CLONE_SOURCE_FORM);
      // Target does not yet exist — readFile throws ENOENT.
      if (path === CLONE_BENCH_TARGET_PATH) throw new Error("ENOENT");
      throw new Error(`unexpected read: ${path}`);
    });
    const fs = mockFs({ readFile, writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs, { benchCacheRoot: CLONE_BENCH_ROOT });

    const result = await adapter.execute("dysflow_create_form_from_template", {
      sourceForm: "Form_CloneSource",
      targetForm: "Form_CloneTarget",
      tokenMap: { FormName: "CloneTarget", TitleCaption: "Cloned Caption" },
      apply: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({ mode: "apply", importGate: "passed" });
      expect(result.data).toMatchObject({
        sourcePath: CLONE_BENCH_SOURCE_PATH,
        targetPath: CLONE_BENCH_TARGET_PATH,
      });
    }
    // Target was written with the token-replaced content.
    expect(writeFile).toHaveBeenCalledWith(
      CLONE_BENCH_TARGET_PATH,
      expect.stringContaining('Caption ="Cloned Caption"'),
      "utf8",
    );
    // import_modules apply gate was invoked with the resolved target as the module.
    expect(orchestrator.executeMappedTool).toHaveBeenCalledWith(
      "import_modules",
      expect.objectContaining({
        moduleNames: ["CloneTarget"],
        apply: true,
        importMode: "Auto",
      }),
      expect.any(Object),
    );
  });

  it("rejects when target exists and overwrite is false (FORM_TARGET_EXISTS), no write, no import", async () => {
    const orchestrator = makeOrchestrator();
    const writeFile = vi.fn();
    const EXISTING_TARGET_CONTENT = "PRESERVE ME";
    const readFile = vi.fn().mockImplementation(async (path: string) => {
      if (path === CLONE_BENCH_SOURCE_PATH) return Promise.resolve(CLONE_SOURCE_FORM);
      if (path === CLONE_BENCH_TARGET_PATH) return Promise.resolve(EXISTING_TARGET_CONTENT);
      throw new Error(`unexpected read: ${path}`);
    });
    const fs = mockFs({ readFile, writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs, { benchCacheRoot: CLONE_BENCH_ROOT });

    const result = await adapter.execute("dysflow_create_form_from_template", {
      sourceForm: "Form_CloneSource",
      targetForm: "Form_CloneTarget",
      tokenMap: { FormName: "CloneTarget" },
      // overwrite omitted — defaults to false
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: { code: "FORM_TARGET_EXISTS" } });
    expect(writeFile).not.toHaveBeenCalled();
    expect(orchestrator.executeMappedTool).not.toHaveBeenCalled();
  });

  it("overwrites an existing target when overwrite=true and writes the token-replaced content", async () => {
    const orchestrator = makeOrchestrator();
    const writeFile = vi.fn();
    const readFile = vi.fn().mockImplementation(async (path: string) => {
      if (path === CLONE_BENCH_SOURCE_PATH) return Promise.resolve(CLONE_SOURCE_FORM);
      if (path === CLONE_BENCH_TARGET_PATH) return Promise.resolve("PRESERVE ME");
      throw new Error(`unexpected read: ${path}`);
    });
    const fs = mockFs({ readFile, writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs, { benchCacheRoot: CLONE_BENCH_ROOT });

    const result = await adapter.execute("dysflow_create_form_from_template", {
      sourceForm: "Form_CloneSource",
      targetForm: "Form_CloneTarget",
      tokenMap: { FormName: "CloneTarget", TitleCaption: "Cloned Caption" },
      overwrite: true,
      apply: true,
    });

    expect(result.ok).toBe(true);
    expect(writeFile).toHaveBeenCalledWith(
      CLONE_BENCH_TARGET_PATH,
      expect.stringContaining("Cloned Caption"),
      "utf8",
    );
    expect(orchestrator.executeMappedTool).toHaveBeenCalledTimes(1);
  });

  it("restores the original target contents when the import gate fails", async () => {
    const orchestrator = makeOrchestrator(
      failureResult({
        code: "GATE_FAILED",
        message: "import_modules rejected",
        retryable: false,
      }),
    );
    const writeFile = vi.fn();
    const ORIGINAL_TARGET = "ORIGINAL TARGET CONTENT — RESTORE ME";
    const readFile = vi.fn().mockImplementation(async (path: string) => {
      if (path === CLONE_BENCH_SOURCE_PATH) return Promise.resolve(CLONE_SOURCE_FORM);
      if (path === CLONE_BENCH_TARGET_PATH) return Promise.resolve(ORIGINAL_TARGET);
      throw new Error(`unexpected read: ${path}`);
    });
    const fs = mockFs({ readFile, writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs, { benchCacheRoot: CLONE_BENCH_ROOT });

    const result = await adapter.execute("dysflow_create_form_from_template", {
      sourceForm: "Form_CloneSource",
      targetForm: "Form_CloneTarget",
      tokenMap: { FormName: "CloneTarget" },
      overwrite: true,
      apply: true,
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: { code: "FORM_IMPORT_GATE_FAILED" } });
    // The restore was the LAST write — writeFile received ORIGINAL_TARGET on the target path.
    expect(writeFile).toHaveBeenLastCalledWith(CLONE_BENCH_TARGET_PATH, ORIGINAL_TARGET, "utf8");
  });

  // #692 — rollback success must be reported in error details
  it("reports rollback success in error details when import gate fails (cloneFormFromTemplate)", async () => {
    const orchestrator = makeOrchestrator(
      failureResult({
        code: "GATE_FAILED",
        message: "import_modules rejected",
        retryable: false,
      }),
    );
    const writeFile = vi.fn();
    const ORIGINAL_TARGET = "ORIGINAL TARGET CONTENT";
    const readFile = vi.fn().mockImplementation(async (path: string) => {
      if (path === CLONE_BENCH_SOURCE_PATH) return Promise.resolve(CLONE_SOURCE_FORM);
      if (path === CLONE_BENCH_TARGET_PATH) return Promise.resolve(ORIGINAL_TARGET);
      throw new Error(`unexpected read: ${path}`);
    });
    const fs = mockFs({ readFile, writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs, { benchCacheRoot: CLONE_BENCH_ROOT });

    const result = await adapter.execute("dysflow_create_form_from_template", {
      sourceForm: "Form_CloneSource",
      targetForm: "Form_CloneTarget",
      tokenMap: { FormName: "CloneTarget" },
      overwrite: true,
      apply: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.details).toMatchObject({
        rollback: { attempted: true, applied: true, targetExisted: true },
      });
    }
  });

  // #692 — rollback failure must be reported in error details with the error message
  it("reports rollback failure in error details when restore write throws (cloneFormFromTemplate)", async () => {
    const orchestrator = makeOrchestrator(
      failureResult({
        code: "GATE_FAILED",
        message: "import_modules rejected",
        retryable: false,
      }),
    );
    const writeFile = vi.fn().mockImplementation(async (_path: string) => {
      // First call is the mutation write (succeeds), second is the rollback write (fails).
      if (writeFile.mock.calls.length === 1) return; // mutation write succeeds
      throw new Error("EACCES: permission denied on restore volume");
    });
    const ORIGINAL_TARGET = "ORIGINAL TARGET CONTENT";
    const readFile = vi.fn().mockImplementation(async (path: string) => {
      if (path === CLONE_BENCH_SOURCE_PATH) return Promise.resolve(CLONE_SOURCE_FORM);
      if (path === CLONE_BENCH_TARGET_PATH) return Promise.resolve(ORIGINAL_TARGET);
      throw new Error(`unexpected read: ${path}`);
    });
    const fs = mockFs({ readFile, writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs, { benchCacheRoot: CLONE_BENCH_ROOT });

    const result = await adapter.execute("dysflow_create_form_from_template", {
      sourceForm: "Form_CloneSource",
      targetForm: "Form_CloneTarget",
      tokenMap: { FormName: "CloneTarget" },
      overwrite: true,
      apply: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.details).toMatchObject({
        rollback: {
          attempted: true,
          applied: false,
          targetExisted: true,
          error: { message: expect.stringContaining("EACCES") },
        },
      });
    }
  });

  // #692 — new-target rollback: when target did not exist before (readFile throws ENOENT),
  // the import gate failure writes originalTargetText (empty string) back — this leaves
  // an empty placeholder artifact, NOT a true restore of "no file". The new metadata
  // (targetExisted, restoredState, requiresManualCleanup) disambiguates this for consumers.
  it("reports new-target rollback metadata when import gate fails for a newly-created target", async () => {
    const orchestrator = makeOrchestrator(
      failureResult({
        code: "GATE_FAILED",
        message: "import_modules rejected",
        retryable: false,
      }),
    );
    const writeFile = vi.fn();
    // Target does NOT exist (readFile throws ENOENT on first call, then source).
    const readFile = vi.fn().mockImplementation(async (path: string) => {
      if (path === CLONE_BENCH_SOURCE_PATH) return Promise.resolve(CLONE_SOURCE_FORM);
      if (path === CLONE_BENCH_TARGET_PATH) throw new Error("ENOENT"); // new target
      throw new Error(`unexpected read: ${path}`);
    });
    const fs = mockFs({ readFile, writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs, { benchCacheRoot: CLONE_BENCH_ROOT });

    const result = await adapter.execute("dysflow_create_form_from_template", {
      sourceForm: "Form_CloneSource",
      targetForm: "Form_CloneTarget",
      tokenMap: { FormName: "CloneTarget" },
      apply: true,
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: { code: "FORM_IMPORT_GATE_FAILED" } });
    // Rollback wrote empty string (originalTargetText for non-existent target).
    expect(writeFile).toHaveBeenLastCalledWith(CLONE_BENCH_TARGET_PATH, "", "utf8");
    if (!result.ok) {
      // New-target metadata: original state was "no file", rollback wrote empty placeholder.
      expect(result.error.details).toMatchObject({
        rollback: {
          attempted: true,
          applied: true,
          targetExisted: false,
          restoredState: "empty-placeholder",
          requiresManualCleanup: true,
        },
      });
    }
  });

  // #692 — new-target rollback failure: when target did not exist AND the restore write fails.
  it("reports new-target rollback failure metadata when restore write throws for a newly-created target", async () => {
    const orchestrator = makeOrchestrator(
      failureResult({
        code: "GATE_FAILED",
        message: "import_modules rejected",
        retryable: false,
      }),
    );
    const writeFile = vi.fn().mockImplementation(async (_path: string) => {
      // First call is the mutation write (succeeds), second is the rollback write (fails).
      if (writeFile.mock.calls.length === 1) return; // mutation write succeeds
      throw new Error("ENOSPC: no space left on device");
    });
    // Target does NOT exist (readFile throws ENOENT on first call, then source).
    const readFile = vi.fn().mockImplementation(async (path: string) => {
      if (path === CLONE_BENCH_SOURCE_PATH) return Promise.resolve(CLONE_SOURCE_FORM);
      if (path === CLONE_BENCH_TARGET_PATH) throw new Error("ENOENT"); // new target
      throw new Error(`unexpected read: ${path}`);
    });
    const fs = mockFs({ readFile, writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs, { benchCacheRoot: CLONE_BENCH_ROOT });

    const result = await adapter.execute("dysflow_create_form_from_template", {
      sourceForm: "Form_CloneSource",
      targetForm: "Form_CloneTarget",
      tokenMap: { FormName: "CloneTarget" },
      apply: true,
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: { code: "FORM_IMPORT_GATE_FAILED" } });
    if (!result.ok) {
      // New-target rollback failure still carries the metadata indicating manual cleanup is needed.
      expect(result.error.details).toMatchObject({
        rollback: {
          attempted: true,
          applied: false,
          targetExisted: false,
          restoredState: "empty-placeholder",
          requiresManualCleanup: true,
          error: { message: expect.stringContaining("ENOSPC") },
        },
      });
    }
  });

  it("rejects strict missing tokens via FORM_MUTATION_INVALID", async () => {
    const orchestrator = makeOrchestrator();
    const writeFile = vi.fn();
    const readFile = vi.fn().mockImplementation(async (path: string) => {
      if (path === CLONE_BENCH_SOURCE_PATH) return Promise.resolve(CLONE_SOURCE_FORM);
      if (path === CLONE_BENCH_TARGET_PATH) throw new Error("ENOENT");
      throw new Error(`unexpected read: ${path}`);
    });
    const fs = mockFs({ readFile, writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs, { benchCacheRoot: CLONE_BENCH_ROOT });

    // TitleCaption is unmapped — strict policy must reject before any write.
    const result = await adapter.execute("dysflow_create_form_from_template", {
      sourceForm: "Form_CloneSource",
      targetForm: "Form_CloneTarget",
      tokenMap: { FormName: "CloneTarget" },
      missingTokenPolicy: "strict",
      apply: true,
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: { code: "FORM_MUTATION_INVALID" } });
    expect(writeFile).not.toHaveBeenCalled();
    expect(orchestrator.executeMappedTool).not.toHaveBeenCalled();
  });

  it("rejects an invalid token map with FORM_TOKEN_MAP_INVALID", async () => {
    const orchestrator = makeOrchestrator();
    const fs = mockFs();
    const adapter = new VbaFormsAdapter(orchestrator, fs, { benchCacheRoot: CLONE_BENCH_ROOT });

    // Empty token key — engine rejects at validation.
    const result = await adapter.execute("dysflow_create_form_from_template", {
      sourceForm: "Form_CloneSource",
      targetForm: "Form_CloneTarget",
      tokenMap: { "": "X" },
      apply: true,
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: { code: "FORM_TOKEN_MAP_INVALID" } });
    expect(fs.readFile).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(orchestrator.executeMappedTool).not.toHaveBeenCalled();
  });
});
