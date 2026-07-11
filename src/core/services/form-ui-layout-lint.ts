// Issue #815 — `analyze_form_layout` geometry lint.
//
// Pure lint over a `FormUiBehaviorMap` (the same shape `verify_form_ui`
// consumes). Emits a flat list of typed `LayoutFinding` diagnostics covering:
//   - Missing geometry (controls whose Left/Top/Width/Height cannot be
//     parsed as positive finite twips).
//   - Overlap (pairwise strict AABB — edge-touching is NOT overlap).
//   - Alignment (controls sharing a visual row, defined by Top proximity
//     within `alignmentThresholdTwips`, default 50).
//   - Off-section (controls outside their declared section bounds, only
//     when both `sectionBounds` and `controlSection` are supplied).
//   - Tab order vs visual order (when ≥ 2 controls have explicit TabIndex).
//
// Architectural notes:
//   - PURE: no I/O, no FormIR mutation, no Access dependency. The adapter
//     reads the `.form.txt` and builds the input `FormUiBehaviorMap`.
//   - HEXAGONAL: layout is a "core" concern — pure geometric analysis of
//     an in-memory representation. MCP exposure lives in `src/adapters/`.
//   - REUSE: every detection calls into the shared geometry primitives in
//     `./form-ui-geometry.ts` (parseBoundingBox, boxesOverlap,
//     isWithinSection, visualOrder, tabOrderMatchesVisual, parseTabIndex).
//     Sibling #818 (`verify_form_bindings`) and #817 (`diff_form_preview`)
//     consume the same primitives so adding new geometry checks never
//     duplicates bounding-box math.
//
// Invariants (preserved across behavior-preserving refactors):
//   - All findings carry `severity: "warning"` — the tool is informational
//     and never gating. This matches the read-only stance the issue spec
//     mandates (`read-only` risk in the dispatch route).
//   - Overlap uses the strict AABB test from `boxesOverlap` — edge-touching
//     is NOT overlap. The pairwise emission dedups by symmetric pair key so
//     a single overlapping pair produces one finding, not two.
//   - Alignment uses a transitive closure (union-find on top proximity):
//     if A-B and B-C are within threshold but A-C are NOT, {A,B,C} still
//     form one row. One finding per cluster, naming every member.
//   - Off-section silently skips when `sectionBounds` OR `controlSection`
//     is absent (missing optional input ⇒ check skipped, no warning).
//   - Tab-order mismatch emits ONE finding naming the visual order the
//     agent should compare against — no per-control findings (would be
//     noisy on forms with 20+ controls).
//   - Missing-geometry warnings run for EVERY control whose geometry
//     fails to parse — the agent uses them to triage which controls to
//     skip from overlap/alignment/tab-order checks (those checks
//     gracefully skip null boxes).

import type { FormUiBehaviorMap } from "../models/form-ui-builder.js";
import {
  type BoundingBox,
  boxesOverlap,
  isWithinSection,
  type LayoutBounds,
  parseBoundingBox,
  parseTabIndex,
  tabOrderMatchesVisual,
  visualOrder,
} from "./form-ui-geometry.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * One geometry-lint finding. Carries a typed `code` (so the consumer can
 * filter / count without parsing the message), a `severity` that is always
 * `"warning"` for this tool, a human-readable `message`, an optional
 * `controlName` (pairwise findings use `"A <-> B"`), and an optional `data`
 * bag for structured detail (e.g. `data.top`, `data.controls`).
 */
export type LayoutFinding = {
  code: string;
  severity: "warning";
  message: string;
  controlName?: string;
  data?: Record<string, unknown>;
};

/**
 * Optional inputs to `lintFormLayout`. Each input enables ONE category of
 * looks-right checks; absent input ⇒ the corresponding check is skipped
 * silently. All inputs are optional to keep the contract simple for
 * callers that only need a subset of checks.
 */
export type LintFormLayoutOptions = {
  /**
   * Maximum |topA − topB| (in twips) for two controls to count as sharing
   * a visual row. Defaults to 50. The threshold is symmetric — controls
   * on the same row may differ by up to this many twips without splitting
   * into separate findings. The transitive closure (union-find) means
   * A→B→C counts as one row even when A and C are farther apart than
   * `alignmentThresholdTwips`.
   */
  alignmentThresholdTwips?: number;
  /** Section bounds by section name (e.g. `Detail`, `FormHeader`). */
  sectionBounds?: Readonly<
    Record<string, { left?: number; top?: number; width: number; height: number }>
  >;
  /** Map of control name → owning section name. */
  controlSection?: Readonly<Record<string, string>>;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default visual-row threshold (twips). 50 twips ≈ 0.035" — well below
 *  the typical form row spacing (>= 200 twips). */
export const DEFAULT_ALIGNMENT_THRESHOLD_TWIPS = 50;

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Run the geometry lint over an applied form UI contract.
 *
 * Returns a flat list of findings. Order is deterministic across runs:
 *   1. missing-geometry (in contract order)
 *   2. overlap (pairwise, lexicographic pair order)
 *   3. alignment (per visual-row cluster, ordered by cluster min-top)
 *   4. off-section (in contract order, only when inputs supplied)
 *   5. tab-order mismatch (one finding when ≥ 2 controls have TabIndex
 *      and the order contradicts visual top-to-bottom)
 *
 * Pure: no I/O, no FormIR mutation, no Access dependency.
 */
export function lintFormLayout(
  appliedContract: FormUiBehaviorMap,
  options: LintFormLayoutOptions = {},
): LayoutFinding[] {
  const findings: LayoutFinding[] = [];
  const threshold = options.alignmentThresholdTwips ?? DEFAULT_ALIGNMENT_THRESHOLD_TWIPS;

  // Pre-parse geometry + tabIndex once; every check needs them.
  const geometryByName = new Map<string, BoundingBox | null>();
  const tabIndexByName = new Map<string, number | null>();
  for (const control of appliedContract.controls) {
    geometryByName.set(control.name, parseBoundingBox(control.properties ?? {}));
    tabIndexByName.set(control.name, parseTabIndex(control.properties ?? {}));
  }

  findings.push(...collectMissingGeometryFindings(appliedContract, geometryByName));
  findings.push(...collectOverlapFindings(appliedContract, geometryByName));
  findings.push(...collectAlignmentFindings(appliedContract, geometryByName, threshold));
  findings.push(...collectOffSectionFindings(appliedContract, geometryByName, options));
  findings.push(...collectTabOrderFindings(appliedContract, geometryByName, tabIndexByName));

  return findings;
}

// ---------------------------------------------------------------------------
// Detections
// ---------------------------------------------------------------------------

function collectMissingGeometryFindings(
  contract: FormUiBehaviorMap,
  geometryByName: ReadonlyMap<string, BoundingBox | null>,
): LayoutFinding[] {
  const findings: LayoutFinding[] = [];
  for (const control of contract.controls) {
    const box = geometryByName.get(control.name);
    if (box !== null && box !== undefined) continue;
    findings.push({
      code: "FORM_LAYOUT_MISSING_GEOMETRY",
      severity: "warning",
      controlName: control.name,
      message: `Control "${control.name}" is missing complete Left/Top/Width/Height geometry; skipped from overlap/alignment/tab-order checks.`,
    });
  }
  return findings;
}

function collectOverlapFindings(
  contract: FormUiBehaviorMap,
  geometryByName: ReadonlyMap<string, BoundingBox | null>,
): LayoutFinding[] {
  const findings: LayoutFinding[] = [];
  const seenPairs = new Set<string>();
  const controls = contract.controls;

  for (let i = 0; i < controls.length; i++) {
    const a = controls[i];
    if (a === undefined) continue;
    const boxA = geometryByName.get(a.name);
    if (boxA === null || boxA === undefined) continue;
    for (let j = i + 1; j < controls.length; j++) {
      const b = controls[j];
      if (b === undefined) continue;
      const boxB = geometryByName.get(b.name);
      if (boxB === null || boxB === undefined) continue;
      if (!boxesOverlap(boxA, boxB)) continue;
      // Symmetric pair key — dedup so we emit one finding per pair, not two.
      const pairKey = a.name < b.name ? `${a.name}|${b.name}` : `${b.name}|${a.name}`;
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);
      findings.push({
        code: "FORM_LAYOUT_OVERLAP",
        severity: "warning",
        controlName: `${a.name} <-> ${b.name}`,
        message: `Controls "${a.name}" and "${b.name}" have overlapping bounding boxes (strict AABB; edge-touching is allowed).`,
      });
    }
  }
  return findings;
}

/**
 * Union-find on indices keyed by `|topA − topB| ≤ threshold`. Returns the
 * set of clusters with ≥ 2 members; each cluster becomes one
 * `FORM_LAYOUT_ALIGNMENT` finding listing every member by name.
 *
 * Pure local helper. Hoisted out of `collectAlignmentFindings` so the
 * cluster math is independently testable by import.
 */
function clusterByTopProximity<T extends { top: number }>(
  items: ReadonlyArray<T>,
  threshold: number,
): T[][] {
  const n = items.length;
  if (n < 2) return [];
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) {
      const next = parent[root];
      if (next === undefined) break;
      root = next;
    }
    // Path compression — flatten once we know the root.
    let cur = i;
    while (parent[cur] !== root) {
      const next = parent[cur];
      if (next === undefined) break;
      parent[cur] = root;
      cur = next;
    }
    return root;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const ti = items[i]?.top;
      const tj = items[j]?.top;
      if (ti === undefined || tj === undefined) continue;
      if (Math.abs(ti - tj) <= threshold) union(i, j);
    }
  }
  const groups = new Map<number, T[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const bucket = groups.get(root) ?? [];
    const item = items[i];
    if (item !== undefined) bucket.push(item);
    groups.set(root, bucket);
  }
  return Array.from(groups.values()).filter((bucket) => bucket.length >= 2);
}

function collectAlignmentFindings(
  contract: FormUiBehaviorMap,
  geometryByName: ReadonlyMap<string, BoundingBox | null>,
  threshold: number,
): LayoutFinding[] {
  // Only controls with a parsed box participate in alignment. A control
  // missing geometry was already surfaced as FORM_LAYOUT_MISSING_GEOMETRY;
  // silently excluding it here avoids double-reporting.
  const placed = contract.controls.flatMap((control) => {
    const box = geometryByName.get(control.name);
    if (box === null || box === undefined) return [];
    return [{ name: control.name, top: box.top }];
  });

  const clusters = clusterByTopProximity(placed, threshold);
  // Sort clusters by min-top so the output order is stable and matches the
  // agent's left-to-right reading order.
  clusters.sort((a, b) => {
    const minA = Math.min(...a.map((c) => c.top));
    const minB = Math.min(...b.map((c) => c.top));
    return minA - minB;
  });

  const findings: LayoutFinding[] = [];
  for (const cluster of clusters) {
    const names = cluster.map((c) => c.name);
    const minTop = Math.min(...cluster.map((c) => c.top));
    const maxTop = Math.max(...cluster.map((c) => c.top));
    findings.push({
      code: "FORM_LAYOUT_ALIGNMENT",
      severity: "warning",
      message: `Controls form a visual row within ${threshold} twips (Top range ${minTop}–${maxTop}): ${names.join(", ")}.`,
      data: {
        alignmentThresholdTwips: threshold,
        minTop,
        maxTop,
        controls: names,
      },
    });
  }
  return findings;
}

function collectOffSectionFindings(
  contract: FormUiBehaviorMap,
  geometryByName: ReadonlyMap<string, BoundingBox | null>,
  options: LintFormLayoutOptions,
): LayoutFinding[] {
  if (options.sectionBounds === undefined || options.controlSection === undefined) {
    return [];
  }
  const findings: LayoutFinding[] = [];
  for (const control of contract.controls) {
    const box = geometryByName.get(control.name);
    if (box === null || box === undefined) continue;
    const sectionName = options.controlSection[control.name];
    if (sectionName === undefined) continue;
    const section = options.sectionBounds[sectionName] as LayoutBounds | undefined;
    if (section === undefined) continue;
    if (isWithinSection(box, section)) continue;
    findings.push({
      code: "FORM_LAYOUT_OFF_SECTION",
      severity: "warning",
      controlName: control.name,
      message: `Control "${control.name}" extends outside its declared section "${sectionName}" (section is ${section.width}x${section.height} twips at (${section.left ?? 0}, ${section.top ?? 0})).`,
      data: {
        section: sectionName,
        sectionWidth: section.width,
        sectionHeight: section.height,
      },
    });
  }
  return findings;
}

function collectTabOrderFindings(
  contract: FormUiBehaviorMap,
  geometryByName: ReadonlyMap<string, BoundingBox | null>,
  tabIndexByName: ReadonlyMap<string, number | null>,
): LayoutFinding[] {
  // Build a typed view: only controls with a parsed box AND an explicit
  // TabIndex participate. Visual-order compare uses the shared primitive.
  const tabbed = contract.controls.flatMap((control) => {
    const box = geometryByName.get(control.name);
    const tabIndex = tabIndexByName.get(control.name);
    if (box === null || box === undefined || tabIndex === null || tabIndex === undefined) {
      return [];
    }
    return [{ name: control.name, box, tabIndex }];
  });
  // tabOrderMatchesVisual ignores controls without TabIndex — we already
  // pre-filtered. The shared primitive's `explicit.length < 2` short-circuit
  // means a single TabIndex still yields `true` (no finding).
  if (tabbed.length < 2) return [];
  // Carry `name` through the visualOrder round-trip so we can recover the
  // control names without a secondary lookup that depends on object
  // identity. `tabOrderMatchesVisual` ignores any extra fields beyond
  // BoundingBox + tabIndex (the shared primitive's constraint).
  const tabOrderView = tabbed.map((t) => ({
    name: t.name,
    left: t.box.left,
    top: t.box.top,
    width: t.box.width,
    height: t.box.height,
    tabIndex: t.tabIndex,
  }));
  if (tabOrderMatchesVisual(tabOrderView)) return [];

  const expectedVisualOrder = visualOrder(tabOrderView).map((c) => c.name);

  return [
    {
      code: "FORM_LAYOUT_TAB_ORDER_MISMATCH",
      severity: "warning",
      message: `Tab order does not match visual top-to-bottom order. Visual order: ${expectedVisualOrder.join(", ")}.`,
      data: { expectedVisualOrder },
    },
  ];
}
