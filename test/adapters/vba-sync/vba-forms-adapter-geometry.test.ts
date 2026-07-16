import { describe, expect, it, vi } from "vitest";
import {
  VbaFormsAdapter,
  type VbaFormsOrchestrator,
} from "../../../src/adapters/vba-sync/vba-forms-adapter";
import type { FormFileSystemPort } from "../../../src/core/services/vba-form-service";

// ---------------------------------------------------------------------------
// Helpers (mirror vba-forms-adapter-render.test.ts).
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

function mockFs(content: string, overrides: Partial<FormFileSystemPort> = {}): FormFileSystemPort {
  return {
    mkdir: vi.fn(),
    readdir: vi.fn(),
    readFile: vi.fn().mockResolvedValue(content),
    readJson: vi.fn(),
    writeFile: vi.fn(),
    ...overrides,
  };
}

// A small form with three named controls — textbox, button, label — plus a
// control with an event binding (txtName.OnClick) so hasEventBinding can be
// pinned both ways. LayoutCached* are intentionally included so the
// geometry surface proves they're surfaced (read-only contract — the IR
// carries them, the helper exposes them).
const FORM_FOR_GEOMETRY = `Version =21
Checksum =123456789
Begin Form
    Width =20000
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
        End
        Begin CommandButton
            Name ="cmdSave"
            Caption ="Save"
            Left =3500
            Top =5000
            Width =1500
            Height =500
            LayoutCachedLeft =3500
            LayoutCachedTop =5000
            LayoutCachedWidth =1500
            LayoutCachedHeight =500
        End
        Begin Label
            Name ="lblName"
            Caption ="Name"
            Left =100
            Top =100
            Width =1500
            Height =300
        End
    End
End
`;

// ---------------------------------------------------------------------------
// F5 — read-only geometry + control-list helpers (Issue #872).
//
// These two helpers are the canonical "stop parsing .form.txt by hand"
// tools: `form_get_geometry` returns the Left/Top/Width/Height box for
// one control (plus the cached LayoutCached* values for symmetry with
// the source artifact); `form_list_controls` returns the flat inventory
// with each control's geometry AND its event-binding bit.
//
// Both tools are PURE read-class. The adapter never writes to disk and
// the dispatch write-gate never fires for them. The handler signatures
// match the read-only sibling `render_form_preview` exactly (literal
// sourcePath/path OR projectId+formName).
// ---------------------------------------------------------------------------

describe("VbaFormsAdapter — form_get_geometry (issue #872 F5)", () => {
  it("handles form_get_geometry", () => {
    expect(VbaFormsAdapter.handles("form_get_geometry")).toBe(true);
    // Sibling read-only helpers stay handled.
    expect(VbaFormsAdapter.handles("inspect_form")).toBe(true);
    expect(VbaFormsAdapter.handles("render_form_preview")).toBe(true);
    // The two write tools we added must NOT be confused with the
    // read-only helpers — both surfaces still work independently.
    expect(VbaFormsAdapter.handles("form_set_properties")).toBe(true);
    expect(VbaFormsAdapter.handles("form_duplicate_control")).toBe(true);
  });

  it("returns Left/Top/Width/Height + LayoutCached* for a known control", async () => {
    const fs = mockFs(FORM_FOR_GEOMETRY);
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("form_get_geometry", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      controlName: "txtName",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    const data = result.data as {
      controlName: string;
      type: string;
      left: number;
      top: number;
      width: number;
      height: number;
      layoutCachedLeft?: number;
      layoutCachedTop?: number;
      layoutCachedWidth?: number;
      layoutCachedHeight?: number;
    };
    expect(data.controlName).toBe("txtName");
    expect(data.type).toBe("TextBox");
    expect(data.left).toBe(100);
    expect(data.top).toBe(200);
    expect(data.width).toBe(3000);
    expect(data.height).toBe(400);
    expect(data.layoutCachedLeft).toBe(100);
    expect(data.layoutCachedTop).toBe(200);
    expect(data.layoutCachedWidth).toBe(3000);
    expect(data.layoutCachedHeight).toBe(400);
  });

  it("returns FORM_CONTROL_NOT_FOUND when the control is unknown", async () => {
    const fs = mockFs(FORM_FOR_GEOMETRY);
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("form_get_geometry", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      controlName: "missingControl",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("FORM_CONTROL_NOT_FOUND");
    expect(result.error.remediation).toBe(
      "Run dysflow.form_list_controls to enumerate existing controls in the form.",
    );
  });

  it("returns FORM_SPEC_MISSING when sourcePath is not provided", async () => {
    const fs = mockFs(FORM_FOR_GEOMETRY);
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("form_get_geometry", {
      controlName: "txtName",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("FORM_SPEC_MISSING");
  });

  it("form_get_geometry is read-only — writeFile is never called", async () => {
    const writeFile = vi.fn();
    const fs = mockFs(FORM_FOR_GEOMETRY, { writeFile });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("form_get_geometry", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      controlName: "cmdSave",
    });

    expect(result.ok).toBe(true);
    expect(writeFile).not.toHaveBeenCalled();
  });
});

describe("VbaFormsAdapter — form_list_controls (issue #872 F5)", () => {
  it("handles form_list_controls", () => {
    expect(VbaFormsAdapter.handles("form_list_controls")).toBe(true);
  });

  it("lists every named control with name + type + geometry + hasEventBinding bit", async () => {
    const fs = mockFs(FORM_FOR_GEOMETRY);
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("form_list_controls", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    const data = result.data as {
      formName: string;
      section: string | null;
      controls: Array<{
        name: string;
        type: string;
        left: number;
        top: number;
        width: number;
        height: number;
        hasEventBinding: boolean;
      }>;
      totalCount: number;
      truncated: boolean;
      limit: number;
    };
    expect(data).toMatchObject({
      formName: "Customer",
      section: null,
      totalCount: 3,
      truncated: false,
      limit: 1000,
    });
    expect(data.controls.map((c) => c.name)).toEqual(
      expect.arrayContaining(["txtName", "cmdSave", "lblName"]),
    );
    const txtName = data.controls.find((c) => c.name === "txtName");
    expect(txtName).toMatchObject({
      type: "TextBox",
      left: 100,
      top: 200,
      width: 3000,
      height: 400,
      // txtName carries OnClick = [Event Procedure] in the source.
      hasEventBinding: true,
    });
    const cmdSave = data.controls.find((c) => c.name === "cmdSave");
    expect(cmdSave).toMatchObject({
      type: "CommandButton",
      left: 3500,
      top: 5000,
      width: 1500,
      height: 500,
      // cmdSave has no event binding in the source.
      hasEventBinding: false,
    });
  });

  it("returns FORM_SPEC_MISSING when sourcePath is not provided", async () => {
    const fs = mockFs(FORM_FOR_GEOMETRY);
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("form_list_controls", {});

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("FORM_SPEC_MISSING");
  });

  it("form_list_controls is read-only — writeFile is never called", async () => {
    const writeFile = vi.fn();
    const fs = mockFs(FORM_FOR_GEOMETRY, { writeFile });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("form_list_controls", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
    });

    expect(result.ok).toBe(true);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("form_list_controls caps the response at the caller-supplied limit and exposes totalCount + truncated (issue #872 R4-001)", async () => {
    // Synthetic form with 1500 named TextBox controls — triggers the
    // truncation surface without bloating the test runtime.
    const lines: string[] = ["Version =21", "Begin Form", "    Width =20000", "    Begin"];
    for (let i = 0; i < 1500; i++) {
      lines.push(
        `        Begin TextBox`,
        `            Name ="txtSynthetic${i}"`,
        `            Left =100`,
        `            Top =${i * 20}`,
        `            Width =3000`,
        `            Height =400`,
        `        End`,
      );
    }
    lines.push("    End", "End", "");
    const fs = mockFs(lines.join("\n"));
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("form_list_controls", {
      sourcePath: "C:/repo/forms/Form_Synthetic.form.txt",
      limit: 100,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    const data = result.data as {
      controls: Array<{ name: string }>;
      totalCount: number;
      truncated: boolean;
      limit: number;
    };
    expect(data.controls.length).toBe(100);
    expect(data.totalCount).toBe(1500);
    expect(data.truncated).toBe(true);
    expect(data.limit).toBe(100);
  });
});
