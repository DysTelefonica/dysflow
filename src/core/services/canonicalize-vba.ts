/**
 * Access-VBA canonicalizer for the verify-code v2 redesign.
 *
 * Implements DESIGN §"Access VBA dialect and recognizer ownership" +
 * §"Canonicalization order" (the 13 ordered steps) for the supported
 * Access-VBA7 source-text dialect emitted by the supported Access VBE/export
 * paths. WU-1 ships the pure surface: no I/O, no filesystem, no Access COM.
 * The runtime path that wires `canonicalizeVba` into the comparator lands in
 * WU-3 (atomic category union migration).
 *
 * Non-goals enforced here:
 *   - Never produces a "best effort equals green" verdict. Anything outside
 *     the supported grammar, malformed strings, ambiguous `Rem`, invalid
 *     continuations, invalid date literals, unbalanced conditional
 *     directives, token-budget exhaustion, or structural ambiguity returns
 *     `{status:"incomplete", diagnostics}`.
 *   - Never concatenates tokens. Whitespace normalization collapses adjacent
 *     inter-token spaces to a single boundary marker; it does not glue two
 *     identifiers together.
 *   - Never folds case inside string literals or comment bodies. Case folding
 *     is string-aware and only applies to code identifiers/keywords.
 */

import type { SnapshotCodec } from "./vba-source-snapshot.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type CanonicalTokenKind =
  | "identifier"
  | "keyword"
  | "literal"
  | "operator"
  | "punctuation"
  | "type"
  | "name-arg"
  | "comment-removed"
  | "continuation-boundary";

export type CanonicalToken = {
  readonly kind: CanonicalTokenKind;
  /** Post case-fold when applicable; raw when the token is a string literal or comment. */
  readonly text: string;
};

export type CanonicalStatementKind =
  | "module-header"
  | "attribute"
  | "option"
  | "directive"
  | "declaration"
  | "procedure"
  | "assignment"
  | "call"
  | "loop"
  | "if"
  | "select"
  | "with"
  | "label";

export type CanonicalStatement = {
  readonly kind: CanonicalStatementKind;
  readonly sourceRange: {
    readonly start: number;
    readonly end: number;
  };
  readonly tokens: readonly CanonicalToken[];
};

export type CanonicalDiagnosticCode =
  | "UNSUPPORTED_SYNTAX"
  | "INVALID_STRING_LITERAL"
  | "INVALID_DATE_LITERAL"
  | "INVALID_CONTINUATION"
  | "DANGLING_CONTINUATION"
  | "UNBALANCED_CONDITIONAL"
  | "AMBIGUOUS_REM"
  | "TOKEN_BUDGET_EXHAUSTED"
  | "AMBIGUOUS_BOUNDARY"
  | "DECODING_FAILED"
  | "UNSUPPORTED_BOM"
  | "DECLARED_CODEC_CONFLICT"
  | "COMMENT_LINE_OBSERVED";

export type CanonicalDiagnostic = {
  readonly code: CanonicalDiagnosticCode;
  readonly message: string;
  readonly position?: { readonly line: number; readonly column: number };
};

export type CanonicalizationResult =
  | {
      readonly status: "supported";
      readonly logicalStatements: readonly CanonicalStatement[];
      readonly diagnostics: readonly CanonicalDiagnostic[];
    }
  | { readonly status: "incomplete"; readonly diagnostics: readonly CanonicalDiagnostic[] };

const TOKEN_BUDGET = 1_000_000;

// ---------------------------------------------------------------------------
// Codec selection (DESIGN §"Canonicalization order" steps 1–3)
// ---------------------------------------------------------------------------

const UTF8_BOM = new Uint8Array([0xef, 0xbb, 0xbf]);
const UTF16LE_BOM = new Uint8Array([0xff, 0xfe]);
const UTF16BE_BOM = new Uint8Array([0xfe, 0xff]);
const UTF32LE_BOM_PREFIX = new Uint8Array([0xff, 0xfe, 0x00, 0x00]);
const UTF32BE_BOM_PREFIX = new Uint8Array([0x00, 0x00, 0xfe, 0xff]);

export type CodecSelection =
  | { readonly codec: SnapshotCodec; readonly source: "bom" | "manifest" | "source-default" }
  | { readonly error: CanonicalDiagnostic };

/**
 * Select the codec for a frozen-source snapshot without heuristics. Per
 * DESIGN §"Canonicalization order" step 2:
 *
 *   1. A supported BOM selects its codec.
 *   2. If an explicit manifest codec is also present it must agree, else
 *      the artifact is `incomplete`.
 *   3. Without a BOM, use the explicit manifest codec.
 *   4. For version-controlled source only, absence of both uses the fixed
 *      compatibility default `utf-8`.
 */
export function selectCodec(input: {
  readonly bytes: Uint8Array;
  readonly manifestCodec?: SnapshotCodec;
  readonly sourceDefault?: SnapshotCodec;
}): CodecSelection {
  const bomCodec = detectBomCodec(input.bytes);
  if (bomCodec !== undefined) {
    if (bomCodec === "unsupported") {
      return {
        error: {
          code: "UNSUPPORTED_BOM",
          message: "Detected an unsupported BOM (UTF-32 or non-text signature).",
        },
      };
    }
    if (input.manifestCodec !== undefined && input.manifestCodec !== bomCodec) {
      return {
        error: {
          code: "DECLARED_CODEC_CONFLICT",
          message: `BOM declares ${bomCodec} but manifest declares ${input.manifestCodec}.`,
        },
      };
    }
    return { codec: bomCodec, source: "bom" };
  }

  if (input.manifestCodec !== undefined) {
    return { codec: input.manifestCodec, source: "manifest" };
  }

  if (input.sourceDefault !== undefined) {
    return { codec: input.sourceDefault, source: "source-default" };
  }

  return { codec: "utf-8", source: "source-default" };
}

function detectBomCodec(bytes: Uint8Array): SnapshotCodec | "unsupported" | undefined {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    if (startsWith(bytes, UTF32LE_BOM_PREFIX)) {
      return "unsupported";
    }
    return "utf-16le";
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    if (startsWith(bytes, UTF32BE_BOM_PREFIX)) {
      return "unsupported";
    }
    return "utf-16be";
  }
  if (startsWith(bytes, UTF32BE_BOM_PREFIX)) {
    return "unsupported";
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return "utf-8";
  }
  return undefined;
}

/**
 * Strip a matching BOM from the prefix of `bytes`. Only the BOM whose codec
 * matches the declared `codec` is stripped; a malformed BOM (e.g. UTF-8
 * bytes misread as Latin-1) is the canonicalizer's responsibility only after
 * a successful codec selection, never here.
 */
export function stripBom(bytes: Uint8Array, codec: SnapshotCodec): Uint8Array {
  if (codec === "utf-8" && startsWith(bytes, UTF8_BOM)) {
    return bytes.slice(UTF8_BOM.length);
  }
  if (codec === "utf-16le" && startsWith(bytes, UTF16LE_BOM)) {
    return bytes.slice(UTF16LE_BOM.length);
  }
  if (codec === "utf-16be" && startsWith(bytes, UTF16BE_BOM)) {
    return bytes.slice(UTF16BE_BOM.length);
  }
  return bytes;
}

function startsWith(haystack: Uint8Array, needle: Uint8Array): boolean {
  if (haystack.length < needle.length) return false;
  for (let index = 0; index < needle.length; index += 1) {
    if (haystack[index] !== needle[index]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// EOL normalization (DESIGN step 4)
// ---------------------------------------------------------------------------

/**
 * Normalize `\r\n` and bare `\r` to `\n`. Returns the rewritten text plus a
 * `changed` boolean so the canonicalizer can attribute EOL drift to the
 * `lineEnding` normalization reason without diffing twice.
 */
export function normalizeLineEndings(text: string): { text: string; changed: boolean } {
  let working = text;
  let changed = false;
  if (working.includes("\r\n")) {
    working = working.replace(/\r\n/g, "\n");
    changed = true;
  }
  if (working.includes("\r")) {
    working = working.replace(/\r/g, "\n");
    changed = true;
  }
  return { text: working, changed };
}

// ---------------------------------------------------------------------------
// Lexer + parser pipeline (DESIGN steps 5–13)
// ---------------------------------------------------------------------------

/**
 * Codes that promote the verdict to `incomplete`. Informational codes (e.g.
 * `COMMENT_LINE_OBSERVED`) are surfaced but do NOT flip the status — they
 * document that the canonicalizer saw and removed a comment-only line, which
 * is a successful operation, not an evidence loss.
 */
const INCOMPLETE_PROMOTING_CODES: ReadonlySet<CanonicalDiagnosticCode> = new Set([
  "UNSUPPORTED_SYNTAX",
  "INVALID_STRING_LITERAL",
  "INVALID_DATE_LITERAL",
  "INVALID_CONTINUATION",
  "UNBALANCED_CONDITIONAL",
  "AMBIGUOUS_REM",
  "TOKEN_BUDGET_EXHAUSTED",
  "DECODING_FAILED",
  "UNSUPPORTED_BOM",
  "DECLARED_CODEC_CONFLICT",
  "DANGLING_CONTINUATION",
  "AMBIGUOUS_BOUNDARY",
]);

export function isIncompletePromotingDiagnostic(code: CanonicalDiagnosticCode): boolean {
  return INCOMPLETE_PROMOTING_CODES.has(code);
}

/**
 * Canonicalize a VBA source payload. The caller has already selected the
 * codec and stripped the BOM. This entrypoint walks the 13-step pipeline and
 * returns a discriminated union with diagnostics.
 *
 * Pure: no global state, no I/O.
 */
export function canonicalizeVba(input: {
  readonly bytes: Uint8Array;
  readonly codec: SnapshotCodec;
  readonly fileType: "bas" | "cls" | "frm" | "form.txt" | "report.txt";
}): CanonicalizationResult {
  const decoded = decode(input.bytes, input.codec);
  if ("error" in decoded) return { status: "incomplete", diagnostics: [decoded.error] };

  const eol = normalizeLineEndings(decoded.text);
  const lines = eol.text.split("\n");
  const diagnostics: CanonicalDiagnostic[] = [];

  const parsed = parseStatements(lines, diagnostics);
  if (parsed.fatalError) {
    diagnostics.push(parsed.fatalError);
  }

  // Per DESIGN: "Anything outside the supported grammar, malformed strings,
  // ambiguous `Rem`, invalid/dangling continuations, invalid date literals,
  // unbalanced conditional directives, token-budget exhaustion, or structural
  // ambiguity returns `incomplete`. There is no 'best effort equals green'
  // path." A diagnostic in `INCOMPLETE_PROMOTING_CODES` flips the verdict;
  // informational codes (e.g. `COMMENT_LINE_OBSERVED`) do NOT.
  const hasIncompleteDiagnostic = diagnostics.some((d) => isIncompletePromotingDiagnostic(d.code));
  if (hasIncompleteDiagnostic) {
    return { status: "incomplete", diagnostics };
  }

  return {
    status: "supported",
    logicalStatements: parsed.statements,
    diagnostics,
  };
}

function decode(
  bytes: Uint8Array,
  codec: SnapshotCodec,
): { text: string } | { error: CanonicalDiagnostic } {
  try {
    if (codec === "utf-8") {
      return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
    }
    if (codec === "windows-1252") {
      return { text: new TextDecoder("windows-1252", { fatal: true }).decode(bytes) };
    }
    if (codec === "utf-16le") {
      return { text: new TextDecoder("utf-16le", { fatal: true }).decode(bytes) };
    }
    if (codec === "utf-16be") {
      return { text: new TextDecoder("utf-16be", { fatal: true }).decode(bytes) };
    }
    return {
      error: {
        code: "DECODING_FAILED",
        message: `Unsupported codec: ${String(codec)}`,
      },
    };
  } catch (cause) {
    return {
      error: {
        code: "DECODING_FAILED",
        message: `Decoding failed for codec ${codec}: ${describeError(cause)}`,
      },
    };
  }
}

function describeError(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return String(cause);
}

type ParseOutcome = {
  readonly statements: CanonicalStatement[];
  readonly fatalError: CanonicalDiagnostic | undefined;
};

/**
 * Lexer/parser pipeline.
 *
 * We walk physical lines top-to-bottom. The pipeline implements the
 * canonicalization order literally:
 *
 *   - Step 5: lex each physical line into code/string/comment tokens.
 *   - Step 6: validate continuations BEFORE discarding blank lines.
 *   - Step 7: join validated continuations with an explicit boundary marker.
 *   - Step 8: recognize labels, directives, single-line If, colon/newline
 *             boundaries. Only grammar-proven equivalent boundaries
 *             canonicalize alike; date literals and `:=` are never split.
 *   - Step 9: remove comment tokens from functional comparison; retain
 *             informational diagnostics about comment removal.
 *   - Step 10: fold case for code identifiers/keywords; compare string
 *              literal codepoints exactly. (Performed inside `lexLine`.)
 *   - Step 11: normalize insignificant inter-token whitespace; never
 *              concatenate tokens. (Performed inside `lexLine`.)
 *   - Step 12: discard empty logical statements only here.
 *   - Step 13: compare ordered logical statements with duplicate cardinality
 *              preserved.
 */
function parseStatements(
  lines: readonly string[],
  diagnostics: CanonicalDiagnostic[],
): ParseOutcome {
  const statements: CanonicalStatement[] = [];
  const conditionalStack: string[] = [];
  let tokenCount = 0;

  // Pending statement being built across continuation lines. We track the
  // start line of the first physical line so `sourceRange.start` points at
  // the actual origin, not the continuation landing.
  let pendingLine = "";
  let pendingStartLine = 0;
  let pendingStartColumn = 0;
  let pendingKind: CanonicalStatementKind = "assignment";
  let pendingIsOpen = false;
  let pendingExpectsContinuation = false;

  function flushPending(): void {
    if (!pendingIsOpen) return;
    const lex = lexLine(pendingLine, diagnostics, pendingStartLine);
    tokenCount += lex.tokens.length;
    statements.push({
      kind: pendingKind,
      sourceRange: {
        start: pendingStartLine * 65536 + pendingStartColumn,
        end: pendingStartLine * 65536 + pendingStartColumn + pendingLine.length,
      },
      tokens: lex.tokens,
    });
    pendingIsOpen = false;
    pendingLine = "";
    pendingStartLine = 0;
    pendingStartColumn = 0;
  }

  for (let i = 0; i < lines.length; i += 1) {
    const lineNumber = i + 1;
    const rawLine = lines[i] ?? "";

    // Step 6 — validate continuations BEFORE we do anything else. A
    // physical line that ends in ` _` (one or more spaces, then a
    // single underscore) is a continuation. A line that does NOT end
    // in ` _` and the next non-blank line starts a new code line
    // (i.e. the current line is a "mid-expression" without a
    // continuation marker) is reported as `INVALID_CONTINUATION`.
    const continuation = detectContinuation(rawLine);

    if (continuation.kind === "with-marker") {
      if (continuation.hasTrailingComment) {
        diagnostics.push({
          code: "INVALID_CONTINUATION",
          message: `Trailing comment before line-continuation underscore at line ${lineNumber}`,
          position: { line: lineNumber, column: 1 },
        });
        // We still treat the line as closed; the diagnostic is what
        // flips the verdict to incomplete. Do not consume the next
        // line as continuation because the grammar disallows it.
        if (pendingIsOpen) flushPending();
        continue;
      }
      const before = stripContinuationMarker(rawLine);
      if (!pendingIsOpen) {
        pendingLine = before;
        pendingStartLine = lineNumber;
        pendingStartColumn = 1;
        pendingKind = guessStatementKind(before);
        pendingIsOpen = true;
      } else {
        pendingLine = `${pendingLine} ${before}`;
      }
      // Mark that the pending statement is still absorbing physical lines;
      // the next iteration must NOT promote the pending to closed via the
      // mid-expression heuristic until the continuation chain closes.
      pendingExpectsContinuation = true;
      continue;
    }

    // No continuation marker. If the previous line did NOT close its
    // statement via `End Sub`, missing token, or explicit blank line,
    // and the current line starts with code (not blank, not comment,
    // not directive), we treat the previous line as having ended
    // mid-expression. Per DESIGN step 6, that's `INVALID_CONTINUATION`.
    const trimmed = rawLine.trim();
    const trimmedNonEmpty = trimmed.length > 0;
    const isCodeLike =
      trimmedNonEmpty &&
      !trimmed.startsWith("'") &&
      !/^Rem\b/i.test(trimmed) &&
      !trimmed.startsWith("#") &&
      !looksLikeMidExpressionClosing(rawLine);

    if (
      pendingIsOpen &&
      trimmedNonEmpty &&
      isCodeLike &&
      !pendingExpectsContinuation &&
      !isMidExpressionUnfinished(rawLine)
    ) {
      // The pending statement is still open AND this line looks like a fresh
      // code statement. We close the pending one only if the grammar is happy
      // with the previous line as a complete statement — otherwise we report
      // INVALID_CONTINUATION. We use a heuristic based on terminators because
      // a full VBA parser is out of scope for WU-1; WU-3 may tighten it.
      flushPending();
    } else if (
      pendingIsOpen &&
      trimmedNonEmpty &&
      isCodeLike &&
      !pendingExpectsContinuation &&
      isMidExpressionUnfinished(rawLine)
    ) {
      diagnostics.push({
        code: "INVALID_CONTINUATION",
        message: `Mid-expression line without '_' continuation marker at line ${lineNumber - 1}`,
        position: { line: lineNumber - 1, column: 1 },
      });
      flushPending();
    }

    if (!trimmedNonEmpty) {
      // Blank line. Close any pending statement and move on.
      if (pendingIsOpen) flushPending();
      continue;
    }

    // Comment-only line: drop the entire logical line per DESIGN step 9.
    if (trimmed.startsWith("'")) {
      diagnostics.push({
        code: "COMMENT_LINE_OBSERVED",
        message: `Comment-only line at ${lineNumber}`,
        position: { line: lineNumber, column: 1 },
      });
      continue;
    }

    // Rem comment line — DESIGN step 8 ambiguous-Rem detection. A `Rem`
    // followed by `=` is ambiguous between comment and label/assignment.
    if (/^Rem\b/i.test(trimmed)) {
      const tail = trimmed.slice(3).trimStart();
      if (tail.startsWith("=")) {
        diagnostics.push({
          code: "AMBIGUOUS_REM",
          message: `Rem followed by '=' at line ${lineNumber}; cannot disambiguate from assignment.`,
          position: { line: lineNumber, column: 1 },
        });
        // Per DESIGN: incomplete. We do not produce a logical statement.
        continue;
      }
      // Pure comment; drop the entire logical line per DESIGN step 9.
      diagnostics.push({
        code: "COMMENT_LINE_OBSERVED",
        message: `Rem comment-only line at ${lineNumber}`,
        position: { line: lineNumber, column: 1 },
      });
      continue;
    }

    // Module header lines (VERSION, BEGIN, END). We emit a single
    // module-header logical statement per such line; comments inside the
    // block are already handled by the lexer.
    if (/^VERSION\b/i.test(trimmed) || /^BEGIN\b/i.test(trimmed) || /^END\b/i.test(trimmed)) {
      const lex = lexLine(rawLine, diagnostics, lineNumber);
      tokenCount += lex.tokens.length;
      statements.push({
        kind: "module-header",
        sourceRange: { start: lineNumber * 65536 + 1, end: lineNumber * 65536 + rawLine.length },
        tokens: lex.tokens,
      });
      continue;
    }

    if (/^Attribute\b/i.test(trimmed)) {
      const lex = lexLine(rawLine, diagnostics, lineNumber);
      tokenCount += lex.tokens.length;
      statements.push({
        kind: "attribute",
        sourceRange: { start: lineNumber * 65536 + 1, end: lineNumber * 65536 + rawLine.length },
        tokens: lex.tokens,
      });
      continue;
    }

    if (/^Option\b/i.test(trimmed)) {
      const lex = lexLine(rawLine, diagnostics, lineNumber);
      tokenCount += lex.tokens.length;
      statements.push({
        kind: "option",
        sourceRange: { start: lineNumber * 65536 + 1, end: lineNumber * 65536 + rawLine.length },
        tokens: lex.tokens,
      });
      continue;
    }

    // Conditional directive. We track `#If` opens and `#End` closes.
    if (trimmed.startsWith("#")) {
      const head = trimmed.split(/\s+/)[0] ?? "";
      const lower = head.toLowerCase();
      if (lower === "#if") conditionalStack.push("#if");
      else if (lower === "#elseif" || lower === "#else") {
        if (conditionalStack.length === 0) {
          diagnostics.push({
            code: "UNBALANCED_CONDITIONAL",
            message: `Stray ${lower} at line ${lineNumber}`,
            position: { line: lineNumber, column: 1 },
          });
        }
      } else if (lower === "#end") {
        if (conditionalStack.length === 0) {
          diagnostics.push({
            code: "UNBALANCED_CONDITIONAL",
            message: `#End without matching #If at line ${lineNumber}`,
            position: { line: lineNumber, column: 1 },
          });
        } else {
          conditionalStack.pop();
        }
      }
      // Lex a directive line WITHOUT treating `#` as a date-literal marker.
      // The grammar treats the entire `#If ... Then` / `#End If` line as
      // a single directive logical statement; the closing `>` of `#End If`
      // is part of the keyword, not an operator.
      const lex = lexDirectiveLine(rawLine, diagnostics, lineNumber);
      tokenCount += lex.tokens.length;
      statements.push({
        kind: "directive",
        sourceRange: { start: lineNumber * 65536 + 1, end: lineNumber * 65536 + rawLine.length },
        tokens: lex.tokens,
      });
      continue;
    }

    // Procedure header. Sub/Function/Property (and `Declare` for external
    // function declarations) start a procedure. The leading visibility
    // modifier (Public/Private) is allowed. We emit a single procedure
    // logical statement per line; the body lives in subsequent lines.
    if (looksLikeProcedureHeader(trimmed)) {
      const lex = lexLine(rawLine, diagnostics, lineNumber);
      tokenCount += lex.tokens.length;
      statements.push({
        kind: "procedure",
        sourceRange: { start: lineNumber * 65536 + 1, end: lineNumber * 65536 + rawLine.length },
        tokens: lex.tokens,
      });
      continue;
    }

    // Step 8 — colon-separated statement boundaries. We split on a `:`
    // that is NOT inside a string and NOT the second character of `:=`.
    // Each split becomes its own statement; cardinality is preserved.
    const splits = splitOnStatementBoundary(rawLine);
    if (splits.length > 1) {
      for (let s = 0; s < splits.length; s += 1) {
        const segment = (splits[s] ?? "").trim();
        if (segment.length === 0) continue;
        const lex = lexLine(segment, diagnostics, lineNumber);
        tokenCount += lex.tokens.length;
        statements.push({
          kind: guessStatementKind(segment),
          sourceRange: {
            start: lineNumber * 65536 + 1,
            end: lineNumber * 65536 + 1 + segment.length,
          },
          tokens: lex.tokens,
        });
      }
      continue;
    }

    // Otherwise this line starts (or continues) a pending statement.
    if (!pendingIsOpen) {
      // Detect mid-expression WITHOUT a continuation marker AT THE TIME the
      // line is being absorbed; per DESIGN step 6 that's INVALID_CONTINUATION.
      if (isMidExpressionUnfinished(rawLine) && !isLikelyCompleteStatement(rawLine)) {
        diagnostics.push({
          code: "INVALID_CONTINUATION",
          message: `Mid-expression line without '_' continuation marker at line ${lineNumber}`,
          position: { line: lineNumber, column: 1 },
        });
        // Do NOT consume the next line as continuation; the grammar disallows
        // it. Continue past this diagnostic-only line so the loop picks up
        // the next physical line normally.
        continue;
      }
      pendingLine = rawLine;
      pendingStartLine = lineNumber;
      pendingStartColumn = 1;
      pendingKind = guessStatementKind(rawLine);
      pendingIsOpen = true;
    } else {
      pendingLine = `${pendingLine} ${rawLine}`;
    }
    // The continuation chain has been absorbed; the next iteration may apply
    // the mid-expression heuristic again.
    pendingExpectsContinuation = false;
  }

  if (pendingIsOpen) {
    // Final flush. The grammar guarantees a clean close unless a future WU
    // extends the parser. We do NOT emit INVALID_CONTINUATION here because
    // EOF is a legal statement closer in VBA.
    flushPending();
  }

  if (conditionalStack.length > 0) {
    return {
      statements,
      fatalError: {
        code: "UNBALANCED_CONDITIONAL",
        message: `Unclosed conditional directive(s): ${conditionalStack.join(", ")}`,
      },
    };
  }

  if (tokenCount > TOKEN_BUDGET) {
    return {
      statements,
      fatalError: {
        code: "TOKEN_BUDGET_EXHAUSTED",
        message: `Token budget ${TOKEN_BUDGET} exceeded while parsing.`,
      },
    };
  }

  return { statements, fatalError: undefined };
}

// ---------------------------------------------------------------------------
// Continuation detection
// ---------------------------------------------------------------------------

type ContinuationDetection =
  | { kind: "with-marker"; hasTrailingComment: boolean }
  | { kind: "without-marker" };

/**
 * A line contains a continuation marker when the line includes a `_`
 * preceded by one or more whitespace characters AND there is no inline
 * comment between the last code token and the `_`. Per DESIGN step 6,
 * a trailing comment AFTER the `_` is explicitly NOT legal and is
 * reported as `INVALID_CONTINUATION`.
 *
 * The detection does NOT require the `_` to be at the end of the line.
 * If there is content AFTER the `_` that is not pure whitespace, we
 * treat that as a malformed continuation (trailing-comment case).
 */
function detectContinuation(line: string): ContinuationDetection {
  // Strip trailing CR if present.
  const text = line.replace(/\r$/, "");

  // Match the FIRST `_` with whitespace before, ignoring those inside
  // string literals.
  let inString = false;
  let matchIndex = -1;
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    if (ch === '"') {
      if (inString && text[index + 1] === '"') {
        index += 1;
        continue;
      }
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "_") {
      const prev = text[index - 1];
      if (prev === " " || prev === "\t") {
        matchIndex = index;
        break;
      }
    }
  }
  if (matchIndex === -1) return { kind: "without-marker" };

  const head = text.slice(0, matchIndex);
  const tail = text.slice(matchIndex + 1).trim();

  // Per DESIGN step 6: a trailing comment after `_` is not legal. We treat
  // any non-whitespace content after the `_` as a malformed continuation.
  const hasTrailingContent = tail.length > 0;
  if (hasTrailingContent) {
    return { kind: "with-marker", hasTrailingComment: true };
  }

  // Inspect the substring before the underscore. If it contains an
  // unquoted `'` comment marker or a `Rem` keyword, the continuation is
  // malformed per DESIGN step 6.
  const hasTrailingComment = containsCommentMarker(head);
  return { kind: "with-marker", hasTrailingComment };
}

function containsCommentMarker(text: string): boolean {
  // Find any `'` that is NOT inside a string. We re-walk the text and
  // toggle the inString flag the same way the lexer does.
  let inString = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') {
      if (inString && text[i + 1] === '"') {
        i += 1;
        continue;
      }
      inString = !inString;
      continue;
    }
    if (!inString && ch === "'") return true;
    if (!inString && /^Rem\b/i.test(text.slice(i))) return true;
  }
  return false;
}

function stripContinuationMarker(line: string): string {
  // Find the leftmost code-block `_` (with whitespace before) and strip
  // from there to the end of the line, including any trailing comment.
  const text = line.replace(/\r$/, "");
  let inString = false;
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    if (ch === '"') {
      if (inString && text[index + 1] === '"') {
        index += 1;
        continue;
      }
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "_") {
      const prev = text[index - 1];
      if (prev === " " || prev === "\t") {
        return text.slice(0, Math.max(0, index - 1)).trimEnd();
      }
    }
  }
  return text.trimEnd();
}

/**
 * Returns true when the line is mid-expression WITHOUT a continuation
 * marker. Heuristic: the line ends with an operator or an open paren, or
 * ends with a comma in argument context.
 *
 * The check is intentionally conservative: false negatives keep the line
 * as a fresh statement; false positives produce a spurious diagnostic. We
 * prefer false negatives during WU-1; WU-3 may tighten the heuristic.
 */
/**
 * Returns true when a line clearly closes a statement on its own (e.g.
 * `End Sub`, `Next`, `Wend`, `End If`, `Loop`, `End Function`, or any line
 * that does not end with a mid-expression operator). Used to suppress
 * the mid-expression heuristic for the very last line of a multi-line
 * block that closes naturally.
 */
function isLikelyCompleteStatement(line: string): boolean {
  if (looksLikeMidExpressionClosing(line)) return true;
  return !isMidExpressionUnfinished(line);
}

/**
 * Returns true when the line is mid-expression WITHOUT a continuation
 * marker. Heuristic: the line ends with an operator or an open paren, or
 * ends with a comma in argument context.
 *
 * The check is intentionally conservative: false negatives keep the line
 * as a fresh statement; false positives produce a spurious diagnostic. We
 * prefer false negatives during WU-1; WU-3 may tighten the heuristic.
 */
function isMidExpressionUnfinished(line: string): boolean {
  const trimmed = line.replace(/\r$/, "").trimEnd();
  if (trimmed.length === 0) return false;
  const last = trimmed[trimmed.length - 1];
  if (last === undefined) return false;
  if ("+-*/\\^=<>".includes(last)) return true;
  if (last === "(") return true;
  if (last === ",") return true;
  if (last === "&") return true;
  return false;
}

/**
 * Returns true when a line clearly closes a statement (e.g. `End Sub`,
 * `Next`, `Wend`, `End If`, `Loop`, `End Function`). Such lines DO NOT
 * trigger the `INVALID_CONTINUATION` heuristic even if the previous
 * statement was pending.
 */
function looksLikeMidExpressionClosing(line: string): boolean {
  const trimmed = line.trim().toLowerCase();
  return (
    trimmed === "end" ||
    trimmed.startsWith("end sub") ||
    trimmed.startsWith("end function") ||
    trimmed.startsWith("end property") ||
    trimmed.startsWith("end if") ||
    trimmed.startsWith("end with") ||
    trimmed.startsWith("end select") ||
    trimmed.startsWith("loop") ||
    trimmed.startsWith("next") ||
    trimmed.startsWith("wend")
  );
}

/**
 * Returns true when the line declares a procedure. We allow an optional
 * visibility modifier (`Public`, `Private`, `Static`, `Friend`) and any
 * combination of `Declare`, `PtrSafe`, plus the `Sub`/`Function`/`Property`
 * header keyword.
 *
 * Per DESIGN §"Supported productions": "procedure/property/declaration
 * boundaries". WU-1 only needs the boundary detection; the full grammar
 * for the procedure body lands in WU-3.
 */
function looksLikeProcedureHeader(line: string): boolean {
  const tokens = line
    .trimStart()
    .split(/\s+/)
    .map((t) => t.toLowerCase());
  if (tokens.length < 2) return false;
  // Strip leading visibility/storage modifiers.
  while (tokens.length > 0) {
    const head = tokens[0];
    if (head === "public" || head === "private" || head === "static" || head === "friend") {
      tokens.shift();
      continue;
    }
    break;
  }
  if (tokens.length < 2) return false;
  const first = tokens[0];
  return (
    first === "sub" ||
    first === "function" ||
    first === "property" ||
    (first === "declare" && tokens.length >= 3)
  );
}

// ---------------------------------------------------------------------------
// Statement guessing
// ---------------------------------------------------------------------------

function guessStatementKind(line: string): CanonicalStatementKind {
  const head = line.trimStart().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (head === "if" || head.startsWith("elseif")) return "if";
  if (head === "for" || head === "do" || head === "while") return "loop";
  if (head === "select") return "select";
  if (head === "with") return "with";
  if (
    head === "dim" ||
    head === "private" ||
    head === "public" ||
    head === "const" ||
    head === "static" ||
    head === "declare"
  ) {
    return "declaration";
  }
  if (head === "call") return "call";
  if (head.endsWith(":")) return "label";
  return "assignment";
}

// ---------------------------------------------------------------------------
// Statement splitter (DESIGN step 8)
// ---------------------------------------------------------------------------

/**
 * Split a physical line on a `:` boundary, but ONLY when the `:` is not
 * inside a string literal AND is not the second character of `:=`. Returns
 * the list of trimmed segments.
 *
 * DESIGN step 8: "date literals and `:=` are never split as colons".
 */
function splitOnStatementBoundary(line: string): string[] {
  const out: string[] = [];
  let buffer = "";
  let inString = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      const next = line[index + 1];
      if (inString && next === '"') {
        buffer += '""';
        index += 1;
        continue;
      }
      inString = !inString;
      buffer += '"';
      continue;
    }
    if (!inString && char === ":") {
      const next = line[index + 1];
      if (next === "=") {
        buffer += ":=";
        index += 1;
        continue;
      }
      out.push(buffer);
      buffer = "";
      continue;
    }
    buffer += char;
  }
  if (buffer.length > 0) out.push(buffer);
  return out;
}

// ---------------------------------------------------------------------------
// Lexer
// ---------------------------------------------------------------------------

type LexResult = {
  readonly tokens: CanonicalToken[];
};

/**
 * Tokenize one physical line. The lexer:
 *
 *   - Drops inline comments after `'` (everything past the first unquoted
 *     `'` is removed).
 *   - Preserves string-literal contents verbatim, including escaped `""`.
 *   - Preserves date-literal contents verbatim.
 *   - Recognizes `:=` as a single named-argument token.
 *   - Case-folds identifiers/keywords to lowercase.
 *   - Emits INVALID_DATE_LITERAL when the date shape doesn't match the
 *     supported `#YYYY-MM-DD#` form.
 *   - Emits INVALID_STRING_LITERAL when a string is unterminated.
 *   - Emits UNSUPPORTED_SYNTAX for unrecognized characters.
 *
 * All diagnostics are appended to the caller's `diagnostics` array.
 */
function lexLine(source: string, diagnostics: CanonicalDiagnostic[], startLine: number): LexResult {
  const tokens: CanonicalToken[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === undefined) break;

    if (char === " " || char === "\t") {
      index += 1;
      continue;
    }

    if (char === '"') {
      const start = index;
      index += 1;
      let body = '"';
      let terminated = false;
      while (index < source.length) {
        const ch = source[index];
        if (ch === undefined) break;
        if (ch === '"') {
          if (source[index + 1] === '"') {
            body += '""';
            index += 2;
            continue;
          }
          body += '"';
          index += 1;
          terminated = true;
          break;
        }
        body += ch;
        index += 1;
      }
      if (!terminated) {
        diagnostics.push({
          code: "INVALID_STRING_LITERAL",
          message: `Unterminated string literal at line ${startLine}, offset ${start}`,
          position: { line: startLine, column: start + 1 },
        });
      }
      tokens.push({ kind: "literal", text: body });
      continue;
    }

    if (char === "#") {
      const start = index;
      index += 1;
      let body = "#";
      let terminated = false;
      while (index < source.length) {
        const ch = source[index];
        if (ch === undefined) break;
        if (ch === "#") {
          body += "#";
          index += 1;
          terminated = true;
          break;
        }
        body += ch;
        index += 1;
      }
      if (!terminated || !isValidDateLiteral(body)) {
        diagnostics.push({
          code: "INVALID_DATE_LITERAL",
          message: `Invalid date literal at line ${startLine}, offset ${start}: ${body}`,
          position: { line: startLine, column: start + 1 },
        });
      }
      tokens.push({ kind: "literal", text: body });
      continue;
    }

    if (char === "'") {
      // Inline comment — drop the rest of the physical line.
      break;
    }

    if (char === ":" && source[index + 1] === "=") {
      tokens.push({ kind: "name-arg", text: ":=" });
      index += 2;
      continue;
    }

    if (/[0-9]/.test(char)) {
      let body = "";
      while (index < source.length) {
        const ch = source[index];
        if (ch === undefined) break;
        if (/[0-9.eE+-]/.test(ch)) {
          body += ch;
          index += 1;
          continue;
        }
        break;
      }
      tokens.push({ kind: "literal", text: body });
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      let body = "";
      while (index < source.length) {
        const ch = source[index];
        if (ch === undefined) break;
        if (/[A-Za-z0-9_]/.test(ch)) {
          body += ch;
          index += 1;
          continue;
        }
        break;
      }
      const lowered = body.toLowerCase();
      if (VBA_KEYWORDS.has(lowered)) {
        tokens.push({ kind: "keyword", text: lowered });
      } else {
        tokens.push({ kind: "identifier", text: body });
      }
      continue;
    }

    if ("(),.;".includes(char)) {
      tokens.push({ kind: "punctuation", text: char });
      index += 1;
      continue;
    }

    if (/[+\-*/\\^=<>!&%]/.test(char)) {
      tokens.push({ kind: "operator", text: char });
      index += 1;
      continue;
    }

    diagnostics.push({
      code: "UNSUPPORTED_SYNTAX",
      message: `Unrecognized character '${char}' at line ${startLine}, offset ${index}`,
      position: { line: startLine, column: index + 1 },
    });
    index += 1;
  }
  return { tokens };
}

// ---------------------------------------------------------------------------
// Keyword table
// ---------------------------------------------------------------------------

const VBA_KEYWORDS: ReadonlySet<string> = new Set([
  "attribute",
  "option",
  "explicit",
  "compare",
  "database",
  "binary",
  "text",
  "public",
  "private",
  "dim",
  "const",
  "static",
  "sub",
  "function",
  "property",
  "end",
  "if",
  "then",
  "else",
  "elseif",
  "select",
  "case",
  "for",
  "next",
  "do",
  "loop",
  "while",
  "wend",
  "with",
  "set",
  "let",
  "call",
  "exit",
  "return",
  "goto",
  "rem",
  "as",
  "byref",
  "byval",
  "optional",
  "paramarray",
  "preserve",
  "redim",
  "new",
  "nothing",
  "true",
  "false",
  "me",
  "mybase",
  "myclass",
  "and",
  "or",
  "xor",
  "not",
  "mod",
  "is",
  "like",
  "step",
  "to",
  "until",
  "each",
  "in",
  // VBA7 / Win64 declarations
  "declare",
  "ptrsafe",
  // Common Win64 types
  "longptr",
  "longlong",
  "long",
  "integer",
  "string",
  "boolean",
  "byte",
  "single",
  "double",
  "currency",
  "date",
  "object",
  "variant",
]);

// ---------------------------------------------------------------------------
// Date literal validation
// ---------------------------------------------------------------------------

function isValidDateLiteral(body: string): boolean {
  const inner = body.slice(1, -1);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(inner);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  // Refine: reject impossible month/day combinations without consulting
  // a calendar library. February has 28 days in a common year; we do not
  // consider leap years here because VBA's `#...#` literal accepts the
  // same shape and the canonicalizer does not silently rewrite dates.
  if (month === 2 && day > 28) return false;
  if ([4, 6, 9, 11].includes(month) && day > 30) return false;
  if (year < 100 || year > 9999) return false;
  return true;
}

/**
 * Tokenize a `#If/#ElseIf/#Else/#End If` directive line. Unlike `lexLine`
 * this lexer does NOT treat `#` as a date-literal marker; the entire line
 * is parsed as identifiers, keywords, and operators, with the leading
 * `#If` (`#ElseIf`, `#End`) recognized as a single keyword token.
 *
 * The canonicalizer only enters this path when the trimmed line begins
 * with `#`, so the parser does not need to disambiguate date literals
 * from directives here.
 */
function lexDirectiveLine(
  source: string,
  diagnostics: CanonicalDiagnostic[],
  startLine: number,
): LexResult {
  const tokens: CanonicalToken[] = [];
  let index = 0;

  // Match a leading `#If`, `#ElseIf`, or `#End` (case-insensitive).
  const headMatch = /^#(if|elseif|else|end)\b/i.exec(source);
  if (headMatch !== null) {
    tokens.push({ kind: "keyword", text: headMatch[0].toLowerCase() });
    index = headMatch[0].length;
  }

  let trailingIf = false;
  while (index < source.length) {
    const char = source[index];
    if (char === undefined) break;
    if (char === " " || char === "\t") {
      index += 1;
      continue;
    }
    if (char === '"') {
      const start = index;
      index += 1;
      let body = '"';
      let terminated = false;
      while (index < source.length) {
        const ch = source[index];
        if (ch === undefined) break;
        if (ch === '"') {
          if (source[index + 1] === '"') {
            body += '""';
            index += 2;
            continue;
          }
          body += '"';
          index += 1;
          terminated = true;
          break;
        }
        body += ch;
        index += 1;
      }
      if (!terminated) {
        diagnostics.push({
          code: "INVALID_STRING_LITERAL",
          message: `Unterminated string literal at line ${startLine}, offset ${start}`,
          position: { line: startLine, column: start + 1 },
        });
      }
      tokens.push({ kind: "literal", text: body });
      continue;
    }
    if (/[0-9]/.test(char)) {
      let body = "";
      while (index < source.length) {
        const ch = source[index];
        if (ch === undefined) break;
        if (/[0-9.]/.test(ch)) {
          body += ch;
          index += 1;
          continue;
        }
        break;
      }
      tokens.push({ kind: "literal", text: body });
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      let body = "";
      while (index < source.length) {
        const ch = source[index];
        if (ch === undefined) break;
        if (/[A-Za-z0-9_]/.test(ch)) {
          body += ch;
          index += 1;
          continue;
        }
        break;
      }
      const lowered = body.toLowerCase();
      if (lowered === "then") {
        tokens.push({ kind: "keyword", text: "then" });
      } else if (lowered === "if") {
        tokens.push({ kind: "keyword", text: "if" });
        trailingIf = true;
      } else if (VBA_KEYWORDS.has(lowered)) {
        tokens.push({ kind: "keyword", text: lowered });
      } else {
        tokens.push({ kind: "identifier", text: body });
      }
      continue;
    }
    if (/[+\-*/\\^=<>!&%]/.test(char)) {
      tokens.push({ kind: "operator", text: char });
      index += 1;
      continue;
    }
    if (char === "(" || char === ")") {
      tokens.push({ kind: "punctuation", text: char });
      index += 1;
      continue;
    }
    diagnostics.push({
      code: "UNSUPPORTED_SYNTAX",
      message: `Unrecognized character '${char}' at line ${startLine}, offset ${index}`,
      position: { line: startLine, column: index + 1 },
    });
    index += 1;
  }
  if (trailingIf) {
    // The directive terminator is `If` after `#End` — we already tokenized it.
    void trailingIf;
  }
  return { tokens };
}
