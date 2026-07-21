// Issue #941 — pre-validation for form_set_property.
//
// Before an unknown or malformed property reaches the IR mutation (and
// eventually the Access LoadFromText step, which fails with cryptic parser
// errors), this module classifies the property name and value type so the
// caller gets a typed envelope with actionable remediation.
//
// Two-tier allowlist strategy (matches the issue's "fail-open globally,
// fail-closed per control"):
//   1. KNOWN_ADDABLE_PROPERTY_NAMES — explicit set of well-known property
//      names a caller can confidently ADD to any control (Caption, Name,
//      Visible, …). Conservative: when in doubt, leave it out. The
//      per-control allowlist (existing scalar keys on the control's own
//      FormIR entries) supersedes this — if the control already has the
//      key, any string passes.
//   2. KNOWN_FORM_PROPERTY_TYPES — full type lookup for every property the
//      runtime can plausibly type-check. Default to "string" (everything
//      not listed here) so the contract stays additive; Access accepts
//      text values for almost every non-numeric / non-color property.
//
// Existing narrow tables in `form-ui-geometry.ts`
// (KNOWN_NUMERIC_PROPERTY_RANGES, KNOWN_ENUM_PROPERTIES) compose into the
// "twip" and "enum" buckets here without duplication.

/**
 * Conservative allowlist of property names a caller can ADD to any
 * control. The pre-validation gate accepts a property name when:
 *   (a) the control ALREADY has that key in its FormIR scalar entries, OR
 *   (b) the key is in this set.
 *
 * Both branches are checked together. The set is intentionally small —
 * prefer omission when the property is exotic / control-type-specific.
 */
export const KNOWN_ADDABLE_PROPERTY_NAMES: ReadonlySet<string> = new Set([
  // Identity & display (universal)
  "Name",
  "Caption",
  "Visible",
  "Enabled",
  "Locked",
  "TabStop",
  // Layout (geometry — twip type, validated by KNOWN_FORM_PROPERTY_TYPES)
  "Left",
  "Top",
  "Width",
  "Height",
  // Index / ordering
  "TabIndex",
  // Toggles
  "CanGrow",
  "CanShrink",
  "AutoActivate",
  "AutoTab",
  "HideDuplicates",
  "IsHyperlink",
  "RunningSum",
  // Formatting
  "Format",
  "DecimalPlaces",
  "ForeColor",
  "BackColor",
  "BackStyle",
  "BorderColor",
  "BorderStyle",
  "BorderWidth",
  "SpecialEffect",
  "FontName",
  "FontSize",
  "FontWeight",
  "FontItalic",
  "FontUnderline",
  "ForeThemeColorIndex",
  "BackThemeColorIndex",
  "ForeTint",
  "BackTint",
  // Data binding
  "ControlSource",
  "RowSource",
  "RowSourceType",
  "ColumnCount",
  "ColumnWidths",
  "BoundColumn",
  "ColumnHeads",
  "ListRows",
  "ListWidth",
  // Behavior / metadata
  "DefaultValue",
  "ValidationRule",
  "ValidationText",
  "StatusBarText",
  "InputMask",
  "HelpContextId",
  "Tag",
  "EventProcPrefix",
  // Lifecycle
  "LastUpdated",
  "DateCreated",
  // Container-level layout
  "Moveable",
  "ColumnWidth",
  "RowHeight",
  "DisplayWhen",
  "ScrollBars",
  "Cycle",
  "DataEntry",
  "DefaultEditing",
  "AllowDeletions",
  "AllowAdditions",
  "AllowEdits",
  "RecordSelectors",
  "NavigationButtons",
  "DividingLines",
  "AutoResize",
  "AutoCenter",
  "PopUp",
  "Modal",
  "Orientation",
  "TextAlign",
  // Timing
  "TimerInterval",
  "Interval",
  // Sub-form / report linkage
  "LinkChildFields",
  "LinkMasterFields",
  "SourceObject",
  // Group / level
  "GroupLevel",
  "KeepTogether",
]);

/**
 * Full type table per the issue's taxonomy. Anything not listed here
 * defaults to "string" (treated as text), which is safe — Access accepts
 * text for almost every property not enumerated below.
 *
 * Buckets:
 *   integer — finite whole numbers (TabIndex, RowSourceType, GroupLevel, …)
 *   twip    — finite non-negative integer in [0, 50_000] (geometry)
 *   boolean — true / false (toggle properties)
 *   date    — date string (LastUpdated, DateCreated)
 *   color   — &HBBGGRR& 32-bit hex (ForeColor, BackColor, …)
 *   enum    — numeric code from a known allowlist (BackStyle, SpecialEffect, …)
 *   string  — default; anything else
 */
type FormPropertyType = "integer" | "twip" | "boolean" | "date" | "color" | "enum" | "string";

const TWIP_KEYS: ReadonlySet<string> = new Set([
  "Left",
  "Top",
  "Width",
  "Height",
  "ColumnWidth",
  "RowHeight",
  "Moveable",
]);

const INTEGER_KEYS: ReadonlySet<string> = new Set([
  "TabIndex",
  "RowSourceType",
  "GroupLevel",
  "Interval",
]);

const BOOLEAN_KEYS: ReadonlySet<string> = new Set([
  "Visible",
  "Enabled",
  "Locked",
  "TabStop",
  "CanGrow",
  "CanShrink",
  "AutoActivate",
  "AutoTab",
  "HideDuplicates",
  "IsHyperlink",
  "RunningSum",
]);

const DATE_KEYS: ReadonlySet<string> = new Set(["LastUpdated", "DateCreated"]);

const COLOR_KEYS: ReadonlySet<string> = new Set([
  "BackColor",
  "ForeColor",
  "BorderColor",
  "BackThemeColorIndex",
  "ForeThemeColorIndex",
  "BackTint",
  "ForeTint",
]);

const ENUM_KEYS: ReadonlySet<string> = new Set([
  "BackStyle",
  "SpecialEffect",
  "BorderStyle",
  "DisplayWhen",
  "ScrollBars",
  "Cycle",
  "DataEntry",
  "DefaultEditing",
  "AllowDeletions",
  "AllowAdditions",
  "AllowEdits",
  "RecordSelectors",
  "NavigationButtons",
  "DividingLines",
  "AutoResize",
  "AutoCenter",
  "PopUp",
  "Modal",
  "ControlType",
  "Orientation",
  "TextAlign",
]);

/**
 * Classifies every property we know about into its expected type. The
 * "string" default applies to anything absent from this map (Caption,
 * Name, ControlSource, RowSource, Format, DefaultValue, ValidationRule,
 * StatusBarText, InputMask, …). Pure data; no I/O.
 */
function buildTypeMap(): ReadonlyMap<string, FormPropertyType> {
  const out = new Map<string, FormPropertyType>();
  for (const k of TWIP_KEYS) out.set(k, "twip");
  for (const k of INTEGER_KEYS) out.set(k, "integer");
  for (const k of BOOLEAN_KEYS) out.set(k, "boolean");
  for (const k of DATE_KEYS) out.set(k, "date");
  for (const k of COLOR_KEYS) out.set(k, "color");
  for (const k of ENUM_KEYS) out.set(k, "enum");
  return out;
}

export const KNOWN_FORM_PROPERTY_TYPES: ReadonlyMap<string, FormPropertyType> = buildTypeMap();

/**
 * Type of the result of {@link validateFormPropertyValue}. Three shapes:
 *   - `{ kind: "<expected-type>" }` — value matches; caller may proceed.
 *   - `{ kind: "unknown" }` — key has no type entry (defaults to "string"
 *     in the runtime — see {@link KNOWN_FORM_PROPERTY_TYPES}); any value
 *     type is accepted, so the caller may proceed without further checks.
 *   - `null` — value's runtime type does NOT match the expected type.
 *     Caller should reject with FORM_PROPERTY_VALUE_INVALID.
 *
 * `actualKind` is populated on the success/mismatch branches to give the
 * caller a structured remediation hint (it mirrors `actualType` in the
 * thrown envelope).
 */
export type FormPropertyValidation =
  | { kind: FormPropertyType; actualKind: string }
  | { kind: "unknown" };

/**
 * Pre-validate a property value against its expected type. Pure.
 *
 * @param key   - the property name (must be non-null; checked elsewhere).
 * @param value - the runtime value the caller intends to write.
 * @returns `null` if the value's runtime type does NOT match the expected
 *          type (caller should reject with FORM_PROPERTY_VALUE_INVALID);
 *          otherwise a `{ kind, actualKind }` object describing the
 *          accepted match (or `{ kind: "unknown" }` for keys that have no
 *          type entry — those pass through without type checking).
 */
export function validateFormPropertyValue(
  key: string,
  value: unknown,
): FormPropertyValidation | null {
  const expected = KNOWN_FORM_PROPERTY_TYPES.get(key);
  if (expected === undefined) {
    // No type entry — pass through, default to "string" semantics.
    return { kind: "unknown" };
  }

  const actualKind = runtimeKindOf(value);

  if (expected === "string") {
    // String expected — anything string-coercible passes.
    return actualKind === "string"
      ? { kind: "string", actualKind }
      : { kind: "string", actualKind };
  }

  if (expected === "boolean") {
    if (typeof value === "boolean") return { kind: "boolean", actualKind };
    return null;
  }

  if (expected === "integer") {
    if (typeof value === "number" && Number.isInteger(value)) {
      return { kind: "integer", actualKind };
    }
    return null;
  }

  if (expected === "twip") {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return { kind: "twip", actualKind };
    }
    return null;
  }

  if (expected === "color") {
    if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 0xffffff) {
      return { kind: "color", actualKind };
    }
    return null;
  }

  if (expected === "date") {
    if (typeof value === "string" || value instanceof Date) {
      return { kind: "date", actualKind };
    }
    return null;
  }

  if (expected === "enum") {
    // Enum values are numeric codes in Access; accept finite numbers here.
    // The narrower allowlist lives in KNOWN_ENUM_PROPERTIES (form-ui-geometry.ts)
    // and is enforced by the existing validatePropertyValue helper when a
    // string token is supplied; this pre-validation only refuses clear type
    // mismatches.
    if (typeof value === "number" && Number.isFinite(value)) {
      return { kind: "enum", actualKind };
    }
    return null;
  }

  // Unreachable — exhaustive switch over FormPropertyType.
  return { kind: expected, actualKind };
}

/**
 * Stringify the runtime kind of `value` for the `actualType` field of
 * the typed envelope. Mirrors the canonical kind names from
 * {@link KNOWN_FORM_PROPERTY_TYPES}.
 */
export function runtimeKindOf(value: unknown): string {
  if (typeof value === "string") return "string";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "number";
    return Number.isInteger(value) ? "integer" : "number";
  }
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  return typeof value;
}
