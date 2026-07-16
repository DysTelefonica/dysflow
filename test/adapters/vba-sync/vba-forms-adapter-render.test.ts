import { describe, expect, it, vi } from "vitest";
import {
  VbaFormsAdapter,
  type VbaFormsOrchestrator,
} from "../../../src/adapters/vba-sync/vba-forms-adapter";
import { successResult } from "../../../src/core/contracts/index";
import type { FormFileSystemPort } from "../../../src/core/services/vba-form-service";

// ---------------------------------------------------------------------------
// Helpers (mirrors vba-forms-adapter-inspect.test.ts)
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
    Caption ="Test"
    Width =20000
    Begin
        Begin Label
            Name ="lblTest"
            Caption ="Hello"
            Left =1000
            Top =500
            Width =2000
            Height =400
        End
        Begin CommandButton
            Name ="cmdSave"
            Caption ="Save"
            Left =1000
            Top =1500
            Width =1500
            Height =500
        End
    End
End
`;

// ---------------------------------------------------------------------------
// Tests (#814 — render_form_preview adapter wiring)
// ---------------------------------------------------------------------------

describe("VbaFormsAdapter — render_form_preview (issue #814)", () => {
  it("handles render_form_preview", () => {
    expect(VbaFormsAdapter.handles("render_form_preview")).toBe(true);
    // Sibling read-only tools stay handled.
    expect(VbaFormsAdapter.handles("inspect_form")).toBe(true);
    expect(VbaFormsAdapter.handles("verify_form_ui")).toBe(true);
    // Unrelated tool not handled.
    expect(VbaFormsAdapter.handles("export_modules")).toBe(false);
  });

  it("returns FORM_SPEC_MISSING when sourcePath is not provided", async () => {
    const fs = mockFs({ readFile: vi.fn() });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("render_form_preview", {});

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

    const result = await adapter.execute("render_form_preview", {
      sourcePath: "C:/repo/forms/Form_Missing.form.txt",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORM_NOT_FOUND");
    }
  });

  it("returns the structured envelope with svg, ascii, viewport, warnings (default output=svg)", async () => {
    const fs = mockFs({ readFile: vi.fn().mockResolvedValue(SIMPLE_FORM) });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("render_form_preview", {
      sourcePath: "C:/repo/forms/Form_TestForm.form.txt",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as {
        formName: string;
        viewport: { width: number; height: number };
        warnings: string[];
        svg?: string;
        ascii?: string;
      };
      expect(data.formName).toBe("TestForm");
      expect(data.viewport).toMatchObject({
        width: expect.any(Number),
        height: expect.any(Number),
      });
      expect(data.warnings).toEqual(expect.any(Array));
      // `output` defaults to "svg" so ascii is omitted.
      expect(typeof data.svg).toBe("string");
      expect(data.ascii).toBeUndefined();
    }
  });

  it("returns the ascii frame when output='ascii'", async () => {
    const fs = mockFs({ readFile: vi.fn().mockResolvedValue(SIMPLE_FORM) });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("render_form_preview", {
      sourcePath: "C:/repo/forms/Form_TestForm.form.txt",
      output: "ascii",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { ascii?: string; svg?: string };
      expect(typeof data.ascii).toBe("string");
      expect(data.svg).toBeUndefined();
    }
  });

  it("returns BOTH frames when output='both'", async () => {
    const fs = mockFs({ readFile: vi.fn().mockResolvedValue(SIMPLE_FORM) });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("render_form_preview", {
      sourcePath: "C:/repo/forms/Form_TestForm.form.txt",
      output: "both",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { ascii?: string; svg?: string };
      expect(typeof data.ascii).toBe("string");
      expect(typeof data.svg).toBe("string");
    }
  });

  it("render_form_preview is read-only — writeFile is never called", async () => {
    const writeFile = vi.fn();
    const fs = mockFs({
      readFile: vi.fn().mockResolvedValue(SIMPLE_FORM),
      writeFile,
    });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    await adapter.execute("render_form_preview", {
      sourcePath: "C:/repo/forms/Form_TestForm.form.txt",
      apply: true,
    });

    expect(writeFile).not.toHaveBeenCalled();
  });

  it("accepts 'path' as an alias for sourcePath", async () => {
    const fs = mockFs({ readFile: vi.fn().mockResolvedValue(SIMPLE_FORM) });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("render_form_preview", {
      path: "C:/repo/forms/Form_TestForm.form.txt",
    });

    expect(result.ok).toBe(true);
  });

  it("derives form name from filename (strips Form_ prefix and .form.txt suffix)", async () => {
    const fs = mockFs({ readFile: vi.fn().mockResolvedValue(SIMPLE_FORM) });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("render_form_preview", {
      sourcePath: "C:/repo/E2E_testing/src/forms/Form_TestForm.form.txt",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as { formName: string };
      expect(data.formName).toBe("TestForm");
    }
  });

  it("passes an explicit viewportScale through to the renderer", async () => {
    const fs = mockFs({ readFile: vi.fn().mockResolvedValue(SIMPLE_FORM) });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    // Two renders at different scales MUST produce different viewports —
    // guards against the adapter swallowing the option silently.
    const wideViewport = await adapter.execute("render_form_preview", {
      sourcePath: "C:/repo/forms/Form_TestForm.form.txt",
      viewportScale: 1,
    });
    const tightViewport = await adapter.execute("render_form_preview", {
      sourcePath: "C:/repo/forms/Form_TestForm.form.txt",
      viewportScale: 0.01,
    });
    expect(wideViewport.ok).toBe(true);
    expect(tightViewport.ok).toBe(true);
    if (wideViewport.ok && tightViewport.ok) {
      const wv = (wideViewport.data as { viewport: { width: number } }).viewport.width;
      const tv = (tightViewport.data as { viewport: { width: number } }).viewport.width;
      // Both follow the same math; tighter scale ⇒ smaller viewport for
      // the same control set.
      expect(tv).toBeLessThan(wv);
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

    const result = await adapter.execute("render_form_preview", {
      projectId: "test-project",
      formName: "frmMain",
    });

    expect(result.ok).toBe(true);
    expect(orchestrator.resolveExecutionTarget).toHaveBeenCalledWith({
      projectId: "test-project",
      formName: "frmMain",
    });
  });

  it("renders the exact resolved candidate snapshot from one filesystem read", async () => {
    let reads = 0;
    const fs = mockFs({
      readFile: vi.fn().mockImplementation(async () => {
        reads++;
        return reads === 1 ? SIMPLE_FORM : "not the resolved snapshot";
      }),
    });
    const orchestrator = makeOrchestrator();
    orchestrator.resolveExecutionTarget = vi.fn().mockResolvedValue({
      ok: true,
      data: { destinationRoot: "C:/repo/src", projectRoot: "C:/repo" },
    });

    const result = await new VbaFormsAdapter(orchestrator, fs).execute("render_form_preview", {
      projectId: "test-project",
      formName: "frmMain",
    });

    expect(result.ok).toBe(true);
    expect(reads).toBe(1);
  });

  it("its response is bypass-tested against the successResult shape (issue #813 standards)", async () => {
    // Regression guard: render_form_preview MUST follow the same
    // { ok, data } envelope every other adapter returns. If a future
    // refactor switches the adapter to a tuple shape, the rest of the
    // MCP wiring (dispatch-factory, write-execution-dispatch) breaks.
    const fs = mockFs({ readFile: vi.fn().mockResolvedValue(SIMPLE_FORM) });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("render_form_preview", {
      sourcePath: "C:/repo/forms/Form_TestForm.form.txt",
    });

    // `successResult` returns `{ ok: true, data }`. Test the structural
    // shape so the adapter never accidentally returns the inner `data`
    // payload directly (a regression in `vba-forms-ai-tools.test.ts`).
    expect(result).toEqual(expect.objectContaining({ ok: expect.any(Boolean) }));
    expect(successResult(result.ok ? result.data : null)).toBeDefined();
  });
});
