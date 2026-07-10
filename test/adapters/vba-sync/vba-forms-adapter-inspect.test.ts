import { describe, expect, it, vi } from "vitest";
import {
  VbaFormsAdapter,
  type VbaFormsOrchestrator,
} from "../../../src/adapters/vba-sync/vba-forms-adapter";
import type { FormFileSystemPort } from "../../../src/core/services/vba-form-service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOrchestrator(): VbaFormsOrchestrator {
  return {
    executor: vi.fn(),
    env: {},
    cwd: "C:/repo",
    resolveExecutionTarget: vi.fn(),
    validateStrictContext: vi.fn(),
    executeMappedTool: vi.fn(),
  };
}

function mockFs(overrides: Partial<FormFileSystemPort> = {}): FormFileSystemPort {
  return {
    mkdir: vi.fn(),
    readdir: vi.fn(),
    readFile: vi.fn().mockResolvedValue(""),
    readJson: vi.fn(),
    writeFile: vi.fn(),
    ...overrides,
  };
}

const SIMPLE_FORM = `Version =21
VersionRequired =20
Begin Form
    Caption ="Formulario de Prueba"
    OnOpen ="[Event Procedure]"
    Begin
        Begin Label
            Name ="lblTitulo"
            Caption ="Título"
        End
        Begin TextBox
            Name ="txtNombre"
        End
    End
End
CodeBehindForm
Option Compare Database
Option Explicit
`;

const FORM_WITH_EVENTS = `Version =21
VersionRequired =20
Begin Form
    OnOpen ="[Event Procedure]"
    OnClose ="[Event Procedure]"
    OnTimer ="[Event Procedure]"
    Begin
        Begin Label
            Name ="lblTest"
        End
    End
End
`;

// ---------------------------------------------------------------------------
// Tests (RED: inspect_form not yet routed in the adapter)
// ---------------------------------------------------------------------------

describe("VbaFormsAdapter — inspect_form", () => {
  it("handles inspect_form", () => {
    expect(VbaFormsAdapter.handles("inspect_form")).toBe(true);
    // Existing tools still handled
    expect(VbaFormsAdapter.handles("validate_form_spec")).toBe(true);
    expect(VbaFormsAdapter.handles("generate_form")).toBe(true);
    // Unrelated tool not handled
    expect(VbaFormsAdapter.handles("export_modules")).toBe(false);
  });

  it("returns FORM_SPEC_MISSING when sourcePath is not provided", async () => {
    const fs = mockFs({ readFile: vi.fn() });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("inspect_form", {});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORM_SPEC_MISSING");
    }
  });

  it("returns FORM_NOT_FOUND when the file does not exist", async () => {
    const fs = mockFs({
      readFile: vi.fn().mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" })),
    });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("inspect_form", {
      sourcePath: "C:/repo/forms/Form_Missing.form.txt",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORM_NOT_FOUND");
    }
  });

  it("returns structured result with name, kind, controls, and events", async () => {
    const fs = mockFs({ readFile: vi.fn().mockResolvedValue(SIMPLE_FORM) });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("inspect_form", {
      sourcePath: "C:/repo/forms/Form_TestForm.form.txt",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as {
        name: string;
        kind: string;
        controls: Array<{ name: string; type: string; properties: Record<string, string> }>;
        events: string[];
      };

      expect(data.name).toBe("TestForm");
      expect(data.kind).toBe("Form");

      expect(data.controls).toBeInstanceOf(Array);
      expect(data.controls.length).toBeGreaterThan(0);

      const lblTitulo = data.controls.find((c) => c.name === "lblTitulo");
      expect(lblTitulo).toBeDefined();
      expect(lblTitulo?.type).toBe("Label");

      const txtNombre = data.controls.find((c) => c.name === "txtNombre");
      expect(txtNombre).toBeDefined();
      expect(txtNombre?.type).toBe("TextBox");

      expect(data.events).toContain("OnOpen");
    }
  });

  it("extracts multiple form-level events", async () => {
    const fs = mockFs({ readFile: vi.fn().mockResolvedValue(FORM_WITH_EVENTS) });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("inspect_form", {
      sourcePath: "C:/repo/forms/Form_EventForm.form.txt",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { events: string[] };
      expect(data.events).toContain("OnOpen");
      expect(data.events).toContain("OnClose");
      expect(data.events).toContain("OnTimer");
    }
  });

  it("inspect_form is read-only — writeFile is never called", async () => {
    const writeFile = vi.fn();
    const fs = mockFs({
      readFile: vi.fn().mockResolvedValue(SIMPLE_FORM),
      writeFile,
    });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    await adapter.execute("inspect_form", {
      sourcePath: "C:/repo/forms/Form_TestForm.form.txt",
    });

    expect(writeFile).not.toHaveBeenCalled();
  });

  it("accepts 'path' as an alias for sourcePath", async () => {
    const fs = mockFs({ readFile: vi.fn().mockResolvedValue(SIMPLE_FORM) });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("inspect_form", {
      path: "C:/repo/forms/Form_TestForm.form.txt",
    });

    expect(result.ok).toBe(true);
  });

  it("derives form name from filename (strips Form_ prefix and .form.txt suffix)", async () => {
    const fs = mockFs({ readFile: vi.fn().mockResolvedValue(SIMPLE_FORM) });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("inspect_form", {
      sourcePath: "C:/repo/E2E_testing/src/forms/Form_FormComercial.form.txt",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { name: string };
      expect(data.name).toBe("FormComercial");
    }
  });

  it("resolves via shared resolver when projectId and formName are supplied", async () => {
    const fs = mockFs({
      readFile: vi.fn().mockImplementation(async (path: string) => {
        if (path.replace(/\\/g, "/") === "C:/repo/src/forms/Form_frmMain.form.txt") {
          return SIMPLE_FORM;
        }
        throw new Error("ENOENT");
      }),
    });
    const orchestrator = makeOrchestrator();
    orchestrator.resolveExecutionTarget = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        destinationRoot: "C:/repo/src",
        projectRoot: "C:/repo",
      },
    });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("inspect_form", {
      projectId: "test-project",
      formName: "frmMain",
    });

    expect(result.ok).toBe(true);
    expect(orchestrator.resolveExecutionTarget).toHaveBeenCalledWith({
      projectId: "test-project",
      formName: "frmMain",
    });
    expect(fs.readFile).toHaveBeenCalledWith(
      expect.stringMatching(/C:[\\/]repo[\\/]src[\\/]forms[\\/]Form_frmMain\.form\.txt/),
    );
  });

  it("keeps literal sourcePath passthrough when projectId/formName are not supplied", async () => {
    const fs = mockFs({
      readFile: vi.fn().mockImplementation(async (path: string) => {
        if (path === "D:/somewhere/custom.form.txt") {
          return SIMPLE_FORM;
        }
        throw new Error("ENOENT");
      }),
    });
    const orchestrator = makeOrchestrator();
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("inspect_form", {
      sourcePath: "D:/somewhere/custom.form.txt",
    });

    expect(result.ok).toBe(true);
    expect(orchestrator.resolveExecutionTarget).not.toHaveBeenCalled();
    expect(fs.readFile).toHaveBeenCalledWith("D:/somewhere/custom.form.txt");
  });
});
