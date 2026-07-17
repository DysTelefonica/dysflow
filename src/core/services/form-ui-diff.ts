// Issue #817 — `diff_form_preview` core service.
//
// Pure: no I/O, no FormIR mutation, no Access dependency. Composes two
// `renderFormPreview` outputs into a before/after visual diff with four
// diff categories — added, removed, moved, resized — and an "unchanged"
// marker for the SVG / ASCII surface only.
//
// Architecture notes:
//   - HEXAGONAL: this module is `core`; the preview adapter capability
//     owns I/O and parses the two .form.txt files. Here we trust that the
//     caller hands us two FormIRs and we operate on the typed trees.
//   - SHARED PRIMITIVES: we re-use `BoundingBox` (form-ui-geometry.ts) and
//     `FormPreviewControlLayout` / `FormPreviewOutput` (form-ui-render.ts).
//     No bounding-box math is duplicated here.
//   - DETERMINISTIC: same inputs => byte-identical SVG / ASCII / changes.
//     The agent (and snapshot tests) rely on this.
//
// Diff categories:
//   - `added`    — control name present in `after` only.
//   - `removed`  — control name present in `before` only.
//   - `moved`    — same name in both, Width/Height unchanged (within
//                  epsilon), Left/Top different (within epsilon).
//   - `resized`  — same name in both, Width/Height different (within
//                  epsilon), Left/Top unchanged (within epsilon).
//   - `same`     — same name + identical box. NOT in the `changes` enum
//                  (informational only) but the SVG carries
//                  `data-diff="same"` on the rect, and the ASCII grid
//                  keeps the control abbreviation.

import type { FormIR } from "../models/form-ir.js";
import type { BoundingBox } from "./form-ui-geometry.js";
import {
  extractFormPreviewLayouts,
  type FormPreviewControlLayout,
  type FormPreviewOutput,
  type RenderFormPreviewOptions,
  renderFormPreview,
} from "./form-ui-render.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Diff classification for one control. `same` is informational-only. */
export type FormPreviewDiffKind = "added" | "removed" | "moved" | "resized" | "same";

export type DiffFormPreviewOptions = {
  /**
   * Options forwarded to `renderFormPreview` for both frames. Identical
   * options on both sides keep the SVG viewport + ASCII grid comparable;
   * the diff composer passes them through verbatim.
   */
  render?: RenderFormPreviewOptions;
  /**
   * Tolerance (twips) for the "moved" / "resized" classification. Defaults
   * to 0 — any non-zero integer delta on the relevant axis is treated as a
   * real change. Tests can loosen it without touching production code.
   */
  epsilon?: number;
  /** Which frame(s) to surface. Defaults to `"both"`. */
  output?: "svg" | "ascii" | "both";
};

export type FormPreviewDiffEntry = {
  controlName: string;
  box: BoundingBox;
};

export type FormPreviewMovedEntry = {
  controlName: string;
  before: BoundingBox;
  after: BoundingBox;
};

export type FormPreviewResizedEntry = {
  controlName: string;
  before: BoundingBox;
  after: BoundingBox;
};

export type FormPreviewDiffResult = {
  /** Self-contained SVG document with `data-diff="added|removed|moved|resized|same"` on every control rect. */
  svg: string;
  /** Monospace box-drawing grid with a diff-marker legend prepended. */
  ascii: string[];
  /** Re-rendered before frame (passed through to the consumer for parity). */
  before: FormPreviewOutput;
  /** Re-rendered after frame (passed through to the consumer for parity). */
  after: FormPreviewOutput;
  /** Categorized change list. `same` controls are NOT surfaced here. */
  changes: {
    added: FormPreviewDiffEntry[];
    removed: FormPreviewDiffEntry[];
    moved: FormPreviewMovedEntry[];
    resized: FormPreviewResizedEntry[];
  };
  /** Combined warnings from both render calls. */
  warnings: string[];
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const DEFAULT_EPSILON = 0;

/**
 * Compose a before/after visual diff from two FormIRs. Pure — the caller
 * resolves any filesystem / parse concerns before calling this.
 */
export function diffFormPreview(
  beforeIr: FormIR,
  afterIr: FormIR,
  options: DiffFormPreviewOptions = {},
): FormPreviewDiffResult {
  const renderOptions = options.render ?? {};
  const epsilon = options.epsilon ?? DEFAULT_EPSILON;
  const outputMode = options.output ?? "both";

  // Render both frames through the SINGLE source of truth (#814's
  // renderFormPreview). The diff composer never re-implements SVG /
  // ASCII generation — it composes primitives.
  const beforeRender = renderFormPreview(beforeIr, renderOptions);
  const afterRender = renderFormPreview(afterIr, renderOptions);

  // Extract per-control layouts (also from the SAME primitive so the
  // geometry comparison matches what was rendered).
  const beforeLayouts = extractFormPreviewLayouts(beforeIr);
  const afterLayouts = extractFormPreviewLayouts(afterIr);

  // Categorize.
  const changes = classifyChanges(beforeLayouts, afterLayouts, epsilon);

  // Compose diff overlays.
  const svg = renderDiffSvg(
    afterRender.svg,
    afterRender.viewport,
    beforeLayouts,
    afterLayouts,
    changes,
  );
  const ascii = renderDiffAscii(
    afterRender.ascii,
    renderOptions.ascii,
    beforeLayouts,
    afterLayouts,
    changes,
  );

  const warnings = [...beforeRender.warnings, ...afterRender.warnings];

  const result: FormPreviewDiffResult = {
    svg,
    ascii,
    before: beforeRender,
    after: afterRender,
    changes,
    warnings,
  };

  // Honor the `output` selector without losing the structured envelope.
  if (outputMode === "svg") {
    result.ascii = [];
  } else if (outputMode === "ascii") {
    result.svg = "";
  }
  return result;
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

function classifyChanges(
  before: ReadonlyArray<FormPreviewControlLayout>,
  after: ReadonlyArray<FormPreviewControlLayout>,
  epsilon: number,
): FormPreviewDiffResult["changes"] {
  const beforeByName = new Map<string, FormPreviewControlLayout>();
  for (const layout of before) {
    beforeByName.set(layout.name, layout);
  }
  const afterByName = new Map<string, FormPreviewControlLayout>();
  for (const layout of after) {
    afterByName.set(layout.name, layout);
  }

  const added: FormPreviewDiffEntry[] = [];
  const removed: FormPreviewDiffEntry[] = [];
  const moved: FormPreviewMovedEntry[] = [];
  const resized: FormPreviewResizedEntry[] = [];

  // Added + (potentially) moved / resized.
  for (const [name, afterLayout] of afterByName) {
    const beforeLayout = beforeByName.get(name);
    if (beforeLayout === undefined) {
      added.push({
        controlName: name,
        box: rectOrZero(afterLayout.rect),
      });
      continue;
    }
    if (beforeLayout.rect === null || afterLayout.rect === null) {
      // Either side missing geometry — treat as "same" semantically (we
      // cannot classify geometry change on a missing box). The SVG still
      // gets `data-diff="same"` because the rendering layer cannot tell
      // them apart.
      continue;
    }
    const sameLeftTop =
      within(beforeLayout.rect.left, afterLayout.rect.left, epsilon) &&
      within(beforeLayout.rect.top, afterLayout.rect.top, epsilon);
    const sameSize =
      within(beforeLayout.rect.width, afterLayout.rect.width, epsilon) &&
      within(beforeLayout.rect.height, afterLayout.rect.height, epsilon);
    if (sameLeftTop && sameSize) {
      // unchanged — informational only
      continue;
    }
    if (sameSize) {
      moved.push({
        controlName: name,
        before: { ...beforeLayout.rect },
        after: { ...afterLayout.rect },
      });
      continue;
    }
    if (sameLeftTop) {
      resized.push({
        controlName: name,
        before: { ...beforeLayout.rect },
        after: { ...afterLayout.rect },
      });
      continue;
    }
    // Mixed: both moved AND resized — pick the strongest signal. We
    // classify as `moved` (position change is the dominant perception),
    // and surface the size delta in `after`.
    moved.push({
      controlName: name,
      before: { ...beforeLayout.rect },
      after: { ...afterLayout.rect },
    });
  }

  // Removed — name in `before` but NOT in `after`.
  for (const [name, beforeLayout] of beforeByName) {
    if (afterByName.has(name)) continue;
    removed.push({
      controlName: name,
      box: rectOrZero(beforeLayout.rect),
    });
  }

  return { added, removed, moved, resized };
}

function rectOrZero(
  rect: { left: number; top: number; width: number; height: number } | null,
): BoundingBox {
  if (rect === null) return { left: 0, top: 0, width: 0, height: 0 };
  return { ...rect };
}

function within(a: number, b: number, epsilon: number): boolean {
  return Math.abs(a - b) <= epsilon;
}

// ---------------------------------------------------------------------------
// SVG diff overlay
// ---------------------------------------------------------------------------

function renderDiffSvg(
  baseSvg: string,
  viewport: { width: number; height: number },
  beforeLayouts: ReadonlyArray<FormPreviewControlLayout>,
  afterLayouts: ReadonlyArray<FormPreviewControlLayout>,
  changes: FormPreviewDiffResult["changes"],
): string {
  // Build the per-control diff-kind map keyed by name.
  const kindByName = buildKindByName(beforeLayouts, afterLayouts, changes);

  // Walk every `data-control="X"` rect and inject `data-diff="..."` after
  // the `data-control` attribute. Surgical regex pass — keeps the
  // renderer's output otherwise byte-identical (#814 invariant).
  const updated = baseSvg.replace(
    /<rect\s+data-control="([^"]+)"([^>]*)>/g,
    (_match, name: string, rest: string) => {
      const kind = kindByName.get(name) ?? "same";
      return `<rect data-control="${name}" data-diff="${kind}"${rest}>`;
    },
  );

  // Removed controls are NOT in the `after` frame's SVG — emit a
  // ghost-rect at the `before` geometry so the agent can see what
  // disappeared. Use stroke-dasharray + a muted stroke so it reads as
  // "ghost" rather than as live UI.
  if (changes.removed.length > 0) {
    const scale = inferScaleFromSvg(afterLayouts, viewport);
    const ghosts: string[] = [];
    for (const entry of changes.removed) {
      const x = round2(entry.box.left * scale);
      const y = round2(entry.box.top * scale);
      const w = round2(entry.box.width * scale);
      const h = round2(entry.box.height * scale);
      if (w <= 0 || h <= 0) continue;
      ghosts.push(
        `    <rect data-control="${escapeXml(entry.controlName)}" data-diff="removed" ` +
          `data-section="removed" x="${x}" y="${y}" width="${w}" height="${h}" ` +
          `fill="none" stroke="#dc2626" stroke-width="2" stroke-dasharray="4 2" />`,
      );
    }
    if (ghosts.length > 0) {
      const closing = "</svg>";
      const idx = updated.lastIndexOf(closing);
      if (idx !== -1) {
        return `${updated.slice(0, idx)}  <g data-section="removed">\n${ghosts.join("\n")}\n  </g>\n${updated.slice(idx)}`;
      }
    }
  }

  return updated;
}

/**
 * Recover the viewport scale the renderer used to translate the AFTER
 * layout into pixel-space. The renderer sizes its viewport as
 *   viewport.width = max(200, ceil(maxRight * scale))
 * so we can read `scale` back as `viewport.width / maxRight` for the
 * AFTER layout. (When the form is empty, the renderer falls back to
 * `width = 200`, in which case `scale` is irrelevant — no ghosts emitted.)
 */
function inferScaleFromSvg(
  afterLayouts: ReadonlyArray<FormPreviewControlLayout>,
  viewport: { width: number; height: number },
): number {
  let maxRight = 0;
  let maxBottom = 0;
  for (const layout of afterLayouts) {
    if (layout.rect === null) continue;
    if (layout.hidden) continue;
    const right = layout.rect.left + layout.rect.width;
    const bottom = layout.rect.top + layout.rect.height;
    if (right > maxRight) maxRight = right;
    if (bottom > maxBottom) maxBottom = bottom;
  }
  if (maxRight <= 0 || maxBottom <= 0) return 1;
  const scaleX = viewport.width / maxRight;
  const scaleY = viewport.height / maxBottom;
  // The renderer applies a uniform scale; pick the smaller to mirror the
  // conservative side. (In practice scaleX === scaleY for the default
  // renderer — but we honor both ends to be safe.)
  return Math.min(scaleX, scaleY);
}

// ---------------------------------------------------------------------------
// ASCII diff overlay
// ---------------------------------------------------------------------------

function renderDiffAscii(
  baseAscii: string,
  baseAsciiDims: RenderFormPreviewOptions["ascii"] | undefined,
  beforeLayouts: ReadonlyArray<FormPreviewControlLayout>,
  afterLayouts: ReadonlyArray<FormPreviewControlLayout>,
  changes: FormPreviewDiffResult["changes"],
): string[] {
  // The renderer produces a single string. Split into rows so the diff
  // composer can prepend a legend (a deterministic, testable surface for
  // the markers) and the underlying grid stays a faithful render.
  const rows = baseAscii.split("\n");

  // Per-control summary. We surface the diff categories as a human-readable
  // legend so the markers `+`, `-`, `*` are testable without depending on
  // whether they happen to land on a frame character vs an empty cell in
  // the rendered grid. The legend is the single source of truth for the
  // "this diff was categorized as X" signal in the ASCII surface.
  const lines: string[] = [];
  lines.push(`[diff] + ${changes.added.length} added`);
  for (const entry of changes.added) {
    lines.push(`  + ${entry.controlName}`);
  }
  lines.push(`[diff] - ${changes.removed.length} removed`);
  for (const entry of changes.removed) {
    lines.push(`  - ${entry.controlName}`);
  }
  lines.push(`[diff] * ${changes.moved.length} moved`);
  for (const entry of changes.moved) {
    lines.push(
      `  * ${entry.controlName} (${entry.before.left},${entry.before.top}) -> (${entry.after.left},${entry.after.top})`,
    );
  }
  lines.push(`[diff] * ${changes.resized.length} resized`);
  for (const entry of changes.resized) {
    lines.push(
      `  * ${entry.controlName} ${entry.before.width}x${entry.before.height} -> ${entry.after.width}x${entry.after.height}`,
    );
  }
  // Annotate the underlying grid with a single in-grid marker per changed
  // control so an agent looking at the grid alone (without scrolling up
  // to the legend) can still spot the changes.
  const annotatedGrid = annotateGrid(rows, baseAsciiDims, beforeLayouts, afterLayouts, changes);

  return [...lines, "", ...annotatedGrid];
}

/**
 * Paint a single character marker into the underlying grid for each
 * changed control. The marker lands in the top-left INTERIOR cell of the
 * control (where the renderer's label would otherwise be — we let the
 * marker WIN over the label so the agent sees it in the agent's grid
 * scan).
 */
function annotateGrid(
  rows: string[],
  baseAsciiDims: RenderFormPreviewOptions["ascii"] | undefined,
  beforeLayouts: ReadonlyArray<FormPreviewControlLayout>,
  afterLayouts: ReadonlyArray<FormPreviewControlLayout>,
  changes: FormPreviewDiffResult["changes"],
): string[] {
  const dims = baseAsciiDims ?? { cellWidth: 80, cellHeight: 24 };
  const cellWidth = Math.max(3, dims.cellWidth | 0);
  const cellHeight = Math.max(3, dims.cellHeight | 0);

  const visibleAfter = afterLayouts.filter((l) => l.rect !== null && !l.hidden);
  const fit = computeAsciiFitFor(visibleAfter, cellWidth - 2, cellHeight - 2);

  const markerByCell = new Map<string, string>();

  for (const layout of visibleAfter) {
    if (layout.rect === null) continue;
    const name = layout.name;
    let marker: string | undefined;
    if (changes.added.some((c) => c.controlName === name)) marker = "+";
    else if (changes.moved.some((c) => c.controlName === name)) marker = "*";
    else if (changes.resized.some((c) => c.controlName === name)) marker = "*";
    if (marker === undefined) continue;
    const { x0, y0 } = projectToGrid(layout.rect, fit, cellWidth, cellHeight);
    // Place the marker at the interior top-left cell (inside the frame).
    const mx = clamp(x0 + 1, 1, cellWidth - 2);
    const my = clamp(y0 + 1, 1, cellHeight - 2);
    markerByCell.set(cellKey(mx, my), marker);
  }

  // Removed controls get a `-` marker projected from the BEFORE frame.
  const visibleBefore = beforeLayouts.filter((l) => l.rect !== null && !l.hidden);
  const fitBefore = computeAsciiFitFor(visibleBefore, cellWidth - 2, cellHeight - 2);
  for (const entry of changes.removed) {
    const box: BoundingBox = {
      left: entry.box.left,
      top: entry.box.top,
      width: entry.box.width,
      height: entry.box.height,
    };
    const { x0, y0 } = projectToGrid(box, fitBefore, cellWidth, cellHeight);
    const mx = clamp(x0 + 1, 1, cellWidth - 2);
    const my = clamp(y0 + 1, 1, cellHeight - 2);
    const key = cellKey(mx, my);
    if (!markerByCell.has(key)) markerByCell.set(key, "-");
  }

  const out = [...rows];
  for (const [key, marker] of markerByCell) {
    const [xs, ys] = key.split(",");
    const x = Number(xs);
    const y = Number(ys);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (y < 0 || y >= out.length) continue;
    const row = out[y] ?? "";
    if (x < 0 || x >= row.length) continue;
    out[y] = setChar(row, x, marker, cellWidth);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildKindByName(
  beforeLayouts: ReadonlyArray<FormPreviewControlLayout>,
  afterLayouts: ReadonlyArray<FormPreviewControlLayout>,
  changes: FormPreviewDiffResult["changes"],
): Map<string, FormPreviewDiffKind> {
  const kindByName = new Map<string, FormPreviewDiffKind>();
  for (const entry of changes.added) kindByName.set(entry.controlName, "added");
  for (const entry of changes.moved) kindByName.set(entry.controlName, "moved");
  for (const entry of changes.resized) kindByName.set(entry.controlName, "resized");

  // Mark every other `after` control as `same`.
  for (const layout of afterLayouts) {
    if (!kindByName.has(layout.name)) kindByName.set(layout.name, "same");
  }
  // And every `before`-only control as `removed` (the SVG composer will
  // emit a ghost rect).
  for (const layout of beforeLayouts) {
    if (!kindByName.has(layout.name)) kindByName.set(layout.name, "removed");
  }
  return kindByName;
}

function projectToGrid(
  box: BoundingBox,
  fit: { scaleX: number; scaleY: number },
  cellWidth: number,
  cellHeight: number,
): { x0: number; y0: number; x1: number; y1: number } {
  const x0 = clamp(Math.floor(box.left * fit.scaleX) + 1, 1, cellWidth - 2);
  const y0 = clamp(Math.floor(box.top * fit.scaleY) + 1, 1, cellHeight - 2);
  const x1 = clamp(Math.floor((box.left + box.width) * fit.scaleX) + 1, x0 + 1, cellWidth - 1);
  const y1 = clamp(Math.floor((box.top + box.height) * fit.scaleY) + 1, y0 + 1, cellHeight - 1);
  return { x0, y0, x1, y1 };
}

/**
 * Mirror of `computeAsciiFit` in `form-ui-render.ts`. Re-declared here so
 * the diff composer is self-contained — the renderer does not export it
 * (and the math is short enough to keep duplicated; one place to update
 * when the cell-fit heuristic changes).
 */
function computeAsciiFitFor(
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

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

function setChar(row: string, index: number, ch: string, cellWidth: number): string {
  if (index < 0 || index >= cellWidth) return row;
  if (row.length < cellWidth) row = row.padEnd(cellWidth, " ");
  const before = row.slice(0, index);
  const after = row.slice(index + 1);
  return before + ch + after;
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
