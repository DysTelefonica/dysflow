// Issue #816 — Phase 3 (Ergonomic actions) — pure FormIR align + distribute
// primitives. These tests pin the pure core behavior at the ports/tool
// boundaries. They are the RED step of the strict TDD cycle: the service
// file `src/core/services/form-ui-align-distribute.ts` does not exist yet.
//
// Behavior under test (per the issue body + design):
//   - `alignControls(ir, controlNames, edge)` aligns N controls to a common
//     edge (left/right/top/bottom/hcenter/vcenter) using the MEDIAN of the
//     selected set (NOT min/max — preserves the spread of off-median
//     outliers). Moves only the axis-aligned `Left`/`Top` property;
//     everything else (control identity, events, bindings, Width, Height,
//     other layout properties, codeBehind) is preserved verbatim.
//   - `distributeControls(ir, controlNames, axis, spacing?)` distributes N
//     controls evenly along an axis. With `spacing` provided (twips), uses
//     the exact gap. Without it, distributes across the bounding box of the
//     selected set (first control at start, last at end, middle ones spaced
//     evenly). Same identity-preserving semantics.
//   - Edge cases:
//     - Unknown control name → FormMutationError FORM_CONTROL_NOT_FOUND.
//     - <2 controls → FormMutationError FORM_MUTATION_INVALID (the issue
//       acceptance criterion: <2 controls for distribute → typed error).
//     - For align, 1 control is a no-op (already "aligned to itself"); for
//       distribute, <2 is rejected.
//     - Controls with non-numeric or missing `Left`/`Top` → FormMutationError
//       FORM_MUTATION_INVALID (cannot align/distribute a control whose
//       geometry is missing).
//
// Pure invariants (no I/O, no FormIR in-place mutation):
//   - The input `ir` is never mutated.
//   - The returned `ir` is a fresh clone (different reference).
//   - The returned `source` is `serializeFormTxt(ir)` of the returned `ir`.
//   - The function never touches `ir.codeBehind`.
//   - `advisories` is always an array (may be empty).

import { describe, expect, it } from "vitest";
import type { FormIR, FormNode, PropertyEntry } from "../../../src/core/models/form-ir.js";
import { parseFormTxt, serializeFormTxt } from "../../../src/core/services/form-ir-service.js";
import {
  alignControls,
  distributeControls,
} from "../../../src/core/services/form-ui-align-distribute.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a tiny FormIR from a list of control descriptions. Each control
 * becomes a top-level child of the form's root, no nested sections. We use
 * this instead of going through the full SaveAsText parser so the tests
 * stay focused on the pure geometry math.
 */
function buildIr(
  controls: Array<{
    name: string;
    left: number;
    top: number;
    width?: number;
    height?: number;
    caption?: string;
    events?: string[];
  }>,
): FormIR {
  const children: FormNode[] = controls.map((control) => {
    const entries: PropertyEntry[] = [
      { kind: "scalar", key: "Name", value: `"${control.name}"` },
      { kind: "scalar", key: "Left", value: String(control.left) },
      { kind: "scalar", key: "Top", value: String(control.top) },
      { kind: "scalar", key: "Width", value: String(control.width ?? 1000) },
      { kind: "scalar", key: "Height", value: String(control.height ?? 500) },
    ];
    if (control.caption !== undefined) {
      entries.push({ kind: "scalar", key: "Caption", value: `"${control.caption}"` });
    }
    for (const event of control.events ?? []) {
      entries.push({ kind: "scalar", key: event, value: '"[Event Procedure]"' });
    }
    return { blockType: "CommandButton", entries, children: [] };
  });
  return {
    name: "Form_Test",
    kind: "Form",
    preamble: [],
    root: { blockType: "Form", entries: [], children },
    codeBehind: null,
  };
}

/** Read a single numeric property off a control, or `null` when missing. */
function readNumeric(
  ir: FormIR,
  controlName: string,
  key: "Left" | "Top" | "Width" | "Height",
): number | null {
  const control = ir.root.children.find((child) => {
    const nameEntry = child.entries.find(
      (entry): entry is { kind: "scalar"; key: string; value: string } =>
        entry.kind === "scalar" && entry.key === "Name",
    );
    return nameEntry?.value === `"${controlName}"`;
  });
  if (!control) return null;
  const entry = control.entries.find(
    (candidate): candidate is { kind: "scalar"; key: string; value: string } =>
      candidate.kind === "scalar" && candidate.key === key,
  );
  if (!entry) return null;
  const parsed = Number(entry.value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Find a control and return all of its scalar entries verbatim. */
function readScalars(ir: FormIR, controlName: string): Record<string, string> {
  const control = ir.root.children.find((child) => {
    const nameEntry = child.entries.find(
      (entry): entry is { kind: "scalar"; key: string; value: string } =>
        entry.kind === "scalar" && entry.key === "Name",
    );
    return nameEntry?.value === `"${controlName}"`;
  });
  if (!control) return {};
  const out: Record<string, string> = {};
  for (const entry of control.entries) {
    if (entry.kind === "scalar") out[entry.key] = entry.value;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Align — single-axis moves + identity preservation
// ---------------------------------------------------------------------------

describe("alignControls — left/right/top/bottom (issue #816)", () => {
  it("aligns left edge to the median Left of the selection", () => {
    // Selection Lefts: 100, 200, 900. Median = 200.
    const ir = buildIr([
      { name: "a", left: 100, top: 50 },
      { name: "b", left: 200, top: 100 },
      { name: "c", left: 900, top: 150 },
    ]);

    const result = alignControls(ir, ["a", "b", "c"], "left");

    // Every control moves to Left = 200 (the median).
    expect(readNumeric(result.ir, "a", "Left")).toBe(200);
    expect(readNumeric(result.ir, "b", "Left")).toBe(200);
    expect(readNumeric(result.ir, "c", "Left")).toBe(200);
    // Top is untouched on each control (identity preserved).
    expect(readNumeric(result.ir, "a", "Top")).toBe(50);
    expect(readNumeric(result.ir, "b", "Top")).toBe(100);
    expect(readNumeric(result.ir, "c", "Top")).toBe(150);
  });

  it("aligns right edge to the median Right of the selection", () => {
    // Selection: Lefts 100, 200, 900; Widths 1000 (all same). Rights = 1100, 1200, 1900. Median Right = 1200.
    // New Left = medianRight − Width = 1200 − 1000 = 200.
    const ir = buildIr([
      { name: "a", left: 100, top: 50 },
      { name: "b", left: 200, top: 100 },
      { name: "c", left: 900, top: 150 },
    ]);

    const result = alignControls(ir, ["a", "b", "c"], "right");

    expect(readNumeric(result.ir, "a", "Left")).toBe(200);
    expect(readNumeric(result.ir, "b", "Left")).toBe(200);
    expect(readNumeric(result.ir, "c", "Left")).toBe(200);
  });

  it("aligns top edge to the median Top", () => {
    const ir = buildIr([
      { name: "a", left: 100, top: 50 },
      { name: "b", left: 200, top: 100 },
      { name: "c", left: 900, top: 700 },
    ]);

    const result = alignControls(ir, ["a", "b", "c"], "top");

    expect(readNumeric(result.ir, "a", "Top")).toBe(100);
    expect(readNumeric(result.ir, "b", "Top")).toBe(100);
    expect(readNumeric(result.ir, "c", "Top")).toBe(100);
    // Left untouched.
    expect(readNumeric(result.ir, "a", "Left")).toBe(100);
    expect(readNumeric(result.ir, "b", "Left")).toBe(200);
    expect(readNumeric(result.ir, "c", "Left")).toBe(900);
  });

  it("aligns bottom edge to the median Bottom", () => {
    // Selection: Tops 50, 100, 700; Heights 500 (all). Bottoms = 550, 600, 1200. Median Bottom = 600.
    // New Top = medianBottom − Height = 600 − 500 = 100.
    const ir = buildIr([
      { name: "a", left: 100, top: 50 },
      { name: "b", left: 200, top: 100 },
      { name: "c", left: 900, top: 700 },
    ]);

    const result = alignControls(ir, ["a", "b", "c"], "bottom");

    expect(readNumeric(result.ir, "a", "Top")).toBe(100);
    expect(readNumeric(result.ir, "b", "Top")).toBe(100);
    expect(readNumeric(result.ir, "c", "Top")).toBe(100);
  });

  it("aligns center-horizontal to the median horizontal-center", () => {
    // Widths 1000 (all). Centroid_x = Left + Width/2 = Left + 500.
    // Centers: 600, 700, 1400. Median = 700.
    // New Left = medianCenter − Width/2 = 700 − 500 = 200.
    const ir = buildIr([
      { name: "a", left: 100, top: 50 },
      { name: "b", left: 200, top: 100 },
      { name: "c", left: 900, top: 150 },
    ]);

    const result = alignControls(ir, ["a", "b", "c"], "center-horizontal");

    expect(readNumeric(result.ir, "a", "Left")).toBe(200);
    expect(readNumeric(result.ir, "b", "Left")).toBe(200);
    expect(readNumeric(result.ir, "c", "Left")).toBe(200);
  });

  it("aligns center-vertical to the median vertical-center", () => {
    // Heights 500 (all). Centers: 300, 350, 950. Median = 350.
    // New Top = medianCenter − Height/2 = 350 − 250 = 100.
    const ir = buildIr([
      { name: "a", left: 100, top: 50 },
      { name: "b", left: 200, top: 100 },
      { name: "c", left: 900, top: 700 },
    ]);

    const result = alignControls(ir, ["a", "b", "c"], "center-vertical");

    expect(readNumeric(result.ir, "a", "Top")).toBe(100);
    expect(readNumeric(result.ir, "b", "Top")).toBe(100);
    expect(readNumeric(result.ir, "c", "Top")).toBe(100);
  });

  it("uses median (not min/max) — outlier is preserved, not snap-fit", () => {
    // Selection: Lefts 100, 200, 300, 900. Sorted: 100, 200, 300, 900.
    // For an even-length set the conventional median is the mean of the
    // two middle values: (200 + 300) / 2 = 250. The outlier (900) does
    // NOT pull the target toward itself (min) or toward 300 (upper of two
    // middles) — the median semantics keep the target at the center of
    // the bulk, away from the outlier.
    const ir = buildIr([
      { name: "a", left: 100, top: 50 },
      { name: "b", left: 200, top: 100 },
      { name: "c", left: 300, top: 150 },
      { name: "d", left: 900, top: 200 }, // outlier
    ]);

    const result = alignControls(ir, ["a", "b", "c", "d"], "left");

    expect(readNumeric(result.ir, "a", "Left")).toBe(250);
    expect(readNumeric(result.ir, "b", "Left")).toBe(250);
    expect(readNumeric(result.ir, "c", "Left")).toBe(250);
    expect(readNumeric(result.ir, "d", "Left")).toBe(250); // outlier collapses to median
  });

  it("single-control align is a no-op (already aligned to itself)", () => {
    const ir = buildIr([{ name: "only", left: 333, top: 444 }]);

    const result = alignControls(ir, ["only"], "left");

    // The single control's Left becomes its own median (333), so the value
    // is unchanged. Top is also unchanged.
    expect(readNumeric(result.ir, "only", "Left")).toBe(333);
    expect(readNumeric(result.ir, "only", "Top")).toBe(444);
  });

  it("zero controls is rejected with FORM_MUTATION_INVALID", () => {
    const ir = buildIr([{ name: "a", left: 0, top: 0 }]);
    expect(() => alignControls(ir, [], "left")).toThrowError(
      expect.objectContaining({ code: "FORM_MUTATION_INVALID" }),
    );
  });
});

// ---------------------------------------------------------------------------
// Align — identity preservation
// ---------------------------------------------------------------------------

describe("alignControls — identity preservation (issue #816)", () => {
  it("preserves Name, Width, Height, Caption, and event bindings verbatim", () => {
    const ir = buildIr([
      {
        name: "cmdSave",
        left: 100,
        top: 50,
        width: 2000,
        height: 600,
        caption: "Save",
        events: ["OnClick", "OnDblClick"],
      },
      {
        name: "cmdExit",
        left: 200,
        top: 100,
        width: 1500,
        height: 400,
        caption: "Exit",
        events: ["OnClick"],
      },
      { name: "cmdHelp", left: 900, top: 150, width: 1200, height: 500, caption: "Help" },
    ]);

    const result = alignControls(ir, ["cmdSave", "cmdExit", "cmdHelp"], "left");

    // Width/Height unchanged.
    expect(readNumeric(result.ir, "cmdSave", "Width")).toBe(2000);
    expect(readNumeric(result.ir, "cmdSave", "Height")).toBe(600);
    expect(readNumeric(result.ir, "cmdExit", "Width")).toBe(1500);
    expect(readNumeric(result.ir, "cmdExit", "Height")).toBe(400);
    expect(readNumeric(result.ir, "cmdHelp", "Width")).toBe(1200);
    expect(readNumeric(result.ir, "cmdHelp", "Height")).toBe(500);

    // Caption unchanged.
    expect(readScalars(result.ir, "cmdSave").Caption).toBe('"Save"');
    expect(readScalars(result.ir, "cmdExit").Caption).toBe('"Exit"');
    expect(readScalars(result.ir, "cmdHelp").Caption).toBe('"Help"');

    // Event bindings unchanged.
    expect(readScalars(result.ir, "cmdSave").OnClick).toBe('"[Event Procedure]"');
    expect(readScalars(result.ir, "cmdSave").OnDblClick).toBe('"[Event Procedure]"');
    expect(readScalars(result.ir, "cmdExit").OnClick).toBe('"[Event Procedure]"');
  });

  it("preserves the order of scalar entries within a control", () => {
    // The pure core uses `upsertScalar`, which preserves insertion order on
    // first-time keys and replaces in-place on existing keys. We verify
    // that the relative order of OTHER keys does not change after the
    // `Left` upsert.
    const ir = buildIr([
      { name: "a", left: 100, top: 50 },
      { name: "b", left: 200, top: 100 },
    ]);

    const result = alignControls(ir, ["a", "b"], "left");
    const a = result.ir.root.children.find((child) => {
      const name = child.entries.find(
        (entry): entry is { kind: "scalar"; key: string; value: string } =>
          entry.kind === "scalar" && entry.key === "Name",
      );
      return name?.value === '"a"';
    });
    expect(a).toBeDefined();
    // Entry order: Name, Left, Top, Width, Height (per buildIr).
    const keys = a?.entries
      .filter(
        (entry): entry is { kind: "scalar"; key: string; value: string } => entry.kind === "scalar",
      )
      .map((entry) => entry.key);
    expect(keys).toEqual(["Name", "Left", "Top", "Width", "Height"]);
  });

  it("never touches codeBehind", () => {
    const ir: FormIR = {
      ...buildIr([
        { name: "a", left: 100, top: 50 },
        { name: "b", left: 200, top: 100 },
      ]),
      codeBehind: "Option Compare Database\nPrivate Sub a_Click()\nEnd Sub\n",
    };
    const beforeCode = ir.codeBehind;
    const result = alignControls(ir, ["a", "b"], "left");
    expect(result.ir.codeBehind).toBe(beforeCode);
  });

  it("does not mutate the input IR", () => {
    const ir = buildIr([
      { name: "a", left: 100, top: 50 },
      { name: "b", left: 200, top: 100 },
    ]);
    const beforeSource = serializeFormTxt(ir);
    const beforeLeft = readNumeric(ir, "a", "Left");
    alignControls(ir, ["a", "b"], "left");
    expect(serializeFormTxt(ir)).toBe(beforeSource);
    expect(readNumeric(ir, "a", "Left")).toBe(beforeLeft);
  });
});

// ---------------------------------------------------------------------------
// Align — error paths
// ---------------------------------------------------------------------------

describe("alignControls — error paths (issue #816)", () => {
  it("rejects an unknown control name with FORM_CONTROL_NOT_FOUND", () => {
    const ir = buildIr([
      { name: "a", left: 100, top: 50 },
      { name: "b", left: 200, top: 100 },
    ]);
    expect(() => alignControls(ir, ["a", "ghost"], "left")).toThrowError(
      expect.objectContaining({ code: "FORM_CONTROL_NOT_FOUND" }),
    );
  });

  it("rejects a control with missing Left/Top with FORM_MUTATION_INVALID", () => {
    // Build a control with no Left at all.
    const ir: FormIR = {
      name: "Form_Test",
      kind: "Form",
      preamble: [],
      root: {
        blockType: "Form",
        entries: [],
        children: [
          {
            blockType: "CommandButton",
            entries: [
              { kind: "scalar", key: "Name", value: '"a"' },
              { kind: "scalar", key: "Top", value: "100" },
              // intentionally NO Left
              { kind: "scalar", key: "Width", value: "1000" },
              { kind: "scalar", key: "Height", value: "500" },
            ],
            children: [],
          },
          {
            blockType: "CommandButton",
            entries: [
              { kind: "scalar", key: "Name", value: '"b"' },
              { kind: "scalar", key: "Left", value: "200" },
              { kind: "scalar", key: "Top", value: "100" },
              { kind: "scalar", key: "Width", value: "1000" },
              { kind: "scalar", key: "Height", value: "500" },
            ],
            children: [],
          },
        ],
      },
      codeBehind: null,
    };
    expect(() => alignControls(ir, ["a", "b"], "left")).toThrowError(
      expect.objectContaining({ code: "FORM_MUTATION_INVALID" }),
    );
  });
});

// ---------------------------------------------------------------------------
// Distribute — even spacing across the bounding box
// ---------------------------------------------------------------------------

describe("distributeControls — even spacing (issue #816)", () => {
  it("distributes N=3 controls evenly across the bounding box (horizontal)", () => {
    // Lefts: 100, 200, 600. Bounding box spans 100..600. 3 controls →
    // first stays at 100, last stays at 600, middle sits at the midpoint
    // of (100+1000-100)/(3-1) = (1100-100)/2 = 500; the midpoint is
    // evenly distributed, so control 2 lands at 100 + (600 - 100) / 2 = 350.
    // Widths 1000 (all).
    const ir = buildIr([
      { name: "a", left: 100, top: 50, width: 1000 },
      { name: "b", left: 200, top: 100, width: 1000 },
      { name: "c", left: 600, top: 150, width: 1000 },
    ]);

    const result = distributeControls(ir, ["a", "b", "c"], "horizontal");

    expect(readNumeric(result.ir, "a", "Left")).toBe(100);
    expect(readNumeric(result.ir, "b", "Left")).toBe(350);
    expect(readNumeric(result.ir, "c", "Left")).toBe(600);
    // Top untouched.
    expect(readNumeric(result.ir, "a", "Top")).toBe(50);
    expect(readNumeric(result.ir, "b", "Top")).toBe(100);
    expect(readNumeric(result.ir, "c", "Top")).toBe(150);
  });

  it("distributes N=4 controls evenly across the bounding box (horizontal)", () => {
    // Selection Lefts: 0, 100, 500, 900; bounding box 0..900.
    // Even spacing = 900 / (4 - 1) = 300 → 0, 300, 600, 900.
    const ir = buildIr([
      { name: "a", left: 0, top: 50 },
      { name: "b", left: 100, top: 100 },
      { name: "c", left: 500, top: 150 },
      { name: "d", left: 900, top: 200 },
    ]);

    const result = distributeControls(ir, ["a", "b", "c", "d"], "horizontal");

    expect(readNumeric(result.ir, "a", "Left")).toBe(0);
    expect(readNumeric(result.ir, "b", "Left")).toBe(300);
    expect(readNumeric(result.ir, "c", "Left")).toBe(600);
    expect(readNumeric(result.ir, "d", "Left")).toBe(900);
  });

  it("distributes along the vertical axis using Top values", () => {
    // Tops: 0, 100, 500, 900 → bounding box 0..900. Even spacing = 300.
    const ir = buildIr([
      { name: "a", left: 50, top: 0 },
      { name: "b", left: 100, top: 100 },
      { name: "c", left: 150, top: 500 },
      { name: "d", left: 200, top: 900 },
    ]);

    const result = distributeControls(ir, ["a", "b", "c", "d"], "vertical");

    expect(readNumeric(result.ir, "a", "Top")).toBe(0);
    expect(readNumeric(result.ir, "b", "Top")).toBe(300);
    expect(readNumeric(result.ir, "c", "Top")).toBe(600);
    expect(readNumeric(result.ir, "d", "Top")).toBe(900);
    // Lefts untouched.
    expect(readNumeric(result.ir, "a", "Left")).toBe(50);
    expect(readNumeric(result.ir, "b", "Left")).toBe(100);
    expect(readNumeric(result.ir, "c", "Left")).toBe(150);
    expect(readNumeric(result.ir, "d", "Left")).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Distribute — fixed spacing
// ---------------------------------------------------------------------------

describe("distributeControls — fixed spacing (issue #816)", () => {
  it("uses the provided spacing twips as the exact gap (horizontal)", () => {
    // Selection: a@100, b@200, c@600. spacing=50 → a=100, b=100+1000+50=1150, c=1150+1000+50=2200.
    // The last control moves too — fixed spacing overrides the bounding-box
    // anchor semantics so the user gets exact gaps.
    const ir = buildIr([
      { name: "a", left: 100, top: 50, width: 1000 },
      { name: "b", left: 200, top: 100, width: 1000 },
      { name: "c", left: 600, top: 150, width: 1000 },
    ]);

    const result = distributeControls(ir, ["a", "b", "c"], "horizontal", 50);

    expect(readNumeric(result.ir, "a", "Left")).toBe(100);
    expect(readNumeric(result.ir, "b", "Left")).toBe(1150);
    expect(readNumeric(result.ir, "c", "Left")).toBe(2200);
  });

  it("uses fixed spacing along the vertical axis too", () => {
    // spacing=20 along vertical. a@50, b@100, c@200 → a=50, b=50+500+20=570, c=570+500+20=1090.
    const ir = buildIr([
      { name: "a", left: 50, top: 50, height: 500 },
      { name: "b", left: 100, top: 100, height: 500 },
      { name: "c", left: 150, top: 200, height: 500 },
    ]);

    const result = distributeControls(ir, ["a", "b", "c"], "vertical", 20);

    expect(readNumeric(result.ir, "a", "Top")).toBe(50);
    expect(readNumeric(result.ir, "b", "Top")).toBe(570);
    expect(readNumeric(result.ir, "c", "Top")).toBe(1090);
  });

  it("sorts the selection by axis position before applying fixed spacing", () => {
    // Selection order: c, a, b. Fixed spacing=10. Each control has width 500.
    // Sorted by Left: a@100, b@200, c@600.
    // After sorting: a=100, b=100+500+10=610, c=610+500+10=1120.
    const ir = buildIr([
      { name: "c", left: 600, top: 150, width: 500 },
      { name: "a", left: 100, top: 50, width: 500 },
      { name: "b", left: 200, top: 100, width: 500 },
    ]);

    const result = distributeControls(ir, ["c", "a", "b"], "horizontal", 10);

    expect(readNumeric(result.ir, "a", "Left")).toBe(100);
    expect(readNumeric(result.ir, "b", "Left")).toBe(610);
    expect(readNumeric(result.ir, "c", "Left")).toBe(1120);
  });
});

// ---------------------------------------------------------------------------
// Distribute — identity preservation + edge cases
// ---------------------------------------------------------------------------

describe("distributeControls — identity + edge cases (issue #816)", () => {
  it("preserves Name, Width, Height, Caption, and event bindings verbatim", () => {
    const ir = buildIr([
      {
        name: "cmdSave",
        left: 100,
        top: 50,
        width: 2000,
        height: 600,
        caption: "Save",
        events: ["OnClick"],
      },
      {
        name: "cmdExit",
        left: 200,
        top: 100,
        width: 1500,
        height: 400,
        caption: "Exit",
        events: ["OnClick"],
      },
      { name: "cmdHelp", left: 900, top: 150, width: 1200, height: 500, caption: "Help" },
    ]);

    const result = distributeControls(ir, ["cmdSave", "cmdExit", "cmdHelp"], "horizontal");

    // Widths/Heights preserved.
    expect(readNumeric(result.ir, "cmdSave", "Width")).toBe(2000);
    expect(readNumeric(result.ir, "cmdSave", "Height")).toBe(600);
    expect(readNumeric(result.ir, "cmdExit", "Width")).toBe(1500);
    expect(readNumeric(result.ir, "cmdExit", "Height")).toBe(400);
    expect(readNumeric(result.ir, "cmdHelp", "Width")).toBe(1200);
    expect(readNumeric(result.ir, "cmdHelp", "Height")).toBe(500);
    // Captions preserved.
    expect(readScalars(result.ir, "cmdSave").Caption).toBe('"Save"');
    expect(readScalars(result.ir, "cmdExit").Caption).toBe('"Exit"');
    expect(readScalars(result.ir, "cmdHelp").Caption).toBe('"Help"');
    // Event bindings preserved.
    expect(readScalars(result.ir, "cmdSave").OnClick).toBe('"[Event Procedure]"');
  });

  it("does not mutate the input IR", () => {
    const ir = buildIr([
      { name: "a", left: 100, top: 50 },
      { name: "b", left: 200, top: 100 },
      { name: "c", left: 600, top: 150 },
    ]);
    const beforeSource = serializeFormTxt(ir);
    distributeControls(ir, ["a", "b", "c"], "horizontal");
    expect(serializeFormTxt(ir)).toBe(beforeSource);
  });

  it("N=2 places the first at start and the second at start + spacing (default = bounding box preserves both anchors)", () => {
    // Selection: a@100, b@900. With bounding-box distribution, first stays
    // at 100, second stays at 900 (the bounding box endpoints are preserved).
    const ir = buildIr([
      { name: "a", left: 100, top: 50 },
      { name: "b", left: 900, top: 100 },
    ]);

    const result = distributeControls(ir, ["a", "b"], "horizontal");

    expect(readNumeric(result.ir, "a", "Left")).toBe(100);
    expect(readNumeric(result.ir, "b", "Left")).toBe(900);
  });

  it("N=1 is rejected with FORM_MUTATION_INVALID (issue acceptance criterion)", () => {
    const ir = buildIr([{ name: "only", left: 100, top: 50 }]);
    expect(() => distributeControls(ir, ["only"], "horizontal")).toThrowError(
      expect.objectContaining({ code: "FORM_MUTATION_INVALID" }),
    );
  });

  it("N=0 is rejected with FORM_MUTATION_INVALID", () => {
    const ir = buildIr([{ name: "a", left: 100, top: 50 }]);
    expect(() => distributeControls(ir, [], "horizontal")).toThrowError(
      expect.objectContaining({ code: "FORM_MUTATION_INVALID" }),
    );
  });

  it("rejects an unknown control name with FORM_CONTROL_NOT_FOUND", () => {
    const ir = buildIr([
      { name: "a", left: 100, top: 50 },
      { name: "b", left: 200, top: 100 },
      { name: "c", left: 600, top: 150 },
    ]);
    expect(() => distributeControls(ir, ["a", "ghost", "c"], "horizontal")).toThrowError(
      expect.objectContaining({ code: "FORM_CONTROL_NOT_FOUND" }),
    );
  });

  it("never touches codeBehind", () => {
    const ir: FormIR = {
      ...buildIr([
        { name: "a", left: 100, top: 50 },
        { name: "b", left: 200, top: 100 },
        { name: "c", left: 600, top: 150 },
      ]),
      codeBehind: "Option Compare Database\n",
    };
    const beforeCode = ir.codeBehind;
    const result = distributeControls(ir, ["a", "b", "c"], "horizontal");
    expect(result.ir.codeBehind).toBe(beforeCode);
  });
});

// ---------------------------------------------------------------------------
// Round-trip — the returned ir.source is parseFormTxt(serialize(result.ir))
// ---------------------------------------------------------------------------

describe("alignControls + distributeControls — return shape", () => {
  it("returns { ir, source, advisories } with serialized source + empty advisories", () => {
    const ir = buildIr([
      { name: "a", left: 100, top: 50 },
      { name: "b", left: 200, top: 100 },
      { name: "c", left: 600, top: 150 },
    ]);

    const alignResult = alignControls(ir, ["a", "b", "c"], "left");
    expect(alignResult.advisories).toEqual([]);
    expect(alignResult.source).toBe(serializeFormTxt(alignResult.ir));

    const distributeResult = distributeControls(ir, ["a", "b", "c"], "horizontal");
    expect(distributeResult.advisories).toEqual([]);
    expect(distributeResult.source).toBe(serializeFormTxt(distributeResult.ir));
  });

  it("the returned source round-trips through parseFormTxt without loss", () => {
    const ir = buildIr([
      { name: "a", left: 100, top: 50, caption: "A" },
      { name: "b", left: 200, top: 100, caption: "B" },
      { name: "c", left: 600, top: 150, caption: "C" },
    ]);

    const alignResult = alignControls(ir, ["a", "b", "c"], "left");
    const reparsed = parseFormTxt(alignResult.source, { name: "Form_Test" });
    expect(readNumeric(reparsed, "a", "Left")).toBe(200);
    expect(readNumeric(reparsed, "b", "Left")).toBe(200);
    expect(readNumeric(reparsed, "c", "Left")).toBe(200);
    expect(readScalars(reparsed, "a").Caption).toBe('"A"');
  });
});
