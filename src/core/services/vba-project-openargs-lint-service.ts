/**
 * Pure cross-form OpenArgs contract-mismatch engine
 * (`src/core/services/vba-project-openargs-lint-service.ts`).
 *
 * Issue #1006 — Access / VBA producers carry a silent contract with
 * `Me.OpenArgs` consumers through `DoCmd.OpenForm "<FormName>", …, <OpenArgs>`.
 * When the producer emits `ANIO=2025;SEM=2` (named-key/semicolon) but the
 * consumer only parses `2025|2` (pipe-delimited), the consumer falls back
 * silently to defaults and the user sees wrong data with no error surface.
 *
 * This engine is a deterministic, pure-function detector that pairs producer
 * `DoCmd.OpenForm` calls with consumer `Me.OpenArgs` parser patterns **across
 * the same source tree** and emits one
 * `OPENARGS_CONTRACT_MISMATCH` diagnostic per producer → consumer pair whose
 * grammars disagree. It refuses to invent dataflow for dynamic / indeterminate
 * expressions — those stay silent per the issue contract.
 *
 * No filesystem, no Access COM, no PowerShell. Adapters (slice 2) own I/O.
 */

export type OpenArgsContractMismatchDiagnostic = {
  readonly code: "OPENARGS_CONTRACT_MISMATCH";
  readonly severity: "error";
  readonly producerPath: string;
  readonly producerLine: number;
  readonly consumerPath: string;
  readonly consumerLine: number;
  readonly producerGrammar: string;
  readonly consumerGrammar: string;
  readonly fallbackRiskReachable: boolean;
};

export type VbaProjectOpenArgsLintResult = {
  readonly diagnostics: ReadonlyArray<OpenArgsContractMismatchDiagnostic>;
  readonly isClean: boolean;
};

type OpenArgsSource = { readonly path: string; readonly text: string };

// ---------------------------------------------------------------------------
// Grammar models
// ---------------------------------------------------------------------------

/**
 * Structured grammar of a consumer's `Me.OpenArgs` parser. Two consumers
 * match iff their normalized grammar shapes are equivalent (see
 * {@link grammarsMatch}).
 *
 * `delimiters` is the sorted, deduped set of single-character pair-separator
 * literals the parser recognizes in `InStr(..., X)` / `Split(..., X)` calls.
 * `kvSeparator` is the single separator inside each pair that splits a
 * `key=value` token (e.g. `"="`); `undefined` when the parser is purely
 * positional. `hasFallback` is `true` when the parser carries a defaulting
 * guard (`If m_Anio = 0 Then m_Anio = CLng(Year(Date))` etc.).
 */
export type ConsumerGrammar = {
  readonly delimiters: readonly string[];
  readonly kvSeparator: string | undefined;
  readonly hasFallback: boolean;
};

/**
 * Structured grammar of a producer's `DoCmd.OpenForm "…", …, <OpenArgsExpr>`
 * literal. We commit to a grammar when the OpenArgs expression yields at
 * least one observable string literal piece from which delimiters, kv
 * separators, and key names can be derived. Function calls (`CStr(anio)`)
 * and bare variables (`payload`) between literal pieces do not invalidate
 * the result — the boundaries ARE static even when interpolated values
 * are not.
 */
export type ProducerGrammar = {
  readonly delimiters: readonly string[];
  readonly kvSeparator: string | undefined;
  readonly keys: readonly string[];
};

// ---------------------------------------------------------------------------
// Internal records
// ---------------------------------------------------------------------------

type ProducerRecord = {
  readonly sourcePath: string;
  readonly formName: string;
  readonly line: number;
  readonly grammar: ProducerGrammar | undefined;
  readonly rawExpression: string;
};

type ConsumerRecord = {
  readonly sourcePath: string;
  readonly formName: string;
  readonly firstMeOpenArgsLine: number;
  readonly grammar: ConsumerGrammar;
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function lintVbaProjectOpenArgs(
  sources: ReadonlyArray<OpenArgsSource>,
): VbaProjectOpenArgsLintResult {
  const consumersByForm = new Map<string, ConsumerRecord>();
  const producers: ProducerRecord[] = [];

  for (const source of sources) {
    if (!isClassModuleFile(source.path)) continue;
    const classModuleName = extractClassModuleName(source.text, source.path);
    if (classModuleName === undefined) continue;

    const lineCount = countLines(source.text);
    const lineOffsets = computeLineOffsets(source.text);
    const assignments = new Map<string, ProducerGrammar>();

    for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
      const line = getLine(source.text, lineOffsets, lineIndex);
      const lineNumber = lineIndex + 1;

      // Track simple `<var> = <expression>` assignments so a bare
      // identifier passed as OpenArgs later in the same module can be
      // resolved to the static grammar of its initializer. We replace any
      // prior definition — VBA reassignment semantics are last-write-wins,
      // and a literal-heavy RHS yields a deterministic grammar.
      const assignment = findSimpleAssignmentOnOriginal(line);
      if (assignment !== undefined) {
        const grammar = extractProducerGrammar(assignment.rhs);
        if (grammar !== undefined) {
          assignments.set(assignment.name.toLowerCase(), grammar);
        } else {
          assignments.delete(assignment.name.toLowerCase());
        }
      }

      for (const producer of extractProducerCallsFromLine(line, lineNumber, assignments)) {
        producers.push({
          sourcePath: source.path,
          formName: producer.formName,
          line: producer.line,
          grammar: producer.grammar,
          rawExpression: producer.rawExpression,
        });
      }

      const safeLine = stripStringsAndComments(line);
      if (findMeOpenArgsPositions(safeLine).length === 0) continue;

      const existing = findConsumerForProducer(classModuleName, consumersByForm);
      if (existing === undefined) {
        const consumerGrammar = analyzeConsumerGrammarInLines(
          source.text,
          lineOffsets,
          lineCount,
          lineIndex,
        );
        const record: ConsumerRecord = {
          sourcePath: source.path,
          formName: classModuleName,
          firstMeOpenArgsLine: lineNumber,
          grammar: consumerGrammar,
        };
        indexConsumers(consumersByForm, record);
      }
    }
  }

  const diagnostics: OpenArgsContractMismatchDiagnostic[] = [];
  for (const producer of producers) {
    const consumer = findConsumerForProducer(producer.formName, consumersByForm);
    if (consumer === undefined) continue;
    if (producer.grammar === undefined) continue;
    if (grammarsMatch(producer.grammar, consumer.grammar)) continue;

    diagnostics.push({
      code: "OPENARGS_CONTRACT_MISMATCH",
      severity: "error",
      producerPath: producer.sourcePath,
      producerLine: producer.line,
      consumerPath: consumer.sourcePath,
      consumerLine: consumer.firstMeOpenArgsLine,
      producerGrammar: serializeProducerGrammar(producer.grammar),
      consumerGrammar: serializeConsumerGrammar(consumer.grammar),
      fallbackRiskReachable: consumer.grammar.hasFallback,
    });
  }

  diagnostics.sort((a, b) => {
    const producerCompare = a.producerPath.localeCompare(b.producerPath);
    if (producerCompare !== 0) return producerCompare;
    const lineDelta = a.producerLine - b.producerLine;
    if (lineDelta !== 0) return lineDelta;
    return a.consumerPath.localeCompare(b.consumerPath);
  });

  return {
    diagnostics,
    isClean: diagnostics.length === 0,
  };
}

// ---------------------------------------------------------------------------
// File / module classification
// ---------------------------------------------------------------------------

function isClassModuleFile(path: string): boolean {
  return /\.cls$/i.test(path);
}

/**
 * Extracts the class module name from the source's `Attribute VB_Name`
 * header when present; otherwise derives it from the basename of the path.
 * Returns `undefined` when no class-like signal can be inferred.
 */
function extractClassModuleName(text: string, path: string): string | undefined {
  const attribute = text.match(/^\s*Attribute\s+VB_Name\s*=\s*"([^"]+)"/im);
  if (attribute?.[1] !== undefined) return attribute[1];
  const base = path.replaceAll("\\", "/").split("/").pop();
  if (base === undefined) return undefined;
  const stripped = base.replace(/\.cls$/i, "");
  return stripped.length > 0 ? stripped : undefined;
}

// ---------------------------------------------------------------------------
// Line iteration
// ---------------------------------------------------------------------------

type LineOffsets = readonly number[];

/**
 * Returns the 0-indexed offset of each line's first character. We use these
 * offsets to slice substrings without paying for repeated `split` allocations
 * and to keep `lineIndex` → `line number` arithmetic O(1).
 */
function computeLineOffsets(text: string): LineOffsets {
  const offsets: number[] = [];
  offsets.push(0);
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch !== "\n") continue;
    const cursor = i + 1;
    if (cursor < text.length) offsets.push(cursor);
  }
  return offsets;
}

function countLines(text: string): number {
  if (text.length === 0) return 0;
  let count = 1;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") count += 1;
  }
  return count;
}

function getLine(text: string, offsets: LineOffsets, lineIndex: number): string {
  const start = offsets[lineIndex];
  if (start === undefined) return "";
  let end: number;
  const nextOffset = offsets[lineIndex + 1];
  if (nextOffset === undefined) {
    end = text.length;
  } else {
    end = nextOffset;
  }
  let slice = text.slice(start, end);
  // Strip a trailing line terminator (LF only or CRLF) so callers operate
  // on the raw line content. A standalone CR (legacy Mac) is also covered.
  if (slice.endsWith("\n")) slice = slice.slice(0, -1);
  if (slice.endsWith("\r")) slice = slice.slice(0, -1);
  return slice;
}

/**
 * Replaces string literals with `""` (keeping their double-quote pairs as
 * positional markers) and shortens `'` comments to spaces. Output preserves
 * the original column counts so extracted line numbers stay aligned with
 * the source text a consumer reads.
 */
function stripStringsAndComments(line: string): string {
  let output = "";
  let inString = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index] ?? "";
    const next = line[index + 1] ?? "";
    if (char === '"') {
      if (inString && next === '"') {
        output += "  ";
        index += 1;
        continue;
      }
      inString = !inString;
      output += '"';
      continue;
    }
    if (char === "'" && !inString) {
      output += " ".repeat(line.length - index);
      return output;
    }
    output += inString ? " " : char;
  }
  return output;
}

// ---------------------------------------------------------------------------
// Producer extraction — `DoCmd.OpenForm "<Form>", …, <OpenArgsExpr>`
// ---------------------------------------------------------------------------

const DOCMD_OPENFORM_RE = /\bDoCmd\s*\.\s*OpenForm\b/gi;

/**
 * Recognized positionally (Access `/acCmdOpenForm` doc):
 *   DoCmd.OpenForm "FormName" [, view] [, filtername] [, where] [, datamode] [, windowmode] [, openargs]
 *
 * The 7th positional argument is `OpenArgs`. We extract it string-aware so
 * `DoCmd.OpenForm "FormX", , , , , , "A=1;B=2"` parses cleanly without
 * stopping at commas inside the OpenArgs expression. The original line is
 * used for the OpenArgs token so delimiters inside string literals are
 * observable; the safeLine variant is consulted only for the surrounding
 * `DoCmd.OpenForm` detection (string-safe is irrelevant there since the
 * call itself is a keyword, not a literal).
 */
function extractProducerCallsFromLine(
  line: string,
  lineNumber: number,
  assignments: ReadonlyMap<string, ProducerGrammar>,
): Array<{
  readonly formName: string;
  readonly line: number;
  readonly grammar: ProducerGrammar | undefined;
  readonly rawExpression: string;
}> {
  const results: Array<{
    formName: string;
    line: number;
    grammar: ProducerGrammar | undefined;
    rawExpression: string;
  }> = [];

  const re = new RegExp(DOCMD_OPENFORM_RE.source, DOCMD_OPENFORM_RE.flags);
  let match: RegExpExecArray | null = re.exec(line);
  while (match !== null) {
    const result = extractOneProducerFromLine(
      line,
      match.index,
      match[0].length,
      lineNumber,
      assignments,
    );
    if (result !== undefined) {
      results.push(result);
    }
    match = re.exec(line);
  }
  return results;
}

/**
 * Parses one matched `DoCmd.OpenForm` site. Supports both invocation forms:
 *   - paren-form:  `DoCmd.OpenForm("X", …, <OpenArgs>)`
 *   - statement:   `DoCmd.OpenForm "X", …, <OpenArgs>`  (no parens;
 *                  widely used in real Access code, including the issue
 *                  repro: `DoCmd.OpenForm "FormIndicadorProyectos", …, openArgs`)
 *
 * Both forms populate a positional arg list with the same 7th slot for
 * OpenArgs. When the OpenArgs token is a bare identifier (e.g. a local
 * variable built up on a prior line), we resolve it through the running
 * `assignments` map; this is the constant-folding pass that lets the engine
 * produce a grammar for `openArgs = "ANIO=" & CStr(anio) & ";SEM=" & sem`
 * followed by `DoCmd.OpenForm …, openArgs`.
 */
function extractOneProducerFromLine(
  line: string,
  matchIndex: number,
  matchLength: number,
  lineNumber: number,
  assignments: ReadonlyMap<string, ProducerGrammar>,
):
  | {
      formName: string;
      line: number;
      grammar: ProducerGrammar | undefined;
      rawExpression: string;
    }
  | undefined {
  const afterCallName = matchIndex + matchLength;
  const probe = skipSpaces(line, afterCallName);
  if (probe === -1) return undefined;

  let args: string[];
  if (line[probe] === "(") {
    const closeIdx = findMatchingCloseParen(line, probe);
    if (closeIdx === -1) return undefined;
    args = splitTopLevelCommas(line.slice(probe + 1, closeIdx));
  } else {
    // Statement-form: parse comma-separated positional args until end of
    // statement. Statement separators are `:` (multiple statements on one
    // line) or end-of-line. We also stop on trailing comments.
    const statementEnd = findStatementEnd(line, probe);
    const statementText = line.slice(probe, statementEnd);
    args = splitTopLevelCommas(statementText);
  }

  const formName = unquote(args[0]?.trim() ?? "");
  const openArgsToken = args[6]?.trim() ?? "";

  if (formName === undefined || formName.length === 0) return undefined;
  if (openArgsToken.length === 0) return undefined;

  const grammar = resolveOpenArgsGrammar(openArgsToken, assignments);
  return {
    formName,
    line: lineNumber,
    grammar,
    rawExpression: openArgsToken,
  };
}

/**
 * Resolve the OpenArgs token to a producer grammar.
 * Priority: literal expression grammar → assignment-traced grammar → undefined.
 */
function resolveOpenArgsGrammar(
  token: string,
  assignments: ReadonlyMap<string, ProducerGrammar>,
): ProducerGrammar | undefined {
  const direct = extractProducerGrammar(token);
  if (direct !== undefined) return direct;
  if (isBareIdentifier(token)) {
    return assignments.get(token.trim().toLowerCase());
  }
  return undefined;
}

/**
 * Locate a leading simple-assignment statement on the ORIGINAL (un-stripped)
 * line:
 *   [Let] <ident> = <rhs>
 *
 * Operates on the original line so the RHS keeps its string literals
 * intact — that's the bit {@link extractProducerGrammar} consumes to derive
 * delimiters, kv separators, and key names. The walk skips over `=` signs
 * inside string literals and comments so a literal `"x=1"` does not
 * confuse the operator detection.
 *
 * Returns `undefined` for compound statements (`X = Y : Z = W` is parsed as
 * one assignment of `X = Y : Z`, which we decline), for non-identifier LHS
 * (e.g. `Me.Text = …`), for the equality / comparison operators (`==`,
 * `<=`, `>=`, `<>`), or when a `Let` prefix is followed by something else.
 */
function findSimpleAssignmentOnOriginal(
  originalLine: string,
): { name: string; rhs: string; rhsStart: number } | undefined {
  let cursor = 0;
  while (cursor < originalLine.length && /[ \t]/.test(originalLine[cursor] ?? "")) {
    cursor += 1;
  }
  if (cursor >= originalLine.length) return undefined;

  // Skip optional `Let ` prefix.
  if (originalLine.slice(cursor, cursor + 4).toLowerCase() === "let ") {
    cursor += 4;
    while (cursor < originalLine.length && /[ \t]/.test(originalLine[cursor] ?? "")) {
      cursor += 1;
    }
  }

  // LHS: a single bare identifier. `qualified` access (`Me.X`, `modFoo.Bar`)
  // is supported for completeness but is uncommon on the LHS of an
  // assignment in real form code; we accept it.
  const lhsMatch = originalLine
    .slice(cursor)
    .match(/^([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?)\s*=(?!=)/);
  if (lhsMatch === null) return undefined;
  const name = lhsMatch[1];
  if (name === undefined) return undefined;

  const eqEnd = cursor + (lhsMatch[0]?.length ?? 0);
  // rhsStart = position of the first non-space char after `=` (already
  // consumed by the regex's `\s*`).
  const rhsStart = eqEnd;
  let rhsEnd = originalLine.length;
  // Stop at trailing `'` comment or `:` statement separator (still inside
  // a comment, so we shouldn't attribute grammar to commented-out text).
  for (let i = rhsStart; i < originalLine.length; i += 1) {
    const ch = originalLine[i];
    const prev = originalLine[i - 1];
    if (ch === "'" && prev !== '"') {
      rhsEnd = i;
      break;
    }
    if (ch === ":") {
      rhsEnd = i;
      break;
    }
  }

  const rhs = originalLine.slice(rhsStart, rhsEnd).trimEnd();
  return { name, rhs, rhsStart };
}

function skipSpaces(text: string, from: number): number {
  for (let i = from; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === " " || ch === "\t") continue;
    return i;
  }
  return -1;
}

/**
 * For statement-form DoCmd.OpenForm calls (no parens), locate where the
 * statement ends. Stop on `:` (VBA statement separator), end-of-line, or
 * a `'` comment opener (we treat rest-of-line as comment-skipped).
 */
function findStatementEnd(line: string, from: number): number {
  let inString = false;
  for (let i = from; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"') {
      if (inString && next === '"') {
        i += 1;
        continue;
      }
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "'") return i;
    if (ch === ":") return i;
  }
  return line.length;
}

function findMatchingCloseParen(text: string, openIdx: number): number {
  let depth = 0;
  let inString = false;
  for (let i = openIdx; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') {
      if (inString && text[i + 1] === '"') {
        i += 1;
        continue;
      }
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function splitTopLevelCommas(input: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let inString = false;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i] ?? "";
    if (ch === '"') {
      if (inString && input[i + 1] === '"') {
        current += '""';
        i += 1;
        continue;
      }
      inString = !inString;
      current += ch;
      continue;
    }
    if (!inString) {
      if (ch === "(") depth += 1;
      if (ch === ")") depth -= 1;
      if (ch === "," && depth === 0) {
        parts.push(current);
        current = "";
        continue;
      }
    }
    current += ch;
  }
  parts.push(current);
  // Return raw segments (with surrounding whitespace) so positional
  // indexing is preserved — `DoCmd.OpenForm "X", , , , , , openArgs` must
  // keep the empty slots for `view`, `filtername`, `where`, `datamode`,
  // `windowmode` so `args[6]` resolves to `openArgs` even when those
  // middle args are defaulted out. Callers trim what they consume.
  return parts;
}

function unquote(token: string): string | undefined {
  const trimmed = token.trim();
  if (trimmed.length < 2) return undefined;
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replaceAll('""', '"');
  }
  return undefined;
}

/**
 * Walk the OpenArgs expression and derive a {@link ProducerGrammar} when
 * at least one string literal piece can be observed. The expression may
 * interleave bare identifiers (`payload`) or function calls (`CStr(anio)`)
 * between literal pieces — those interpolate unknown values but their
 * grammar boundaries (delimiters, kv separators, key names) ARE static.
 *
 * Reject only when no string literals can be attributed (a fully-dynamic
 * expression like `payload` or `BuildPayload()`) — that's the
 * "do not invent dataflow" guard the issue contract calls for.
 */
function extractProducerGrammar(expression: string): ProducerGrammar | undefined {
  const pieces = splitOnTopLevelAmp(expression);
  if (pieces.length === 0) return undefined;

  const stringPieces: string[] = [];
  for (const piece of pieces) {
    const trimmed = piece.trim();
    if (trimmed.length === 0) continue;
    const literal = parseStringLiteral(trimmed);
    if (literal !== undefined) {
      stringPieces.push(literal);
    }
  }

  if (stringPieces.length === 0) return undefined;

  const delimiterSet = new Set<string>();
  let kvSeparator: string | undefined;
  const keySet = new Set<string>();
  for (const piece of stringPieces) {
    const pieceDelims = findSingleCharDelimiters(piece);
    for (const d of pieceDelims) delimiterSet.add(d);
    const pieceKv = detectKvSeparator(piece);
    if (kvSeparator === undefined) kvSeparator = pieceKv;
    else if (pieceKv !== undefined && pieceKv !== kvSeparator) kvSeparator = undefined;
    for (const key of extractNamedKeys(piece, pieceDelims)) keySet.add(key);
  }

  return {
    delimiters: [...delimiterSet].sort(),
    kvSeparator,
    keys: [...keySet].sort(),
  };
}

function splitOnTopLevelAmp(expression: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let inString = false;
  for (let i = 0; i < expression.length; i += 1) {
    const ch = expression[i] ?? "";
    if (ch === '"') {
      if (inString && expression[i + 1] === '"') {
        current += '""';
        i += 1;
        continue;
      }
      inString = !inString;
      current += ch;
      continue;
    }
    if (!inString) {
      if (ch === "(") depth += 1;
      if (ch === ")") depth -= 1;
      if (ch === "&" && depth === 0) {
        parts.push(current);
        current = "";
        continue;
      }
    }
    current += ch;
  }
  if (current.length > 0 || expression.length > 0) parts.push(current);
  return parts;
}

function parseStringLiteral(token: string): string | undefined {
  const trimmed = token.trim();
  if (trimmed.length < 2) return undefined;
  if (!trimmed.startsWith('"') || !trimmed.endsWith('"')) return undefined;
  return trimmed.slice(1, -1).replaceAll('""', '"');
}

function serializeProducerGrammar(g: ProducerGrammar): string {
  const tokens: string[] = [];
  if (g.delimiters.length > 0) tokens.push(`delims=${g.delimiters.join("|")}`);
  if (g.kvSeparator !== undefined) tokens.push(`kv=${g.kvSeparator}`);
  if (g.keys.length > 0) tokens.push(`keys=${g.keys.join("|")}`);
  return tokens.join(",") || "unrecognized";
}

// ---------------------------------------------------------------------------
// Consumer extraction — `Me.OpenArgs` parser patterns
// ---------------------------------------------------------------------------

const ME_OPENARGS_RE = /Me\s*\.\s*OpenArgs/gi;

function findMeOpenArgsPositions(safeLine: string): Array<{ readonly index: number }> {
  const positions: Array<{ readonly index: number }> = [];
  ME_OPENARGS_RE.lastIndex = 0;
  let match: RegExpExecArray | null = ME_OPENARGS_RE.exec(safeLine);
  while (match !== null) {
    positions.push({ index: match.index });
    match = ME_OPENARGS_RE.exec(safeLine);
  }
  return positions;
}

/**
 * Walks the lines of a class module starting from the first `Me.OpenArgs`
 * reference and aggregates parser-shape signals. We bound the scan to a
 * local window because the parser always lives near its `Me.OpenArgs`
 * access — early termination on `End Sub` / `End Function` / `End Property`
 * keeps us safe against helper Subs defined later in the same class.
 */
function analyzeConsumerGrammarInLines(
  text: string,
  offsets: LineOffsets,
  lineCount: number,
  startLineIndex: number,
): ConsumerGrammar {
  const delimiterSet = new Set<string>();
  let kvSeparator: string | undefined;
  let hasFallback = false;
  const scanEnd = Math.min(lineCount, startLineIndex + 200);

  for (let i = startLineIndex; i < scanEnd; i += 1) {
    const line = getLine(text, offsets, i);
    if (line.trim().length === 0) continue;

    const scan = scanLineForParserSignals(line);

    if (scan.isParserLine) {
      for (const delim of scan.singleCharLiterals) delimiterSet.add(delim);
    }

    if (scan.splitEqLiteral !== undefined && kvSeparator === undefined) {
      kvSeparator = scan.splitEqLiteral;
    }

    if (scan.isFallbackLine) hasFallback = true;

    if (scan.isProceduralEnd) break;
  }

  return {
    delimiters: [...delimiterSet].sort(),
    kvSeparator,
    hasFallback,
  };
}

type LineSignals = {
  readonly isParserLine: boolean;
  readonly isFallbackLine: boolean;
  readonly isProceduralEnd: boolean;
  readonly singleCharLiterals: readonly string[];
  readonly splitEqLiteral: string | undefined;
};

function scanLineForParserSignals(line: string): LineSignals {
  const safeLine = stripStringsAndComments(line);
  const literals = collectStringLiterals(line);

  const isParserLine = /\bInStr\b/i.test(safeLine) || /\bSplit\b/i.test(safeLine);
  const singleCharLiterals = isParserLine ? literals.filter((l) => l.length === 1) : [];

  // Detection of `Split(<x>, "=")` for the kv-separator heuristic uses the
  // ORIGINAL line — the safeLine variant has its literal contents blanked
  // out to spaces, so `"="` would not survive the round-trip. We still
  // gate on the safeLine match for `\bSplit\s*\(` to avoid false
  // positives from inside string literals.
  const splitEqLiteral = /\bSplit\s*\(/i.test(safeLine)
    ? findSplitByLiteralArgument(line)
    : undefined;

  const isFallbackLine = FALLBACK_PATTERNS.some((p) => p.test(safeLine));
  const isProceduralEnd = /\bEnd\s+(Sub|Function|Property)\b/i.test(safeLine);

  return {
    isParserLine,
    isFallbackLine,
    isProceduralEnd,
    singleCharLiterals,
    splitEqLiteral,
  };
}

/**
 * Walks the original (non-stripped) line and yields each `"…"` literal
 * with doubled-quote pairs decoded. This preserves the literal content the
 * consumer compares against — running it on the stripped line would yield
 * empty strings because the strip pass spaces out their contents.
 */
function collectStringLiterals(line: string): string[] {
  const literals: string[] = [];
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch !== '"') {
      i += 1;
      continue;
    }
    let j = i + 1;
    let decoded = "";
    while (j < line.length) {
      const inner = line[j];
      const next = line[j + 1];
      if (inner === '"' && next === '"') {
        decoded += '"';
        j += 2;
        continue;
      }
      if (inner === '"') {
        break;
      }
      decoded += inner ?? "";
      j += 1;
    }
    literals.push(decoded);
    i = j + 1;
  }
  return literals;
}

/**
 * Returns `"="` when the consumer line shows evidence of a `Split(<x>, "=")`
 * call — the canonical signature of key/value extraction inside an OpenArgs
 * parser. Operates on the ORIGINAL line so that string-literal delimiters
 * (`"="`) survive the round-trip; we still gate the regex match on the
 * safeLine (passed-in check via the caller) so false positives inside
 * string literals are filtered out before this runs.
 */
function findSplitByLiteralArgument(originalLine: string): string | undefined {
  // Walk the original line so string-content is preserved, but skip over
  // string regions entirely. We regex-search for `Split(` from positions
  // that are not inside a string literal.
  let i = 0;
  while (i < originalLine.length) {
    const ch = originalLine[i];
    const next = originalLine[i + 1];
    if (ch === '"') {
      if (next === '"') {
        i += 2;
        continue;
      }
      // Skip the entire string literal (handles paired quotes).
      i += 1;
      while (i < originalLine.length && originalLine[i] !== '"') {
        const innerCh = originalLine[i];
        const innerNext = originalLine[i + 1];
        if (innerCh === '"' && innerNext === '"') {
          i += 2;
          continue;
        }
        i += 1;
      }
      if (i < originalLine.length) i += 1;
      continue;
    }
    if (ch === "'") {
      // Trailing comment, stop scanning.
      return undefined;
    }
    if (ch === "S" || ch === "s") {
      const tail = originalLine.slice(i);
      const match = /^Split\s*\(/i.exec(tail);
      if (match !== null) {
        const openIdx = i + match[0].length - 1;
        const closeIdx = findMatchingCloseParen(originalLine, openIdx);
        if (closeIdx !== -1) {
          const inner = originalLine.slice(openIdx + 1, closeIdx);
          const parts = splitTopLevelCommas(inner);
          const lit = unquote(parts[1]?.trim() ?? "");
          if (lit === "=") return "=";
        }
        i += match[0].length;
        continue;
      }
    }
    i += 1;
  }
  return undefined;
}

const FALLBACK_PATTERNS: readonly RegExp[] = [
  /\bIf\s+[A-Za-z_][A-Za-z0-9_]*\s*=\s*0\s+Then\b/i,
  /\bIf\s+IsNull\s*\(/i,
  /\bIf\s+IsEmpty\s*\(/i,
  /\bNz\s*\(/i,
  /\bCLng\s*\(\s*Year\s*\(\s*Date\s*\)\s*\)/i,
  /\bIf\s+Len\s*\(\s*Me\s*\.\s*OpenArgs\s*\)\s*=\s*0\s+Then\b/i,
];

function serializeConsumerGrammar(g: ConsumerGrammar): string {
  const tokens: string[] = [];
  if (g.delimiters.length > 0) tokens.push(`delims=${g.delimiters.join("|")}`);
  if (g.kvSeparator !== undefined) tokens.push(`kv=${g.kvSeparator}`);
  if (g.hasFallback) tokens.push("fallback");
  return tokens.join(",") || "empty";
}

// ---------------------------------------------------------------------------
// Producer ↔ consumer pairing
// ---------------------------------------------------------------------------

/**
 * Resolve a producer's target form name to the matching consumer record.
 * Access auto-prefixes `Form_` (and respects capitalization variations) so a
 * `DoCmd.OpenForm "FormIndicadorProyectos"` call must match a consumer whose
 * `Attribute VB_Name` is `Form_FormIndicadorProyectos` (and vice-versa). We
 * index consumers under multiple case-insensitive variants of the canonical
 * name and accept the first hit.
 */
function findConsumerForProducer(
  targetFormName: string,
  consumersByForm: ReadonlyMap<string, ConsumerRecord>,
): ConsumerRecord | undefined {
  const variants = formNameLookupVariants(targetFormName);
  for (const variant of variants) {
    const hit = consumersByForm.get(variant);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

function indexConsumers(
  consumersByForm: Map<string, ConsumerRecord>,
  consumer: ConsumerRecord,
): void {
  for (const variant of formNameLookupVariants(consumer.formName)) {
    consumersByForm.set(variant, consumer);
  }
}

/**
 * Returns the case-insensitive lookup keys a form name can be resolved
 * under. We index `X`, `Form_X`, and the canonical-cased identity so the
 * same consumer can be paired against producers using any of Access's
 * accepted name forms for the same form.
 */
function formNameLookupVariants(formName: string): readonly string[] {
  const lower = formName.toLowerCase();
  const variants = new Set<string>();
  variants.add(lower);
  if (lower.startsWith("form_")) {
    variants.add(lower.slice("form_".length));
  } else {
    variants.add(`form_${lower}`);
  }
  return [...variants];
}

function grammarsMatch(producer: ProducerGrammar, consumer: ConsumerGrammar): boolean {
  const producerDelims = producer.delimiters;
  const consumerDelims = consumer.delimiters;

  // Both sides carried no observable grammar — treat as indeterminate match
  // rather than a contradictory one, mirroring the "do not invent dataflow"
  // contract.
  if (producerDelims.length === 0 && consumerDelims.length === 0) return true;

  // The pair-separator alphabet must overlap. If the producer emits `;` and
  // the consumer parses `|`, the consumers won't see what the producer sent.
  const consumerDelimSet = new Set(consumerDelims);
  const delimOverlap = producerDelims.some((d) => consumerDelimSet.has(d));
  if (!delimOverlap) return false;

  // The key/value story still has to agree: a producer that emits
  // `"ANIO=…"` and a consumer that only `Split(…, ";")` without `"="` is
  // divergent even if their outer `;` delimiters coincide.
  const producerKv = producer.kvSeparator;
  const consumerKv = consumer.kvSeparator;
  if (producerKv !== undefined && consumerKv === undefined) return false;
  if (producerKv === undefined && consumerKv !== undefined) return false;

  return true;
}

// ---------------------------------------------------------------------------
// String-piece helpers (declared as exports from the module-local view)
// ---------------------------------------------------------------------------

const DELIMITER_CHARS = [";", "|", "&", ",", "/", "\\", ":", " ", "\t"];

function findSingleCharDelimiters(piece: string): string[] {
  const found = new Set<string>();
  for (const ch of DELIMITER_CHARS) {
    if (piece.includes(ch)) found.add(ch);
  }
  return [...found].sort();
}

/**
 * Returns true when the token names a single identifier (with optional
 * qualifier like `Me.X` or `modFoo.Bar`) and nothing else. Used to decide
 * whether to consult the running assignment map for OpenArgs resolution.
 */
function isBareIdentifier(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/.test(token.trim());
}

function detectKvSeparator(piece: string): string | undefined {
  if (piece.includes("=")) return "=";
  if (piece.includes(":")) return ":";
  return undefined;
}

function extractNamedKeys(piece: string, delimiters: readonly string[]): string[] {
  if (!piece.includes("=")) return [];
  let tokens: readonly string[] = [piece];
  for (const delim of delimiters) {
    if (!piece.includes(delim)) continue;
    const split = piece.split(delim);
    if (split.length > tokens.length) tokens = split;
  }
  const keys = new Set<string>();
  for (const token of tokens) {
    const eq = token.indexOf("=");
    if (eq <= 0) continue;
    const key = token.slice(0, eq).trim();
    if (key.length > 0) keys.add(key);
  }
  return [...keys].sort();
}
