// Issue #816 — Phase 3 (Ergonomic actions) — pure FormIR align + distribute.
//
// This module is PURE: no I/O, no FormIR mutation outside the returned `ir`.
// The input IR is never mutated; the returned IR is a fresh clone.
//
// Two batch geometry verbs:
//   - `alignControls(ir, controlNames, edge)` — align N controls to a common
//     edge (left | right | top | bottom | center-horizontal |
//     center-vertical), using the MEDIAN of the selected set's position
//     values. Median (not min/max) preserves the spread of off-median
//     outliers — i.e. we collapse everyone onto the middle of the
//     distribution, not onto its extremes.
//   - `distributeControls(ir, controlNames, axis, spacing?)` — distribute N
//     controls evenly along an axis. Without `spacing`, distributes across
//     the bounding box of the selected set (first control stays at start,
//     last at end, middle ones spaced evenly). With `spacing` provided
//     (twips), uses the exact gap between consecutive control edges and
//     lets the last control move too — fixed-spacing overrides the
//     bounding-box anchor so the user gets exact gaps.
//
// Both primitives:
//   - Preserve control identity: only the moved axis property (`Left` for
//     horizontal verbs, `Top` for vertical verbs) changes; Name, type,
//     Width, Height, other layout properties, event bindings, and
//     codeBehind are preserved verbatim.
//   - Refuse unknown control names (FORM_CONTROL_NOT_FOUND).
//   - Refuse invalid geometry (FORM_MUTATION_INVALID) when a control
//     misses the relevant layout key.
//   - Refuse <2 controls for distribute (FORM_MUTATION_INVALID), per the
//     issue acceptance criterion.
//   - Return `{ ir, source, advisories }` — matches the shape of
//     `applyFormUiDesignOperations` so the adapter can reuse the existing
//     dispatch seam for output formatting.
//
// Geometry math is delegated to the shared primitives in
// `./form-ui-geometry.ts` (parseBoundingBox); the per-control FormNode
// walk reuses `collectControls` from `./form-ir-service.ts` to avoid
// duplicating the tree walk.

import type { FormIR, FormNode, PropertyEntry, ScalarEntry } from "../models/form-ir.js";
import { collectControls, FormMutationError, serializeFormTxt } from "./form-ir-service.js";
import { type BoundingBox, parseBoundingBox } from "./form-ui-geometry.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type AlignEdge =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "center-horizontal"
  | "center-vertical";

export type DistributeAxis = "horizontal" | "vertical";

export type AlignDistributeResult = {
  ir: FormIR;
  /** `serializeFormTxt(ir)` — already-serialized form of the returned ir. */
  source: string;
  /** Advisory list (currently always empty; reserved for future use). */
  advisories: string[];
};

// ---------------------------------------------------------------------------
// Public API — align
// ---------------------------------------------------------------------------

/**
 * Align the named controls to a common edge.
 *
 * @param ir         The form IR (never mutated).
 * @param controlNames Ordered list of control names to align. Order is
 *                     ignored; the median of the selection is used.
 * @param edge       Which edge/center to align on.
 * @returns          The mutated IR + its serialized form + an empty advisory
 *                   list.
 * @throws           `FormMutationError` with code:
 *                     - `FORM_CONTROL_NOT_FOUND` if any name is not in the IR.
 *                     - `FORM_MUTATION_INVALID` when the control selection is
 *                       empty or a control misses the relevant layout key
 *                       (Left/Top/Width/Height) needed for the requested edge.
 */
export function alignControls(
  ir: FormIR,
  controlNames: readonly string[],
  edge: AlignEdge,
): AlignDistributeResult {
  if (controlNames.length === 0) {
    throw new FormMutationError(
      "FORM_MUTATION_INVALID",
      `alignControls requires at least one control name; received an empty selection.`,
    );
  }

  // Resolve + validate every named control. We collect the bounding box
  // (for the median) — the FormNode lookup happens on the CLONED tree so
  // we never write through a reference to the original IR.
  const resolved = controlNames.map((name) => resolveNamedControl(ir, name));

  // Compute the target position on the moved axis. The median (not mean,
  // not min/max) is the contract: see the issue body — "preserves the
  // spread of off-median outliers".
  const target = computeAlignmentTarget(resolved, edge);

  // Clone the IR, then re-resolve each named control on the CLONED tree.
  // This is the critical immutability step: we never mutate `ir` because
  // we never hold a reference to any of its nodes past this line.
  const next = cloneIr(ir);
  const nextByName = buildControlIndex(next.root);
  for (const entry of resolved) {
    const liveNode = nextByName.get(entry.name);
    if (liveNode === undefined) {
      throw new FormMutationError(
        "FORM_CONTROL_NOT_FOUND",
        `Control "${entry.name}" was not found.`,
      );
    }
    const newAxisValue = computeAxisValueAfterAlign(entry, edge, target);
    upsertScalar(liveNode, axisKeyFor(edge), String(newAxisValue));
  }

  return {
    ir: next,
    source: serializeFormTxt(next),
    advisories: [],
  };
}

// ---------------------------------------------------------------------------
// Public API — distribute
// ---------------------------------------------------------------------------

/**
 * Distribute the named controls evenly along an axis.
 *
 * @param ir           The form IR (never mutated).
 * @param controlNames List of control names to distribute. Order is ignored;
 *                     controls are sorted by their position on the axis.
 * @param axis         `"horizontal"` (moves Left) or `"vertical"` (moves Top).
 * @param spacing      Optional exact gap (twips) between consecutive control
 *                     edges. When omitted, distributes across the bounding
 *                     box of the selection (first control stays at start,
 *                     last at end).
 * @returns            The mutated IR + its serialized form + an empty advisory
 *                     list.
 * @throws             `FormMutationError` with code:
 *                       - `FORM_CONTROL_NOT_FOUND` if any name is not in the IR.
 *                       - `FORM_MUTATION_INVALID` when the control selection
 *                         has fewer than 2 controls, or any control misses
 *                         the relevant layout key (Left/Top/Width/Height).
 */
export function distributeControls(
  ir: FormIR,
  controlNames: readonly string[],
  axis: DistributeAxis,
  spacing?: number,
): AlignDistributeResult {
  if (controlNames.length < 2) {
    throw new FormMutationError(
      "FORM_MUTATION_INVALID",
      `distributeControls requires at least 2 controls; received ${controlNames.length}.`,
    );
  }
  if (spacing !== undefined && (!Number.isFinite(spacing) || spacing < 0)) {
    throw new FormMutationError(
      "FORM_MUTATION_INVALID",
      `distributeControls spacing must be a non-negative finite number; received ${String(spacing)}.`,
    );
  }

  const resolved = controlNames.map((name) => resolveNamedControl(ir, name));
  // Sort by axis position so fixed-spacing applies in the correct order
  // (callers may pass names in any order; we sort once and reuse for both
  // fixed-spacing and bounding-box paths).
  const axisBoxKey: "left" | "top" = axis === "horizontal" ? "left" : "top";
  const sizeBoxKey: "width" | "height" = axis === "horizontal" ? "width" : "height";
  const axisFormKey: "Left" | "Top" = axis === "horizontal" ? "Left" : "Top";
  const sorted = [...resolved].sort((a, b) => a.box[axisBoxKey] - b.box[axisBoxKey]);

  // Compute each control's new axis position. We compute ALL positions in
  // sorted order, then map them back onto the resolved (call-order) list so
  // every original `controlName` gets its new position — independent of the
  // caller's input order.
  const newPositions: number[] = [];
  if (spacing !== undefined) {
    // Fixed spacing: first stays at its current position, every subsequent
    // control sits at (previous + prev_size + spacing).
    let cursor = sorted[0]?.box[axisBoxKey] ?? 0;
    for (const item of sorted) {
      newPositions.push(cursor);
      cursor += item.box[sizeBoxKey] + spacing;
    }
  } else {
    // Bounding-box distribution: first stays at start, last stays at end,
    // middle controls sit at evenly-divided positions. For N controls,
    // there are N-1 gaps; step = (end - start) / (N - 1).
    const start = sorted[0]?.box[axisBoxKey] ?? 0;
    const end = sorted[sorted.length - 1]?.box[axisBoxKey] ?? 0;
    const step = (end - start) / (sorted.length - 1);
    for (let i = 0; i < sorted.length; i++) {
      newPositions.push(start + step * i);
    }
  }

  // Round to integer twips — fractional twips are meaningless in the
  // Access SaveAsText format.
  const roundedNewPositions = newPositions.map((value) => Math.round(value));

  const next = cloneIr(ir);
  // Map back: each sorted entry's index → its rounded new position.
  // We re-resolve the FormNode on the CLONED tree (nodes are fresh objects
  // after cloneIr — never mutate the original).
  const nextByName = buildControlIndex(next.root);
  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    const position = roundedNewPositions[i];
    if (item === undefined || position === undefined) continue;
    const liveNode = nextByName.get(item.name);
    if (liveNode === undefined) continue;
    upsertScalar(liveNode, axisFormKey, String(position));
  }

  return {
    ir: next,
    source: serializeFormTxt(next),
    advisories: [],
  };
}

// ---------------------------------------------------------------------------
// Internal — geometry resolution
// ---------------------------------------------------------------------------

type NamedControl = {
  name: string;
  box: BoundingBox;
};

/**
 * Resolve a control name to its parsed bounding box. Uses the shared
 * `collectControls` tree walk + `parseBoundingBox` parser so the geometry
 * math stays in one place. We do NOT hold a FormNode reference here —
 * callers re-resolve the node on the cloned tree so the input IR is
 * never mutated.
 */
function resolveNamedControl(ir: FormIR, name: string): NamedControl {
  const all = collectControls(ir.root);
  const found = all.find((control) => control.name === name);
  if (found === undefined) {
    throw new FormMutationError("FORM_CONTROL_NOT_FOUND", `Control "${name}" was not found.`);
  }
  const box = parseBoundingBox(found.properties);
  if (box === null) {
    throw new FormMutationError(
      "FORM_MUTATION_INVALID",
      `Control "${name}" is missing one of Left/Top/Width/Height; cannot align/distribute a control without complete geometry.`,
    );
  }
  return { name, box };
}

/** Build a `name → FormNode` index over a fresh-cloned root. */
function buildControlIndex(root: FormNode): Map<string, FormNode> {
  const out = new Map<string, FormNode>();
  walk(root);
  return out;

  function walk(node: FormNode): void {
    const nameEntry = node.entries.find(
      (entry): entry is ScalarEntry => entry.kind === "scalar" && entry.key === "Name",
    );
    if (nameEntry !== undefined) {
      const trimmed = nameEntry.value.trim();
      const stripped =
        trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1) : trimmed;
      out.set(stripped, node);
    }
    for (const child of node.children) walk(child);
  }
}

// ---------------------------------------------------------------------------
// Internal — alignment target
// ---------------------------------------------------------------------------

type AlignmentTarget = number;

function computeAlignmentTarget(
  resolved: readonly NamedControl[],
  edge: AlignEdge,
): AlignmentTarget {
  const values = resolved.map((entry) => valueForEdge(entry.box, edge));
  return median(values);
}

function valueForEdge(box: BoundingBox, edge: AlignEdge): number {
  switch (edge) {
    case "left":
      return box.left;
    case "right":
      return box.left + box.width;
    case "top":
      return box.top;
    case "bottom":
      return box.top + box.height;
    case "center-horizontal":
      return box.left + box.width / 2;
    case "center-vertical":
      return box.top + box.height / 2;
  }
}

/**
 * Median of a finite number array. For an even-length array, returns the
 * arithmetic mean of the two middle values (the conventional median-of-
 * even-set definition — the median is not pinned to one of the two
 * middles). Both interpretations "preserve the spread of off-median
 * outliers" relative to min/max; the arithmetic mean is the standard
 * mathematical definition.
 */
function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid] ?? 0;
  }
  const lower = sorted[mid - 1] ?? 0;
  const upper = sorted[mid] ?? 0;
  return (lower + upper) / 2;
}

function axisKeyFor(edge: AlignEdge): "Left" | "Top" {
  // Horizontal verbs (left/right/center-horizontal) move Left; vertical
  // verbs (top/bottom/center-vertical) move Top.
  return edge === "left" || edge === "right" || edge === "center-horizontal" ? "Left" : "Top";
}

function computeAxisValueAfterAlign(entry: NamedControl, edge: AlignEdge, target: number): number {
  switch (edge) {
    case "left":
      return target;
    case "right":
      // New Left = target Right − Width
      return target - entry.box.width;
    case "top":
      return target;
    case "bottom":
      // New Top = target Bottom − Height
      return target - entry.box.height;
    case "center-horizontal":
      // New Left = target Center − Width/2
      return target - entry.box.width / 2;
    case "center-vertical":
      // New Top = target Center − Height/2
      return target - entry.box.height / 2;
  }
}

// ---------------------------------------------------------------------------
// Internal — IR cloning + scalar upsert (matches form-ir-service.ts)
// ---------------------------------------------------------------------------

function cloneEntry(entry: PropertyEntry): PropertyEntry {
  if (entry.kind === "empty") return { kind: "empty" };
  if (entry.kind === "blob") return { kind: "blob", key: entry.key, lines: [...entry.lines] };
  return { kind: "scalar", key: entry.key, value: entry.value };
}

function cloneNode(node: FormNode): FormNode {
  return {
    blockType: node.blockType,
    entries: node.entries.map(cloneEntry),
    children: node.children.map(cloneNode),
  };
}

function cloneIr(ir: FormIR): FormIR {
  return {
    name: ir.name,
    kind: ir.kind,
    preamble: ir.preamble.map(cloneEntry),
    root: cloneNode(ir.root),
    codeBehind: ir.codeBehind,
  };
}

function upsertScalar(node: FormNode, key: string, value: string): void {
  const entry = node.entries.find(
    (candidate): candidate is ScalarEntry => candidate.kind === "scalar" && candidate.key === key,
  );
  if (entry !== undefined) {
    entry.value = value;
    return;
  }
  node.entries.push({ kind: "scalar", key, value });
}
