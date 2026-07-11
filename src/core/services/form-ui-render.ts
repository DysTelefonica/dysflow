// Pure renderer for Access FormIR — produces both an SVG layout artifact and
// an ASCII grid for inline terminal use (issue #814, phase 2 Perception).
//
// Architectural notes:
//   - PURE: no I/O, no Access, no FormIR mutation. The caller resolves the
//     `.form.txt` file (already a sibling design), parses to FormIR, and
//     hands the IR to this module.
//   - HEXAGONAL: rendering is a "core" concern — geometric transformation of
//     an in-memory representation. Wire protocols (file read, MCP exposure)
//     live in `src/adapters/`.
//   - TWIPS: every rectangle is measured in twips (1440 twips == 1 inch). The
//     renderer scales each twip rectangle into a viewport using
//     `options.viewportScale`. Coordinate math is delegated to the shared
//     primitives in `./form-ui-geometry.ts` (`BoundingBox`, `parseBoundingBox`,
//     `visualOrder`).
//
// Invariants:
//   - Output is DETERMINISTIC — same IR + same options => byte-identical SVG,
//     byte-identical ASCII, same viewport. This is the contract #817
//     (`diff_form_preview`) relies on: two renderings compose into a diff.
//   - HIDDEN controls (Visible = 0 / "NotDefault"-equivalent) are EXCLUDED
//     from both renderers and REPORTED in `warnings[]`. Non-hidden but
//     geometry-incomplete controls ARE reported in `warnings[]` but never
//     silently dropped from the IR (the `warnings` array is the only
//     notification surface).
//   - ROLE COLORING mirrors `analyze_form_ui`'s role taxonomy: action,
//     input, display, container. The adapter layer (or the consuming agent)
//     can override colors; the renderer ships a default palette that
//     satisfies the SVG-contrast requirement.

import type { FormIR, FormNode, PropertyEntry, ScalarEntry } from "../models/form-ir.js";
import { MAX_SANE_TWIPS, parseBoundingBox } from "./form-ui-geometry.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** The role taxonomy mirrors `analyze_form_ui`'s classification. */
export type FormPreviewRole = "action" | "input" | "display" | "container" | "unknown";

/**
 * One prepared control rectangle, in absolute twip coordinates. The
 * renderer walks every named control in `FormIR`, resolves the parent
 * section/container's `Left`/`Top` if present (rare in real `.form.txt`
 * — section-relative is the common case), and emits this flattened shape.
 */
export type FormPreviewControlLayout = {
  name: string;
  type: string;
  role: FormPreviewRole;
  caption: string | undefined;
  /** Absolute rectangle in twips. Missing geometry => rect is null. */
  rect: { left: number; top: number; width: number; height: number } | null;
  /** The form section this control sits in (Header / Detail / Footer / null). */
  sectionName: string | null;
  /** True when the control's Visible property is 0 / NotDefault-equivalent. */
  hidden: boolean;
};

/**
 * Renderer output — both frames in one envelope so the consumer (MCP tool,
 * terminal, #817 diff composer) can pick the format it needs without
 * re-rendering.
 */
export type FormPreviewOutput = {
  /** Self-contained SVG document — well-formed, no external refs. */
  svg: string;
  /** Monospace box-drawing grid, sized per `options.ascii`. */
  ascii: string;
  /** Viewport dimensions in PIXEL units (twips * viewportScale), matching the SVG `viewBox`. */
  viewport: { width: number; height: number };
  /** Non-fatal findings: hidden controls + controls with missing geometry. */
  warnings: string[];
};

/**
 * Renderer options. Defaults mirror the worst-case fallback for an agent
 * consuming `RenderFormPreview` output without override knobs:
 *   - `viewportScale`: 0.05 (squashes a ~20" form into a ~1500px viewport).
 *   - `ascii`: 80x24 (sensible terminal default).
 */
export type RenderFormPreviewOptions = {
  /** Twips -> pixels multiplier. Default 0.05. */
  viewportScale?: number;
  /** ASCII grid dimensions. Default 80x24. */
  ascii?: { cellWidth: number; cellHeight: number };
};

const DEFAULT_VIEWPORT_SCALE = 0.05;
const DEFAULT_ASCII_WIDTH = 80;
const DEFAULT_ASCII_HEIGHT = 24;

/**
 * Twip -> pixel conversion constant, documented in one place so #815 +
 * #818 (`analyze_form_layout` + `verify_form_bindings`) and any future
 * pixel-aware layout tool reuse the same multiplier.
 */
export const TWIPS_PER_PIXEL = 1 / 0.05; // 20 twips per pixel at the default scale
// (Exposed for cross-package reuse; the renderer applies `viewportScale`
// directly so the constant does not need a second reference site.)

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function renderFormPreview(
  ir: FormIR,
  options: RenderFormPreviewOptions = {},
): FormPreviewOutput {
  const scale = options.viewportScale ?? DEFAULT_VIEWPORT_SCALE;
  const asciiDims = options.ascii ?? {
    cellWidth: DEFAULT_ASCII_WIDTH,
    cellHeight: DEFAULT_ASCII_HEIGHT,
  };

  const layout = buildLayoutModel(ir);
  const pixelViewport = computePixelViewport(layout.controls, scale);

  const warnings = collectWarnings(layout.controls);
  const svg = renderSvg(ir.name, layout.controls, pixelViewport, scale);
  const ascii = renderAscii(layout.controls, asciiDims);

  return {
    svg,
    ascii,
    viewport: pixelViewport,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Layout model
// ---------------------------------------------------------------------------

type LayoutModel = {
  controls: FormPreviewControlLayout[];
};

function buildLayoutModel(ir: FormIR): LayoutModel {
  const controls: FormPreviewControlLayout[] = [];
  for (const node of ir.root.children) {
    walkNode(node, /*parentSection*/ null, controls);
  }
  return { controls: sortControlsByVisualOrder(controls) };
}

/**
 * Stable (top, left) sort for `FormPreviewControlLayout`. Mirrors
 * `visualOrder` from the shared geometry module but works on the richer
 * `FormPreviewControlLayout` shape (which carries `name`/`type`/`role`
 * alongside the rectangle). A control with `rect === null` sorts to the
 * END — those are non-fatal warning-only entries, never rendered.
 */
function sortControlsByVisualOrder(
  controls: FormPreviewControlLayout[],
): FormPreviewControlLayout[] {
  const placed = controls.filter((control) => control.rect !== null);
  const warningsOnly = controls.filter((control) => control.rect === null);
  const sorted = [...placed].sort((a, b) => {
    const ra = a.rect as { left: number; top: number };
    const rb = b.rect as { left: number; top: number };
    return ra.top - rb.top || ra.left - rb.left;
  });
  return [...sorted, ...warningsOnly];
}

function walkNode(
  node: FormNode,
  parentSection: string | null,
  controls: FormPreviewControlLayout[],
): void {
  // Update the section "context" whenever we step into a section-shaped
  // node. SaveAsText uses blockType names like FormHeader, FormFooter,
  // Detail, Header, Footer — but also generic container widgets like
  // TabControl / SubForm / Rectangle / OptionGroup. We only treat
  // section-flavored blockTypes as new sections; container-shaped
  // controls are rendered as descendants of the *current* section.
  const sectionName = classifySection(node.blockType) ?? parentSection;

  // A "named control" is any node that exposes a scalar Name property.
  const nameEntry = node.entries.find(
    (entry): entry is ScalarEntry => entry.kind === "scalar" && entry.key === "Name",
  );
  if (nameEntry) {
    const name = unquote(nameEntry.value);
    const properties = collectProperties(node.entries);
    const box = parseBoundingBox(properties);
    const role = roleFor(node.blockType);
    controls.push({
      name,
      type: node.blockType,
      role,
      caption: unquoteOrUndefined(properties.Caption),
      rect: box ? { left: box.left, top: box.top, width: box.width, height: box.height } : null,
      sectionName,
      hidden: isHidden(properties),
    });
  }

  for (const child of node.children) {
    walkNode(child, sectionName, controls);
  }
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/**
 * Compute the pixel viewport from the layout's control rectangles.
 * A control-less form still gets a minimal 200x200 viewport so the
 * SVG/ASCII grid never collapse to zero.
 */
function computePixelViewport(
  controls: ReadonlyArray<FormPreviewControlLayout>,
  scale: number,
): { width: number; height: number } {
  let maxRight = 0;
  let maxBottom = 0;
  for (const control of controls) {
    if (control.rect === null) continue;
    const right = control.rect.left + control.rect.width;
    const bottom = control.rect.top + control.rect.height;
    if (right > maxRight) maxRight = right;
    if (bottom > maxBottom) maxBottom = bottom;
  }
  const width = Math.max(200, Math.ceil(maxRight * scale));
  const height = Math.max(200, Math.ceil(maxBottom * scale));
  return { width, height };
}

// ---------------------------------------------------------------------------
// SVG renderer
// ---------------------------------------------------------------------------

/**
 * Role -> default fill. Calibrated for a light-on-dark viewing default;
 * every consumer is free to override (the SVG attributes are stable enough
 * to grep / re-skin with CSS).
 */
const ROLE_FILLS: Record<FormPreviewRole, string> = {
  action: "#2563eb", // blue — interactive buttons
  input: "#10b981", // green — editable fields
  display: "#f59e0b", // amber — labels / images / read-only
  container: "#6366f1", // indigo — rectangles / tab controls / sub-forms
  unknown: "#6b7280", // gray
};

const ROLE_STROKES: Record<FormPreviewRole, string> = {
  action: "#1e40af",
  input: "#047857",
  display: "#b45309",
  container: "#4338ca",
  unknown: "#374151",
};

function renderSvg(
  formName: string,
  controls: ReadonlyArray<FormPreviewControlLayout>,
  viewport: { width: number; height: number },
  scale: number,
): string {
  const visible = controls.filter((control) => control.rect !== null && !control.hidden);
  const groupedBySection = groupBySection(visible);

  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${viewport.width}" height="${viewport.height}" viewBox="0 0 ${viewport.width} ${viewport.height}" role="img" aria-label="Form ${escapeXml(formName)} preview">`,
  );
  lines.push(`  <title>Form ${escapeXml(formName)} preview</title>`);
  lines.push(
    `  <desc>Geometric layout rendered from FormIR. Coordinates in twips at scale ${scale}.</desc>`,
  );

  // Background panel — visible canvas.
  lines.push(
    `  <rect data-layer="canvas" x="0" y="0" width="${viewport.width}" height="${viewport.height}" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1" />`,
  );

  // Section groups.
  for (const [sectionName, sectionControls] of groupedBySection) {
    const tag = sectionName ?? "Detail";
    lines.push(`  <g data-section="${escapeXml(tag)}">`);
    // Section background.
    const sectionRect = computeSectionRect(sectionControls);
    if (sectionRect !== null) {
      lines.push(
        `    <rect data-section-bg="${escapeXml(tag)}" x="${sectionRect.x}" y="${sectionRect.y}" width="${sectionRect.w}" height="${sectionRect.h}" fill="#e2e8f0" stroke="#94a3b8" stroke-width="1" />`,
      );
    }
    for (const control of sectionControls) {
      const rect = control.rect;
      if (rect === null) continue;
      const x = round2(rect.left * scale);
      const y = round2(rect.top * scale);
      const w = round2(rect.width * scale);
      const h = round2(rect.height * scale);
      const fill = ROLE_FILLS[control.role];
      const stroke = ROLE_STROKES[control.role];
      lines.push(
        `    <rect data-control="${escapeXml(control.name)}" data-type="${escapeXml(control.type)}" data-role="${control.role}" x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="1" fill-opacity="0.85" />`,
      );
      if (w > 30 && h > 14) {
        const labelText =
          control.name.length > 16 ? `${control.name.slice(0, 14)}..` : control.name;
        lines.push(
          `    <text x="${x + 4}" y="${y + h / 2 + 4}" font-family="monospace" font-size="11" fill="#0f172a">${escapeXml(labelText)}</text>`,
        );
      }
    }
    lines.push(`  </g>`);
  }

  lines.push(`</svg>`);
  return lines.join("\n");
}

function computeSectionRect(controls: ReadonlyArray<FormPreviewControlLayout>): {
  x: number;
  y: number;
  w: number;
  h: number;
} | null {
  if (controls.length === 0) return null;
  let minLeft = Number.POSITIVE_INFINITY;
  let minTop = Number.POSITIVE_INFINITY;
  let maxRight = 0;
  let maxBottom = 0;
  for (const control of controls) {
    const rect = control.rect;
    if (rect === null) continue;
    if (rect.left < minLeft) minLeft = rect.left;
    if (rect.top < minTop) minTop = rect.top;
    const right = rect.left + rect.width;
    const bottom = rect.top + rect.height;
    if (right > maxRight) maxRight = right;
    if (bottom > maxBottom) maxBottom = bottom;
  }
  if (!Number.isFinite(minLeft) || !Number.isFinite(minTop)) return null;
  return { x: minLeft, y: minTop, w: maxRight - minLeft, h: maxBottom - minTop };
}

// ---------------------------------------------------------------------------
// ASCII renderer
// ---------------------------------------------------------------------------

/**
 * Lay the visible controls into a monospace box-drawing grid. The cells are
 * filled with the control's three-letter abbreviation ("CMD", "LBL", ...) so
 * a human can scan the layout in a terminal. The grid is sized in cells,
 * not pixels — the option shape mirrors the `ed`/`vim` world.
 *
 * The ASCII renderer scales TWIP coordinates into CELL coordinates via an
 * independent fit-to-grid scale (`computeAsciiFit`), so the SVG output's
 * `viewportScale` does NOT influence the ASCII grid. This is intentional:
 * the SVG viewport may be tuned for a browser preview, while the ASCII
 * grid must always read sensibly in an 80x24 terminal.
 *
 * Internally the grid is a flat `string[]` of fixed-width rows so the
 * `noUncheckedIndexedAccess` strict-TS rule cannot trip on the cell writes.
 */
function renderAscii(
  controls: ReadonlyArray<FormPreviewControlLayout>,
  dims: { cellWidth: number; cellHeight: number },
): string {
  // Clamp to the minimum grid size that can hold a box-drawing frame:
  // a 1-cell column ("+") works, but a width-0 frame ("+ +") would be
  // degenerate. Floor 3 wide x 3 tall so any consumer — even one passing
  // 0/0 explicitly — gets a usable grid.
  const cellWidth = Math.max(3, dims.cellWidth | 0);
  const cellHeight = Math.max(3, dims.cellHeight | 0);
  const rows: string[] = new Array<string>(cellHeight);
  for (let y = 0; y < cellHeight; y++) {
    rows[y] = " ".repeat(cellWidth);
  }

  // Frame the grid with box-drawing characters so the rendered artifact is
  // visually distinct from "raw text". The frame is always emitted — even
  // an empty form gets a frame.
  rows[0] = `+${"-".repeat(cellWidth - 2)}+`;
  rows[cellHeight - 1] = rows[0] ?? "+".repeat(cellWidth);
  for (let y = 1; y < cellHeight - 1; y++) {
    rows[y] = `|${" ".repeat(cellWidth - 2)}|`;
  }

  const visible = controls.filter((control) => control.rect !== null && !control.hidden);
  const fit = computeAsciiFit(visible, cellWidth - 2, cellHeight - 2);
  for (const control of visible) {
    const rect = control.rect;
    if (rect === null) continue;
    const x0 = clamp(Math.floor(rect.left * fit.scaleX) + 1, 1, cellWidth - 2);
    const y0 = clamp(Math.floor(rect.top * fit.scaleY) + 1, 1, cellHeight - 2);
    const x1 = clamp(Math.floor((rect.left + rect.width) * fit.scaleX) + 1, x0 + 1, cellWidth - 1);
    const y1 = clamp(Math.floor((rect.top + rect.height) * fit.scaleY) + 1, y0 + 1, cellHeight - 1);
    const abbrev = controlAbbrev(control);
    const rows2 = paintFrame(rows, cellWidth, cellHeight, x0, y0, x1, y1, abbrev);
    for (let y = 0; y < rows2.length; y++) {
      rows[y] = rows2[y] ?? rows[y] ?? "";
    }
  }

  return rows.join("\n");
}

/**
 * Apply one control's frame + label to a fixed-width grid buffer. The
 * buffer is a flat `string[]` of `cellHeight` rows, each `cellWidth` wide.
 * Each touched cell is rewritten (string-immutable, so we rebuild the
 * affected rows). Hidden controls are filtered before this point so the
 * painter never sees them.
 */
function paintFrame(
  rows: string[],
  cellWidth: number,
  cellHeight: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  abbrev: string,
): string[] {
  const out = [...rows];
  // Top + bottom borders.
  for (let x = x0; x < x1 && x < cellWidth - 1; x++) {
    out[y0] = setChar(out[y0] ?? "", x, "-", cellWidth);
    out[y1] = setChar(out[y1] ?? "", x, "-", cellWidth);
  }
  // Left + right borders (skip the corners we already painted above).
  for (let y = y0 + 1; y < y1 && y < cellHeight - 1; y++) {
    out[y] = setChar(out[y] ?? "", x0, "|", cellWidth);
    out[y] = setChar(out[y] ?? "", x1, "|", cellWidth);
  }
  // Label — written on the row just inside the top border.
  const labelY = Math.min(cellHeight - 2, y0 + 1);
  if (labelY > y0) {
    let row = out[labelY] ?? "";
    const labelStart = x0 + 1;
    for (
      let i = 0;
      i < abbrev.length && labelStart + i < x1 && labelStart + i < cellWidth - 1;
      i++
    ) {
      const ch = abbrev[i] ?? "";
      row = setChar(row, labelStart + i, ch, cellWidth);
    }
    out[labelY] = row;
  }
  return out;
}

/**
 * Replace one character at `index` in a fixed-width row. Bounds-checked;
 * returns the row unchanged when `index` is out of range or the cell is
 * already a frame/border character (so a label inside a 1-wide cell does
 * not stomp the box-drawing frame).
 */
function setChar(row: string, index: number, ch: string, cellWidth: number): string {
  if (index < 0 || index >= cellWidth) return row;
  if (row.length < cellWidth) row = row.padEnd(cellWidth, " ");
  const before = row.slice(0, index);
  const after = row.slice(index + 1);
  return before + ch + after;
}

/**
 * Compute the independent fit-to-grid scale for the ASCII layout. It fits
 * the controls' bounding box into the requested (inner) cell area by
 * choosing the smaller of `cellW/totalW` and `cellH/totalH` so the form
 * never overflows the terminal. An empty layout returns the trivial
 * 1.0 scale (so controls that DO exist never get clipped to invisible).
 */
function computeAsciiFit(
  controls: ReadonlyArray<FormPreviewControlLayout>,
  cellW: number,
  cellH: number,
): { scaleX: number; scaleY: number } {
  if (controls.length === 0) return { scaleX: 1, scaleY: 1 };
  let minLeft = Number.POSITIVE_INFINITY;
  let minTop = Number.POSITIVE_INFINITY;
  let maxRight = 0;
  let maxBottom = 0;
  for (const control of controls) {
    const rect = control.rect;
    if (rect === null) continue;
    if (rect.left < minLeft) minLeft = rect.left;
    if (rect.top < minTop) minTop = rect.top;
    const right = rect.left + rect.width;
    const bottom = rect.top + rect.height;
    if (right > maxRight) maxRight = right;
    if (bottom > maxBottom) maxBottom = bottom;
  }
  const totalW = Math.max(1, maxRight - minLeft);
  const totalH = Math.max(1, maxBottom - minTop);
  const scale = Math.max(1e-6, Math.min(cellW / totalW, cellH / totalH));
  return { scaleX: scale, scaleY: scale };
}

// ---------------------------------------------------------------------------
// Warnings
// ---------------------------------------------------------------------------

function collectWarnings(controls: ReadonlyArray<FormPreviewControlLayout>): string[] {
  const warnings: string[] = [];
  for (const control of controls) {
    if (control.rect === null) {
      warnings.push(
        `Control "${control.name}" (${control.type}) is missing geometry (Left/Top/Width/Height); rendered as a warning, not a rectangle.`,
      );
      continue;
    }
    if (
      control.rect.left > MAX_SANE_TWIPS ||
      control.rect.top > MAX_SANE_TWIPS ||
      control.rect.width > MAX_SANE_TWIPS ||
      control.rect.height > MAX_SANE_TWIPS
    ) {
      warnings.push(
        `Control "${control.name}" (${control.type}) has out-of-range geometry (Left/Top/Width/Height > MAX_SANE_TWIPS).`,
      );
    }
    if (control.hidden) {
      warnings.push(
        `Control "${control.name}" (${control.type}) is hidden (Visible=0); excluded from the rendered preview.`,
      );
    }
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function classifySection(blockType: string): string | null {
  if (blockType === "FormHeader" || blockType === "Header") return "Header";
  if (blockType === "FormFooter" || blockType === "Footer") return "Footer";
  if (blockType === "Detail") return "Detail";
  return null;
}

function roleFor(blockType: string): FormPreviewRole {
  if (blockType === "CommandButton" || blockType === "ToggleButton") return "action";
  if (
    blockType === "TextBox" ||
    blockType === "ComboBox" ||
    blockType === "ListBox" ||
    blockType === "CheckBox"
  ) {
    return "input";
  }
  if (blockType === "Label" || blockType === "Image" || blockType === "Line") return "display";
  if (
    blockType === "Rectangle" ||
    blockType === "TabControl" ||
    blockType === "Page" ||
    blockType === "SubForm" ||
    blockType === "OptionGroup"
  ) {
    return "container";
  }
  return "unknown";
}

function isHidden(properties: Readonly<Record<string, string>>): boolean {
  const raw = properties.Visible;
  if (raw === undefined) return false;
  const trimmed = raw.trim();
  return trimmed === "0" || trimmed === "-1" || trimmed.toLowerCase() === "false";
}

function collectProperties(entries: ReadonlyArray<PropertyEntry>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of entries) {
    if (entry.kind === "scalar") {
      result[entry.key] = entry.value;
    }
  }
  return result;
}

function unquote(value: string | undefined): string {
  if (value === undefined) return "";
  const trimmed = value.trim();
  return trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1) : trimmed;
}

function unquoteOrUndefined(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return unquote(value) || undefined;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function controlAbbrev(control: FormPreviewControlLayout): string {
  // Three-letter monospace label. Prefer type-derived abbreviation so a
  // a human scanning the grid sees "CMD" / "TXT" / "LBL" rather than a
  // versioned name like `cmdRefreshV2`.
  const abbrev = TYPE_ABBREV[control.type];
  if (abbrev !== undefined) return abbrev.toUpperCase();
  return control.name.slice(0, 3).toUpperCase();
}

const TYPE_ABBREV: Record<string, string> = {
  CommandButton: "CMD",
  TextBox: "TXT",
  Label: "LBL",
  ComboBox: "CMB",
  ListBox: "LST",
  CheckBox: "CHK",
  ToggleButton: "TGL",
  Rectangle: "BOX",
  Image: "IMG",
  Line: "LIN",
  TabControl: "TAB",
  Page: "PAG",
  SubForm: "SUB",
  OptionGroup: "GRP",
  OptionButton: "OPT",
};

function groupBySection(
  controls: ReadonlyArray<FormPreviewControlLayout>,
): Array<[string | null, FormPreviewControlLayout[]]> {
  const sections = new Map<string | null, FormPreviewControlLayout[]>();
  // Iterate the controls in document order so the SVG group's emitted order
  // matches the source tree order — important for snapshot diffs.
  for (const control of controls) {
    const bucket = sections.get(control.sectionName) ?? [];
    bucket.push(control);
    sections.set(control.sectionName, bucket);
  }
  return Array.from(sections.entries());
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
