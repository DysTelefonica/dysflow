/**
 * vba-semantic-classifier.ts
 *
 * Pure domain service. Zero adapter dependencies — no node:fs, no PowerShell, no COM.
 * Entry point: classifyVbaPair(input) -> SemanticClassification
 *
 * Implements the 8-category classification taxonomy for VBA module pairs:
 *   matched | whitespaceOnly | attributeOnly | formSerializationOnly |
 *   encodingOnly | sourceNewer | binaryNewer | bothChanged
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type VbaComparisonMode = "semantic" | "strict";

export type VbaSemanticCategory =
  | "matched" // identical after no/normalization
  | "whitespaceOnly" // differ only by CRLF/LF/trailing-ws/blank lines
  | "attributeOnly" // differ only by Attribute VB_* header lines (not VB_Name)
  | "formSerializationOnly" // differ only by stripped form/report noise sections
  | "encodingOnly" // differ only by encoding mojibake (normalize-and-recompare)
  | "sourceNewer" // functional change, only source has unique functional lines
  | "binaryNewer" // functional change, only binary has unique functional lines
  | "bothChanged"; // functional change on both sides

export type VbaRecommendation =
  | "no_action"
  | "import_to_binary" // source -> Access
  | "export_to_src" // Access -> disk
  | "manual_merge";

export interface SemanticClassification {
  classification: VbaSemanticCategory;
  /** Stable, human/grep-friendly string — no paths or timestamps. */
  reason: string;
  srcUniqueFunctionalLines: number;
  binaryUniqueFunctionalLines: number;
  recommendation: VbaRecommendation;
  /** true only for sourceNewer, binaryNewer, bothChanged */
  actionable: boolean;
}

export interface ClassifyVbaPairInput {
  sourceText: string;
  binaryText: string;
  /** Optional raw bytes — enables reliable encodingOnly detection. */
  sourceBytes?: Uint8Array;
  /** Optional raw bytes — enables reliable encodingOnly detection. */
  binaryBytes?: Uint8Array;
  /** "bas" | "cls" | "frm" | "form.txt" | "report.txt" */
  fileType: string;
  mode: VbaComparisonMode;
}

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

/**
 * Maximum number of lines per side before LCS falls back to multiset-difference.
 * VBA files are small; this bound protects against pathological inputs.
 */
const LCS_LINE_BUDGET = 20_000;

/** File types that are VBA code modules (not form/report serialization). */
const CODE_FILE_TYPES = new Set(["bas", "cls", "frm"]);

/** File types that are form/report serialization documents. */
const FORM_FILE_TYPES = new Set(["form.txt", "report.txt"]);

/**
 * Known serialization-noise keys for form/report files.
 * These keys (scalar or Begin..End block) are stripped before comparison.
 * LOCKED list — unknown keys are retained (bias-to-functional).
 * NameMap and GUID are NOT in this list (they are functional).
 */
const FORM_NOISE_KEYS = new Set([
  "Checksum",
  "PrtDevMode",
  "PrtDevModeW",
  "PrtDevNames",
  "PrtDevNamesW",
  "PrtMip",
  "RecSrcDt",
]);

/**
 * VB_ attribute prefix. Lines starting with this are candidate for stripping.
 * VB_Name is explicitly excluded (functional — a rename is a real change).
 */
const VB_ATTR_PREFIX = "Attribute VB_";

/** VB_Name is functional — must NOT be stripped even though it's a VB_ attribute. */
const VB_NAME_ATTR_PREFIX = "Attribute VB_Name";

// ---------------------------------------------------------------------------
// Normalizers (pure, exported for discoverability — tests assert on classifyVbaPair output)
// ---------------------------------------------------------------------------

/**
 * Normalizes line endings to LF.
 * Converts CRLF (\r\n) and bare CR (\r) to LF (\n).
 */
export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * Strips trailing spaces and tabs from each line, and collapses trailing blank lines.
 * Apply after normalizeLineEndings so that \r\n is already normalized.
 */
export function normalizeTrailingWhitespace(text: string): string {
  const lines = text.split("\n");
  const stripped = lines.map((line) => line.replace(/[ \t]+$/, ""));
  // Remove trailing blank lines
  let end = stripped.length;
  while (end > 0 && stripped[end - 1] === "") {
    end--;
  }
  return stripped.slice(0, end).join("\n");
}

/**
 * Removes `Attribute VB_*` header lines from VBA code files (.bas, .cls, .frm).
 *
 * VB_Name is NOT stripped — a name change is a functional rename.
 * This normalizer is a no-op for form.txt and report.txt files.
 */
export function stripAttributeLines(text: string, fileType: string): string {
  if (!CODE_FILE_TYPES.has(fileType)) {
    return text; // no-op for non-code file types
  }
  const lines = text.split("\n");
  return lines
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith(VB_ATTR_PREFIX)) return true;
      if (trimmed.startsWith(VB_NAME_ATTR_PREFIX)) return true; // VB_Name is functional
      return false;
    })
    .join("\n");
}

/**
 * Strips known form/report serialization noise sections from form.txt and report.txt files.
 *
 * Strips:
 * - Scalar assignments: `Checksum = <value>` (single-line)
 * - Begin..End blocks for: PrtDevMode, PrtDevModeW, PrtDevNames, PrtDevNamesW, PrtMip, RecSrcDt
 *
 * Retains:
 * - NameMap (functional — LOCKED decision)
 * - GUID (functional)
 * - Everything else
 * - Any unknown Begin..End key (bias-to-functional)
 *
 * This normalizer is a no-op for bas, cls, frm files.
 */
export function stripFormSerializationNoise(text: string, fileType: string): string {
  if (!FORM_FILE_TYPES.has(fileType)) {
    return text; // no-op for non-form file types
  }

  const lines = text.split("\n");
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    // Try to match a noise key on this line
    const matchedKey = findNoiseKey(trimmed);

    if (matchedKey !== null) {
      // Check if this is a scalar assignment or a Begin..End block
      const afterKey = trimmed.slice(matchedKey.length).trim();

      if (afterKey.startsWith("= Begin") || afterKey === "= Begin") {
        // It's a Begin..End block — skip until matching End
        i++; // skip the "Key = Begin" line
        while (i < lines.length) {
          const blockLine = (lines[i] ?? "").trim();
          i++;
          if (blockLine === "End") break; // end of block
        }
        // Do not append anything — the block is stripped
      } else if (afterKey.startsWith("=")) {
        // Scalar assignment line — skip it
        i++;
      } else {
        // Not a recognized form (shouldn't happen with known keys) — retain
        result.push(line);
        i++;
      }
    } else {
      result.push(line);
      i++;
    }
  }

  return result.join("\n");
}

/**
 * Returns the noise key found at the start of the trimmed line, or null if no noise key matches.
 * Ensures key is followed by whitespace or `=` so we don't partially match longer key names.
 */
function findNoiseKey(trimmed: string): string | null {
  for (const key of FORM_NOISE_KEYS) {
    // Key must be followed by whitespace, `=`, or end of string
    if (trimmed.startsWith(key)) {
      const after = trimmed.slice(key.length);
      const firstChar = after[0];
      if (after === "" || firstChar === " " || firstChar === "=" || firstChar === "\t") {
        return key;
      }
    }
  }
  return null;
}

/**
 * Best-effort Latin-1/UTF-8 double-encoding (mojibake) repair.
 *
 * Safety invariants (LOCKED):
 * - If either string contains U+FFFD (replacement char), repair is NOT attempted;
 *   the original string is returned unchanged. This prevents hiding a real content
 *   change behind a lossy decode artifact.
 * - If bytes are provided: decode the bytes under both UTF-8 and Windows-1252.
 *   The "canonical" interpretation is UTF-8 (preferred, modern encoding). If the
 *   caller's text matches the Windows-1252 decode, it means the bytes were
 *   mis-decoded as Win-1252; the repaired version is the UTF-8 decode.
 *   Conversely, if text matches the UTF-8 decode, no repair is needed for that side.
 * - If bytes are absent: attempt string-level Latin-1 repair heuristic.
 *
 * @returns The repaired string, or the original text if repair is not applicable/safe.
 */
export function repairMojibake(text: string, bytes?: Uint8Array): string {
  // U+FFFD guard — never attempt repair when replacement chars are present
  if (text.includes("�")) {
    return text;
  }

  if (bytes !== undefined) {
    // Byte path: decode as UTF-8 and as Windows-1252/Latin-1
    try {
      const utf8Decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      const latin1Decoded = new TextDecoder("windows-1252", { fatal: false }).decode(bytes);

      // Guard: if any decode produces FFFD, bail out
      if (utf8Decoded.includes("�") || latin1Decoded.includes("�")) {
        return text;
      }

      // If the text matches the Win-1252 decode (meaning it was mis-decoded as Win-1252),
      // return the UTF-8 decode as the repaired version.
      if (text === latin1Decoded && latin1Decoded !== utf8Decoded) {
        return utf8Decoded;
      }

      // If the text matches the UTF-8 decode, the bytes support this text as-is.
      if (text === utf8Decoded) {
        return text;
      }
    } catch {
      // If decoding fails, return original
      return text;
    }
  } else {
    // String fallback path: attempt to repair Latin-1 mis-decoded UTF-8
    // This tries to re-encode as Latin-1 and decode as UTF-8
    try {
      const repaired = repairMojibakerStringFallback(text);
      if (!repaired.includes("�") && repaired !== text) {
        return repaired;
      }
    } catch {
      // Fall through on any error
    }
  }

  return text;
}

/**
 * String-level fallback mojibake repair.
 * Attempts to treat the string as if it were Windows-1252 bytes, re-interpreted as UTF-8.
 * This handles the classic "UTF-8 bytes stored in a Windows-1252 field" scenario.
 */
function repairMojibakerStringFallback(text: string): string {
  // Re-encode the string to latin1 bytes, then decode as UTF-8
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    bytes[i] = text.charCodeAt(i) & 0xff;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

// ---------------------------------------------------------------------------
// LCS-based functional-line differ
// ---------------------------------------------------------------------------

/**
 * Computes the LCS (Longest Common Subsequence) length for two line arrays.
 * Classic DP approach, O(n*m). Bounded by LCS_LINE_BUDGET.
 *
 * @returns { lcs: number, capped: boolean }
 */
export function lcsLength(a: string[], b: string[]): { lcs: number; capped: boolean } {
  if (a.length > LCS_LINE_BUDGET || b.length > LCS_LINE_BUDGET) {
    // Fallback to multiset intersection count for large inputs
    const multisetLcs = multisetIntersectionCount(a, b);
    return { lcs: multisetLcs, capped: true };
  }

  const n = a.length;
  const m = b.length;

  // Use two-row optimization to reduce memory
  let prev = new Array<number>(m + 1).fill(0) as number[];
  let curr = new Array<number>(m + 1).fill(0) as number[];

  for (let i = 1; i <= n; i++) {
    const aLine = a[i - 1] ?? "";
    for (let j = 1; j <= m; j++) {
      const bLine = b[j - 1] ?? "";
      if (aLine === bLine) {
        curr[j] = (prev[j - 1] ?? 0) + 1;
      } else {
        curr[j] = Math.max(prev[j] ?? 0, curr[j - 1] ?? 0);
      }
    }
    // Swap rows
    [prev, curr] = [curr, prev];
    curr.fill(0);
  }

  return { lcs: prev[m] ?? 0, capped: false };
}

/**
 * Multiset intersection count — used as LCS fallback when arrays exceed LCS_LINE_BUDGET.
 * Counts min occurrences of each line across both arrays.
 */
function multisetIntersectionCount(a: string[], b: string[]): number {
  const countA = new Map<string, number>();
  for (const line of a) {
    countA.set(line, (countA.get(line) ?? 0) + 1);
  }
  let intersection = 0;
  const countB = new Map<string, number>();
  for (const line of b) {
    countB.set(line, (countB.get(line) ?? 0) + 1);
  }
  for (const [line, cntA] of countA) {
    const cntB = countB.get(line) ?? 0;
    intersection += Math.min(cntA, cntB);
  }
  return intersection;
}

/**
 * Computes the symmetric functional-line diff between two texts.
 * Returns srcUnique, binaryUnique, and whether LCS was capped.
 */
function computeFunctionalDiff(
  srcText: string,
  binText: string,
): { srcUnique: number; binUnique: number; capped: boolean } {
  const srcLines = srcText.split("\n").filter((l) => l.trim() !== "");
  const binLines = binText.split("\n").filter((l) => l.trim() !== "");

  const { lcs, capped } = lcsLength(srcLines, binLines);

  return {
    srcUnique: srcLines.length - lcs,
    binUnique: binLines.length - lcs,
    capped,
  };
}

// ---------------------------------------------------------------------------
// Non-actionable result builder
// ---------------------------------------------------------------------------

function nonActionable(
  classification: VbaSemanticCategory,
  reason: string,
): SemanticClassification {
  return {
    classification,
    reason,
    srcUniqueFunctionalLines: 0,
    binaryUniqueFunctionalLines: 0,
    recommendation: "no_action",
    actionable: false,
  };
}

// ---------------------------------------------------------------------------
// Functional diff result builder
// ---------------------------------------------------------------------------

function fromFunctionalDiff(
  srcUnique: number,
  binUnique: number,
  capped: boolean,
): SemanticClassification {
  const cappedNote = capped ? " (lcs-capped)" : "";

  if (srcUnique > 0 && binUnique === 0) {
    return {
      classification: "sourceNewer",
      reason: `source has ${srcUnique} unique functional line(s) not in binary${cappedNote}`,
      srcUniqueFunctionalLines: srcUnique,
      binaryUniqueFunctionalLines: 0,
      recommendation: "import_to_binary",
      actionable: true,
    };
  }

  if (srcUnique === 0 && binUnique > 0) {
    return {
      classification: "binaryNewer",
      reason: `binary has ${binUnique} unique functional line(s) not in source${cappedNote}`,
      srcUniqueFunctionalLines: 0,
      binaryUniqueFunctionalLines: binUnique,
      recommendation: "export_to_src",
      actionable: true,
    };
  }

  if (srcUnique > 0 && binUnique > 0) {
    return {
      classification: "bothChanged",
      reason: `source has ${srcUnique} and binary has ${binUnique} unique functional line(s)${cappedNote}`,
      srcUniqueFunctionalLines: srcUnique,
      binaryUniqueFunctionalLines: binUnique,
      recommendation: "manual_merge",
      actionable: true,
    };
  }

  // Defensive: normalization equalized them — treat as matched
  return {
    classification: "matched",
    reason: `normalization resolved all differences${cappedNote}`,
    srcUniqueFunctionalLines: 0,
    binaryUniqueFunctionalLines: 0,
    recommendation: "no_action",
    actionable: false,
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Classifies a pair of VBA source/binary texts and returns a SemanticClassification.
 *
 * Classification precedence (§3.3 design):
 *   0. strict mode: raw equality -> matched; else functional diff (no normalization).
 *   1. raw equal -> matched
 *   2. equal after lineEndings + trailingWs -> whitespaceOnly
 *   3. equal after (2) + stripAttributeLines -> attributeOnly  (code types only)
 *   4. equal after (2) + stripFormSerializationNoise -> formSerializationOnly (form/report only)
 *   5. equal after (2..4) + repairMojibake -> encodingOnly (with safety guards)
 *   6. else -> functional diff -> sourceNewer / binaryNewer / bothChanged
 */
export function classifyVbaPair(input: ClassifyVbaPairInput): SemanticClassification {
  const { sourceText, binaryText, sourceBytes, binaryBytes, fileType, mode } = input;

  // -------------------------------------------------------------------------
  // Step 0: strict mode — no noise buckets, byte/text-exact behavior
  // -------------------------------------------------------------------------
  if (mode === "strict") {
    if (sourceText === binaryText) {
      return nonActionable("matched", "texts are identical (strict mode)");
    }
    // In strict mode, run the functional diff directly on normalized (whitespace) lines
    // so directionality is still derived correctly
    const { srcUnique, binUnique, capped } = computeFunctionalDiff(sourceText, binaryText);
    return fromFunctionalDiff(srcUnique, binUnique, capped);
  }

  // -------------------------------------------------------------------------
  // Step 1: raw equality
  // -------------------------------------------------------------------------
  if (sourceText === binaryText) {
    return nonActionable("matched", "texts are identical");
  }

  // -------------------------------------------------------------------------
  // Step 2: whitespaceOnly — normalize line endings and trailing whitespace
  // -------------------------------------------------------------------------
  const normalizeWs = (t: string) => normalizeTrailingWhitespace(normalizeLineEndings(t));

  const srcNormWs = normalizeWs(sourceText);
  const binNormWs = normalizeWs(binaryText);

  if (srcNormWs === binNormWs) {
    return nonActionable(
      "whitespaceOnly",
      "texts differ only in line endings or trailing whitespace",
    );
  }

  // -------------------------------------------------------------------------
  // Step 3: attributeOnly — strip VB_* attribute lines (code file types only)
  // -------------------------------------------------------------------------
  if (CODE_FILE_TYPES.has(fileType)) {
    const srcNormAttr = stripAttributeLines(srcNormWs, fileType);
    const binNormAttr = stripAttributeLines(binNormWs, fileType);

    if (srcNormAttr === binNormAttr) {
      return nonActionable("attributeOnly", "texts differ only in Attribute VB_* header lines");
    }
  }

  // -------------------------------------------------------------------------
  // Step 4: formSerializationOnly — strip form/report noise sections
  // -------------------------------------------------------------------------
  if (FORM_FILE_TYPES.has(fileType)) {
    const srcNormForm = stripFormSerializationNoise(srcNormWs, fileType);
    const binNormForm = stripFormSerializationNoise(binNormWs, fileType);

    if (srcNormForm === binNormForm) {
      return nonActionable(
        "formSerializationOnly",
        "texts differ only in form serialization noise (Checksum, PrtDevMode, RecSrcDt, etc.)",
      );
    }
  }

  // -------------------------------------------------------------------------
  // Step 5: encodingOnly — mojibake normalization with safety guards
  // -------------------------------------------------------------------------
  // Only attempt if neither side contains U+FFFD (replacement char)
  if (!sourceText.includes("�") && !binaryText.includes("�")) {
    const repairedSrc = repairMojibake(srcNormWs, sourceBytes);
    const repairedBin = repairMojibake(binNormWs, binaryBytes);

    // Only classify encodingOnly if repair actually changed something AND equalized the texts
    const repairChangedSomething = repairedSrc !== srcNormWs || repairedBin !== binNormWs;
    if (repairChangedSomething && repairedSrc === repairedBin) {
      // Additional safety: ensure repaired texts do not contain U+FFFD
      if (!repairedSrc.includes("�") && !repairedBin.includes("�")) {
        return nonActionable(
          "encodingOnly",
          "texts differ only in encoding (mojibake repair resolved)",
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // Step 6: functional diff — apply all normalizers then run LCS differ
  // -------------------------------------------------------------------------
  // Apply full normalization pipeline on the normalized-whitespace texts
  let srcFull = srcNormWs;
  let binFull = binNormWs;

  // Apply attribute stripping for code types (already checked above but apply for diff context)
  if (CODE_FILE_TYPES.has(fileType)) {
    srcFull = stripAttributeLines(srcFull, fileType);
    binFull = stripAttributeLines(binFull, fileType);
  }

  // Apply form noise stripping for form types
  if (FORM_FILE_TYPES.has(fileType)) {
    srcFull = stripFormSerializationNoise(srcFull, fileType);
    binFull = stripFormSerializationNoise(binFull, fileType);
  }

  // Apply mojibake repair if safe (no FFFD)
  if (!sourceText.includes("�") && !binaryText.includes("�")) {
    const repairedSrc = repairMojibake(srcFull, sourceBytes);
    const repairedBin = repairMojibake(binFull, binaryBytes);
    // Only apply if it doesn't produce FFFD
    if (!repairedSrc.includes("�")) srcFull = repairedSrc;
    if (!repairedBin.includes("�")) binFull = repairedBin;
  }

  const { srcUnique, binUnique, capped } = computeFunctionalDiff(srcFull, binFull);
  return fromFunctionalDiff(srcUnique, binUnique, capped);
}
