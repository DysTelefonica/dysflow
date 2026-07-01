// Pure domain service for parsing Access .form.txt (SaveAsText format) files into FormIR.
// No I/O. All functions are synchronous and deterministic.

import type {
  AddControlInput,
  ApplyTokenMapOptions,
  ApplyTokenMapResult,
  BlobEntry,
  CloneFromTemplateOptions,
  CloneFromTemplateResult,
  EmptyLineEntry,
  FormIR,
  FormMutationResult,
  FormNode,
  MissingTokenPolicy,
  MoveControlInput,
  PropertyEntry,
  RenameControlInput,
  ScalarEntry,
  TokenMap,
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

export class FormMutationError extends Error {
  constructor(
    readonly code:
      | "FORM_DUPLICATE_CONTROL"
      | "FORM_CONTROL_NOT_FOUND"
      | "FORM_SECTION_NOT_FOUND"
      | "FORM_MUTATION_INVALID"
      | "FORM_METADATA_LOSS"
      | "FORM_CONTROL_HAS_EVENT_BINDING"
      | "FORM_TOKEN_MAP_INVALID"
      | "FORM_TARGET_EXISTS",
    message: string,
  ) {
    super(message);
    this.name = "FormMutationError";
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

// ---------------------------------------------------------------------------
// Mutation primitives
// ---------------------------------------------------------------------------

const PRESERVED_METADATA_KEYS = ["Checksum", "Format", "PrtDevMode"] as const;

function cloneEntry(entry: PropertyEntry): PropertyEntry {
  if (entry.kind === "empty") return { kind: "empty" };
  if (entry.kind === "blob") return { kind: "blob", key: entry.key, lines: [...entry.lines] };
  return { kind: "scalar", key: entry.key, value: entry.value };
}

function cloneNode(node: FormNode): FormNode {
  return {
    blockType: node.blockType,
    entries: node.entries.map(cloneEntry),
    children: node.children.map(cloneNode),
  };
}

function cloneIr(ir: FormIR): FormIR {
  return {
    name: ir.name,
    kind: ir.kind,
    preamble: ir.preamble.map(cloneEntry),
    root: cloneNode(ir.root),
    codeBehind: ir.codeBehind,
  };
}

function unquoteScalar(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1) : trimmed;
}

function quoteName(name: string): string {
  return `"${name}"`;
}

function normalizeMutationValue(value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? " NotDefault" : "0";
  return String(value);
}

function findNameEntry(node: FormNode): ScalarEntry | undefined {
  return node.entries.find(
    (entry): entry is ScalarEntry => entry.kind === "scalar" && entry.key === "Name",
  );
}

function hasControlNamed(node: FormNode, name: string): boolean {
  const nameEntry = findNameEntry(node);
  if (nameEntry !== undefined && unquoteScalar(nameEntry.value) === name) return true;
  return node.children.some((child) => hasControlNamed(child, name));
}

function findControlNode(node: FormNode, name: string): FormNode | undefined {
  const nameEntry = findNameEntry(node);
  if (nameEntry !== undefined && unquoteScalar(nameEntry.value) === name) return node;
  for (const child of node.children) {
    const found = findControlNode(child, name);
    if (found !== undefined) return found;
  }
  return undefined;
}

function hasEventProcedureBinding(node: FormNode): boolean {
  return node.entries.some(
    (entry) => entry.kind === "scalar" && entry.value.includes("[Event Procedure]"),
  );
}

function childControlContainer(node: FormNode): FormNode {
  return node.children.find((child) => child.blockType === "") ?? node;
}

function findDefaultControlContainer(node: FormNode): FormNode {
  const section = node.children
    .flatMap((child) => [child, ...child.children])
    .find((child) => {
      if (child.blockType !== "Section") return false;
      const nameEntry = findNameEntry(child);
      const name = nameEntry === undefined ? "" : unquoteScalar(nameEntry.value).toLowerCase();
      return name === "detalle" || name === "detail";
    });
  if (section !== undefined) return childControlContainer(section);
  const firstSection = node.children.find((child) => child.blockType === "Section");
  if (firstSection !== undefined) return childControlContainer(firstSection);
  return childControlContainer(node);
}

function findTargetContainer(node: FormNode, targetSectionName?: string): FormNode | undefined {
  if (targetSectionName === undefined) return findDefaultControlContainer(node);
  const nameEntry = findNameEntry(node);
  if (nameEntry !== undefined && unquoteScalar(nameEntry.value) === targetSectionName) {
    return childControlContainer(node);
  }
  for (const child of node.children) {
    const found = findTargetContainer(child, targetSectionName);
    if (found !== undefined) return found;
  }
  return undefined;
}

function upsertScalar(node: FormNode, key: string, value: string): void {
  const entry = node.entries.find(
    (candidate): candidate is ScalarEntry => candidate.kind === "scalar" && candidate.key === key,
  );
  if (entry !== undefined) {
    entry.value = value;
    return;
  }
  node.entries.push({ kind: "scalar", key, value });
}

function metadataSnapshot(ir: FormIR): string[] {
  const out: string[] = [];
  const visitEntry = (entry: PropertyEntry): void => {
    if (entry.kind === "empty") return;
    if (!isPreservedMetadataKey(entry.key)) {
      return;
    }
    if (entry.kind === "blob") out.push(`${entry.key}=Begin\n${entry.lines.join("\n")}\nEnd`);
    else out.push(`${entry.key}=${entry.value}`);
  };
  const visitNode = (node: FormNode): void => {
    node.entries.forEach(visitEntry);
    node.children.forEach(visitNode);
  };
  ir.preamble.forEach(visitEntry);
  visitNode(ir.root);
  return out;
}

function preservedKeys(ir: FormIR): string[] {
  const keys = new Set<string>();
  const visitEntry = (entry: PropertyEntry): void => {
    if (entry.kind === "empty") return;
    for (const key of PRESERVED_METADATA_KEYS) {
      if (entry.key === key || entry.key.startsWith(key)) keys.add(key);
    }
  };
  const visitNode = (node: FormNode): void => {
    node.entries.forEach(visitEntry);
    node.children.forEach(visitNode);
  };
  ir.preamble.forEach(visitEntry);
  visitNode(ir.root);
  return [...keys].sort();
}

function assertMetadataPreserved(before: FormIR, after: FormIR): void {
  const beforeSnapshot = metadataSnapshot(before);
  const afterSnapshot = metadataSnapshot(after);
  if (JSON.stringify(beforeSnapshot) !== JSON.stringify(afterSnapshot)) {
    throw new FormMutationError(
      "FORM_METADATA_LOSS",
      "Form mutation would lose or rewrite opaque Access metadata.",
    );
  }
}

function mutationResult(
  before: FormIR,
  after: FormIR,
  changedControlName: string,
): FormMutationResult {
  assertMetadataPreserved(before, after);
  return {
    ir: after,
    source: serializeFormTxt(after),
    changedControlName,
    preservedKeys: preservedKeys(after),
  };
}

export function addControl(ir: FormIR, input: AddControlInput): FormMutationResult {
  const name = input.control.name?.trim();
  const type = input.control.type?.trim();
  if (!name || !type) {
    throw new FormMutationError(
      "FORM_MUTATION_INVALID",
      "addControl requires control.name and control.type.",
    );
  }
  if (hasControlNamed(ir.root, name)) {
    throw new FormMutationError("FORM_DUPLICATE_CONTROL", `Control "${name}" already exists.`);
  }

  const next = cloneIr(ir);
  const target = findTargetContainer(next.root, input.targetSectionName);
  if (target === undefined) {
    throw new FormMutationError(
      "FORM_SECTION_NOT_FOUND",
      `Target section "${input.targetSectionName ?? ""}" was not found.`,
    );
  }

  const entries: PropertyEntry[] = [{ kind: "scalar", key: "Name", value: quoteName(name) }];
  for (const [key, value] of Object.entries(input.control.properties ?? {})) {
    if (key === "Name") continue;
    entries.push({ kind: "scalar", key, value: normalizeMutationValue(value) });
  }
  target.children.push({ blockType: type, entries, children: [] });
  return mutationResult(ir, next, name);
}

export function moveControl(ir: FormIR, input: MoveControlInput): FormMutationResult {
  if (input.left === undefined && input.top === undefined) {
    throw new FormMutationError(
      "FORM_MUTATION_INVALID",
      "moveControl requires at least one of left or top.",
    );
  }
  const next = cloneIr(ir);
  const control = findControlNode(next.root, input.controlName);
  if (control === undefined) {
    throw new FormMutationError(
      "FORM_CONTROL_NOT_FOUND",
      `Control "${input.controlName}" was not found.`,
    );
  }
  if (input.left !== undefined) upsertScalar(control, "Left", String(input.left));
  if (input.top !== undefined) upsertScalar(control, "Top", String(input.top));
  return mutationResult(ir, next, input.controlName);
}

export function renameControl(ir: FormIR, input: RenameControlInput): FormMutationResult {
  const newName = input.newName.trim();
  if (!input.controlName.trim() || !newName) {
    throw new FormMutationError(
      "FORM_MUTATION_INVALID",
      "renameControl requires controlName and newName.",
    );
  }
  if (hasControlNamed(ir.root, newName)) {
    throw new FormMutationError("FORM_DUPLICATE_CONTROL", `Control "${newName}" already exists.`);
  }
  const next = cloneIr(ir);
  const control = findControlNode(next.root, input.controlName);
  if (control === undefined) {
    throw new FormMutationError(
      "FORM_CONTROL_NOT_FOUND",
      `Control "${input.controlName}" was not found.`,
    );
  }
  if (hasEventProcedureBinding(control)) {
    throw new FormMutationError(
      "FORM_CONTROL_HAS_EVENT_BINDING",
      `Control "${input.controlName}" has [Event Procedure] bindings. Rename is refused because Access event procedure names are control-name convention-bound.`,
    );
  }
  upsertScalar(control, "Name", quoteName(newName));
  return mutationResult(ir, next, newName);
}

// ---------------------------------------------------------------------------
// Form Template Cloning (slice 5, issue #618)
// ---------------------------------------------------------------------------

/**
 * Validate a token map. Every key MUST be a non-empty string; every value
 * MUST be a string. Otherwise throws FORM_TOKEN_MAP_INVALID with an
 * actionable message — no source IR mutation occurs.
 */
function validateTokenMap(tokenMap: TokenMap): void {
  for (const [key, value] of Object.entries(tokenMap)) {
    if (typeof key !== "string" || key.length === 0) {
      throw new FormMutationError(
        "FORM_TOKEN_MAP_INVALID",
        `Token map keys must be non-empty strings; received ${JSON.stringify(key)}.`,
      );
    }
    if (typeof value !== "string") {
      throw new FormMutationError(
        "FORM_TOKEN_MAP_INVALID",
        `Token "${key}" maps to a non-string value (${typeof value}). Token values must be strings.`,
      );
    }
  }
}

const TOKEN_PATTERN = /\{\{([^}]+)\}\}/g;

/**
 * Collect every unique `{{Token}}` placeholder that appears in the source text.
 * Used by applyTokenMap to partition tokens into `applied` vs `missing`.
 */
function collectSourceTokens(sourceText: string): string[] {
  const seen = new Set<string>();
  for (const match of sourceText.matchAll(TOKEN_PATTERN)) {
    const token = match[1];
    if (token !== undefined) seen.add(token);
  }
  return [...seen].sort();
}

/**
 * Replace every `{{Key}}` occurrence in `value` using `tokenMap`. Order
 * matches `Object.entries(tokenMap)`; collisions are not a concern at the
 * orchestrator's shape (token names are stable identifiers).
 */
function replaceTokensInString(value: string, tokenMap: TokenMap): string {
  let out = value;
  for (const [token, replacement] of Object.entries(tokenMap)) {
    const pattern = `{{${token}}}`;
    if (out.includes(pattern)) {
      out = out.split(pattern).join(replacement);
    }
  }
  return out;
}

/**
 * Returns true when a property key belongs to the Access opaque metadata
 * reserved set: any key equal to or starting with `Checksum`, `Format`,
 * or `PrtDevMode`. Matches the slice 4 invariant — the metadata guard
 * (`metadataSnapshot`) uses the same prefix rules.
 *
 * Single source of truth for the "is this a reserved Access metadata key"
 * predicate: both `metadataSnapshot` and `applyTokenMap` walk it.
 */
function isPreservedMetadataKey(key: string): boolean {
  return PRESERVED_METADATA_KEYS.some((prefix) => key === prefix || key.startsWith(prefix));
}

/**
 * Apply the token map to a single PropertyEntry. Returns a NEW entry when
 * the key is NOT a preserved-metadata key; returns the entry unchanged
 * (no object allocation needed for empty entries) when the key IS preserved.
 * When the key is preserved, body lines and scalar values are NEVER touched.
 */
function applyTokensToEntry(entry: PropertyEntry, tokenMap: TokenMap): PropertyEntry {
  if (entry.kind === "empty") return entry;
  if (isPreservedMetadataKey(entry.key)) return entry;
  if (entry.kind === "scalar") {
    return {
      kind: "scalar",
      key: entry.key,
      value: replaceTokensInString(entry.value, tokenMap),
    };
  }
  // blob — apply tokens line by line; preserve verbatim whitespace.
  return {
    kind: "blob",
    key: entry.key,
    lines: entry.lines.map((line) => replaceTokensInString(line, tokenMap)),
  };
}

/**
 * Walk a FormNode tree and apply the token map to every non-preserved entry
 * (recursive). Children are always processed. Returns a NEW node; the input
 * is never mutated.
 */
function applyTokensToNode(node: FormNode, tokenMap: TokenMap): FormNode {
  return {
    blockType: node.blockType,
    entries: node.entries.map((entry) => applyTokensToEntry(entry, tokenMap)),
    children: node.children.map((child) => applyTokensToNode(child, tokenMap)),
  };
}

/**
 * Apply a token map to a parsed FormIR. Pure IR transformation.
 *
 * Scope rules (slice 5 design):
 *   - Walks every scalar value and every blob body line whose key is NOT
 *     `Checksum`, `Format`, or `PrtDevMode` (preserved metadata).
 *   - Under `missingTokenPolicy: "warn-pass-through"` (default): tokens
 *     present in the source but absent from the token map are left verbatim
 *     and reported in `missingTokens`. The operation still succeeds.
 *   - Under `missingTokenPolicy: "strict"`: any missing source token throws
 *     `FORM_MUTATION_INVALID` with no IR mutation applied.
 *   - `appliedTokens` lists every token from the map that was actually
 *     replaced (i.e. its `{{Token}}` pattern was found in the source).
 *   - `warnings` carries one human-readable string per missing token, in
 *     the same order as `missingTokens`.
 *
 * The input IR is NEVER mutated; the returned IR is a fresh clone.
 *
 * @throws FormMutationError with code `FORM_TOKEN_MAP_INVALID` for bad input.
 * @throws FormMutationError with code `FORM_MUTATION_INVALID` when strict
 *         policy rejects an unmapped source token.
 */
export function applyTokenMap(
  ir: FormIR,
  tokenMap: TokenMap,
  opts?: ApplyTokenMapOptions,
): ApplyTokenMapResult {
  validateTokenMap(tokenMap);

  const missingTokenPolicy: MissingTokenPolicy = opts?.missingTokenPolicy ?? "warn-pass-through";

  const next = cloneIr(ir);
  next.preamble = next.preamble.map((entry) => applyTokensToEntry(entry, tokenMap));
  next.root = applyTokensToNode(next.root, tokenMap);

  const sourceText = serializeFormTxt(ir);
  const sourceTokens = collectSourceTokens(sourceText);

  const appliedTokens: string[] = [];
  const missingTokens: string[] = [];
  const warnings: string[] = [];
  for (const token of sourceTokens) {
    if (Object.hasOwn(tokenMap, token)) {
      appliedTokens.push(token);
    } else {
      missingTokens.push(token);
      warnings.push(
        `Token "{{${token}}}" is present in the source but missing from the token map; leaving verbatim under warn-pass-through policy.`,
      );
    }
  }

  if (missingTokenPolicy === "strict" && missingTokens.length > 0) {
    throw new FormMutationError(
      "FORM_MUTATION_INVALID",
      `Strict token enforcement rejected ${missingTokens.length} unmapped source token(s): ${missingTokens
        .map((t) => `"{{${t}}}"`)
        .join(", ")}.`,
    );
  }

  return {
    ir: next,
    appliedTokens,
    missingTokens,
    warnings,
  };
}

/**
 * Clone a source FormIR into a target by applying a token map. Pure: the
 * adapter wraps this with filesystem + LoadFromText gate + restore-on-failure.
 *
 * Pipeline (slice 5 design):
 *   1. Validate the token map (FORM_TOKEN_MAP_INVALID on bad input).
 *   2. Run `applyTokenMap` — populates the cloned IR's scalars and non-
 *      preserved blob body lines with the mapped values.
 *   3. Set the cloned IR's `name` to `targetFormName`.
 *   4. Call `assertMetadataPreserved(sourceIr, clonedIr)` — rejects with
 *      FORM_METADATA_LOSS if a reserved metadata key was rewritten.
 *
 * Round-trip property (spec scenario 1): a manual clone-and-replace on
 * the source text using the same token map is byte-equivalent to
 * `result.source`. This is the spec's "byte-equivalence" guarantee.
 *
 * @throws FormMutationError with code `FORM_TOKEN_MAP_INVALID`,
 *         `FORM_MUTATION_INVALID` (strict), or `FORM_METADATA_LOSS`.
 */
export function cloneFormFromTemplate(
  sourceIr: FormIR,
  opts: CloneFromTemplateOptions,
): CloneFromTemplateResult {
  const tokenMap = opts.tokenMap;
  const targetFormName = opts.targetFormName;
  const missingTokenPolicy: MissingTokenPolicy = opts.missingTokenPolicy ?? "warn-pass-through";

  if (typeof targetFormName !== "string" || targetFormName.length === 0) {
    throw new FormMutationError(
      "FORM_MUTATION_INVALID",
      "cloneFormFromTemplate requires a non-empty targetFormName.",
    );
  }

  const applied = applyTokenMap(sourceIr, tokenMap, { missingTokenPolicy });

  applied.ir.name = targetFormName;
  assertMetadataPreserved(sourceIr, applied.ir);

  return {
    ir: applied.ir,
    source: serializeFormTxt(applied.ir),
    appliedTokens: applied.appliedTokens,
    missingTokens: applied.missingTokens,
    warnings: applied.warnings,
    preservedKeys: preservedKeys(applied.ir),
  };
}
