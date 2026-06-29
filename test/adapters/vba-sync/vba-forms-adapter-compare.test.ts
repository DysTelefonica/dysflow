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
    Caption ="Formulario"
    Begin Label
        Name ="lblTitulo"
        Caption ="Título"
    End
    Begin TextBox
        Name ="txtNombre"
    End
End
`;

const SIMPLE_FORM_CHANGED_CAPTION = `Version =21
VersionRequired =20
Begin Form
    Caption ="Formulario"
    Begin Label
        Name ="lblTitulo"
        Caption ="Cambiado"
    End
    Begin TextBox
        Name ="txtNombre"
    End
End
`;

// ---------------------------------------------------------------------------
// Tests (RED: adapter does not yet route compare_form)
// ---------------------------------------------------------------------------

describe("VbaFormsAdapter — compare_form", () => {
  it("handles compare_form and keeps inspect_form / lint_form_code handled", () => {
    expect(VbaFormsAdapter.handles("compare_form")).toBe(true);
    expect(VbaFormsAdapter.handles("inspect_form")).toBe(true);
    expect(VbaFormsAdapter.handles("lint_form_code")).toBe(true);
    expect(VbaFormsAdapter.handles("export_modules")).toBe(false);
  });

  it("returns FORM_SPEC_MISSING when sourcePath is not provided", async () => {
    const fs = mockFs();
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("compare_form", {
      targetPath: "C:/repo/forms/Form_B.form.txt",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORM_SPEC_MISSING");
    }
  });

  it("returns FORM_SPEC_MISSING when targetPath is not provided", async () => {
    const fs = mockFs();
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("compare_form", {
      sourcePath: "C:/repo/forms/Form_A.form.txt",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORM_SPEC_MISSING");
    }
  });

  it("returns FORM_NOT_FOUND when the source file does not exist", async () => {
    const fs = mockFs({
      readFile: vi.fn().mockImplementation((p: string) => {
        if (p.includes("Form_Missing")) {
          return Promise.reject(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
        }
        return Promise.resolve(SIMPLE_FORM);
      }),
    });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("compare_form", {
      sourcePath: "C:/repo/forms/Form_Missing.form.txt",
      targetPath: "C:/repo/forms/Form_Other.form.txt",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORM_NOT_FOUND");
    }
  });

  it("returns FORM_PARSE_ERROR when the source file is malformed", async () => {
    const fs = mockFs({
      readFile: vi.fn().mockImplementation((p: string) => {
        if (p.includes("Form_A")) {
          return Promise.resolve("not a form file\nno begin block\n");
        }
        return Promise.resolve(SIMPLE_FORM);
      }),
    });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("compare_form", {
      sourcePath: "C:/repo/forms/Form_A.form.txt",
      targetPath: "C:/repo/forms/Form_B.form.txt",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORM_PARSE_ERROR");
    }
  });

  it("returns a drift report with actionableOk:false when Caption differs", async () => {
    const fs = mockFs({
      readFile: vi.fn().mockImplementation((p: string) => {
        if (p.includes("Form_A")) return Promise.resolve(SIMPLE_FORM);
        if (p.includes("Form_B")) return Promise.resolve(SIMPLE_FORM_CHANGED_CAPTION);
        return Promise.reject(new Error(`unexpected path: ${p}`));
      }),
    });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("compare_form", {
      sourcePath: "C:/repo/forms/Form_A.form.txt",
      targetPath: "C:/repo/forms/Form_B.form.txt",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as {
        matched: boolean;
        driftDetected: boolean;
        actionableOk: boolean;
        drifts: ReadonlyArray<{
          kind: string;
          controlName?: string;
          key?: string;
          actionable: boolean;
        }>;
        sourceName: string;
        targetName: string;
      };

      expect(data.matched).toBe(false);
      expect(data.driftDetected).toBe(true);
      expect(data.actionableOk).toBe(false);
      expect(data.sourceName).toBe("A");
      expect(data.targetName).toBe("B");

      const captionDrift = data.drifts.find(
        (d) => d.kind === "propertyChanged" && d.key === "Caption",
      );
      expect(captionDrift).toBeDefined();
      expect(captionDrift?.controlName).toBe("lblTitulo");
      expect(captionDrift?.actionable).toBe(true);
    }
  });

  it("returns matched:true when both files are identical", async () => {
    const fs = mockFs({
      readFile: vi.fn().mockResolvedValue(SIMPLE_FORM),
    });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("compare_form", {
      sourcePath: "C:/repo/forms/Form_SameA.form.txt",
      targetPath: "C:/repo/forms/Form_SameB.form.txt",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as {
        matched: boolean;
        driftDetected: boolean;
        actionableOk: boolean;
        drifts: readonly unknown[];
      };
      expect(data.matched).toBe(true);
      expect(data.driftDetected).toBe(false);
      expect(data.actionableOk).toBe(true);
      expect(data.drifts).toEqual([]);
    }
  });

  it("compare_form is read-only — writeFile is never called", async () => {
    const writeFile = vi.fn();
    const fs = mockFs({
      readFile: vi.fn().mockResolvedValue(SIMPLE_FORM),
      writeFile,
    });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    await adapter.execute("compare_form", {
      sourcePath: "C:/repo/forms/Form_SameA.form.txt",
      targetPath: "C:/repo/forms/Form_SameB.form.txt",
    });

    expect(writeFile).not.toHaveBeenCalled();
  });
});
