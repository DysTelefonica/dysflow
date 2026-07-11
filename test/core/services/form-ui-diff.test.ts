import { describe, expect, it } from "vitest";
import type { FormIR } from "../../../src/core/models/form-ir";
import { diffFormPreview } from "../../../src/core/services/form-ui-diff";

// ---------------------------------------------------------------------------
// Fixture: a baseline form (CustomerView) and several mutations. We pin each
// diff category to a deterministic FormIR pair so the tests run in isolation
// without filesystem fixtures.
// ---------------------------------------------------------------------------

const IR: FormIR = {
  name: "CustomerView",
  kind: "Form",
  preamble: [],
  root: {
    blockType: "Form",
    entries: [],
    children: [
      {
        blockType: "Detail",
        entries: [],
        children: [
          {
            blockType: "Label",
            entries: [
              { kind: "scalar", key: "Name", value: '"lblName"' },
              { kind: "scalar", key: "Left", value: "1000" },
              { kind: "scalar", key: "Top", value: "1000" },
              { kind: "scalar", key: "Width", value: "2000" },
              { kind: "scalar", key: "Height", value: "400" },
            ],
            children: [],
          },
          {
            blockType: "TextBox",
            entries: [
              { kind: "scalar", key: "Name", value: '"txtCustomerName"' },
              { kind: "scalar", key: "Left", value: "3200" },
              { kind: "scalar", key: "Top", value: "1000" },
              { kind: "scalar", key: "Width", value: "3000" },
              { kind: "scalar", key: "Height", value: "400" },
            ],
            children: [],
          },
          {
            blockType: "CommandButton",
            entries: [
              { kind: "scalar", key: "Name", value: '"cmdSave"' },
              { kind: "scalar", key: "Left", value: "500" },
              { kind: "scalar", key: "Top", value: "2000" },
              { kind: "scalar", key: "Width", value: "1000" },
              { kind: "scalar", key: "Height", value: "400" },
            ],
            children: [],
          },
        ],
      },
    ],
  },
  codeBehind: null,
};

function deepCloneIR(ir: FormIR): FormIR {
  return JSON.parse(JSON.stringify(ir)) as FormIR;
}

function moveTextBox(ir: FormIR, name: string, left: number): void {
  for (const section of ir.root.children) {
    for (const child of section.children) {
      if (child.blockType === "TextBox") {
        const nameEntry = child.entries.find((e) => e.kind === "scalar" && e.key === "Name");
        if (nameEntry?.kind === "scalar" && nameEntry.value === `"${name}"`) {
          child.entries = child.entries.map((entry) =>
            entry.kind === "scalar" && entry.key === "Left"
              ? { ...entry, value: String(left) }
              : entry,
          );
        }
      }
    }
  }
}

function resizeTextBox(ir: FormIR, name: string, width: number, height: number): void {
  for (const section of ir.root.children) {
    for (const child of section.children) {
      if (child.blockType === "TextBox") {
        const nameEntry = child.entries.find((e) => e.kind === "scalar" && e.key === "Name");
        if (nameEntry?.kind === "scalar" && nameEntry.value === `"${name}"`) {
          child.entries = child.entries.map((entry) => {
            if (entry.kind !== "scalar") return entry;
            if (entry.key === "Width") return { ...entry, value: String(width) };
            if (entry.key === "Height") return { ...entry, value: String(height) };
            return entry;
          });
        }
      }
    }
  }
}

function addControl(
  ir: FormIR,
  blockType: string,
  name: string,
  rect: {
    left: number;
    top: number;
    width: number;
    height: number;
  },
): void {
  const detail = ir.root.children[0];
  if (!detail) throw new Error("fixture detail missing");
  detail.children.push({
    blockType,
    entries: [
      { kind: "scalar", key: "Name", value: `"${name}"` },
      { kind: "scalar", key: "Left", value: String(rect.left) },
      { kind: "scalar", key: "Top", value: String(rect.top) },
      { kind: "scalar", key: "Width", value: String(rect.width) },
      { kind: "scalar", key: "Height", value: String(rect.height) },
    ],
    children: [],
  });
}

function removeControl(ir: FormIR, name: string): void {
  for (const section of ir.root.children) {
    section.children = section.children.filter((child) => {
      const nameEntry = child.entries.find((e) => e.kind === "scalar" && e.key === "Name");
      return !(nameEntry?.kind === "scalar" && nameEntry.value === `"${name}"`);
    });
  }
}

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

describe("diffFormPreview — output shape (issue #817)", () => {
  it("returns svg, ascii, before, after, changes and warnings", () => {
    const after = deepCloneIR(IR);
    const result = diffFormPreview(IR, after);

    expect(result.svg).toEqual(expect.any(String));
    expect(result.ascii).toEqual(expect.arrayContaining([expect.any(String)]));
    expect(result.before).toBeDefined();
    expect(result.after).toBeDefined();
    expect(result.changes).toEqual({
      added: expect.any(Array),
      removed: expect.any(Array),
      moved: expect.any(Array),
      resized: expect.any(Array),
    });
    expect(result.warnings).toEqual(expect.any(Array));
  });

  it("is deterministic across consecutive calls", () => {
    const after = deepCloneIR(IR);
    const a = diffFormPreview(IR, after);
    const b = diffFormPreview(IR, after);
    expect(a.svg).toBe(b.svg);
    expect(a.ascii).toEqual(b.ascii);
    expect(a.changes).toEqual(b.changes);
  });
});

// ---------------------------------------------------------------------------
// Each diff category — pins a behavior the AI consumer relies on
// ---------------------------------------------------------------------------

describe("diffFormPreview — moved category", () => {
  it("classifies a Left-only change as 'moved' (Width/Height unchanged)", () => {
    const after = deepCloneIR(IR);
    moveTextBox(after, "txtCustomerName", 3300); // was 3200

    const result = diffFormPreview(IR, after);

    expect(result.changes.moved.map((c) => c.controlName)).toContain("txtCustomerName");
    expect(result.changes.moved.find((c) => c.controlName === "txtCustomerName")).toMatchObject({
      controlName: "txtCustomerName",
      before: { left: 3200, top: 1000, width: 3000, height: 400 },
      after: { left: 3300, top: 1000, width: 3000, height: 400 },
    });
    expect(result.changes.added).toEqual([]);
    expect(result.changes.removed).toEqual([]);
    expect(result.changes.resized).toEqual([]);
  });

  it("emits data-diff='moved' on the SVG rect for the moved control", () => {
    const after = deepCloneIR(IR);
    moveTextBox(after, "txtCustomerName", 3300);

    const { svg } = diffFormPreview(IR, after);
    // Locate the rect element for txtCustomerName and confirm the diff attribute.
    const re = /data-control="txtCustomerName"[^>]*data-diff="moved"/;
    expect(re.test(svg)).toBe(true);
  });
});

describe("diffFormPreview — resized category", () => {
  it("classifies a Width/Height change as 'resized' (Left/Top unchanged)", () => {
    const after = deepCloneIR(IR);
    resizeTextBox(after, "txtCustomerName", 3500, 500); // 3000x400 -> 3500x500

    const result = diffFormPreview(IR, after);

    expect(result.changes.resized.map((c) => c.controlName)).toContain("txtCustomerName");
    expect(result.changes.resized.find((c) => c.controlName === "txtCustomerName")).toMatchObject({
      controlName: "txtCustomerName",
      before: { left: 3200, top: 1000, width: 3000, height: 400 },
      after: { left: 3200, top: 1000, width: 3500, height: 500 },
    });
    expect(result.changes.moved).toEqual([]);
  });

  it("emits data-diff='resized' on the SVG rect for the resized control", () => {
    const after = deepCloneIR(IR);
    resizeTextBox(after, "txtCustomerName", 3500, 500);

    const { svg } = diffFormPreview(IR, after);
    const re = /data-control="txtCustomerName"[^>]*data-diff="resized"/;
    expect(re.test(svg)).toBe(true);
  });
});

describe("diffFormPreview — added category", () => {
  it("classifies a control present only in 'after' as 'added'", () => {
    const after = deepCloneIR(IR);
    addControl(after, "CommandButton", "cmdNew", {
      left: 6000,
      top: 2000,
      width: 1000,
      height: 400,
    });

    const result = diffFormPreview(IR, after);

    expect(result.changes.added.map((c) => c.controlName)).toContain("cmdNew");
    expect(result.changes.added.find((c) => c.controlName === "cmdNew")).toMatchObject({
      controlName: "cmdNew",
      box: { left: 6000, top: 2000, width: 1000, height: 400 },
    });
    expect(result.changes.removed).toEqual([]);
  });

  it("emits data-diff='added' on the SVG rect for the new control", () => {
    const after = deepCloneIR(IR);
    addControl(after, "CommandButton", "cmdNew", {
      left: 6000,
      top: 2000,
      width: 1000,
      height: 400,
    });

    const { svg } = diffFormPreview(IR, after);
    const re = /data-control="cmdNew"[^>]*data-diff="added"/;
    expect(re.test(svg)).toBe(true);
  });
});

describe("diffFormPreview — removed category", () => {
  it("classifies a control present only in 'before' as 'removed'", () => {
    const after = deepCloneIR(IR);
    removeControl(after, "cmdSave");

    const result = diffFormPreview(IR, after);

    expect(result.changes.removed.map((c) => c.controlName)).toContain("cmdSave");
    expect(result.changes.removed.find((c) => c.controlName === "cmdSave")).toMatchObject({
      controlName: "cmdSave",
      box: { left: 500, top: 2000, width: 1000, height: 400 },
    });
    expect(result.changes.added).toEqual([]);
  });

  it("emits data-diff='removed' on the SVG rect for the removed control", () => {
    const after = deepCloneIR(IR);
    removeControl(after, "cmdSave");

    const { svg } = diffFormPreview(IR, after);
    // The diff SVG pins the removed control's geometry on the 'before'
    // frame so the agent can see what disappeared.
    const re = /data-control="cmdSave"[^>]*data-diff="removed"/;
    expect(re.test(svg)).toBe(true);
  });
});

describe("diffFormPreview — unchanged controls", () => {
  it("emits data-diff='same' on the SVG rect for controls identical in both frames", () => {
    const after = deepCloneIR(IR);
    const { svg } = diffFormPreview(IR, after);

    // lblName sits at (1000, 1000) 2000x400 in both — it MUST carry data-diff=same.
    const re = /data-control="lblName"[^>]*data-diff="same"/;
    expect(re.test(svg)).toBe(true);
  });

  it("does NOT list unchanged controls in `changes` (same is informational only)", () => {
    const after = deepCloneIR(IR);
    const result = diffFormPreview(IR, after);

    expect(result.changes.added).toEqual([]);
    expect(result.changes.removed).toEqual([]);
    expect(result.changes.moved).toEqual([]);
    expect(result.changes.resized).toEqual([]);
  });
});

describe("diffFormPreview — combined diffs", () => {
  it("classifies multiple categories at once (added + removed + moved)", () => {
    const after = deepCloneIR(IR);
    addControl(after, "CommandButton", "cmdNew", {
      left: 6000,
      top: 2000,
      width: 1000,
      height: 400,
    });
    removeControl(after, "cmdSave");
    moveTextBox(after, "txtCustomerName", 3300);

    const result = diffFormPreview(IR, after);

    expect(result.changes.added.map((c) => c.controlName)).toEqual(["cmdNew"]);
    expect(result.changes.removed.map((c) => c.controlName)).toEqual(["cmdSave"]);
    expect(result.changes.moved.map((c) => c.controlName)).toEqual(["txtCustomerName"]);
    expect(result.changes.resized).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ASCII diff surface — markers + (added), - (removed), * (moved/resized)
// ---------------------------------------------------------------------------

describe("diffFormPreview — ASCII markers", () => {
  it("emits '+' in the cell grid for added controls", () => {
    const after = deepCloneIR(IR);
    addControl(after, "CommandButton", "cmdNew", {
      left: 6000,
      top: 2000,
      width: 1000,
      height: 400,
    });

    const { ascii } = diffFormPreview(IR, after);
    const joined = ascii.join("\n");
    expect(joined).toMatch(/\+/);
  });

  it("emits '-' in the cell grid for removed controls", () => {
    const after = deepCloneIR(IR);
    removeControl(after, "cmdSave");

    const { ascii } = diffFormPreview(IR, after);
    const joined = ascii.join("\n");
    expect(joined).toMatch(/-/);
  });

  it("emits '*' in the cell grid for moved or resized controls", () => {
    const after = deepCloneIR(IR);
    moveTextBox(after, "txtCustomerName", 3300);

    const { ascii } = diffFormPreview(IR, after);
    const joined = ascii.join("\n");
    expect(joined).toMatch(/\*/);
  });
});

// ---------------------------------------------------------------------------
// warnings — propagate from both frames
// ---------------------------------------------------------------------------

describe("diffFormPreview — warnings propagation", () => {
  it("propagates warnings from both before and after frames", () => {
    const after = deepCloneIR(IR);
    // Add a control with missing geometry in the 'after' frame.
    after.root.children[0]?.children.push({
      blockType: "TextBox",
      entries: [
        { kind: "scalar", key: "Name", value: '"txtBroken"' },
        // missing Left/Top/Width/Height
      ],
      children: [],
    });

    const { warnings } = diffFormPreview(IR, after);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.join("\n")).toMatch(/txtBroken/);
  });
});
