// Pure form-IR compare service: diff two FormIRs and report the structural
// drift (added/removed controls, changed properties, layout-bound changes)
// with per-drift actionability.
//
// Zero adapter dependencies. No I/O. No Access, no PowerShell, no COM.

import type { FormIR, FormNode, PropertyEntry, ScalarEntry } from "../models/form-ir.js";
import { FORM_NOISE_KEYS } from "./form-noise-keys.js";

// ---------------------------------------------------------------------------
// Constants — the noise floor
// ---------------------------------------------------------------------------

// FORM_NOISE_KEYS is the canonical set of Access form/report serialization-noise
// keys (scalar properties that are non-actionable drift — Access regenerates
// them on LoadFromText/SaveAsText round-trips and they never represent
// user-visible intent).
//
// Single source of truth lives at `src/core/services/form-noise-keys.ts` —
// both this service and `vba-semantic-classifier.ts` re-export from there so
// `Object.is(consumer.FORM_NOISE_KEYS, shared.FORM_NOISE_KEYS)` holds.
// External callers keep importing from this module unchanged.
export { FORM_NOISE_KEYS };

/** Properties whose change is reported as a single `layoutBoundsChanged` drift
 * (instead of a per-key `propertyChanged`). Order is deterministic:
 * `Left`, `Top`, `Width`, `Height`. */
const LAYOUT_KEYS = ["Left", "Top", "Width", "Height"] as const;
type LayoutKey = (typeof LAYOUT_KEYS)[number];

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type FormDriftKind =
  | "controlAdded"
  | "controlRemoved"
  | "propertyChanged"
  | "layoutBoundsChanged";

/** A pair of [oldValue, newValue] for a single layout-key. */
export type LayoutBoundPair = readonly [oldValue: string, newValue: string];

export interface FormDrift {
  kind: FormDriftKind;
  /** Set when `kind` is `controlAdded` / `controlRemoved` /
   * `propertyChanged` / `layoutBoundsChanged`. */
  controlName?: string;
  /** Set when `kind` is `propertyChanged`. */
  key?: string;
  /** Set when `kind` is `propertyChanged`. Trimmed scalar values. */
  oldValue?: string;
  /** Set when `kind` is `propertyChanged`. Trimmed scalar values. */
  newValue?: string;
  /** Set when `kind` is `layoutBoundsChanged`. The four old/new pairs in
   * `[Left, Top, Width, Height]` order; only present keys are populated. */
  bounds?: Partial<Record<LayoutKey, LayoutBoundPair>>;
  /** True iff this drift is user-visible — i.e. the agent should consider
   * a sync action. False for FORM_NOISE_KEYS changes. */
  actionable: boolean;
  /** Human/grep-friendly explanation of why this drift is actionable or
   * non-actionable. */
  reason: string;
}

export interface CompareFormsInput {
  left: FormIR;
  right: FormIR;
  leftName: string;
  rightName: string;
}

export interface FormDriftReport {
  /** True iff `drifts` contains zero entries with `actionable: true`. */
  matched: boolean;
  /** True iff `drifts.length > 0`. */
  driftDetected: boolean;
  /** Convenience alias for `matched`. */
  actionableOk: boolean;
  drifts: readonly FormDrift[];
  sourceName: string;
  targetName: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Read the un-quoted scalar `Name` of a FormNode, or null. */
function controlNameOf(node: FormNode): string | null {
  for (const e of node.entries) {
    if (e.kind === "scalar" && e.key === "Name") {
      const raw = e.value.trim();
      return raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
    }
  }
  return null;
}

/**
 * Walk a FormNode tree and return a Map from control name (un-quoted scalar
 * `Name`) to the FormNode. Controls without a scalar `Name` are skipped.
 * Mirrors the slice-1 `collectControls` flat walk.
 */
function indexControlsByName(root: FormNode): Map<string, FormNode> {
  const out = new Map<string, FormNode>();
  const visit = (node: FormNode): void => {
    const name = controlNameOf(node);
    if (name !== null && !out.has(name)) out.set(name, node);
    for (const child of node.children) visit(child);
  };
  visit(root);
  return out;
}

/** Collect scalar entries from a control, collapsing duplicates by key
 * (last-seen wins for the comparison, which is consistent with the locked
 * `FORM_NOISE_KEYS` philosophy — duplicates are an Access export quirk,
 * not a real difference). */
function scalarsByKey(node: FormNode): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of node.entries) {
    if (e.kind === "scalar") {
      out.set(e.key, e.value.trim());
    }
  }
  return out;
}

function isActionableKey(key: string): boolean {
  // FORM_NOISE_KEYS = non-actionable (Access will regenerate on round-trip).
  // Everything else is actionable.
  return !FORM_NOISE_KEYS.has(key);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compare two parsed form-IRs and return the structured drift report.
 *
 * Pure function. No I/O. The caller (adapter) is responsible for reading
 * the two `.form.txt` files from disk and parsing them via
 * `parseFormTxt`; this function only walks the typed IRs.
 *
 * Diff policy:
 * - Same-named controls are matched by name (regardless of nesting depth,
 *   to mirror `inspect_form`'s flat control list).
 * - Each unmatched name in `right` produces one `controlAdded`.
 * - Each unmatched name in `left` produces one `controlRemoved`.
 * - For each matched name, scalar entries are compared by key. A differing
 *   non-layout key produces one `propertyChanged` (actionable iff the key
 *   is not in `FORM_NOISE_KEYS`).
 * - For each matched name, the four layout keys (`Left`, `Top`, `Width`,
 *   `Height`) are compared together. Any difference emits ONE
 *   `layoutBoundsChanged` (actionable: true), with the four old/new pairs
 *   in deterministic `[Left, Top, Width, Height]` order. A separate
 *   `propertyChanged` for the layout keys is NEVER emitted (that would
 *   double-count).
 */
export function compareForms(input: CompareFormsInput): FormDriftReport {
  const { left, right, leftName, rightName } = input;
  const drifts: FormDrift[] = [];

  const leftIndex = indexControlsByName(left.root);
  const rightIndex = indexControlsByName(right.root);

  // 1. Added / Removed — symmetric diff on control names
  for (const [name] of leftIndex) {
    if (!rightIndex.has(name)) {
      drifts.push({
        kind: "controlRemoved",
        controlName: name,
        actionable: true,
        reason: `control "${name}" present in source but missing in target`,
      });
    }
  }
  for (const [name] of rightIndex) {
    if (!leftIndex.has(name)) {
      drifts.push({
        kind: "controlAdded",
        controlName: name,
        actionable: true,
        reason: `control "${name}" present in target but missing in source`,
      });
    }
  }

  // 2. Shared controls → property changes + layout-bounds changes
  for (const [name, leftNode] of leftIndex) {
    const rightNode = rightIndex.get(name);
    if (!rightNode) continue;

    const leftScalars = scalarsByKey(leftNode);
    const rightScalars = scalarsByKey(rightNode);

    // 2a. Layout bounds: collect the four old/new pairs
    const bounds: Partial<Record<LayoutKey, LayoutBoundPair>> = {};
    let layoutChanged = false;
    for (const lk of LAYOUT_KEYS) {
      const lv = leftScalars.get(lk);
      const rv = rightScalars.get(lk);
      if (lv !== undefined && rv !== undefined && lv !== rv) {
        bounds[lk] = [lv, rv] as const;
        layoutChanged = true;
      }
    }
    if (layoutChanged) {
      drifts.push({
        kind: "layoutBoundsChanged",
        controlName: name,
        bounds,
        actionable: true,
        reason: `control "${name}" geometry changed (Left/Top/Width/Height)`,
      });
    }

    // 2b. Non-layout property changes — walk the union of keys, skip the
    // layout keys (those are reported as `layoutBoundsChanged`).
    const keys = new Set<string>([...leftScalars.keys(), ...rightScalars.keys()]);
    for (const key of keys) {
      if ((LAYOUT_KEYS as readonly string[]).includes(key)) continue;
      const lv = leftScalars.get(key);
      const rv = rightScalars.get(key);
      if (lv === undefined && rv === undefined) continue;
      if (lv === rv) continue;
      const actionable = isActionableKey(key);
      drifts.push({
        kind: "propertyChanged",
        controlName: name,
        key,
        oldValue: lv,
        newValue: rv,
        actionable,
        reason: actionable
          ? `control "${name}" property "${key}" differs (actionable)`
          : `control "${name}" property "${key}" differs but "${key}" is in FORM_NOISE_KEYS (non-actionable)`,
      });
    }
  }

  // 3. Aggregate the report
  const actionableOk = drifts.every((d) => !d.actionable);
  const driftDetected = drifts.length > 0;
  return {
    matched: actionableOk,
    driftDetected,
    actionableOk,
    drifts,
    sourceName: leftName,
    targetName: rightName,
  };
}

/** Re-exported helper: build a `PropertyEntry[]` of a single scalar entry.
 * Used only for ad-hoc test fixtures; the public API of this module is
 * `compareForms` + `FORM_NOISE_KEYS` + the types above. */
export function makeScalarEntry(key: string, value: string): ScalarEntry {
  return { kind: "scalar", key, value };
}

/** Helper for callers that need to push a single entry (kept here so the
 * service module is the single owner of entry shapes). */
export type { PropertyEntry };
