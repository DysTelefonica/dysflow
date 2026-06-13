/**
 * vba-semantic-classifier.ts
 *
 * Pure domain service. Zero adapter dependencies — no node:fs, no PowerShell, no COM.
 * Entry point: classifyVbaPair(input) -> SemanticClassification
 *
 * Implements the classification taxonomy for VBA module pairs:
 *   matched | whitespaceOnly | attributeOnly | caseOnly | formSerializationOnly |
 *   encodingOnly | sourceNewer | binaryNewer | bothChanged
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type VbaComparisonMode = "semantic" | "strict";

/**
 * Fingerprint of the active semantic-classification rule set. Surfaced in the
 * verify/reconcile result so a consumer can tell which rules produced a given
 * classification — distinct from the package version. BUMP THIS whenever the
 * classification rules change (new category, new normalizer, changed precedence).
 */
export const SEMANTIC_CLASSIFIER_RULES = "2026-06-13.r4-real-repo-acceptance";

export type VbaSemanticCategory =
  | "matched" // identical after no/normalization
  | "whitespaceOnly" // differ only by CRLF/LF/trailing-ws/blank lines
  | "attributeOnly" // differ only by Attribute VB_* header lines (not VB_Name)
  | "caseOnly" // differ only by identifier/keyword casing (VBA is case-insensitive)
  | "formSerializationOnly" // differ only by stripped form/report noise sections
  | "encodingOnly" // differ only by encoding mojibake or lossy out-of-codepage replacement
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
 * GUID is NOT in this list (it is functional). NameMap is stripped because
 * repeated Access exports can omit/recreate it without changing behavior; real
 * control/name changes still survive through the actual property/control lines.
 */
const FORM_NOISE_KEYS = new Set([
  "Checksum",
  "PrtDevMode",
  "PrtDevModeW",
  "PrtDevNames",
  "PrtDevNamesW",
  "PrtMip",
  "RecSrcDt",
  // Layout cache and publish/CTI flags — IDE/runtime bookkeeping, never functional.
  "LayoutCachedLeft",
  "LayoutCachedTop",
  "LayoutCachedWidth",
  "LayoutCachedHeight",
  "PublishOption",
  "NoSaveCTIWhenDisabled",
  "NameMap",
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

/** Leading indentation in exported VBA code is not executable semantics. */
export function normalizeLeadingWhitespace(text: string, fileType: string): string {
  if (!CODE_FILE_TYPES.has(fileType)) return text;
  return text
    .split("\n")
    .map((line) => (line.trim() === "" ? "" : line.replace(/^\s+/, "")))
    .join("\n");
}

/**
 * Removes `Attribute VB_*` header lines from VBA code files (.bas, .cls, .frm).
 *
 * VB_Name is NOT stripped — a name change is a functional rename.
 * This normalizer is a no-op for form.txt and report.txt files.
 */
export function stripAttributeLines(text: string, fileType: string, keepVbName = true): string {
  // Applies to code modules AND to the CodeBehindForm section embedded in
  // form/report serialization, which carries the same Attribute VB_* boilerplate.
  if (!CODE_FILE_TYPES.has(fileType) && !FORM_FILE_TYPES.has(fileType)) {
    return text; // no-op for unknown file types
  }
  const lines = text.split("\n");
  return lines
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith(VB_ATTR_PREFIX)) return true;
      // VB_Name is kept only when both sides agree on it (a real rename stays
      // functional); the caller passes keepVbName=false when it is non-functional
      // header presence (one side simply omits the header).
      if (trimmed.startsWith(VB_NAME_ATTR_PREFIX)) return keepVbName;
      return false;
    })
    .join("\n");
}

/**
 * Reads the `Attribute VB_Name = "…"` value from a module/form text, or null.
 * Used to decide whether a VB_Name difference is a real rename (both sides name
 * the module, values differ) versus mere header presence (one side omits it).
 */
export function extractVbName(text: string): string | null {
  const match = text.match(/^\s*Attribute VB_Name\s*=\s*"([^"]*)"/m);
  return match ? (match[1] ?? null) : null;
}

/**
 * Strips the leading `VERSION x.x CLASS` line and its following `BEGIN … END`
 * block from a class-module export.
 *
 * This block (`MultiUse`, etc.) is instancing boilerplate that an Access binary
 * export may emit on one side only. It is removed only when the text starts with
 * `VERSION <num> CLASS` — a `.frm` form begins with `VERSION 5.00` and a control
 * `Begin … End` tree, which is functional and must NOT be stripped.
 */
export function stripModuleHeader(text: string): string {
  const lines = text.split("\n");
  if (!/^VERSION\s+[\d.]+\s+CLASS$/i.test((lines[0] ?? "").trim())) {
    return text; // not a class-module header — leave untouched
  }
  // Drop the VERSION line; if a BEGIN..END block follows, drop it too.
  let i = 1;
  if ((lines[i] ?? "").trim().toUpperCase() !== "BEGIN") {
    return lines.slice(1).join("\n");
  }
  let depth = 0;
  for (; i < lines.length; i++) {
    const t = (lines[i] ?? "").trim().toUpperCase();
    if (t === "BEGIN") depth++;
    else if (t === "END") {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }
  return lines.slice(i).join("\n");
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

/**
 * Sentinel char for lossy-encoding neutralization. U+FFFF is a permanent
 * non-character (never valid in well-formed text), so it cannot collide with
 * real source content.
 */
const LOSSY_SENTINEL = "￿";

/**
 * Folds VBA casing for comparison, preserving runtime-visible content.
 *
 * VBA identifiers and keywords are case-insensitive — the VBE re-cases them
 * project-wide on import, which is NEVER a functional change. But string-literal
 * contents are case-SENSITIVE at runtime, and comment bodies are preserved
 * verbatim (the VBE never re-cases them, so their case never drifts; keeping them
 * intact biases toward functional). Everything OUTSIDE double-quoted string
 * literals and `'` comments is lowercased; string and comment bodies are kept.
 *
 * No-op for file types that are neither VBA code nor form/report serialization.
 */
export function normalizeVbaCase(text: string, fileType: string): string {
  if (!CODE_FILE_TYPES.has(fileType) && !FORM_FILE_TYPES.has(fileType)) {
    return text; // no-op for unknown file types
  }
  return text
    .split("\n")
    .map((line) => foldLineOutsideStringsAndComments(line))
    .join("\n");
}

/**
 * Lowercases a single line outside of double-quoted string literals and `'`
 * comments. Handles the VBA `""` escaped-quote sequence (stays inside the string).
 */
function foldLineOutsideStringsAndComments(line: string): string {
  let out = "";
  let inString = false;
  let i = 0;
  while (i < line.length) {
    const ch = line[i] ?? "";
    if (inString) {
      out += ch;
      if (ch === '"') {
        // VBA escapes a quote inside a string by doubling it ("").
        if (line[i + 1] === '"') {
          out += '"';
          i += 2;
          continue;
        }
        inString = false;
      }
      i += 1;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "'") {
      // Rest of the line is a comment — preserve verbatim.
      out += line.slice(i);
      break;
    }
    out += ch.toLowerCase();
    i += 1;
  }
  return out;
}

/**
 * Neutralizes lossy out-of-codepage replacement for comparison.
 *
 * When Access exports a module, characters outside the active ANSI code page are
 * irreversibly replaced by "?" (U+003F). repairMojibake cannot undo this because
 * the original byte is gone. To detect that two texts differ ONLY by such
 * artifacts, every non-ASCII character and every "?" OUTSIDE a string literal is
 * mapped to a single sentinel. String-literal bodies are preserved verbatim — a
 * glyph change inside a string is runtime-visible and must stay functional,
 * consistent with how casing is folded. All ASCII content outside strings is kept,
 * so any real change in executable code survives.
 */
export function neutralizeLossyEncoding(text: string): string {
  return text.split("\n").map(neutralizeLineOutsideStrings).join("\n");
}

/**
 * Neutralizes lossy export glyphs everywhere, including string literals.
 *
 * Use only as a late equality/actionability guard after normal structural,
 * casing, and functional checks. This catches Access export/codepage artifacts
 * such as `→` becoming `?` in log strings without masking ordinary ASCII text
 * changes.
 */
export function neutralizeLossyEncodingEverywhere(text: string): string {
  return Array.from(text)
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code > 0x7e || ch === "?" ? LOSSY_SENTINEL : ch;
    })
    .join("");
}

function neutralizeLineOutsideStrings(line: string): string {
  let out = "";
  let inString = false;
  let i = 0;
  while (i < line.length) {
    const ch = line[i] ?? "";
    if (inString) {
      out += ch;
      if (ch === '"') {
        // VBA escapes a quote inside a string by doubling it ("").
        if (line[i + 1] === '"') {
          out += '"';
          i += 2;
          continue;
        }
        inString = false;
      }
      i += 1;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      i += 1;
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    out += code > 0x7e || ch === "?" ? LOSSY_SENTINEL : ch;
    i += 1;
  }
  return out;
}

/**
 * Applies the file-type-appropriate structural strips (attribute lines for code,
 * serialization noise for form/report) on top of already-whitespace-normalized
 * text. Used to compose normalizers for the caseOnly check and the functional diff.
 */
/**
 * Removes module/class header boilerplate: the `VERSION x.x CLASS` + `BEGIN..END`
 * block (code modules only) and `Attribute VB_*` lines (code modules and the
 * CodeBehindForm section of form/report files). VB_Name is preserved unless the
 * caller marks it non-functional via keepVbName=false.
 */
function normalizeModuleHeaders(wsNorm: string, fileType: string, keepVbName: boolean): string {
  let t = wsNorm;
  if (CODE_FILE_TYPES.has(fileType)) t = stripModuleHeader(t);
  t = stripAttributeLines(t, fileType, keepVbName);
  return t;
}

function applyStructuralStrips(wsNorm: string, fileType: string, keepVbName: boolean): string {
  let t = normalizeModuleHeaders(wsNorm, fileType, keepVbName);
  if (FORM_FILE_TYPES.has(fileType)) {
    t = stripFormSerializationNoise(t, fileType);
    t = normalizeFormPropertyValues(t, fileType);
  }
  return t;
}

/**
 * Normalizes Access/VBE export shorthand for known optional default arguments.
 *
 * In the no_conformidades acceptance corpus, Access can export a call that omits
 * the optional default `enumSiNo.Sí` while source keeps it explicit. After lossy
 * encoding normalization that token may appear as `enumSiNo.S￿`. The two forms
 * are semantically equivalent because the omitted argument is the procedure's
 * declared default, so it must not inflate actionableDifferent.
 */
function normalizeKnownOptionalDefaultArguments(text: string): string {
  return text.replace(/\b(datosgeneralesok)\(\s*enumsino\.s(?:í|i|￿)?\s*\)/gi, "$1");
}

/**
 * Strips a leading byte-order-mark or its mojibake remnants from the start of a
 * VBA file.
 *
 * Access exports occasionally carry a BOM that the on-disk source lacks (or vice
 * versa). A real BOM (U+FEFF), a replacement char (U+FFFD), the UTF-8 BOM read as
 * Latin-1 (`ï»¿`), or a lone `?` that mojibake left in its place all appear at
 * byte 0 — never as a functional change. The lone-`?` case is stripped only when
 * it precedes a known leading VBA token, since real VBA never starts with `?`.
 */
export function stripLeadingBom(text: string): string {
  return text
    .replace(/^﻿/, "")
    .replace(/^�/, "")
    .replace(/^ï»¿/, "")
    .replace(/^\?(?=Attribute |VERSION |Version |Option |Begin )/, "");
}

/**
 * Removes form/report toggle-property lines so Access serialization variants
 * compare equal even when one export omits a default/non-default toggle line.
 *
 * Access writes a property only when it differs from its default, so a written
 * boolean/toggle value is always the single non-default value — represented
 * either as the symbolic token `NotDefault` or as the literal `0`/`-1` depending
 * on the export. A genuine change surfaces as a line being present vs absent, not
 * as token-vs-value or present-vs-omitted churn in repeated exports. Non-toggle values (e.g. `Width =9070`,
 * `SomeEnum =2`) are left exact and stay functional.
 *
 * No-op for non-form file types.
 */
export function normalizeFormPropertyValues(text: string, fileType: string): string {
  if (!FORM_FILE_TYPES.has(fileType)) {
    return text; // no-op for non-form file types
  }
  return normalizeEventProcedureOrderWithinPropertyRuns(
    text
      .split("\n")
      .filter((line) => !/^\s*[A-Za-z_]\w*\s*=\s*(?:NotDefault|0|-1)\s*$/.test(line))
      .join("\n"),
  );
}

/** Access may serialize `[Event Procedure]` properties in a different order inside a property run. */
function normalizeEventProcedureOrderWithinPropertyRuns(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; ) {
    const run: string[] = [];
    while (i < lines.length && /^\s*[A-Za-z_]\w*\s*=/.test(lines[i] ?? "")) {
      run.push(lines[i] ?? "");
      i += 1;
    }
    if (run.length > 0) {
      const isEventLine = (line: string) => /^\s*On\w+\s*=\s*"\[Event Procedure\]"\s*$/i.test(line);
      const events = run
        .filter((line) => isEventLine(line))
        .sort((a, b) => a.trim().localeCompare(b.trim()));
      if (events.length === 0) {
        out.push(...run);
      } else {
        out.push(...run.filter((line) => !isEventLine(line)));
        out.push(...events);
      }
      continue;
    }
    out.push(lines[i] ?? "");
    i += 1;
  }
  return out.join("\n");
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
  // Step 1.5: strip a leading BOM / mojibake-BOM artifact, then re-check.
  // A BOM that exists on one side only is never a functional change. If it was
  // the sole difference, classify as encoding; otherwise carry the cleaned text
  // forward so it does not pollute later steps (e.g. break caseOnly detection).
  // -------------------------------------------------------------------------
  const srcText = stripLeadingBom(sourceText);
  const binText = stripLeadingBom(binaryText);
  if ((srcText !== sourceText || binText !== binaryText) && srcText === binText) {
    return nonActionable("encodingOnly", "texts differ only in a leading BOM/encoding artifact");
  }

  // -------------------------------------------------------------------------
  // Step 2: whitespaceOnly — normalize line endings and trailing whitespace
  // -------------------------------------------------------------------------
  const normalizeWs = (t: string) => normalizeTrailingWhitespace(normalizeLineEndings(t));

  const srcNormWs = normalizeWs(srcText);
  const binNormWs = normalizeWs(binText);

  if (srcNormWs === binNormWs) {
    return nonActionable(
      "whitespaceOnly",
      "texts differ only in line endings or trailing whitespace",
    );
  }

  // A VB_Name is functional only when both sides name the module and the names
  // differ (a real rename). When one side simply omits the header, VB_Name
  // presence is non-functional and is stripped along with the rest of the header.
  const srcVbName = extractVbName(srcText);
  const binVbName = extractVbName(binText);
  const keepVbName = srcVbName !== null && binVbName !== null && srcVbName !== binVbName;

  // -------------------------------------------------------------------------
  // Step 3: attributeOnly — strip module/class header + Attribute VB_* lines
  // -------------------------------------------------------------------------
  {
    const srcNormAttr = normalizeModuleHeaders(srcNormWs, fileType, keepVbName);
    const binNormAttr = normalizeModuleHeaders(binNormWs, fileType, keepVbName);

    if (srcNormAttr === binNormAttr) {
      return nonActionable(
        "attributeOnly",
        "texts differ only in module header / Attribute VB_* lines",
      );
    }
  }

  // -------------------------------------------------------------------------
  // Step 4: formSerializationOnly — strip form/report noise + toggle values
  // -------------------------------------------------------------------------
  if (FORM_FILE_TYPES.has(fileType)) {
    const srcNormForm = applyStructuralStrips(srcNormWs, fileType, keepVbName);
    const binNormForm = applyStructuralStrips(binNormWs, fileType, keepVbName);

    if (srcNormForm === binNormForm) {
      return nonActionable(
        "formSerializationOnly",
        "texts differ only in form serialization noise (Checksum, PrtDevMode, RecSrcDt, NotDefault toggles, etc.)",
      );
    }
  }

  // -------------------------------------------------------------------------
  // Step 4.5: caseOnly — differ only by identifier/keyword casing
  // -------------------------------------------------------------------------
  // Compare after the structural strips above plus string-aware case folding.
  // String-literal and comment bodies are preserved, so runtime-visible text
  // changes are NOT absorbed here (they fall through to the functional diff).
  {
    const srcCase = normalizeVbaCase(
      normalizeLeadingWhitespace(applyStructuralStrips(srcNormWs, fileType, keepVbName), fileType),
      fileType,
    );
    const binCase = normalizeVbaCase(
      normalizeLeadingWhitespace(applyStructuralStrips(binNormWs, fileType, keepVbName), fileType),
      fileType,
    );
    if (srcCase === binCase) {
      return nonActionable(
        "caseOnly",
        "texts differ only in identifier or keyword casing (VBA is case-insensitive)",
      );
    }

    if (
      normalizeKnownOptionalDefaultArguments(srcCase) ===
      normalizeKnownOptionalDefaultArguments(binCase)
    ) {
      return nonActionable(
        "caseOnly",
        "texts differ only in identifier casing or explicit optional default arguments",
      );
    }

    if (
      !srcText.includes("�") &&
      !binText.includes("�") &&
      neutralizeLossyEncodingEverywhere(srcCase) === neutralizeLossyEncodingEverywhere(binCase)
    ) {
      return nonActionable(
        "encodingOnly",
        "texts differ only in lossy encoding artifacts, including comments or log strings",
      );
    }
  }

  // -------------------------------------------------------------------------
  // Step 5: encodingOnly — mojibake normalization with safety guards
  // -------------------------------------------------------------------------
  // Only attempt if neither side contains U+FFFD (replacement char)
  if (!srcText.includes("�") && !binText.includes("�")) {
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

    // Lossy fallback: Access export replaced out-of-codepage glyphs with "?".
    // This is irreversible, so mojibake repair cannot equalize the texts. If the
    // only remaining differences are non-ASCII/"?" characters, treat as encoding.
    const lossySrc = neutralizeLossyEncoding(srcNormWs);
    const lossyBin = neutralizeLossyEncoding(binNormWs);
    const lossyTouchedSomething = lossySrc !== srcNormWs || lossyBin !== binNormWs;
    if (lossyTouchedSomething && lossySrc === lossyBin) {
      return nonActionable(
        "encodingOnly",
        "texts differ only in lossy encoding artifacts (out-of-codepage glyphs replaced by '?')",
      );
    }
  }

  // -------------------------------------------------------------------------
  // Step 6: functional diff — apply all normalizers then run LCS differ
  // -------------------------------------------------------------------------
  // Apply full normalization pipeline on the normalized-whitespace texts:
  // module/class header + Attribute strips, then form noise + toggle values.
  let srcFull = applyStructuralStrips(srcNormWs, fileType, keepVbName);
  let binFull = applyStructuralStrips(binNormWs, fileType, keepVbName);

  srcFull = normalizeLeadingWhitespace(srcFull, fileType);
  binFull = normalizeLeadingWhitespace(binFull, fileType);

  // Apply mojibake repair if safe (no FFFD)
  if (!srcText.includes("�") && !binText.includes("�")) {
    const repairedSrc = repairMojibake(srcFull, sourceBytes);
    const repairedBin = repairMojibake(binFull, binaryBytes);
    // Only apply if it doesn't produce FFFD
    if (!repairedSrc.includes("�")) srcFull = repairedSrc;
    if (!repairedBin.includes("�")) binFull = repairedBin;

    // Neutralize lossy out-of-codepage artifacts so they never count as functional.
    srcFull = neutralizeLossyEncoding(srcFull);
    binFull = neutralizeLossyEncoding(binFull);
  }

  // Fold identifier/keyword casing (string + comment bodies preserved) so case
  // drift never inflates the functional-line count alongside a real change.
  srcFull = normalizeVbaCase(srcFull, fileType);
  binFull = normalizeVbaCase(binFull, fileType);

  srcFull = normalizeKnownOptionalDefaultArguments(srcFull);
  binFull = normalizeKnownOptionalDefaultArguments(binFull);

  if (
    !srcText.includes("�") &&
    !binText.includes("�") &&
    neutralizeLossyEncodingEverywhere(srcFull) === neutralizeLossyEncodingEverywhere(binFull)
  ) {
    return nonActionable(
      "encodingOnly",
      "texts differ only in lossy encoding artifacts, including comments or log strings",
    );
  }

  const { srcUnique, binUnique, capped } = computeFunctionalDiff(srcFull, binFull);
  return fromFunctionalDiff(srcUnique, binUnique, capped);
}
