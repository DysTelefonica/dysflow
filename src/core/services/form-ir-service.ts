// Pure domain service for parsing Access .form.txt (SaveAsText format) files into FormIR.
// No I/O. All functions are synchronous and deterministic.

import type {
  BlobEntry,
  EmptyLineEntry,
  FormIR,
  FormNode,
  PropertyEntry,
  ScalarEntry,
} from "../models/form-ir.js";

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

/**
 * Thrown when a .form.txt file cannot be parsed.
 */
export class FormParseError extends Error {
  readonly code = "FORM_PARSE_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "FormParseError";
  }
}

// ---------------------------------------------------------------------------
// Internal parsing helpers
// ---------------------------------------------------------------------------

/**
 * Parse blob content lines starting at startIdx until the first "End" line.
 * Returns the raw lines (with original whitespace) and the index of the line
 * AFTER the closing "End".
 */
function parseBlobContent(
  lines: string[],
  startIdx: number,
): { blobLines: string[]; nextI: number } {
  const blobLines: string[] = [];
  let i = startIdx;

  while (i < lines.length) {
    // i < lines.length guarantees a defined element; ?? "" is a type-safe fallback
    const trimmed = (lines[i] ?? "").trim();
    if (trimmed === "End") {
      return { blobLines, nextI: i + 1 };
    }
    blobLines.push(lines[i] ?? "");
    i++;
  }

  throw new FormParseError("Blob block missing End — unexpected end of file");
}

/**
 * Parse a Begin...End node recursively.
 * lines[startIdx] MUST be the "Begin [blockType]" line.
 * Returns the parsed FormNode and the index of the line AFTER the closing "End".
 */
function parseNode(lines: string[], startIdx: number): { node: FormNode; nextIdx: number } {
  // callers guarantee startIdx < lines.length; ?? "" is a type-safe fallback
  const headerTrimmed = (lines[startIdx] ?? "").trim();
  const blockMatch = headerTrimmed.match(/^Begin\s*(\w*)$/);
  if (!blockMatch) {
    throw new FormParseError(
      `Expected Begin block at line ${startIdx + 1}: "${lines[startIdx] ?? ""}"`,
    );
  }
  // Destructuring with default: (\w*) is always defined when the regex matches, "" is the fallback
  const [, blockType = ""] = blockMatch; // "" for unlabeled Begin

  const entries: PropertyEntry[] = [];
  const children: FormNode[] = [];
  let i = startIdx + 1;

  while (i < lines.length) {
    // i < lines.length guarantees a defined element; ?? "" is a type-safe fallback
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    // Empty line inside a node — preserve for byte-perfect round-trip.
    // Access occasionally emits blank lines between entries (e.g. after a blob block).
    if (trimmed === "") {
      const emptyEntry: EmptyLineEntry = { kind: "empty" };
      entries.push(emptyEntry);
      i++;
      continue;
    }

    // End of current block
    if (trimmed === "End") {
      return { node: { blockType, entries, children }, nextIdx: i + 1 };
    }

    // CodeBehindForm marker — should not appear inside a node but handle gracefully
    if (trimmed === "CodeBehindForm") {
      return { node: { blockType, entries, children }, nextIdx: i };
    }

    // Blob entry: "Key = Begin" (Begin at end of line, nothing after)
    const blobMatch = trimmed.match(/^(\w+)\s*=\s*Begin\s*$/);
    if (blobMatch) {
      const { blobLines, nextI } = parseBlobContent(lines, i + 1);
      // (\w+) is a required capturing group — always defined when the regex matches
      const [, blobKey = ""] = blobMatch;
      const blob: BlobEntry = { kind: "blob", key: blobKey, lines: blobLines };
      entries.push(blob);
      i = nextI;
      continue;
    }

    // Child block: "Begin [optType]"
    const childBlockMatch = trimmed.match(/^Begin\s*(\w*)$/);
    if (childBlockMatch) {
      const { node: child, nextIdx } = parseNode(lines, i);
      children.push(child);
      i = nextIdx;
      continue;
    }

    // Scalar entry: "Key =Value" or "Key = Value"
    // Capture everything after the first "=" including any leading whitespace,
    // so round-trip serialization can reproduce the original line.
    const scalarMatch = trimmed.match(/^(\w+)\s*=(.*)/);
    if (scalarMatch) {
      // Both groups are required — always defined when the regex matches
      const [, scalarKey = "", scalarVal = ""] = scalarMatch;
      const scalar: ScalarEntry = { kind: "scalar", key: scalarKey, value: scalarVal };
      entries.push(scalar);
      i++;
      continue;
    }

    // String continuation line: Access wraps long quoted string values across
    // multiple lines. The continuation starts with optional whitespace then ".
    // e.g.   RowSource ="Part 1"
    //            "Part 2"
    // Store the raw line (with original indentation) appended to the preceding
    // scalar's value so the serializer can reproduce it verbatim.
    if (trimmed.startsWith('"') && entries.length > 0) {
      const lastEntry = entries[entries.length - 1] ?? null;
      if (lastEntry !== null && lastEntry.kind === "scalar") {
        lastEntry.value += `\n${line}`;
        i++;
        continue;
      }
    }

    // Unrecognized line — skip (defensive)
    i++;
  }

  throw new FormParseError(
    `Unexpected end of file — missing End for Begin ${blockType || "(unlabeled)"}`,
  );
}

/**
 * Parse the preamble: all property entries before the root "Begin Form/Report" line.
 * Returns entries, the index of the "Begin Form/Report" line, and the inferred kind.
 */
function parsePreamble(lines: string[]): {
  entries: PropertyEntry[];
  rootIdx: number;
  kind: "Form" | "Report";
} {
  const entries: PropertyEntry[] = [];
  let i = 0;

  while (i < lines.length) {
    // i < lines.length guarantees a defined element; ?? "" is a type-safe fallback
    const trimmed = (lines[i] ?? "").trim();

    if (trimmed === "") {
      // Preamble rarely has blank lines, but preserve for round-trip fidelity.
      const emptyEntry: EmptyLineEntry = { kind: "empty" };
      entries.push(emptyEntry);
      i++;
      continue;
    }

    // Root block start: "Begin Form" or "Begin Report"
    const rootMatch = trimmed.match(/^Begin\s+(Form|Report)\s*$/);
    if (rootMatch) {
      // (Form|Report) always matches — default "Form" is a type-safe fallback that never fires
      const [, rootKind = "Form"] = rootMatch;
      return { entries, rootIdx: i, kind: rootKind as "Form" | "Report" };
    }

    // Blob start in preamble
    const blobMatch = trimmed.match(/^(\w+)\s*=\s*Begin\s*$/);
    if (blobMatch) {
      const { blobLines, nextI } = parseBlobContent(lines, i + 1);
      const [, blobKey = ""] = blobMatch;
      entries.push({ kind: "blob", key: blobKey, lines: blobLines });
      i = nextI;
      continue;
    }

    // Scalar
    const scalarMatch = trimmed.match(/^(\w+)\s*=(.*)/);
    if (scalarMatch) {
      const [, scalarKey = "", scalarVal = ""] = scalarMatch;
      entries.push({ kind: "scalar", key: scalarKey, value: scalarVal });
      i++;
      continue;
    }

    // Skip unrecognized (e.g. BOM-related artifacts)
    i++;
  }

  throw new FormParseError(
    "No Begin Form or Begin Report block found — input is not a SaveAsText .form.txt file",
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a .form.txt (Access SaveAsText format) string into a FormIR.
 *
 * @param text - Raw file content (UTF-8 string, \n or \r\n line endings accepted).
 * @param meta - Optional metadata. `name` defaults to "" if not supplied (adapter provides it from filename).
 * @throws FormParseError if the input is malformed or does not look like a SaveAsText file.
 */
export function parseFormTxt(text: string, meta?: { name?: string }): FormIR {
  if (!text || text.trim() === "") {
    throw new FormParseError("Empty or whitespace-only form text is not a valid SaveAsText file");
  }

  const lines = text.split(/\r?\n/);

  // Phase 1: preamble (entries before Begin Form/Report)
  const { entries: preamble, rootIdx, kind } = parsePreamble(lines);

  // Phase 2: root node
  const { node: root, nextIdx } = parseNode(lines, rootIdx);

  // Phase 3: CodeBehindForm split
  let codeBehind: string | null = null;
  for (let i = nextIdx; i < lines.length; i++) {
    // i < lines.length guarantees a defined element; ?? "" is a type-safe fallback
    if ((lines[i] ?? "").trim() === "CodeBehindForm") {
      codeBehind = lines.slice(i + 1).join("\n");
      break;
    }
  }

  return {
    name: meta?.name ?? "",
    kind,
    preamble,
    root,
    codeBehind,
  };
}

// ---------------------------------------------------------------------------
// IR inspection helpers (used by inspect_form and future tools)
// ---------------------------------------------------------------------------

/**
 * Walk a FormNode tree and collect all named controls.
 * A "control" is any node that has a scalar Name entry.
 * Returns controls in document order.
 */
export function collectControls(node: FormNode): Array<{
  name: string;
  type: string;
  properties: Record<string, string>;
}> {
  const results: Array<{ name: string; type: string; properties: Record<string, string> }> = [];

  const nameEntry = node.entries.find(
    (e): e is ScalarEntry => e.kind === "scalar" && e.key === "Name",
  );

  if (nameEntry) {
    const rawName = nameEntry.value.trim();
    // Strip surrounding quotes if the value is a quoted string
    const name = rawName.startsWith('"') && rawName.endsWith('"') ? rawName.slice(1, -1) : rawName;

    const properties: Record<string, string> = {};
    for (const e of node.entries) {
      if (e.kind === "scalar") {
        properties[e.key] = e.value.trim();
      }
    }

    results.push({ name, type: node.blockType, properties });
  }

  for (const child of node.children) {
    results.push(...collectControls(child));
  }

  return results;
}

/**
 * Collect form-level event names from a FormNode's entries.
 * An entry is an event when its value contains "[Event Procedure]".
 * Only looks at the immediate entries of the supplied node (not recursive).
 */
export function collectFormEvents(node: FormNode): string[] {
  const events: string[] = [];

  for (const e of node.entries) {
    if (e.kind === "scalar" && e.value.includes("[Event Procedure]")) {
      events.push(e.key);
    }
  }

  return events;
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/**
 * Normalize line endings to LF (\n).
 * Used by the round-trip guarantee: serializeFormTxt(parseFormTxt(x)) === normalizeLineEndings(x).
 */
export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

/**
 * Serialize a single PropertyEntry at the given indent level.
 * Blob lines are emitted verbatim (they already carry their original indentation).
 */
function serializeEntry(out: string[], entry: PropertyEntry, indent: number): void {
  if (entry.kind === "empty") {
    out.push("");
    return;
  }
  const pad = " ".repeat(indent);
  if (entry.kind === "scalar") {
    out.push(`${pad}${entry.key} =${entry.value}`);
  } else {
    // blob
    out.push(`${pad}${entry.key} = Begin`);
    for (const blobLine of entry.lines) {
      out.push(blobLine); // verbatim — carries original absolute indentation
    }
    out.push(`${pad}End`);
  }
}

/**
 * Serialize a FormNode and its descendants recursively.
 * Entries are always emitted before children (the structure guaranteed by the parser).
 * indent is the number of leading spaces for the Begin/End lines of this node.
 */
function serializeNode(out: string[], node: FormNode, indent: number): void {
  const pad = " ".repeat(indent);
  out.push(node.blockType ? `${pad}Begin ${node.blockType}` : `${pad}Begin`);
  for (const entry of node.entries) {
    serializeEntry(out, entry, indent + 4);
  }
  for (const child of node.children) {
    serializeNode(out, child, indent + 4);
  }
  out.push(`${pad}End`);
}

/**
 * Serialize a FormIR back to a .form.txt string.
 *
 * Round-trip guarantee: serializeFormTxt(parseFormTxt(x)) === normalizeLineEndings(x)
 * for every real Access SaveAsText fixture (ordered arrays + verbatim blob lines +
 * EmptyLineEntry preservation make this hold by construction).
 *
 * @param ir - The FormIR produced by parseFormTxt.
 * @returns A UTF-8 string in Access SaveAsText format, with LF line endings.
 */
export function serializeFormTxt(ir: FormIR): string {
  const out: string[] = [];
  // Preamble at indent 0
  for (const entry of ir.preamble) {
    serializeEntry(out, entry, 0);
  }
  // Root node (Begin Form / Begin Report) at indent 0
  serializeNode(out, ir.root, 0);
  // CodeBehindForm section
  if (ir.codeBehind !== null) {
    out.push("CodeBehindForm");
    // codeBehind was stored as lines.slice(cbIdx+1).join("\n"), so split back and push
    out.push(...ir.codeBehind.split("\n"));
  }
  return out.join("\n");
}
