// Shared geometry primitives for Access form UI verification (#831) and the
// upcoming #815 `analyze_form_layout` and #818 `verify_form_bindings` siblings.
//
// This module is PURE: no I/O, no FormIR mutation, no Access dependency. Every
// function accepts already-extracted inputs (raw property maps or bounding
// boxes) and returns derived values or boolean checks.
//
// Coordinate system: Access SaveAsText stores layout in TWIPS
// (1 twip = 1/1440 inch). `Left`/`Top` is the control's top-left corner
// relative to its containing section; `Width`/`Height` is its size. Boxes
// are axis-aligned; rotation is not represented in the SaveAsText format.
//
// Invariants:
//   - "overlap" uses the strict AABB test (edge-touching is NOT overlap).
//   - Numeric ranges are bounded by `KNOWN_NUMERIC_PROPERTY_RANGES`; values
//     outside the upper bound are flagged but the test is non-blocking —
//     false positives are worse than missing an off-form control.
//   - Enum allowlists are conservative: only properties explicitly listed
//     in `KNOWN_ENUM_PROPERTIES` are checked. Unknown properties pass
//     silently — defensive, fail-open on unknown, fail-closed on known.

/** A control's axis-aligned bounding box in twips. */
export type BoundingBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** Optional layout bounds for a containing region (form canvas or section). */
export type LayoutBounds = {
  left?: number;
  top?: number;
  width: number;
  height: number;
};

/**
 * Pull the four layout keys (`Left`/`Top`/`Width`/`Height`) out of a raw
 * `Record<string, string>` property map. Returns `null` when ANY of the
 * four keys is missing OR fails to parse as a finite number — a control
 * without complete geometry cannot be checked.
 *
 * The function does NOT normalize quotes: it reads the raw scalar value
 * (the analyzer pipeline already trims/unquotes in most paths). Empty
 * strings parse to NaN and produce `null` — same as a missing key.
 */
export function parseBoundingBox(properties: Readonly<Record<string, string>>): BoundingBox | null {
  const left = parseTwip(properties.Left);
  const top = parseTwip(properties.Top);
  const width = parseTwip(properties.Width);
  const height = parseTwip(properties.Height);
  if (
    left === null ||
    top === null ||
    width === null ||
    height === null ||
    left < 0 ||
    top < 0 ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  return { left, top, width, height };
}

/**
 * Strict AABB overlap test. Two boxes "overlap" only when their interiors
 * intersect on BOTH axes — edge-touching (one box's right equals the
 * other's left) is NOT overlap. This matches Access' visual semantics:
 * edge-touching controls do not occlude each other.
 *
 * Returns false when either input is `null`.
 */
export function boxesOverlap(a: BoundingBox | null, b: BoundingBox | null): boolean {
  if (a === null || b === null) return false;
  return (
    a.left < b.left + b.width &&
    b.left < a.left + a.width &&
    a.top < b.top + b.height &&
    b.top < a.top + a.height
  );
}

/**
 * "The control's top-left is non-negative AND the control's bottom-right
 * sits inside the canvas." `canvas.width`/`canvas.height` are the
 * available drawable area in twips (Access forms are typically way under
 * 32000 twips per axis — we use a generous upper bound to avoid
 * false-positives on real-world wide forms).
 *
 * The function intentionally does NOT require `canvas.left`/`canvas.top`
 * — those are 0/0 in every Access form we have observed.
 */
export function isWithinCanvas(box: BoundingBox, canvas: LayoutBounds): boolean {
  if (box.left < (canvas.left ?? 0)) return false;
  if (box.top < (canvas.top ?? 0)) return false;
  if (box.left + box.width > canvas.width) return false;
  if (box.top + box.height > canvas.height) return false;
  return true;
}

/**
 * Section-bounds containment. `box.left`/`box.top` are measured relative to
 * the section's own top-left, so `section.left`/`section.top` are typically
 * 0/0 — but the function honors them when set.
 */
export function isWithinSection(box: BoundingBox, section: LayoutBounds): boolean {
  return isWithinCanvas(box, section);
}

// ---------------------------------------------------------------------------
// Numeric range allowlists (twips)
// ---------------------------------------------------------------------------

/**
 * Maximum sensible dimension in twips (~34 inches). Above this a value
 * is almost certainly a typo or a malformed plan output. Access allows
 * values up to ~2,147,483,647 internally — anything we flag here is
 * suspicious but not necessarily broken.
 */
export const MAX_SANE_TWIPS = 50_000;

/** The four layout keys, with their [min, max] sane range in twips. */
export const KNOWN_NUMERIC_PROPERTY_RANGES: Readonly<Record<string, readonly [number, number]>> = {
  Left: [0, MAX_SANE_TWIPS],
  Top: [0, MAX_SANE_TWIPS],
  Width: [1, MAX_SANE_TWIPS],
  Height: [1, MAX_SANE_TWIPS],
};

/**
 * Validate a single property's value against its known range/enum
 * allowlist. Returns the failing property name and value, or `null` if the
 * value is OK (or the property is unknown / not validated).
 *
 * The check is split: numeric properties use `KNOWN_NUMERIC_PROPERTY_RANGES`;
 * enum properties use `KNOWN_ENUM_PROPERTIES`. Unknown keys return `null`
 * (no finding) — defensive: only validate properties we know about.
 */
export function validatePropertyValue(
  key: string,
  rawValue: string,
):
  | { kind: "out-of-range"; min: number; max: number }
  | { kind: "invalid-enum"; allowed: readonly string[] }
  | { kind: "non-numeric" }
  | null {
  const numericRange = KNOWN_NUMERIC_PROPERTY_RANGES[key];
  if (numericRange !== undefined) {
    const parsed = parseTwip(rawValue);
    if (parsed === null) return { kind: "non-numeric" };
    const [min, max] = numericRange;
    if (parsed < min || parsed > max) return { kind: "out-of-range", min, max };
    return null;
  }
  const enumAllowlist = KNOWN_ENUM_PROPERTIES[key];
  if (enumAllowlist !== undefined) {
    if (!enumAllowlist.includes(rawValue.trim())) {
      return { kind: "invalid-enum", allowed: enumAllowlist };
    }
    return null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Enum allowlists
// ---------------------------------------------------------------------------

/**
 * Conservative Access enum allowlists. Each entry is the set of values the
 * VBE accepts for that property. Adding an entry here widens the looks-
 * right net; unknown properties are NOT checked (defensive).
 *
 * Source of truth: Access 2010+ object-model documentation; values
 * checked against the local `forms/` fixture catalogue where possible.
 */
export const KNOWN_ENUM_PROPERTIES: Readonly<Record<string, readonly string[]>> = {
  BackStyle: ["0", "1"],
  SpecialEffect: ["0", "1", "2", "3", "4", "5", "6"],
  BorderStyle: ["0", "1", "2", "3", "4", "5", "6", "7"],
  DisplayWhen: ["0", "1", "2"],
  ScrollBars: ["0", "1", "2", "3"],
  Cycle: ["0", "1"],
  DataEntry: ["0", "1"],
  DefaultEditing: ["0", "1", "2"],
  AllowDeletions: ["0", "1"],
  AllowAdditions: ["0", "1"],
  AllowEdits: ["0", "1"],
  RecordSelectors: ["0", "1"],
  NavigationButtons: ["0", "1"],
  DividingLines: ["0", "1"],
  AutoResize: ["0", "1"],
  AutoCenter: ["0", "1"],
  PopUp: ["0", "1"],
  Modal: ["0", "1"],
  ControlType: [
    "100", // Label
    "101", // Rectangle
    "102", // Line
    "103", // Image
    "104", // CommandButton
    "105", // OptionButton
    "106", // CheckBox
    "107", // OptionGroup
    "108", // BoundObjectFrame
    "109", // TextBox
    "110", // ListBox
    "111", // ComboBox
    "112", // SubForm/SubReport
    "114", // ToggleButton
    "118", // TabControl
    "119", // Page
    "120", // PageBreak (deprecated but valid)
    "122", // ActiveX/Custom
    "123", // WebBrowser
    "126", // NavigationControl
    "127", // NavigationButton
  ],
};

// ---------------------------------------------------------------------------
// Tab order
// ---------------------------------------------------------------------------

/**
 * Extract a control's `TabIndex` as a finite positive integer, or `null`
 * when the property is missing / unparseable. Access uses `0` as
 * "default" (visual order); explicit indices are non-zero integers.
 *
 * Missing TabIndex on EVERY control ⇒ Access falls back to visual order
 * and the caller should skip the tab-order check entirely (no warning).
 */
export function parseTabIndex(properties: Readonly<Record<string, string>>): number | null {
  const raw = properties.TabIndex;
  if (raw === undefined || raw === "") return null;
  const parsed = parseTwip(raw);
  if (parsed === null) return null;
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

/**
 * Visual top-to-bottom order: stable sort by `(top, left)`. The result is
 * the canonical "where the user's eye reads" order; tab order should match
 * this when explicitly set.
 */
export function visualOrder<T extends BoundingBox>(controls: ReadonlyArray<T>): T[] {
  return [...controls].sort((a, b) => a.top - b.top || a.left - b.left);
}

/**
 * Return `true` iff every control that has an explicit TabIndex set
 * appears in the same relative order in the visual (top, left) sort. A
 * tab-order mismatch is a looks-right warning, not an error.
 *
 * Controls WITHOUT TabIndex are ignored: Access uses visual order for
 * them automatically.
 */
export function tabOrderMatchesVisual<T extends BoundingBox & { tabIndex: number | null }>(
  controls: ReadonlyArray<T>,
): boolean {
  const explicit = controls.filter((c) => c.tabIndex !== null);
  if (explicit.length < 2) return true;
  const sortedByTab = [...explicit].sort((a, b) => (a.tabIndex ?? 0) - (b.tabIndex ?? 0));
  const visual = visualOrder(explicit);
  for (let i = 0; i < sortedByTab.length; i++) {
    if (sortedByTab[i] !== visual[i]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Code-behind event-handler cross-ref (issue #831 #6, #818 build-out)
// ---------------------------------------------------------------------------

/**
 * Check whether a handler for `eventName` on `controlName` exists in the
 * supplied `codeBehind` text. The VBA convention is
 * `<controlName>_<eventNameWithoutOnPrefix>` (e.g. `OnClick` ⇒ handler
 * `cmdSave_Click`, `OnDblClick` ⇒ handler `cmdSave_DblClick`); we look
 * for that exact token following `Sub`/`Function` declarations.
 *
 * The regex is intentionally narrow: it matches `Sub <ControlName>_<Event>(`
 * or `Function <ControlName>_<Event>(` with case-insensitive matching.
 * VBA identifiers are case-insensitive (AGENTS.md), so we collapse both
 * sides before comparing.
 */
export function eventHandlerExistsInCodeBehind(
  controlName: string,
  eventName: string,
  codeBehind: string,
): boolean {
  if (!codeBehind || !controlName || !eventName) return false;
  // Access strips the `On` prefix when generating the handler name:
  // `OnClick` → `Click`, `OnDblClick` → `DblClick`, `OnLoad` → `Load`.
  const handlerName = `${controlName}_${eventName.replace(/^On/i, "")}`.toLowerCase();
  // Match `Sub` or `Function` followed by an identifier then `(`. The
  // identifier part is what we lower-case-compare against the expected
  // handler name. We rely on `\b` to prevent partial matches (e.g.
  // `cmdSave_Click2` would not match `cmdSave_Click\b`).
  const pattern = /\b(?:sub|function)\s+([A-Za-z0-9_]+)\s*\(/gi;
  const matches = codeBehind.matchAll(pattern);
  for (const match of matches) {
    const name = match[1];
    if (name !== undefined && name.toLowerCase() === handlerName) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseTwip(value: string | undefined): number | null {
  if (value === undefined || value === null) return null;
  // Strip surrounding whitespace + quotes; SaveAsText may write `"1000"`.
  const trimmed = value.trim().replace(/^"|"$/g, "");
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}
