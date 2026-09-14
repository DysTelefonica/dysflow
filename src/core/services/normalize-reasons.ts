/**
 * Normalization-reason ordered enum + primary-category selector.
 *
 * Implements DESIGN §"Non-actionable category and reason contract" verbatim.
 * Pure: no I/O, no global state. Every helper is deterministic and the order
 * `NORMALIZATION_REASON_ORDER` is the single source of truth used by the WU-3
 * classifier when emitting `normalizationReasons` on diff entries.
 */

export const NORMALIZATION_REASON_ORDER = [
  "bomPrefix",
  "lineEnding",
  "leadingIndentation",
  "trailingWhitespace",
  "blankLogicalStatement",
  "interTokenWhitespace",
  "identifierCase",
  "commentText",
  "lineContinuationLayout",
  "statementBoundaryLayout",
  "cosmeticAttribute",
  "formSerialization",
] as const;

export type NormalizationReason = (typeof NORMALIZATION_REASON_ORDER)[number];

const NORMALIZATION_REASON_SET: ReadonlySet<string> = new Set(NORMALIZATION_REASON_ORDER);

export function isNormalizationReason(value: unknown): value is NormalizationReason {
  return typeof value === "string" && NORMALIZATION_REASON_SET.has(value);
}

export type NonActionableCategoryV2 =
  | "encodingOnly"
  | "caseOnly"
  | "whitespaceOnly"
  | "commentOnly"
  | "continuationOnly"
  | "statementBoundaryOnly"
  | "attributeOnly"
  | "formSerializationOnly"
  | "nonActionableMixed";

export type PrimaryCategory = NonActionableCategoryV2 | "actionable" | "incomplete";

const WHITESPACE_REASONS: readonly NormalizationReason[] = [
  "lineEnding",
  "leadingIndentation",
  "trailingWhitespace",
  "blankLogicalStatement",
  "interTokenWhitespace",
];

/**
 * Resolve the DESIGN primary-category table for an ordered, deduplicated list
 * of `normalizationReasons`. Returns one of:
 *
 *   - `encodingOnly`           — only `bomPrefix`.
 *   - `caseOnly`               — only `identifierCase`.
 *   - `whitespaceOnly`         — only whitespace reasons (any subset).
 *   - `commentOnly`            — `commentText` ± `leadingIndentation`/`trailingWhitespace`/`identifierCase`.
 *   - `continuationOnly`       — `lineContinuationLayout` ± whitespace/case.
 *   - `statementBoundaryOnly`  — `statementBoundaryLayout` ± whitespace/case.
 *   - `attributeOnly`          — only `cosmeticAttribute`.
 *   - `formSerializationOnly`  — only `formSerialization`.
 *   - `nonActionableMixed`     — two or more distinct non-actionable families.
 *   - `actionable`             — empty reason list (no normalization ⇒ real drift).
 *   - `incomplete`             — any unknown reason.
 */
export function primaryCategoryForReasons(
  reasons: readonly NormalizationReason[],
): PrimaryCategory {
  // Empty reason list = the canonicalizer observed no normalization. By
  // DESIGN §"Bias to functional" we report functional drift, never a no-op.
  if (reasons.length === 0) return "actionable";

  // Reject unknown reasons up front; we never manufacture a non-actionable
  // category out of an unrecognized family.
  for (const reason of reasons) {
    if (!isNormalizationReason(reason)) return "incomplete";
  }

  const set = new Set(reasons);
  const size = set.size;

  // Single-reason shortcuts.
  if (size === 1) {
    const only = reasons[0] as NormalizationReason;
    if (only === "bomPrefix") return "encodingOnly";
    if (only === "identifierCase") return "caseOnly";
    if (only === "cosmeticAttribute") return "attributeOnly";
    if (only === "formSerialization") return "formSerializationOnly";
    if (only === "commentText") return "commentOnly";
    if (only === "lineContinuationLayout") return "continuationOnly";
    if (only === "statementBoundaryLayout") return "statementBoundaryOnly";
    // Whitespace single-reason: any one whitespace reason alone is
    // `whitespaceOnly`. We deliberately do NOT collapse a single
    // whitespace reason into `commentOnly`/`continuationOnly`/
    // `statementBoundaryOnly` — those require their primary family to be
    // the dominant signal.
    if (WHITESPACE_REASONS.includes(only)) return "whitespaceOnly";
  }

  // Mixed-family checks. We collapse to `nonActionableMixed` whenever
  // the reasons span two or more distinct non-actionable families. The
  // table from DESIGN §"Non-actionable category and reason contract"
  // says: "two or more distinct non-actionable families".
  const families = new Set<string>();
  if (set.has("bomPrefix")) families.add("encoding");
  if (set.has("identifierCase")) families.add("case");
  for (const reason of WHITESPACE_REASONS) {
    if (set.has(reason)) families.add("whitespace");
  }
  if (set.has("commentText")) families.add("comment");
  if (set.has("lineContinuationLayout")) families.add("continuation");
  if (set.has("statementBoundaryLayout")) families.add("boundary");
  if (set.has("cosmeticAttribute")) families.add("attribute");
  if (set.has("formSerialization")) families.add("form");

  if (families.size >= 2) return "nonActionableMixed";

  // Single-family multi-reason buckets.
  if (families.size === 1) {
    const family = [...families][0];
    if (family === "whitespace") return "whitespaceOnly";
    if (family === "comment") return "commentOnly";
    if (family === "continuation") return "continuationOnly";
    if (family === "boundary") return "statementBoundaryOnly";
    if (family === "encoding") return "encodingOnly";
    if (family === "case") return "caseOnly";
    if (family === "attribute") return "attributeOnly";
    if (family === "form") return "formSerializationOnly";
  }

  return "actionable";
}

/**
 * Reject a reason list that mixes known families with unknown tokens, or that
 * carries a token from outside `NORMALIZATION_REASON_ORDER`. Returns
 * `{ok:true}` when every entry is a known reason; otherwise
 * `{ok:false, reason}` with an explanatory string.
 *
 * `primaryCategoryForReasons` already returns `"incomplete"` when it sees an
 * unknown reason, so this helper exists for callers that want to validate
 * BEFORE classifying (e.g. tests, doc anchors, schema shapers).
 */
export function areReasonsCoherent(
  reasons: readonly string[],
): { ok: true } | { ok: false; reason: string } {
  if (reasons.length === 0) return { ok: true };
  for (const reason of reasons) {
    if (!isNormalizationReason(reason)) {
      return { ok: false, reason: `unknown reason: ${String(reason)}` };
    }
  }
  return { ok: true };
}
