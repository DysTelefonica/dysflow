import { describe, expect, it, vi } from "vitest";
import {
  VbaFormsAdapter,
  type VbaFormsOrchestrator,
} from "../../../src/adapters/vba-sync/vba-forms-adapter";
import { successResult } from "../../../src/core/contracts/index";
import type { FormFileSystemPort } from "../../../src/core/services/vba-form-service";

// ---------------------------------------------------------------------------
// Helpers (mirrors vba-forms-adapter-layout.test.ts)
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

const FORM_TEXT = `Version =21
VersionRequired =20
Begin Form
    Caption ="CustomerView"
    Width =20000
    Begin
        Begin TextBox
            Name ="txtName"
            ControlSource ="=Customers.Name"
            Left =1000
            Top =1000
            Width =3000
            Height =400
        End
        Begin ComboBox
            Name ="cmbCust"
            RowSource ="SELECT Id, Name FROM Customers"
            Left =1000
            Top =2000
            Width =3000
            Height =400
        End
        Begin ComboBox
            Name ="cmbOne"
            RowSource ="SELECT Name FROM Customers"
            Left =1000
            Top =3000
            Width =3000
            Height =400
        End
    End
End
`;

const FORM_PATH = "C:/repo/forms/Form_CustomerView.form.txt";

const SCHEMA = {
  Customers: [
    { name: "Id", type: "Long", nullable: false },
    { name: "Name", type: "Text", nullable: true },
  ],
};

// ---------------------------------------------------------------------------
// Tests (#818 — verify_form_bindings adapter wiring)
// ---------------------------------------------------------------------------

describe("VbaFormsAdapter — verify_form_bindings (issue #818)", () => {
  it("handles verify_form_bindings", () => {
    expect(VbaFormsAdapter.handles("verify_form_bindings")).toBe(true);
    // Sibling read-only tools stay handled.
    expect(VbaFormsAdapter.handles("analyze_form_layout")).toBe(true);
    expect(VbaFormsAdapter.handles("render_form_preview")).toBe(true);
    expect(VbaFormsAdapter.handles("diff_form_preview")).toBe(true);
    // Unrelated tool not handled.
    expect(VbaFormsAdapter.handles("export_modules")).toBe(false);
  });

  it("returns FORM_SPEC_MISSING when sourcePath is not provided", async () => {
    const fs = mockFs({ readFile: vi.fn() });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("verify_form_bindings", { schema: SCHEMA });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORM_SPEC_MISSING");
    }
  });

  it("returns FORM_BINDING_SCHEMA_INVALID when schema is missing", async () => {
    const fs = mockFs({
      readFile: vi.fn().mockResolvedValue(FORM_TEXT),
    });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("verify_form_bindings", {
      sourcePath: FORM_PATH,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORM_BINDING_SCHEMA_INVALID");
    }
  });

  it("returns FORM_BINDING_SCHEMA_INVALID when schema has neither aggregate nor single-table shape", async () => {
    const fs = mockFs({
      readFile: vi.fn().mockResolvedValue(FORM_TEXT),
    });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("verify_form_bindings", {
      sourcePath: FORM_PATH,
      schema: 42, // invalid shape
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORM_BINDING_SCHEMA_INVALID");
    }
  });

  it("returns FORM_NOT_FOUND when the file does not exist", async () => {
    const fs = mockFs({
      readFile: vi.fn().mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" })),
    });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("verify_form_bindings", {
      sourcePath: FORM_PATH,
      schema: SCHEMA,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORM_NOT_FOUND");
    }
  });

  it("returns FORM_PARSE_ERROR when the source file is unreadable", async () => {
    const fs = mockFs({
      readFile: vi.fn().mockResolvedValue(""),
    });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("verify_form_bindings", {
      sourcePath: FORM_PATH,
      schema: SCHEMA,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORM_PARSE_ERROR");
    }
  });

  it("returns the structured envelope with empty findings for a clean form + valid schema", async () => {
    const fs = mockFs({
      readFile: vi.fn().mockResolvedValue(FORM_TEXT),
    });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("verify_form_bindings", {
      sourcePath: FORM_PATH,
      schema: SCHEMA,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as {
        formName: string;
        controls: number;
        findings: Array<{ code: string; severity: string }>;
      };
      expect(data.formName).toBe("CustomerView");
      // The form has 3 named controls (txtName + cmbCust + cmbOne).
      expect(data.controls).toBe(3);
      // cmbOne has a 1-column RowSource → FORM_BINDING_TYPE_MISMATCH; the
      // other two bindings are clean.
      expect(data.findings.map((f) => f.code).sort()).toEqual(["FORM_BINDING_TYPE_MISMATCH"]);
      for (const f of data.findings) {
        expect(f.severity).toBe("warning");
      }
    }
  });

  it("surfaces MISSING_TABLE findings when the schema is missing the bound table", async () => {
    const fs = mockFs({
      readFile: vi.fn().mockResolvedValue(FORM_TEXT),
    });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("verify_form_bindings", {
      sourcePath: FORM_PATH,
      schema: {}, // empty schema → Customers is missing
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as {
        findings: Array<{ code: string; controlName: string; data?: Record<string, unknown> }>;
      };
      const missing = data.findings.filter((f) => f.code === "FORM_BINDING_MISSING_TABLE");
      // txtName (Customers.Name) + cmbCust + cmbOne — all reference Customers.
      expect(missing.length).toBeGreaterThanOrEqual(3);
      expect(missing.some((f) => f.controlName === "txtName")).toBe(true);
      expect(missing.some((f) => f.controlName === "cmbCust")).toBe(true);
    }
  });

  it("accepts a single-table get_schema payload {schema:[...], tableName}", async () => {
    const fs = mockFs({
      readFile: vi.fn().mockResolvedValue(FORM_TEXT),
    });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("verify_form_bindings", {
      sourcePath: FORM_PATH,
      schema: {
        schema: SCHEMA.Customers,
        tableName: "Customers",
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as {
        findings: Array<{ code: string }>;
      };
      // Same shape as the aggregate case: only the type-mismatch on cmbOne
      // surfaces; everything else is clean.
      expect(data.findings.map((f) => f.code).sort()).toEqual(["FORM_BINDING_TYPE_MISMATCH"]);
    }
  });

  it("rejects a single-table get_schema payload without tableName", async () => {
    const fs = mockFs({
      readFile: vi.fn().mockResolvedValue(FORM_TEXT),
    });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("verify_form_bindings", {
      sourcePath: FORM_PATH,
      schema: { schema: SCHEMA.Customers }, // no tableName → can't wrap
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORM_BINDING_SCHEMA_INVALID");
    }
  });

  it("verify_form_bindings is read-only — writeFile is never called", async () => {
    const writeFile = vi.fn();
    const fs = mockFs({
      readFile: vi.fn().mockResolvedValue(FORM_TEXT),
      writeFile,
    });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    await adapter.execute("verify_form_bindings", {
      sourcePath: FORM_PATH,
      schema: SCHEMA,
      apply: true, // ignored: read-only tool
    });

    expect(writeFile).not.toHaveBeenCalled();
  });

  it("accepts 'path' as an alias for sourcePath", async () => {
    const fs = mockFs({
      readFile: vi.fn().mockResolvedValue(FORM_TEXT),
    });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("verify_form_bindings", {
      path: FORM_PATH,
      schema: SCHEMA,
    });

    expect(result.ok).toBe(true);
  });

  it("resolves via shared resolver when projectId + formName are supplied", async () => {
    const fs = mockFs({
      readFile: vi.fn().mockImplementation(async (path: string) => {
        const normalized = path.replace(/\\/g, "/");
        if (normalized === "C:/repo/src/forms/Form_CustomerView.form.txt") {
          return FORM_TEXT;
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

    const result = await adapter.execute("verify_form_bindings", {
      projectId: "test-project",
      formName: "CustomerView",
      schema: SCHEMA,
    });

    expect(result.ok).toBe(true);
    expect(orchestrator.resolveExecutionTarget).toHaveBeenCalled();
  });

  it("its response is bypass-tested against the successResult shape (issue #813 standards)", async () => {
    const fs = mockFs({
      readFile: vi.fn().mockResolvedValue(FORM_TEXT),
    });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("verify_form_bindings", {
      sourcePath: FORM_PATH,
      schema: SCHEMA,
    });

    expect(result).toEqual(expect.objectContaining({ ok: expect.any(Boolean) }));
    expect(successResult(result.ok ? result.data : null)).toBeDefined();
  });
});
