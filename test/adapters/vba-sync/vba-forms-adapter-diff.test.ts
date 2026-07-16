import { describe, expect, it, vi } from "vitest";
import {
  VbaFormsAdapter,
  type VbaFormsOrchestrator,
} from "../../../src/adapters/vba-sync/vba-forms-adapter";
import { successResult } from "../../../src/core/contracts/index";
import type { FormFileSystemPort } from "../../../src/core/services/vba-form-service";

// ---------------------------------------------------------------------------
// Helpers (mirrors vba-forms-adapter-render.test.ts)
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

const BEFORE_FORM = `Version =21
VersionRequired =20
Begin Form
    Caption ="Before"
    Width =20000
    Begin
        Begin Label
            Name ="lblName"
            Caption ="Customer:"
            Left =1000
            Top =1000
            Width =2000
            Height =400
        End
        Begin CommandButton
            Name ="cmdSave"
            Caption ="Save"
            Left =500
            Top =2000
            Width =1000
            Height =400
        End
    End
End
`;

const AFTER_FORM = `Version =21
VersionRequired =20
Begin Form
    Caption ="After"
    Width =20000
    Begin
        Begin Label
            Name ="lblName"
            Caption ="Customer:"
            Left =1000
            Top =1000
            Width =2000
            Height =400
        End
        Begin TextBox
            Name ="txtNewField"
            Left =3500
            Top =1000
            Width =2000
            Height =400
        End
    End
End
`;

// ---------------------------------------------------------------------------
// Tests (#817 — diff_form_preview adapter wiring)
// ---------------------------------------------------------------------------

describe("VbaFormsAdapter — diff_form_preview (issue #817)", () => {
  it("handles diff_form_preview", () => {
    expect(VbaFormsAdapter.handles("diff_form_preview")).toBe(true);
    // Sibling read-only tools stay handled.
    expect(VbaFormsAdapter.handles("render_form_preview")).toBe(true);
    expect(VbaFormsAdapter.handles("analyze_form_layout")).toBe(true);
    // Unrelated tool not handled.
    expect(VbaFormsAdapter.handles("export_modules")).toBe(false);
  });

  it("returns FORM_SPEC_MISSING when beforePath is not provided", async () => {
    const fs = mockFs({ readFile: vi.fn() });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("diff_form_preview", {
      afterPath: "C:/repo/forms/Form_After.form.txt",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORM_SPEC_MISSING");
    }
  });

  it("returns FORM_SPEC_MISSING when afterPath is not provided", async () => {
    const fs = mockFs({ readFile: vi.fn() });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("diff_form_preview", {
      beforePath: "C:/repo/forms/Form_Before.form.txt",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORM_SPEC_MISSING");
    }
  });

  it("returns FORM_NOT_FOUND when the before file does not exist", async () => {
    const fs = mockFs({
      readFile: vi.fn().mockImplementation(async (path: string) => {
        if (path === "C:/repo/forms/Form_Before.form.txt") {
          throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        }
        return AFTER_FORM;
      }),
    });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("diff_form_preview", {
      beforePath: "C:/repo/forms/Form_Before.form.txt",
      afterPath: "C:/repo/forms/Form_After.form.txt",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORM_NOT_FOUND");
    }
  });

  it("returns the structured envelope with changes + warnings (default output=both)", async () => {
    const fs = mockFs({
      readFile: vi.fn().mockImplementation(async (path: string) => {
        if (path === "C:/repo/forms/Form_Before.form.txt") return BEFORE_FORM;
        if (path === "C:/repo/forms/Form_After.form.txt") return AFTER_FORM;
        throw new Error("unexpected path");
      }),
    });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("diff_form_preview", {
      beforePath: "C:/repo/forms/Form_Before.form.txt",
      afterPath: "C:/repo/forms/Form_After.form.txt",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as {
        beforeForm: string;
        afterForm: string;
        changes: {
          added: Array<{ controlName: string }>;
          removed: Array<{ controlName: string }>;
          moved: Array<{ controlName: string }>;
          resized: Array<{ controlName: string }>;
        };
        warnings: string[];
        svg?: string;
        ascii?: string[];
      };
      expect(data.beforeForm).toBe("Before");
      expect(data.afterForm).toBe("After");
      expect(data.changes.added.map((c) => c.controlName)).toContain("txtNewField");
      expect(data.changes.removed.map((c) => c.controlName)).toContain("cmdSave");
      // `output` defaults to "both" so both svg and ascii surfaces ship.
      expect(typeof data.svg).toBe("string");
      expect(Array.isArray(data.ascii)).toBe(true);
      // The svg must carry data-diff attributes for the diff classification.
      // Attribute order in the renderer is data-control, data-type, data-role,
      // data-diff — so the regex matches `data-control` first.
      expect(data.svg).toMatch(/data-control="txtNewField"[^>]*data-diff="added"/);
      expect(data.svg).toMatch(/data-diff="removed"/);
    }
  });

  it("returns only the svg frame when output='svg'", async () => {
    const fs = mockFs({
      readFile: vi.fn().mockImplementation(async (path: string) => {
        if (path === "C:/repo/forms/Form_Before.form.txt") return BEFORE_FORM;
        if (path === "C:/repo/forms/Form_After.form.txt") return AFTER_FORM;
        throw new Error("unexpected path");
      }),
    });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("diff_form_preview", {
      beforePath: "C:/repo/forms/Form_Before.form.txt",
      afterPath: "C:/repo/forms/Form_After.form.txt",
      output: "svg",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { svg?: string; ascii?: string[] };
      expect(typeof data.svg).toBe("string");
      expect(data.ascii).toBeUndefined();
    }
  });

  it("returns only the ascii frame when output='ascii'", async () => {
    const fs = mockFs({
      readFile: vi.fn().mockImplementation(async (path: string) => {
        if (path === "C:/repo/forms/Form_Before.form.txt") return BEFORE_FORM;
        if (path === "C:/repo/forms/Form_After.form.txt") return AFTER_FORM;
        throw new Error("unexpected path");
      }),
    });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("diff_form_preview", {
      beforePath: "C:/repo/forms/Form_Before.form.txt",
      afterPath: "C:/repo/forms/Form_After.form.txt",
      output: "ascii",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { svg?: string; ascii?: string[] };
      expect(data.svg).toBeUndefined();
      expect(Array.isArray(data.ascii)).toBe(true);
    }
  });

  it("diff_form_preview is read-only — writeFile is never called", async () => {
    const writeFile = vi.fn();
    const fs = mockFs({
      readFile: vi.fn().mockImplementation(async (path: string) => {
        if (path === "C:/repo/forms/Form_Before.form.txt") return BEFORE_FORM;
        if (path === "C:/repo/forms/Form_After.form.txt") return AFTER_FORM;
        throw new Error("unexpected path");
      }),
      writeFile,
    });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    await adapter.execute("diff_form_preview", {
      beforePath: "C:/repo/forms/Form_Before.form.txt",
      afterPath: "C:/repo/forms/Form_After.form.txt",
      apply: true,
    });

    expect(writeFile).not.toHaveBeenCalled();
  });

  it("accepts 'before' / 'after' as aliases for beforePath / afterPath", async () => {
    const fs = mockFs({
      readFile: vi.fn().mockImplementation(async (path: string) => {
        if (path === "C:/repo/forms/Form_Before.form.txt") return BEFORE_FORM;
        if (path === "C:/repo/forms/Form_After.form.txt") return AFTER_FORM;
        throw new Error("unexpected path");
      }),
    });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("diff_form_preview", {
      before: "C:/repo/forms/Form_Before.form.txt",
      after: "C:/repo/forms/Form_After.form.txt",
    });

    expect(result.ok).toBe(true);
  });

  it("resolves via shared resolver when projectId + beforeName / afterName are supplied", async () => {
    const fs = mockFs({
      readFile: vi.fn().mockImplementation(async (path: string) => {
        const normalized = path.replace(/\\/g, "/");
        if (normalized === "C:/repo/src/forms/Form_frmBefore.form.txt") return BEFORE_FORM;
        if (normalized === "C:/repo/src/forms/Form_frmAfter.form.txt") return AFTER_FORM;
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

    const result = await adapter.execute("diff_form_preview", {
      projectId: "test-project",
      beforeName: "frmBefore",
      afterName: "frmAfter",
    });

    expect(result.ok).toBe(true);
    expect(orchestrator.resolveExecutionTarget).toHaveBeenCalled();
  });

  it("diffs both exact resolved candidate snapshots from one read per side", async () => {
    const reads = new Map<string, number>();
    const fs = mockFs({
      readFile: vi.fn().mockImplementation(async (path: string) => {
        const normalized = path.replace(/\\/g, "/");
        const count = (reads.get(normalized) ?? 0) + 1;
        reads.set(normalized, count);
        if (count > 1) return "not the resolved snapshot";
        if (normalized.endsWith("Form_frmBefore.form.txt")) return BEFORE_FORM;
        if (normalized.endsWith("Form_frmAfter.form.txt")) return AFTER_FORM;
        throw new Error("ENOENT");
      }),
    });
    const orchestrator = makeOrchestrator();
    orchestrator.resolveExecutionTarget = vi.fn().mockResolvedValue({
      ok: true,
      data: { destinationRoot: "C:/repo/src", projectRoot: "C:/repo" },
    });

    const result = await new VbaFormsAdapter(orchestrator, fs).execute("diff_form_preview", {
      projectId: "test-project",
      beforeName: "frmBefore",
      afterName: "frmAfter",
    });

    expect(result.ok).toBe(true);
    expect([...reads.values()]).toEqual([1, 1]);
    expect(orchestrator.resolveExecutionTarget).toHaveBeenCalledTimes(1);
  });

  it("its response is bypass-tested against the successResult shape (issue #813 standards)", async () => {
    const fs = mockFs({
      readFile: vi.fn().mockImplementation(async (path: string) => {
        if (path === "C:/repo/forms/Form_Before.form.txt") return BEFORE_FORM;
        if (path === "C:/repo/forms/Form_After.form.txt") return AFTER_FORM;
        throw new Error("unexpected path");
      }),
    });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("diff_form_preview", {
      beforePath: "C:/repo/forms/Form_Before.form.txt",
      afterPath: "C:/repo/forms/Form_After.form.txt",
    });

    expect(result).toEqual(expect.objectContaining({ ok: expect.any(Boolean) }));
    expect(successResult(result.ok ? result.data : null)).toBeDefined();
  });
});
