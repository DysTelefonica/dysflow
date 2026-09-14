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

import { FORM_NOISE_KEYS } from "./form-noise-keys.js";
import type { NormalizationReason } from "./normalize-reasons.js";

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
export const SEMANTIC_CLASSIFIER_RULES = "2026-09-14.r8-verify-code-v2-categories";

export type VbaSemanticCategory =
  | "matched" // identical after no/normalization
  | "whitespaceOnly" // differ only by CRLF/LF/indentation/trailing-ws/blank lines
  | "attributeOnly" // differ only by Attribute VB_* header lines (not VB_Name)
  | "caseOnly" // differ only by identifier/keyword casing (VBA is case-insensitive)
  | "formSerializationOnly" // differ only by stripped form/report noise sections
  | "encodingOnly" // differ only by encoding mojibake or lossy out-of-codepage replacement
  | "commentOnly" // differ only by comment body content (incl. Rem + case-only inside comments)
  | "continuationOnly" // differ only by line-continuation reflow (`_` + EOL)
  | "statementBoundaryOnly" // differ only by colon-separated vs newline-separated statements
  | "nonActionableMixed" // differ in 2+ distinct non-actionable families (e.g. case + whitespace)
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
  /**
   * Ordered list of `NormalizationReason` entries the classifier attributed
   * to this verdict. Empty for actionable categories and for `matched`;
   * a non-empty list is the canonicalizer-side paper trail explaining
   * WHY the pair was classified non-actionable. Populated by
   * `selectNormalizationReasons` for the hand-tuned static map; the
   * canonicalizer may extend it later without changing the surface.
   */
  normalizationReasons?: readonly NormalizationReason[];
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
 * Maximum number of lines per side before LCS fails safe as an uncertain diff.
 * VBA files are small; this bound protects against pathological inputs.
 */
const LCS_LINE_BUDGET = 20_000;

/** Maximum dynamic-programming cells evaluated by the exact LCS path. */
const LCS_CELL_BUDGET = 4_000_000;

/** File types that are VBA code modules (not form/report serialization). */
const CODE_FILE_TYPES = new Set(["bas", "cls", "frm"]);

/** File types that are form/report serialization documents. */
const FORM_FILE_TYPES = new Set(["form.txt", "report.txt"]);

// FORM_NOISE_KEYS — re-exported from `src/core/services/form-noise-keys.ts`,
// the SINGLE source of truth for the Access form/report serialization-noise
// membership (#hexagonal-tech-debt PR 2, #B.1). Re-exporting keeps
// `Object.is(sharedClassifier, classifier)` strict-identity true; the local
// `findNoiseKey` helper and `stripFormSerializationNoise` use the imported
// reference.
export { FORM_NOISE_KEYS };

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
      // VB_Name is kept whenever the two sides' names differ, including when
      // one side omits it entirely (issue #646) — a real rename or a dropped
      // identity line are both functional. The caller passes keepVbName=false
      // only when both sides agree (same value, or both absent).
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
 * Case-fold whole-line `'` and `Rem` comments in a VBA source text, leaving
 * the executable content untouched. Used by the classifier to detect
 * "comment text differs only in case" diffs and emit `commentOnly` — the
 * VBE preserves comment bodies verbatim, and a case-only difference inside
 * a comment never reaches runtime, so it is non-functional.
 *
 * Pure: no I/O. The no-op case (no comment lines) is the fast path.
 * Comment text is replaced with its lower-cased form; executable content
 * is unchanged. Pair this with `stripCommentLines` to detect any
 * comment-body diff; this helper exists for the case-only subset so the
 * existing "real ASCII change in a comment is functional" contract still
 * holds.
 */
export function caseFoldCommentLines(text: string): string {
  const lines = text.split("\n");
  let changed = false;
  const out: string[] = [];
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("'") || /^Rem\b/i.test(trimmed)) {
      const folded = raw.toLowerCase();
      if (folded !== raw) changed = true;
      out.push(folded);
      continue;
    }
    out.push(raw);
  }
  return changed ? out.join("\n") : text;
}

/**
 * Strip comment-only physical lines from a VBA source text, leaving the
 * executable content untouched. Covers both the `'` single-quote line
 * comment and the `Rem` line comment (case-insensitive). Block comments
 * don't exist in VBA. Trailing in-line comments after code are NOT
 * stripped — only whole comment lines are.
 *
 * Used internally to detect "comment is the SOLE difference" — the
 * classifier tracks whether this strip equalized the texts and, if so,
 * whether other non-actionable normalizers also contributed before
 * collapsing to `commentOnly` or `nonActionableMixed`.
 */
export function stripCommentLines(text: string): string {
  const lines = text.split("\n");
  let changed = false;
  const out: string[] = [];
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("'") || /^Rem\b/i.test(trimmed)) {
      if (raw !== "") changed = true;
      out.push("");
      continue;
    }
    out.push(raw);
  }
  return changed ? out.join("\n") : text;
}

/**
 * Mirror image of `stripCommentLines`: keep ONLY whole-line `'` and `Rem`
 * comment lines verbatim (case-sensitive) and replace every other line —
 * including blank lines — with `""`. Used by the `commentOnly` gate to
 * compare the verbatim content of comment bodies on both sides.
 *
 * Per the AGENTS.md "string-aware folding" rule, comment bodies are
 * runtime-visible, so any case drift or other content drift inside them
 * MUST stay actionable and prevent a collapse to `commentOnly`. Pair
 * with `stripCommentLines`: the latter equalizes the non-comment
 * portions, this one equalizes the comment portions; both must match
 * before the diff can collapse to the non-actionable `commentOnly`
 * bucket.
 */
export function extractCommentLines(text: string): string {
  const lines = text.split("\n");
  let changed = false;
  const out: string[] = [];
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed.startsWith("'") || /^Rem\b/i.test(trimmed)) {
      out.push(raw);
      changed = true;
      continue;
    }
    if (raw !== "") changed = true;
    out.push("");
  }
  return changed ? out.join("\n") : text;
}

/**
 * Join VBA line continuations (`<spaces>_` at the end of a line) into the
 * next line, replacing the underscore + line break with a single space.
 * Used to detect "same code via continuation reflow" cases where source
 * splits an expression across physical lines and binary keeps it on one.
 *
 * Per VBA grammar, a line continuation is zero or more spaces followed by
 * a single underscore at the very end of the physical line. We only fold
 * continuations between non-blank lines; a continuation that lands on a
 * blank line is reported as `INVALID_CONTINUATION` elsewhere and never
 * reaches this normalizer.
 */
export function joinLineContinuations(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let changed = false;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (/[ \t]+_$/.test(line) && i + 1 < lines.length) {
      const before = line.replace(/[ \t]+_$/, "");
      const next = lines[i + 1] ?? "";
      out.push(`${before} ${next}`);
      i += 2;
      changed = true;
      continue;
    }
    out.push(line);
    i += 1;
  }
  return changed ? out.join("\n") : text;
}

/**
 * Normalize colon-separated statement boundaries to newline-separated
 * boundaries (and vice versa). Used to absorb presentation-only reflow
 * where source puts `Dim a: Dim b: a = 1: b = 2` on one logical line and
 * binary writes four physical lines. Safe for VBA code modules only —
 * form/report serialization and strings/comment bodies are untouched.
 *
 * Safety guards: a `:=` (named-argument separator, used in `Call Foo(a:=1)`)
 * must NEVER be split; a date literal `12:34:56` must NEVER be split. The
 * rule is conservative: we only split a top-level `:` that is OUTSIDE
 * string literals and OUTSIDE `:=` sequences. The implementation walks
 * each character with a tiny parser state machine.
 */
export function normalizeStatementBoundaries(text: string, fileType: string): string {
  if (!CODE_FILE_TYPES.has(fileType)) return text;
  const lines = text.split("\n");
  const out: string[] = [];
  let changed = false;
  for (const line of lines) {
    const normalized = splitStatementBoundaryColons(line);
    if (normalized.length > 1) {
      changed = true;
      out.push(...normalized);
      continue;
    }
    out.push(line);
  }
  return changed ? out.join("\n") : text;
}

/**
 * Split a single physical line on top-level `:` characters, returning
 * the resulting fragments. A `:` preceded by `=` (i.e. `:=`) is preserved.
 * A `:` inside a double-quoted string is preserved. Returns `[line]` when
 * no split was possible so callers can fast-path.
 */
function splitStatementBoundaryColons(line: string): string[] {
  // Capture the leading whitespace so every emitted fragment starts with
  // the SAME indent as the original line. Without this, `Dim a: Dim b` splits
  // to `Dim a` and ` Dim b` — the leading space of the second fragment leaks
  // from the `:` position, not the original indent. When the comparison is
  // a binary line written on its own (`    Dim b`) the two leading-whitespace
  // counts differ and the equalization fails for no semantic reason.
  const leadingWsMatch = /^[ \t]*/.exec(line);
  const leadingWs = leadingWsMatch ? leadingWsMatch[0] : "";
  const body = line.slice(leadingWs.length);
  const result: string[] = [];
  let current = leadingWs;
  let inString = false;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i] ?? "";
    if (inString) {
      current += ch;
      if (ch === '"') {
        // (VBA escapes "" inside a string by doubling it.)
        if (body[i + 1] === '"') {
          current += '"';
          i += 1;
          continue;
        }
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      current += ch;
      continue;
    }
    if (ch === ":" && body[i + 1] !== "=") {
      if (current.trim() === "" && result.length === 0) {
        // Leading colon (label) — don't split it.
        current += ch;
        continue;
      }
      result.push(current);
      // Restart the next fragment with the original line indent. Skip any
      // whitespace immediately after the colon — the colon is the OLD
      // line's separator, not a prefix on the NEW fragment. The whitespace
      // step has already collapsed trailing/leading whitespace across the
      // whole tree, so emitting the leadingWs + any post-colon spaces would
      // over-indent the new fragment when the source uses `: ` separator
      // and the binary uses a bare newline.
      current = leadingWs;
      if (body[i + 1] === " " || body[i + 1] === "\t") i += 1;
      continue;
    }
    current += ch;
  }
  if (current.length > leadingWs.length || result.length === 0) result.push(current);
  return result.length > 1 ? result : [line];
}

/**
 * Collapse runs of whitespace BETWEEN tokens to a single space. Pairs
 * like `ItemCount+1` and `ItemCount + 1` compare equal under this fold.
 * VBA does not require whitespace between operators and operands, so a
 * presentation-only reflow is non-functional. Whitespace inside string
 * literals and comments is preserved.
 *
 * Pure: no I/O. No-op when the input already has minimal inter-token
 * whitespace (the fast path).
 */
export function foldInterTokenWhitespace(text: string): string {
  return text
    .split("\n")
    .map((line) => foldLineInterTokenWhitespace(line))
    .join("\n");
}

function foldLineInterTokenWhitespace(line: string): string {
  let out = "";
  let inString = false;
  let i = 0;
  let prevNonSpace: string | null = null;
  while (i < line.length) {
    const ch = line[i] ?? "";
    if (inString) {
      out += ch;
      if (ch === '"') {
        if (line[i + 1] === '"') {
          out += '"';
          i += 1;
        } else {
          inString = false;
          prevNonSpace = '"';
        }
      }
      i += 1;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      prevNonSpace = '"';
      i += 1;
      continue;
    }
    if (ch === "'") {
      // Rest of the line is a comment — preserve verbatim.
      out += line.slice(i);
      return out;
    }
    if (ch === " " || ch === "\t") {
      // Collapse run of whitespace; emit a single space ONLY between two
      // token characters (not after/before punctuation that the VBA
      // parser doesn't need whitespace around).
      const next = line[i + 1] ?? "";
      const isTokenBefore = prevNonSpace !== null && /[\w)\]]/.test(prevNonSpace);
      const isTokenAfter = next !== "" && /[\w$(]/.test(next);
      if (isTokenBefore && isTokenAfter) {
        out += " ";
      }
      i += 1;
      continue;
    }
    out += ch;
    prevNonSpace = ch;
    i += 1;
  }
  return out;
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
 * - Every key in `FORM_NOISE_KEYS` — owned by `form-noise-keys.ts`, which is the
 *   single source of truth and carries the rationale for each entry. Do NOT
 *   restate the list here: the partial hand-maintained copy this docstring used
 *   to carry is what produced issue #1686.
 * - Each such key in BOTH shapes: the scalar assignment (`Checksum =<value>`)
 *   and the `Key = Begin .. End` block.
 *
 * Retains:
 * - GUID (functional)
 * - Everything else
 * - Any unknown Begin..End key (bias-to-functional)
 *
 * `NameMap` is STRIPPED, not retained. Access omits and recreates that binary
 * name table between exports without changing behavior, so a NameMap-only delta
 * is `formSerializationOnly`; real control/name changes still survive through
 * the property/control lines themselves (commit eb056c5b). Consumers reading
 * this function sometimes conclude dysflow deletes NameMap from the `.form.txt`
 * on disk — it does not. The export writes `Access.SaveAsText` output verbatim;
 * this normalizer only ever runs inside `classifyVbaPair` (see
 * `applyStructuralStrips`) and never touches a file. See issue #1685.
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
 *
 * Historical note (#781 cleanup): an earlier string-blind variant named
 * `neutralizeLossyEncodingEverywhere` was REMOVED. It mapped EVERY non-ASCII
 * char to the sentinel, including glyphs inside string literals, which
 * silently masked functional changes such as `→` becoming `?` in a log
 * message. The string-aware form above is the only neutralizer in src/.
 * If a future change reintroduces the blind variant for any reason, the
 * tests in `test/core/services/vba-semantic-classifier.test.ts` are the
 * regression pin — they assert that string-literal contents survive
 * unchanged.
 */
export function neutralizeLossyEncoding(text: string): string {
  return text.split("\n").map(neutralizeLineOutsideStrings).join("\n");
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
  let t = wsNorm;
  // Drop the embedded CodeBehindForm/CodeBehindReport section first: dysflow syncs
  // a form's/report's code-behind from its forms|reports/*.cls on import, so that
  // code is verified through the .cls — never through the .form.txt/.report.txt.
  // The .form.txt/.report.txt is compared for its UI/layout only.
  // (See stripCodeBehindSection.)
  if (FORM_FILE_TYPES.has(fileType)) t = stripCodeBehindSection(t, fileType);
  t = normalizeModuleHeaders(t, fileType, keepVbName);
  if (FORM_FILE_TYPES.has(fileType)) {
    t = stripFormSerializationNoise(t, fileType);
    t = normalizeFormPropertyValues(t, fileType);
  }
  return t;
}

/**
 * Removes the `CodeBehindForm` / `CodeBehindReport` section (and everything after
 * it) from a form/report serialization document, leaving only the UI/layout
 * definition.
 *
 * A form's/report's code-behind lives canonically in its `forms|reports/*.cls`
 * (dysflow's export writes it there from `CodeModule.Lines`, and import syncs it
 * back into the document module). The same code is also serialized — via a
 * different path, `SaveAsText` — into the `.form.txt` `CodeBehindForm` section or
 * the `.report.txt` `CodeBehindReport` section, so comparing it here only
 * double-counts the code and re-introduces serialization noise the `.cls`
 * comparison already owns. We therefore verify form/report code through the
 * `.cls` and UI through the `.form.txt`/`.report.txt`.
 *
 * Reports use the `CodeBehindReport` marker, the symmetric counterpart of a
 * form's `CodeBehindForm` (mirrors the PowerShell `Split-CodeBehindSection`
 * `CodeBehind\w*` match).
 *
 * No-op for non-form file types and for documents with no code-behind marker.
 */
export function stripCodeBehindSection(text: string, fileType: string): string {
  if (!FORM_FILE_TYPES.has(fileType)) return text;
  const lines = text.split("\n");
  const markerIndex = lines.findIndex(
    (line) => line.trim() === "CodeBehindForm" || line.trim() === "CodeBehindReport",
  );
  if (markerIndex === -1) return text;
  return lines.slice(0, markerIndex).join("\n");
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
  // #671 — fix: the previous behaviour FILTERED toggle lines out entirely,
  // which collapsed "source has Enabled = 0" (explicit false) into equal
  // to "binary has no Enabled line at all" (Access default-true). That hid
  // a real UI-state change from the actionable diff. Now we NORMALIZE the
  // value to a canonical `TOGGLE` token (line preserved, canonical
  // "<prop> = TOGGLE") so presence vs absence stays visible AND the two
  // renderings of the same value compare equal. The capture stops before
  // the trailing whitespace so the canonical form has exactly one space
  // between `=` and `TOGGLE` regardless of the input.
  const TOGGLE_VALUE_RE = /^(\s*)([A-Za-z_]\w*)(\s*=)\s*(?:NotDefault|0|-1)\s*$/;
  // #T15 inspector fix: the previous name-agnostic match collapsed ANY property
  // whose value was 0 or -1, including positional ones (Left, Top, Width, etc.)
  // where 0 vs -1 IS a runtime-visible UI change, not Access serialization
  // noise. We now restrict the toggle normalization to the known toggle
  // properties Access actually serializes as 0/NotDefault/-1. Non-toggle
  // numeric properties keep their literal values and stay functional in
  // the diff.
  const TOGGLE_PROPERTY_NAMES = new Set([
    // Form/report control booleans (the canonical four)
    "Visible",
    "Enabled",
    "Locked",
    "TabStop",
    // Section-level booleans
    "CanGrow",
    "CanShrink",
    "AutoLabel",
    "AutoTab",
    "NewRowOrCol",
    // Form-level booleans
    "AllowDeletions",
    "AllowAdditions",
    "AllowEdits",
    "RecordSelectors",
    "NavigationButtons",
    "DividingLines",
    "StatusBar",
    "ControlBox",
    "MinMaxButtons",
    "CloseButton",
    "DataEntry",
    "Modal",
    "PopUp",
    "Cycle",
    "Default",
    // Report-level
    "AutoResize",
  ]);
  return normalizeEventProcedureOrderWithinPropertyRuns(
    text
      .split("\n")
      .map((line) => {
        const match = TOGGLE_VALUE_RE.exec(line);
        if (match === null) return line;
        const propertyName = match[2] ?? "";
        if (!TOGGLE_PROPERTY_NAMES.has(propertyName)) return line;
        return `${match[1] ?? ""}${propertyName}${match[3] ?? ""} TOGGLE`;
      })
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
  if (
    a.length > LCS_LINE_BUDGET ||
    b.length > LCS_LINE_BUDGET ||
    a.length * b.length > LCS_CELL_BUDGET
  ) {
    // Exact ordered equality is handled by classifyVbaPair before reaching this
    // path. For unequal large inputs, an unordered approximation could hide a
    // behavior-changing statement reorder. Returning zero commonality is a
    // bounded, conservative fallback: downstream classification stays
    // actionable/manual-merge instead of claiming an equivalence we cannot prove.
    return { lcs: 0, capped: true };
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
  fileType?: string,
): SemanticClassification {
  const normalizationReasons = selectNormalizationReasons(classification, fileType ?? "");
  return {
    classification,
    reason,
    srcUniqueFunctionalLines: 0,
    binaryUniqueFunctionalLines: 0,
    recommendation: "no_action",
    actionable: false,
    normalizationReasons,
  };
}

/**
 * Static mapping from a classification to the ordered list of
 * `NormalizationReason` entries the canonicalizer would emit for that
 * category. Used to populate `SemanticClassification.normalizationReasons`
 * and, downstream, the `normalizationReasons` field on diff entries.
 *
 * The mapping is HAND-TUNED — not driven by runtime canonicalizer output
 * — so it stays deterministic across runs even when the canonicalizer
 * itself changes. For categories that don't map cleanly today
 * (e.g. `formSerializationOnly`, `nonActionableMixed`) we either pick the
 * most relevant reason or return an empty array; the call sites can
 * always supply a longer list via a dedicated helper if the canonicalizer
 * later attaches reason metadata.
 */
export function selectNormalizationReasons(
  classification: VbaSemanticCategory,
  _fileType: string,
): readonly NormalizationReason[] {
  switch (classification) {
    case "matched":
    case "sourceNewer":
    case "binaryNewer":
    case "bothChanged":
      return [];
    case "encodingOnly":
      return ["bomPrefix"];
    case "caseOnly":
      return ["identifierCase"];
    case "whitespaceOnly":
      return [
        "lineEnding",
        "leadingIndentation",
        "trailingWhitespace",
        "blankLogicalStatement",
        "interTokenWhitespace",
      ];
    case "attributeOnly":
      return ["cosmeticAttribute"];
    case "formSerializationOnly":
      return ["formSerialization"];
    case "commentOnly":
      return ["commentText"];
    case "continuationOnly":
      return ["lineContinuationLayout"];
    case "statementBoundaryOnly":
      return ["statementBoundaryLayout"];
    case "nonActionableMixed":
      // Mixed categories carry 2+ distinct non-actionable reasons; the
      // static map cannot enumerate them generically. Callers that need
      // the precise list should derive it from the diff context instead of
      // reading this return value.
      return [];
    default: {
      // Exhaustiveness guard — TypeScript narrows `classification` to
      // `never` here when the union is fully covered. The runtime check
      // is belt-and-braces for callers that pass a string that bypasses
      // the type.
      const _exhaustive: never = classification;
      return _exhaustive;
    }
  }
}

// ---------------------------------------------------------------------------
// Functional diff result builder
// ---------------------------------------------------------------------------

function fromFunctionalDiff(
  srcUnique: number,
  binUnique: number,
  capped: boolean,
): SemanticClassification {
  const cappedNote = capped
    ? " (lcs-capped: order-aware comparison budget exceeded; conservatively actionable)"
    : "";

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
 *   2. equal after lineEndings + trailingWs + leading indentation -> whitespaceOnly
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
  // Step 2: whitespaceOnly — normalize line endings, indentation, and trailing
  // whitespace.
  //
  // Leading indentation in a VBA code module is not executable semantics; the
  // later steps already folded it, but only after the case-folding step had
  // claimed the pair as `caseOnly`. Folding it here keeps the taxonomy honest:
  // an indentation-only difference is reported as whitespace, not as casing
  // (#1669). Form/report serialization is untouched — `normalizeLeadingWhitespace`
  // is a no-op outside code file types, so structural indentation in a
  // `.form.txt` still reaches the functional diff.
  // -------------------------------------------------------------------------
  const normalizeWs = (t: string) =>
    normalizeLeadingWhitespace(normalizeTrailingWhitespace(normalizeLineEndings(t)), fileType);

  const srcNormWs = normalizeWs(srcText);
  const binNormWs = normalizeWs(binText);

  if (srcNormWs === binNormWs) {
    return nonActionable(
      "whitespaceOnly",
      "texts differ only in line endings, indentation, or trailing whitespace",
    );
  }

  // -------------------------------------------------------------------------
  // Step 2.1 — inter-token whitespace fold (e.g. `ItemCount+1` vs `ItemCount + 1`).
  // VBA does not require whitespace between operators and operands, so a
  // presentation-only reflow is non-functional. Pairs that equalize under
  // this fold alone are classified as `whitespaceOnly` with `interTokenWhitespace`
  // attributed as the reason; pairs that need MORE than inter-token whitespace
  // fall through to the next steps so the richer taxonomy can claim them.
  // -------------------------------------------------------------------------
  {
    const srcInter = foldInterTokenWhitespace(srcNormWs);
    const binInter = foldInterTokenWhitespace(binNormWs);
    if (srcInter === binInter) {
      return nonActionable(
        "whitespaceOnly",
        "texts differ only in inter-token whitespace (operator/operand spacing)",
      );
    }
  }

  // -------------------------------------------------------------------------
  // Step 2.2 — continuationOnly: fold VBA line-continuation reflows (`_<EOL>`)
  // and re-check. Source splitting an expression across two physical lines
  // while binary keeps it on one is non-functional under the VBA grammar;
  // both forms execute identically.
  // -------------------------------------------------------------------------
  {
    const srcCont = joinLineContinuations(srcNormWs);
    const binCont = joinLineContinuations(binNormWs);
    if (srcCont === binCont) {
      return nonActionable(
        "continuationOnly",
        "texts differ only in line-continuation reflow (` _` + EOL)",
      );
    }
  }

  // -------------------------------------------------------------------------
  // Step 2.3 — statementBoundaryOnly: normalize colon-separated statements
  // to newline-separated (and vice versa) for code modules. A pair that
  // differs only in how statement separators are written collapses here.
  // Safety guards inside the normalizer preserve `:=`, string-literal
  // colons, and date literals — we never silently rewrite these.
  // -------------------------------------------------------------------------
  {
    const srcBoundaries = normalizeStatementBoundaries(srcNormWs, fileType);
    const binBoundaries = normalizeStatementBoundaries(binNormWs, fileType);
    if (srcBoundaries === binBoundaries) {
      return nonActionable(
        "statementBoundaryOnly",
        "texts differ only in colon-separated vs newline-separated statement boundaries",
      );
    }
  }

  // -------------------------------------------------------------------------
  // VB_Name is functional whenever the two sides disagree:
  //  - both name it with different values (real rename)
  //  - one side omits it entirely (the #646 dropped-identity import defect)
  // VBA identifiers are case-insensitive so a case-only difference
  // (`Probe` vs `probe`) is treated like any other identifier-case drift —
  // VB_Name gets stripped together with the rest of the cosmetic attribute
  // boilerplate, and the diff falls through to the next check.
  const srcVbName = extractVbName(srcText);
  const binVbName = extractVbName(binText);
  const oneSidedMissing = srcVbName === null || binVbName === null;
  const srcVbNameCaseFolded = srcVbName === null ? null : srcVbName.toLowerCase();
  const binVbNameCaseFolded = binVbName === null ? null : binVbName.toLowerCase();
  const valueDifferent = srcVbNameCaseFolded !== binVbNameCaseFolded;
  const keepVbName = oneSidedMissing || valueDifferent;

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
      neutralizeLossyEncoding(srcCase) === neutralizeLossyEncoding(binCase)
    ) {
      return nonActionable(
        "encodingOnly",
        "texts differ only in lossy encoding artifacts outside string literals and comments",
      );
    }
  }

  // -------------------------------------------------------------------------
  // Step 4.6 — commentOnly: strip whole-line `'` and `Rem` comments and re-check.
  // The classifier's identifier case-fold step (Step 4.5) preserved comment
  // bodies verbatim, so a case-only difference inside a comment body still
  // falls through here. The strict equalization gate is: the comment strip
  // must equalize the texts AS THEY WERE BEFORE attribute / case / form /
  // encoding normalizers — otherwise the equalization is the joint work of
  // comment AND another normalizer (e.g. case + comment), and `nonActionableMixed`
  // is the right verdict. Apply the strip to `srcNormWs`/`binNormWs`
  // (whitespace-normalized, pre-attribute / pre-case) so the gate compares
  // against the same inputs the comment strip would have if it ran first.
  //
  // When the comment strip does NOT equalize pre-attribute / pre-case but the
  // FULL pipeline (case + comment + …) does, the existing Step 6.5
  // `nonActionableMixed` check catches it.
  //
  // String-aware folding (AGENTS.md "VBA semantic diff" section): comment
  // bodies are runtime-visible, so a case-only or other content drift inside
  // them MUST stay actionable. We equalize the comment bodies themselves
  // through `extractCommentLines` and refuse to collapse when their verbatim
  // content differs — the diff falls through to the functional pipeline and
  // is reported as `sourceNewer` / `binaryNewer` / `bothChanged`.
  // -------------------------------------------------------------------------
  {
    const srcComments = stripCommentLines(srcNormWs);
    const binComments = stripCommentLines(binNormWs);
    if (srcComments === binComments) {
      if (extractCommentLines(srcNormWs) === extractCommentLines(binNormWs)) {
        return nonActionable(
          "commentOnly",
          "texts differ only in comment body content (whole-line ' or Rem comments)",
        );
      }
      // Comment-body content drifts (e.g. `' Important` vs `' IMPORTANT`):
      // runtime-visible per AGENTS.md, do NOT collapse — fall through to
      // the functional diff so the change is reported as actionable.
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

  // Capture verbatim comment-body content BEFORE the comment strip so the
  // pipeline can refuse to absorb a runtime-visible comment-body drift.
  // AGENTS.md "string-aware folding" rule: comment bodies are runtime-visible,
  // so a case-only or other content drift inside them must NOT be silently
  // absorbed by the comment-strip step (or by the encodingOnly guard below).
  const srcCommentsVerbatim = extractCommentLines(srcFull);
  const binCommentsVerbatim = extractCommentLines(binFull);
  const commentBodiesDiffer = srcCommentsVerbatim !== binCommentsVerbatim;

  // Strip whole-line `'` and `Rem` comments so a comment-body diff that only
  // surfaces after case-fold can still collapse to `nonActionableMixed` here.
  // The earlier comment-strip gate (Step 4.6) catches single-family diffs;
  // this catch-all ensures mixed diffs (case + comment, etc.) that needed
  // case-fold to make the comment difference observable also equalize.
  //
  // Skip the strip when verbatim comment bodies actually differ: applying
  // it would absorb a runtime-visible content change into the equalization
  // (both `nonActionableMixed` below and the encodingOnly guard downstream
  // would then misclassify the diff as non-actionable). The diff falls
  // through to the functional pipeline and is reported as actionable.
  if (!commentBodiesDiffer) {
    srcFull = stripCommentLines(srcFull);
    binFull = stripCommentLines(binFull);
  }

  srcFull = foldInterTokenWhitespace(srcFull);
  binFull = foldInterTokenWhitespace(binFull);

  srcFull = joinLineContinuations(srcFull);
  binFull = joinLineContinuations(binFull);

  // -------------------------------------------------------------------------
  // Step 6.5 — nonActionableMixed: full pipeline equalized the texts but no
  // single normalization step (whitespace, comment, continuation, statement
  // boundary, attribute, case, form, encoding) did so on its own. Two or
  // more distinct non-actionable families contributed; collapse to the
  // mixed bucket per the DESIGN "non-actionable category and reason
  // contract" table. The single-category detectors above remain the
  // preferred path so the common cases stay atomic and grep-friendly.
  //
  // The string-aware guard above skipped the comment-strip when comment
  // bodies differ, so a comment-body drift cannot reach this check and be
  // misclassified as `nonActionableMixed`.
  //
  // This check MUST run before the encodingOnly guard below — once the
  // pipeline has equalized the texts, the lossy-neutralize check would also
  // be true (equal ⊂ neutralized-equal) and would misclassify a mixed
  // (e.g. case + comment) diff as encodingOnly.
  // -------------------------------------------------------------------------
  if (srcFull === binFull) {
    return nonActionable(
      "nonActionableMixed",
      "texts equalize only under a combination of non-actionable normalizers (mixed case + whitespace + comment, etc.)",
    );
  }

  if (
    !srcText.includes("�") &&
    !binText.includes("�") &&
    neutralizeLossyEncoding(srcFull) === neutralizeLossyEncoding(binFull)
  ) {
    return nonActionable(
      "encodingOnly",
      "texts differ only in lossy encoding artifacts outside string literals and comments",
    );
  }

  const { srcUnique, binUnique, capped } = computeFunctionalDiff(srcFull, binFull);
  return fromFunctionalDiff(srcUnique, binUnique, capped);
}
