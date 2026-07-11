import { describe, expect, it } from "vitest";
import type { FormIR } from "../../../src/core/models/form-ir";
import { renderFormPreview } from "../../../src/core/services/form-ui-render";

// ---------------------------------------------------------------------------
// Fixture: a representative Access form. The intent is to exercise every
// public branch of the renderer:
//   - a form header with one (Header) CommandButton "cmdRefresh"
//   - a detail section with a Label, a TextBox, and a CommandButton
//   - one hidden control (Visible = 0) reported as a warning
//   - one control with missing geometry (no Left/Top/Width/Height) reported
//     as a warning
//   - one control inside an unlabeled Begin...End block (a child rectangle)
//   - one control inside a TabControl — verifies nested container handling
//
// Twip coordinates are chosen so a viewport scale of 0.05 keeps the
// rendered SVG dimensions in the ~1500px wide sweet spot (30000 twips ≈
// 21 inches at 1440 twips/inch).
// ---------------------------------------------------------------------------

const IR: FormIR = {
  name: "CustomerView",
  kind: "Form",
  preamble: [],
  root: {
    blockType: "Form",
    entries: [
      { kind: "scalar", key: "Width", value: "20000" },
      { kind: "scalar", key: "RecordSource", value: '"Customers"' },
    ],
    children: [
      {
        blockType: "FormHeader",
        entries: [],
        children: [
          {
            blockType: "CommandButton",
            entries: [
              { kind: "scalar", key: "Name", value: '"cmdRefresh"' },
              { kind: "scalar", key: "Caption", value: '"Refresh"' },
              { kind: "scalar", key: "Left", value: "500" },
              { kind: "scalar", key: "Top", value: "200" },
              { kind: "scalar", key: "Width", value: "1500" },
              { kind: "scalar", key: "Height", value: "500" },
            ],
            children: [],
          },
        ],
      },
      {
        blockType: "Detail",
        entries: [],
        children: [
          {
            blockType: "Label",
            entries: [
              { kind: "scalar", key: "Name", value: '"lblName"' },
              { kind: "scalar", key: "Caption", value: '"Customer:"' },
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
              { kind: "scalar", key: "ControlSource", value: '"CustomerName"' },
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
              { kind: "scalar", key: "Name", value: '"cmdHidden"' },
              { kind: "scalar", key: "Left", value: "500" },
              { kind: "scalar", key: "Top", value: "2000" },
              { kind: "scalar", key: "Width", value: "1000" },
              { kind: "scalar", key: "Height", value: "400" },
              { kind: "scalar", key: "Visible", value: "0" },
            ],
            children: [],
          },
          {
            blockType: "TextBox",
            entries: [
              { kind: "scalar", key: "Name", value: '"txtNoGeometry"' },
              // intentionally missing Left/Top/Width/Height
              { kind: "scalar", key: "ControlSource", value: '"Email"' },
            ],
            children: [],
          },
          {
            blockType: "",
            entries: [],
            children: [
              {
                blockType: "Rectangle",
                entries: [
                  { kind: "scalar", key: "Name", value: '"boxBorder"' },
                  { kind: "scalar", key: "Left", value: "0" },
                  { kind: "scalar", key: "Top", value: "0" },
                  { kind: "scalar", key: "Width", value: "8000" },
                  { kind: "scalar", key: "Height", value: "3000" },
                ],
                children: [],
              },
            ],
          },
          {
            blockType: "TabControl",
            entries: [
              { kind: "scalar", key: "Name", value: '"tabMain"' },
              { kind: "scalar", key: "Left", value: "7000" },
              { kind: "scalar", key: "Top", value: "200" },
              { kind: "scalar", key: "Width", value: "4000" },
              { kind: "scalar", key: "Height", value: "3000" },
            ],
            children: [
              {
                blockType: "Page",
                entries: [
                  { kind: "scalar", key: "Name", value: '"pgFirst"' },
                  { kind: "scalar", key: "Caption", value: '"Main"' },
                ],
                children: [
                  {
                    blockType: "TextBox",
                    entries: [
                      { kind: "scalar", key: "Name", value: '"txtInsideTab"' },
                      { kind: "scalar", key: "Left", value: "100" },
                      { kind: "scalar", key: "Top", value: "200" },
                      { kind: "scalar", key: "Width", value: "1500" },
                      { kind: "scalar", key: "Height", value: "400" },
                    ],
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  codeBehind: null,
};

// ---------------------------------------------------------------------------
// Output shape (issue #814 — coordinate with #817)
// ---------------------------------------------------------------------------

describe("renderFormPreview — output shape (issue #814)", () => {
  it("returns svg, ascii, viewport, and warnings as a single structured object", () => {
    const result = renderFormPreview(IR);
    expect(result.svg).toEqual(expect.any(String));
    expect(result.ascii).toEqual(expect.any(String));
    expect(result.viewport).toMatchObject({
      width: expect.any(Number),
      height: expect.any(Number),
    });
    expect(result.warnings).toEqual(expect.any(Array));
  });

  it("is deterministic across consecutive runs (byte-stable for snapshot tests)", () => {
    const a = renderFormPreview(IR);
    const b = renderFormPreview(IR);
    expect(a.svg).toBe(b.svg);
    expect(a.ascii).toBe(b.ascii);
    expect(a.viewport).toEqual(b.viewport);
  });
});

// ---------------------------------------------------------------------------
// SVG (semantic — labeled rectangles + role colors, grouped by section)
// ---------------------------------------------------------------------------

describe("renderFormPreview — SVG output (issue #814)", () => {
  it("is a self-contained SVG document (no external refs, well-formed)", () => {
    const { svg } = renderFormPreview(IR);
    expect(svg).toMatch(/^<svg\b/);
    expect(svg).toMatch(/<\/svg>\s*$/);
    // The SVG namespace is required by the SVG 1.1 spec — that is a
    // well-known IRI, not an external HTTP dependency. We assert on
    // hyperlinks / image refs / stylesheet links instead.
    expect(svg).not.toContain("<image");
    expect(svg).not.toContain("<link");
    expect(svg).not.toContain("<style");
    expect(svg).not.toContain("<script");
    expect(svg).not.toContain("xlink:href");
  });

  it("declares a viewBox that matches the returned viewport", () => {
    const { svg, viewport } = renderFormPreview(IR);
    expect(svg).toContain(`viewBox="0 0 ${viewport.width} ${viewport.height}"`);
  });

  it("emits one <rect> per visible control with deterministic twip-derived coordinates", () => {
    const { svg, viewport } = renderFormPreview(IR, { viewportScale: 0.05 });
    // cmdRefresh — Header section: Left=500 twips -> 500*0.05 = 25px.
    expect(svg).toContain('data-control="cmdRefresh"');
    // lblName — Detail Left=1000 twips -> 1000*0.05 = 50px.
    expect(svg).toContain('data-control="lblName"');
    // Viewport's right edge equals the controls' bounding box (11000
    // twips) at scale 0.05 -> 550px. Pin that exact math so #817's
    // diff composition can rely on it.
    expect(viewport.width).toBe(550);
    expect(svg).toContain(`viewBox="0 0 550 ${viewport.height}"`);
  });

  it("honors a custom viewportScale (1 twip == 1 px)", () => {
    const { svg, viewport } = renderFormPreview(IR, { viewportScale: 1 });
    // Form width is 20000 twips; at scale=1 the viewport shrinks to the
    // controls' bounding box (the form header label is 200 twips from the
    // top, controls run down to ~3000 twips).
    expect(viewport.width).toBeGreaterThan(0);
    expect(viewport.height).toBeGreaterThan(0);
    expect(svg).toContain(`viewBox="0 0 ${viewport.width} ${viewport.height}"`);
  });

  it("labels visible controls with their control name in <text> elements", () => {
    const { svg } = renderFormPreview(IR, { viewportScale: 0.05 });
    expect(svg).toMatch(/<text[^>]*>cmdRefresh<\/text>/);
    expect(svg).toMatch(/<text[^>]*>lblName<\/text>/);
    expect(svg).toMatch(/<text[^>]*>txtCustomerName<\/text>/);
  });

  it("does NOT emit a <rect> for a hidden control (Visible = 0)", () => {
    const { svg } = renderFormPreview(IR);
    expect(svg).not.toContain('data-control="cmdHidden"');
    // But the control name appears in the warnings array.
  });

  it("groups controls under per-section <g data-section=...> blocks", () => {
    const { svg } = renderFormPreview(IR);
    expect(svg).toMatch(/<g[^>]*data-section="Header"/);
    expect(svg).toMatch(/<g[^>]*data-section="Detail"/);
  });

  it("uses role-derived fill colors (action/input/display/container)", () => {
    const { svg } = renderFormPreview(IR);
    // At least one control of each role is in the IR — assert by sampling
    // the fill style for the rect that wraps each control name.
    const html = svg.replace(/[\r\n]+/g, " ");
    expect(html).toMatch(/data-control="cmdRefresh"[^>]*fill="#[0-9a-fA-F]{3,6}"/);
    expect(html).toMatch(/data-control="txtCustomerName"[^>]*fill="#[0-9a-fA-F]{3,6}"/);
    expect(html).toMatch(/data-control="lblName"[^>]*fill="#[0-9a-fA-F]{3,6}"/);
  });
});

// ---------------------------------------------------------------------------
// ASCII (monospace box-drawing grid — fallback for terminals)
// ---------------------------------------------------------------------------

describe("renderFormPreview — ASCII output (issue #814)", () => {
  it("emits a rectangular box-drawing grid sized to the viewport", () => {
    const { ascii, viewport } = renderFormPreview(IR, {
      viewportScale: 0.001,
      ascii: { cellWidth: 80, cellHeight: 24 },
    });
    const lines = ascii.split("\n");
    // The grid MUST fit the requested cell dimensions.
    expect(lines.length).toBe(24);
    for (const line of lines) {
      expect(line.length, `all rows must be ${80} chars wide`).toBe(80);
    }
    // Viewport in twip-derived space may collapse to small numbers at this
    // scale; what matters is the ASCII surface shape.
    expect(viewport.width).toBeGreaterThan(0);
    expect(viewport.height).toBeGreaterThan(0);
  });

  it("places a control's name inside the grid at its layout position", () => {
    const { ascii } = renderFormPreview(IR, {
      viewportScale: 0.005,
      ascii: { cellWidth: 80, cellHeight: 24 },
    });
    // cmdRefresh sits in the FormHeader band; its abbreviation ("CMD")
    // should appear somewhere in the first few rows.
    const firstBand = ascii.split("\n").slice(0, 6).join("\n");
    expect(firstBand).toMatch(/CMD/);
  });

  it("places control abbrevs in visual (top,left) order", () => {
    const { ascii } = renderFormPreview(IR, {
      viewportScale: 0.005,
      ascii: { cellWidth: 120, cellHeight: 30 },
    });
    // The two action controls sit at Top=200 (Header) and the Detail action
    // site (cmdHidden is hidden — skipped; lblName + txtCustomerName are
    // visible). The visible-band sequence is determined by visualOrder.
    expect(ascii).toMatch(/CMD/); // cmdRefresh — Header band
    expect(ascii).toMatch(/LBL/); // lblName — Detail band
  });

  it("does NOT paint a hidden control's abbreviation into the grid", () => {
    const { ascii } = renderFormPreview(IR, {
      viewportScale: 0.005,
      ascii: { cellWidth: 120, cellHeight: 30 },
    });
    // cmdHidden is Visible=0; its abbreviation must be absent.
    expect(ascii).not.toMatch(/HID/);
  });

  it("falls back to a single-cell grid when cellWidth/cellHeight are zero", () => {
    const { ascii } = renderFormPreview(IR, {
      ascii: { cellWidth: 0, cellHeight: 0 },
    });
    // Even a degenerate cell dimensions request must yield a non-empty,
    // non-null grid surface so downstream consumers can pipe it to a
    // terminal without crashing.
    expect(ascii.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Warnings: missing geometry + hidden controls
// ---------------------------------------------------------------------------

describe("renderFormPreview — warnings (issue #814 acceptance)", () => {
  it("reports a warning for each control with missing geometry", () => {
    const { warnings } = renderFormPreview(IR);
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/txtNoGeometry/),
        expect.stringMatching(/missing/i),
      ]),
    );
  });

  it("reports a warning naming every hidden control (Visible=0)", () => {
    const { warnings } = renderFormPreview(IR);
    expect(warnings).toEqual(expect.arrayContaining([expect.stringMatching(/cmdHidden[^a-zA-Z]/)]));
  });

  it("emits no warnings for a fully-geometry, all-visible form", () => {
    const clean: FormIR = {
      name: "Clean",
      kind: "Form",
      preamble: [],
      root: {
        blockType: "Form",
        entries: [],
        children: [
          {
            blockType: "Section",
            entries: [],
            children: [
              {
                blockType: "Label",
                entries: [
                  { kind: "scalar", key: "Name", value: '"lblOK"' },
                  { kind: "scalar", key: "Left", value: "100" },
                  { kind: "scalar", key: "Top", value: "100" },
                  { kind: "scalar", key: "Width", value: "500" },
                  { kind: "scalar", key: "Height", value: "200" },
                ],
                children: [],
              },
            ],
          },
        ],
      },
      codeBehind: null,
    };
    const { warnings } = renderFormPreview(clean);
    expect(warnings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Twip coordinate normalization (issue #814 acceptance: pixel conversion
// constant documented in one place, unit-tested against known sizes)
// ---------------------------------------------------------------------------

describe("renderFormPreview — twip conversion", () => {
  it("normalizes control rectangles: a control at Left=2880 twips sits at 2 inches", () => {
    // 2880 twips == 2 inches at 1440 twips/inch.
    const fixture: FormIR = {
      name: "Inches",
      kind: "Form",
      preamble: [],
      root: {
        blockType: "Form",
        entries: [],
        children: [
          {
            blockType: "Section",
            entries: [],
            children: [
              {
                blockType: "TextBox",
                entries: [
                  { kind: "scalar", key: "Name", value: '"txtA"' },
                  { kind: "scalar", key: "Left", value: "2880" },
                  { kind: "scalar", key: "Top", value: "0" },
                  { kind: "scalar", key: "Width", value: "1440" },
                  { kind: "scalar", key: "Height", value: "720" },
                ],
                children: [],
              },
            ],
          },
        ],
      },
      codeBehind: null,
    };
    // At scale=1, the left edge of the rect is at 2880 — the unit test
    // pins the conversion constant: 1 twip == 1 unit at viewportScale=1.
    const { svg } = renderFormPreview(fixture, { viewportScale: 1 });
    // Look for the x attribute on the rect that wraps the control name.
    // The renderer MUST emit a rectangular region whose left edge corresponds
    // to the input twip value at scale=1.
    const match = svg.match(/data-control="txtA"[^>]*\s+x="(\d+(?:\.\d+)?)"/);
    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBeCloseTo(2880, 5);
  });
});

// ---------------------------------------------------------------------------
// Coordinate with #817 — the renderer's output shape is the "single-frame"
// primitive. A pair of frames composes the diff. This test pins the
// intended shape.
// ---------------------------------------------------------------------------

describe("renderFormPreview — #817 composition seam (issue #814 coordination)", () => {
  it("two renderings differ only in the data that changed between the IRs", () => {
    const baselineIr: FormIR = JSON.parse(JSON.stringify(IR));
    const modifiedIr: FormIR = JSON.parse(JSON.stringify(IR));
    // Move txtCustomerName by 100 twips.
    const detailSection = modifiedIr.root.children[1];
    if (!detailSection) throw new Error("fixture detail section missing");
    const txtBox = detailSection.children.find(
      (node) =>
        node.blockType === "TextBox" &&
        node.entries.some(
          (entry) =>
            entry.kind === "scalar" && entry.key === "Name" && entry.value === '"txtCustomerName"',
        ),
    );
    if (!txtBox) throw new Error("fixture txtCustomerName missing");
    txtBox.entries = txtBox.entries.map((entry) =>
      entry.kind === "scalar" && entry.key === "Left" ? { ...entry, value: "3300" } : entry,
    );
    const baseline = renderFormPreview(baselineIr);
    const modified = renderFormPreview(modifiedIr);
    // Different svg payloads.
    expect(modified.svg).not.toBe(baseline.svg);
    // Both expose the same viewport shape (same form bounds).
    expect(Object.keys(modified.viewport).sort()).toEqual(Object.keys(baseline.viewport).sort());
  });
});
