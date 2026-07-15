import { describe, expect, it, vi } from "vitest";
import {
  VbaFormsAdapter,
  type VbaFormsOrchestrator,
} from "../../../src/adapters/vba-sync/vba-forms-adapter";
import { failureResult, successResult } from "../../../src/core/contracts/index";
import type { FormFileSystemPort } from "../../../src/core/services/vba-form-service";

// ---------------------------------------------------------------------------
// Helpers (mirror vba-forms-adapter-mutation.test.ts).
// ---------------------------------------------------------------------------

const FORM_WITH_GRID_AND_BUTTON = `Version =21
Checksum =123456789
Begin Form
    Format =255
    PrtDevMode = Begin
        0x01020304
    End
    OnOpen ="[Event Procedure]"
    Begin
        Begin TextBox
            Name ="txtName"
            Left =100
            Top =200
            Width =3000
            Height =400
            LayoutCachedLeft =100
            LayoutCachedTop =200
            LayoutCachedWidth =3000
            LayoutCachedHeight =400
            OnClick ="[Event Procedure]"
            Format ="@"
        End
        Begin CommandButton
            Name ="cmdSave"
            Caption ="Save"
            Left =3500
            Top =5000
            Width =1500
            Height =500
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
    readFile: vi.fn().mockResolvedValue(FORM_WITH_GRID_AND_BUTTON),
    readJson: vi.fn(),
    writeFile: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// F1 — `form_set_properties` (Issue #872) — atomic batch property writes.
// Mirrors form_set_property's applyGuardedFormWrite seam with a richer
// `properties` map and the additional contract that LayoutCached* are
// silently stripped from the request.
// ---------------------------------------------------------------------------

describe("VbaFormsAdapter — form_set_properties (issue #872 F1)", () => {
  it("handles form_set_properties", () => {
    expect(VbaFormsAdapter.handles("form_set_properties")).toBe(true);
  });

  it("dry-run returns the planned source WITHOUT writing the file or invoking import_modules", async () => {
    const orchestrator = makeOrchestrator();
    const writeFile = vi.fn();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_set_properties", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      controlName: "cmdSave",
      properties: { Caption: '"Apply"', Left: 800, Top: 900, Width: 1500, Height: 500 },
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({ mode: "dry-run", changedControlName: "cmdSave" });
      const source = String((result.data as { source: string }).source);
      expect(source).toContain('Caption ="Apply"');
      expect(source).toContain("Left =800");
      expect(source).toContain("Top =900");
    }
    expect(writeFile).not.toHaveBeenCalled();
    expect(orchestrator.executeMappedTool).not.toHaveBeenCalled();
  });

  it("apply writes the file and queues import_modules as the LoadFromText gate", async () => {
    const orchestrator = makeOrchestrator();
    const writeFile = vi.fn();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_set_properties", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      controlName: "txtName",
      properties: { Left: 5000, Top: 6000 },
      apply: true,
    });

    expect(result.ok).toBe(true);
    expect(writeFile).toHaveBeenCalledWith(
      "C:\\repo\\forms\\Form_Customer.form.txt",
      expect.stringContaining("Left =5000"),
      "utf8",
    );
    expect(orchestrator.executeMappedTool).toHaveBeenCalledWith(
      "import_modules",
      expect.objectContaining({ moduleNames: ["Customer"], apply: true, importMode: "Auto" }),
      expect.any(Object),
    );
  });

  it("strips LayoutCached* keys from the response (issue #872 F3)", async () => {
    const orchestrator = makeOrchestrator();
    const writeFile = vi.fn();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    // Caller passes ALL LayoutCached* keys plus one real key (Caption).
    // The real key applies; the LayoutCached* keys must NOT appear in
    // the serialized source AND must NOT bump changedControlName.
    const result = await adapter.execute("form_set_properties", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      controlName: "txtName",
      properties: {
        Caption: '"Renamed"',
        LayoutCachedLeft: 999,
        LayoutCachedTop: 999,
        LayoutCachedWidth: 999,
        LayoutCachedHeight: 999,
      },
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const source = String((result.data as { source: string }).source);
      // Real key applied.
      expect(source).toContain('Caption ="Renamed"');
      // LayoutCached* keys must NOT have been written into the serialized
      // source — they were silently stripped, not stored, not serialized.
      expect(source).not.toContain("LayoutCachedLeft =999");
      expect(source).not.toContain("LayoutCachedTop =999");
      expect(source).not.toContain("LayoutCachedWidth =999");
      expect(source).not.toContain("LayoutCachedHeight =999");
      // The original LayoutCached* on the file (set by parseFormTxt) are
      // also dropped because the control's entries have been replaced with
      // the new upsertScalar walk (the property map is rebuilt from the
      // upserted entries only). The contract is "we never SET LayoutCached*,
      // Access regenerates them on the next save" — so the serialized
      // form should be free of LayoutCached* entirely on this path.
    }
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("aborts the batch when a protected key is present (no IR written, FORM_PROPERTY_PROTECTED envelope)", async () => {
    const orchestrator = makeOrchestrator();
    const writeFile = vi.fn();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_set_properties", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      controlName: "txtName",
      properties: { Left: 100, Name: '"txtOther"' }, // protected key
      apply: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORM_PROPERTY_PROTECTED");
    }
    expect(writeFile).not.toHaveBeenCalled();
    expect(orchestrator.executeMappedTool).not.toHaveBeenCalled();
  });

  it("aborts the batch when the target control is missing (no IR written, FORM_CONTROL_NOT_FOUND envelope)", async () => {
    const orchestrator = makeOrchestrator();
    const writeFile = vi.fn();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_set_properties", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      controlName: "missingControl",
      properties: { Left: 100 },
      apply: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORM_CONTROL_NOT_FOUND");
    }
    expect(writeFile).not.toHaveBeenCalled();
    expect(orchestrator.executeMappedTool).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// F2 — `form_duplicate_control` (Issue #872) — clone an existing control
// under a new name, optionally overriding geometry and into a different
// section.
// ---------------------------------------------------------------------------

describe("VbaFormsAdapter — form_duplicate_control (issue #872 F2)", () => {
  it("handles form_duplicate_control", () => {
    expect(VbaFormsAdapter.handles("form_duplicate_control")).toBe(true);
  });

  it("dry-run previews the cloned source without writing or importing", async () => {
    const orchestrator = makeOrchestrator();
    const writeFile = vi.fn();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_duplicate_control", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      sourceControlName: "txtName",
      newName: "txtCustomerName",
      overrides: { Left: 7777, Top: 8888 },
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({
        mode: "dry-run",
        changedControlName: "txtCustomerName",
      });
      const source = String((result.data as { source: string }).source);
      expect(source).toContain('Name ="txtCustomerName"');
      expect(source).toContain("Left =7777");
      expect(source).toContain("Top =8888");
      // Original is still present.
      expect(source).toContain('Name ="txtName"');
    }
    expect(writeFile).not.toHaveBeenCalled();
    expect(orchestrator.executeMappedTool).not.toHaveBeenCalled();
  });

  it("apply writes the cloned source and queues import_modules", async () => {
    const orchestrator = makeOrchestrator();
    const writeFile = vi.fn();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_duplicate_control", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      sourceControlName: "cmdSave",
      newName: "cmdSave2",
      overrides: { Caption: '"Save 2"' },
      apply: true,
    });

    expect(result.ok).toBe(true);
    expect(writeFile).toHaveBeenCalledWith(
      "C:\\repo\\forms\\Form_Customer.form.txt",
      expect.stringContaining('Name ="cmdSave2"'),
      "utf8",
    );
    expect(orchestrator.executeMappedTool).toHaveBeenCalledWith(
      "import_modules",
      expect.objectContaining({ moduleNames: ["Customer"], apply: true, importMode: "Auto" }),
      expect.any(Object),
    );
  });

  it("preserves the source's OnClick = [Event Procedure] binding verbatim (the duplicated control is pre-wired)", async () => {
    const orchestrator = makeOrchestrator();
    const writeFile = vi.fn();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_duplicate_control", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      sourceControlName: "txtName", // has OnClick = [Event Procedure]
      newName: "txtName2",
      apply: true,
    });

    expect(result.ok).toBe(true);
    expect(writeFile).toHaveBeenCalledWith(
      "C:\\repo\\forms\\Form_Customer.form.txt",
      expect.stringContaining('Name ="txtName2"'),
      "utf8",
    );
    const serializedSource = String(writeFile.mock.calls[0]?.[1] ?? "");
    // The duplicated control carries its event binding verbatim. The
    // [Event Procedure] string must appear TWICE — once on the original
    // txtName, once on the duplicated txtName2.
    const eventBindingMatches = serializedSource.match(/OnClick ="\[Event Procedure\]"/g) ?? [];
    expect(eventBindingMatches.length, "both original + duplicate carry the binding").toBe(2);
  });

  it("rejects with FORM_DUPLICATE_SOURCE_MISSING when source control is unknown (no IR written)", async () => {
    const orchestrator = makeOrchestrator();
    const writeFile = vi.fn();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_duplicate_control", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      sourceControlName: "missingSource",
      newName: "clone1",
      apply: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORM_DUPLICATE_SOURCE_MISSING");
    }
    expect(writeFile).not.toHaveBeenCalled();
    expect(orchestrator.executeMappedTool).not.toHaveBeenCalled();
  });

  it("rejects with FORM_DUPLICATE_CONTROL when newName already exists (no IR written)", async () => {
    const orchestrator = makeOrchestrator();
    const writeFile = vi.fn();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_duplicate_control", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      sourceControlName: "txtName",
      newName: "cmdSave", // already exists in the form
      apply: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORM_DUPLICATE_CONTROL");
    }
    expect(writeFile).not.toHaveBeenCalled();
    expect(orchestrator.executeMappedTool).not.toHaveBeenCalled();
  });

  it("strips LayoutCached* keys from overrides (issue #872 F3)", async () => {
    const orchestrator = makeOrchestrator();
    const writeFile = vi.fn();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_duplicate_control", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      sourceControlName: "cmdSave",
      newName: "cmdSave3",
      overrides: {
        Caption: '"Save 3"',
        LayoutCachedLeft: 999,
        LayoutCachedWidth: 999,
      },
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const source = String((result.data as { source: string }).source);
      // The Caption override applied.
      expect(source).toContain('Name ="cmdSave3"');
      expect(source).toContain('Caption ="Save 3"');
      // LayoutCached* must NOT have been written into the serialized form.
      expect(source).not.toContain("LayoutCachedLeft =999");
      expect(source).not.toContain("LayoutCachedWidth =999");
    }
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("aborts the batch when an override is a protected key (FORM_PROPERTY_PROTECTED envelope)", async () => {
    const orchestrator = makeOrchestrator();
    const writeFile = vi.fn();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_duplicate_control", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      sourceControlName: "cmdSave",
      newName: "cmdSaveProtected",
      overrides: { Format: '"!"' }, // protected metadata key
      apply: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORM_PROPERTY_PROTECTED");
    }
    expect(writeFile).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Negative — loadFromText gate failures surface as FORM_IMPORT_GATE_FAILED.
// ---------------------------------------------------------------------------

describe("VbaFormsAdapter — F1/F2 import-gate failure surfaces as FORM_IMPORT_GATE_FAILED", () => {
  it("form_set_properties surfaces FORM_IMPORT_GATE_FAILED on apply when the loadFromText gate fails", async () => {
    const orchestrator = makeOrchestrator(
      failureResult({
        code: "FORM_IMPORT_GATE_FAILED",
        message: "LoadFromText rejected",
        retryable: false,
      }),
    );
    const writeFile = vi.fn();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_set_properties", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      controlName: "txtName",
      properties: { Left: 1 },
      apply: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORM_IMPORT_GATE_FAILED");
    }
  });

  it("form_duplicate_control surfaces FORM_IMPORT_GATE_FAILED on apply when the loadFromText gate fails", async () => {
    const orchestrator = makeOrchestrator(
      failureResult({
        code: "FORM_IMPORT_GATE_FAILED",
        message: "LoadFromText rejected",
        retryable: false,
      }),
    );
    const writeFile = vi.fn();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_duplicate_control", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      sourceControlName: "txtName",
      newName: "txtNameFailed",
      apply: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORM_IMPORT_GATE_FAILED");
    }
  });
});
