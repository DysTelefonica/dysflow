// Issue #818 — `verify_form_bindings` core service.
//
// Pure IR-level lint that validates a form's `ControlSource` + `RowSource`
// bindings against a caller-supplied schema aggregate. The schema is a
// `Record<tableName, ColumnSchema[]>` shape produced by the dysflow
// `get_schema` MCP tool (the caller fans out one `get_schema` per table and
// passes the aggregate in via `schema`). This module NEVER opens Access,
// never reads a file, and never mutates the input IR — it is a pure
// transformation over in-memory structures.
//
// Architectural notes:
//   - PURE: zero I/O, zero Access, zero FormIR mutation. The adapter layer
//     reads the .form.txt, parses to FormIR, builds the schema aggregate
//     from `get_schema`, and hands both to this module.
//   - HEXAGONAL: binding validation is a "core" domain concern — the same
//     shape `lintFormLayout` (issue #815) and `diffFormPreview` (#817) live
//     in. MCP exposure lives in `src/adapters/`.
//   - REUSE: every detection calls into the shared form-binding primitives
//     in this module (`extractBindingsFromControlSource`,
//     `extractBindingsFromRowSource`) so the SQL parser lives in exactly
//     one place. Adding a new binding check reuses these helpers.
//
// Detection surface (issue spec, every finding severity="warning"):
//   - FORM_BINDING_MISSING_TABLE   — control binds to a table not in schema
//   - FORM_BINDING_MISSING_COLUMN  — control binds to a column not in table
//   - FORM_BINDING_EMPTY           — ControlSource is empty/whitespace
//   - FORM_BINDING_SQL_UNPARSEABLE — RowSource SQL could not be parsed
//   - FORM_BINDING_TYPE_MISMATCH   — ComboBox/ListBox RowSource column count
//                                    != 2 (text/value pair shape)
//
// All findings are informational and non-blocking (the tool's dispatch route
// is `read-only`). The agent decides what to act on; the lint never gates.

import type { FormIR, FormNode } from "../models/form-ir.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * One column from `get_schema`'s `{schema: [{name, type, ...}]}` payload.
 * Shape mirrors the dysflow `get_schema` runner output (issue #818 contract).
 */
export type ColumnSchema = {
  name: string;
  type: string;
  nullable: boolean;
};

/**
 * Aggregate schema the caller hands to `validateBindings`. Each key is a
 * table name (case-sensitive, no Access bracket-quoting); each value is the
 * list of columns `get_schema` returned for that table.
 *
 * Build shape: callers fan out `get_schema({ tableName })` once per table
 * they care about, then flatten the `{schema: [...]}` payloads into this
 * map. The aggregate is the single input parameter — this module never
 * fetches the schema itself.
 */
export type FormBindingSchema = Record<string, ColumnSchema[] | undefined>;

/**
 * One binding reference extracted from a ControlSource or RowSource.
 *
 * At least one of `table` / `column` is set:
 *   - bare-column reference (ControlSource = "Name"): `{ column: "Name" }`
 *     — no table can be statically resolved from the form's ControlSource;
 *     the validator skips these (the form's RecordSource decides at
 *     runtime).
 *   - bare-table reference (RowSource = `FROM Customers`): `{ table: "Customers" }`.
 *   - column-on-table reference (ControlSource = "Customers.Name", or
 *     RowSource column with alias resolved): `{ table, column }`.
 */
export type BindingRef = {
  table?: string;
  column?: string;
};

/**
 * One validation finding. Severity is always `"warning"` — the tool is
 * informational and never gating (matches the dispatch route risk).
 *
 * `code` is the machine-readable identifier (consumers filter by code).
 * `message` is human-readable. `controlName` names the offending control
 * when applicable. `data` carries structured detail (`table`, `column`,
 * `binding`, `reason`) so consumers can render their own messages without
 * parsing the English string.
 */
export type BindingFinding = {
  code:
    | "FORM_BINDING_MISSING_TABLE"
    | "FORM_BINDING_MISSING_COLUMN"
    | "FORM_BINDING_EMPTY"
    | "FORM_BINDING_SQL_UNPARSEABLE"
    | "FORM_BINDING_TYPE_MISMATCH";
  severity: "warning";
  message: string;
  controlName?: string;
  data?: Record<string, unknown>;
};

/**
 * Options for `validateBindings`. Currently empty — left as an additive
 * extension point so future controls (e.g. strict mode that elevates
 * warnings to errors, or per-control binding overrides) do not change the
 * signature.
 */
export type ValidateBindingsOptions = Record<string, never>;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Strip Access quoting from an identifier. Two quoting styles exist in real
 * .form.txt files: `[bracket]` (used for column/table references inside
 * expressions) and `"double"` (used for Name/Caption scalar values). The
 * validator normalizes both shapes so `[Customers].[Name]`,
 * `Customers.Name`, and any quoted identifier resolve to the same bare key.
 */
function stripBrackets(identifier: string): string {
  let value = identifier.trim();
  if (value.startsWith("[") && value.endsWith("]")) {
    value = value.slice(1, -1);
  }
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    value = value.slice(1, -1);
  }
  return value;
}

/**
 * Walk the FormIR tree and return every named control (mirrors the
 * `collectControls` in `form-ir-service.ts` but lives here so the validator
 * is self-contained — keeps the dependency graph tidy and the surface
 * obvious).
 */
function walkControls(node: FormNode): Array<{
  name: string;
  type: string;
  properties: Record<string, string>;
}> {
  const results: Array<{
    name: string;
    type: string;
    properties: Record<string, string>;
  }> = [];

  const nameEntry = node.entries.find((e) => e.kind === "scalar" && e.key === "Name");
  if (nameEntry && nameEntry.kind === "scalar") {
    const rawName = nameEntry.value.trim();
    const name = stripBrackets(rawName);
    const properties: Record<string, string> = {};
    for (const e of node.entries) {
      if (e.kind === "scalar") {
        properties[e.key] = e.value.trim();
      }
    }
    results.push({ name, type: node.blockType, properties });
  }
  for (const child of node.children) {
    results.push(...walkControls(child));
  }
  return results;
}

/**
 * Extract binding refs from a ControlSource scalar.
 *
 * Shape rules:
 *   - empty / whitespace → `[]` (caller maps this to FORM_BINDING_EMPTY).
 *   - The scalar value in a .form.txt is typically stored as a quoted
 *     string literal (`"=Customers.Name"`); the surrounding `"..."` is
 *     Access serialization noise, not part of the binding. The parser
 *     strips it before parsing.
 *   - Access assignment prefix `=` is stripped before parsing. Access
 *     stores `ControlSource` as `=Customers.Name` (the `=` is the assignment
 *     operator in Access expressions, NOT an "expression starts here"
 *     marker). A `=` followed by an identifier or bracket is a binding; a
 *     `=` followed by anything else (`(`, a literal, etc.) is an expression
 *     and returns `[]`.
 *   - `table.column` or `[table].[column]` → one ref with both set.
 *   - bare `column` (implicit table) → one ref with `column` only.
 *   - dotted chain (e.g. `a.b.c`) → one ref with `table=a, column=b.c`
 *     (rare in real Access forms; defensive against operator typos).
 *
 * The function never throws — every input shape returns either an array
 * of refs or an empty array. The validator composes the empty-array branch
 * into FORM_BINDING_EMPTY itself so this helper is purely structural.
 */
export function extractBindingsFromControlSource(value: string): BindingRef[] {
  // Step 1: strip the OUTER `"..."` scalar wrapper. The .form.txt parser
  // preserves the literal quotes on string values (`"=Customers.Name"`),
  // and `stripBrackets` would be too greedy on `[table].[column]` if we
  // let it run on the whole input. A dedicated scalar-strip step keeps
  // the per-side `[bracket]` stripping for the table/column split below.
  let trimmed = stripScalarWrap(value.trim());
  if (trimmed === "") return [];

  // Step 2: strip the Access assignment `=` prefix when followed by a
  // binding shape (identifier or `[`). Real expressions like `=IIf(...)`
  // or `=Date()` keep the `=` and fall through to the expression branch.
  if (trimmed.startsWith("=")) {
    const rest = trimmed.slice(1).trim();
    if (rest === "") return [];
    // Expression if the value contains characters that cannot appear in a
    // simple binding shape: function-call parens, literals, operators,
    // whitespace separators. A binding is `Identifier(.Identifier)?`
    // optionally with `[bracket]` quoting.
    if (/[(<>=!+\-*/%\s'"]/.test(rest)) {
      return [];
    }
    trimmed = rest;
  }

  // `table.column` — split on the first dot only so dotted chains survive.
  const dotIdx = trimmed.indexOf(".");
  if (dotIdx > 0) {
    const table = stripBrackets(trimmed.slice(0, dotIdx));
    const column = stripBrackets(trimmed.slice(dotIdx + 1));
    if (table === "" || column === "") return [];
    return [{ table, column }];
  }

  // Bare identifier — implicit table (resolved at runtime by Access from the
  // form's RecordSource). The validator cannot statically prove the column
  // exists on a specific table, so it emits the ref with no `table` field.
  const stripped = stripBrackets(trimmed);
  if (stripped === "") return [];
  return [{ column: stripped }];
}

/**
 * Strip ONLY the outer `"..."` scalar wrapping. Used for ControlSource
 * values where the parser emits the literal string with its surrounding
 * double quotes (`"=Customers.Name"`). Bracket-quoted identifiers
 * (`[table].[column]`) are NOT unwrapped here — those get handled by
 * `stripBrackets` per-side after the dot split.
 */
function stripScalarWrap(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * Extract binding refs from a RowSource SQL string. The parser is a
 * deliberately minimal regex-based analyzer — it is NOT a full SQL parser.
 * Scope:
 *   - Strip string literals and line comments before extracting identifiers
 *     (so embedded `'...'` text can't be misread as a column).
 *   - Identify every FROM / JOIN target. Resolve `AS <alias>` and bare
 *     `<alias> JOIN <target>` mappings so `c.Id` resolves to `Customers.Id`.
 *   - For every SELECT-list item, emit `{ table, column }` when the item
 *     carries an alias prefix (e.g. `c.Name`); emit `{ table: <target> }`
 *     only when the SELECT list has no columns (the validator only flags
 *     missing-column per ref, so bare-table refs are harmless).
 *
 * Unparseable input → `[]` (caller maps this to FORM_BINDING_SQL_UNPARSEABLE
 * when the input is non-empty).
 */
export function extractBindingsFromRowSource(sql: string): BindingRef[] {
  const trimmed = sql.trim();
  if (trimmed === "") return [];

  // Defensive: strip single-quoted string literals and `/* ... */` /
  // `-- ...` comments so their contents don't pollute the identifier scan.
  const cleaned = trimmed
    .replace(/'[^']*(?:''[^']*)*'/g, "''") // string literals
    .replace(/\/\*[\s\S]*?\*\//g, " ") // block comments
    .replace(/--[^\n]*/g, " "); // line comments

  const refs: BindingRef[] = [];
  const aliasToTable = new Map<string, string>();
  // Track every FROM/JOIN target in order so bare SELECT-list columns can
  // be attached to the most recently declared target (the standard SQL
  // placement — `SELECT cols FROM t` joins project cols onto `t`).
  const orderedTargets: string[] = [];

  // FROM / JOIN target scan. Each match captures the target table and an
  // optional alias. Bare `<alias> JOIN <target> ON ...` is also accepted —
  // common in real Access SQL.
  const fromJoinRegex =
    /\b(?:FROM|(?:(?:INNER|LEFT|RIGHT|OUTER|CROSS|FULL)\s+)*JOIN)\s+(\[?\w+\]?)(?:\s+AS)?\s*(\[?\w+\]?)?/gi;
  const fromMatches = cleaned.matchAll(fromJoinRegex);
  for (const fromMatch of fromMatches) {
    const target = stripBrackets(fromMatch[1] ?? "");
    const alias = fromMatch[2] ? stripBrackets(fromMatch[2]) : "";
    if (target === "") continue;
    refs.push({ table: target });
    orderedTargets.push(target);
    if (alias !== "" && alias.toLowerCase() !== target.toLowerCase()) {
      aliasToTable.set(alias.toLowerCase(), target);
    } else if (alias !== "") {
      // `FROM Customers AS Customers` (rare) — register the alias anyway so
      // `Customers.Id` still resolves.
      aliasToTable.set(alias.toLowerCase(), target);
    }
  }

  // SELECT-list column scan. Match `<alias>.<column>` first, then fall back
  // to bare `<column>` (attached to the most recent FROM/JOIN target).
  // Multi-dot identifiers (`a.b.c`) are treated as `<table>.<column>.<rest>`
  // (rare in real Access; defensive against typos).
  const selectRegex = /\bSELECT\b([\s\S]+?)\bFROM\b/i;
  const selectMatch = selectRegex.exec(cleaned);
  if (selectMatch && selectMatch[1] !== undefined) {
    const list = selectMatch[1];
    // The most recent target up to the SELECT-list position. In a single
    // SELECT-from-one-table this is the FROM table; with JOINs it's the
    // last declared JOIN target, matching standard SQL convention.
    const fallbackTable = orderedTargets[orderedTargets.length - 1] ?? "";
    for (const raw of list.split(",")) {
      const item = raw.trim();
      if (item === "" || item === "*") continue;
      // Strip trailing alias `AS foo` — we don't track column renames.
      const asSplit = /\s+AS\s+\w+$/i.exec(item);
      const clean = asSplit ? item.slice(0, asSplit.index) : item;
      // `alias.column` form.
      const dotIdx = clean.indexOf(".");
      if (dotIdx > 0) {
        const alias = stripBrackets(clean.slice(0, dotIdx));
        const column = stripBrackets(clean.slice(dotIdx + 1));
        if (column === "") continue;
        const resolved = aliasToTable.get(alias.toLowerCase()) ?? alias;
        if (resolved === "") continue;
        refs.push({ table: resolved, column });
        continue;
      }
      // Bare column — attach to the most recent FROM/JOIN target when we
      // know it. The validator cannot otherwise prove the column exists on
      // any specific table; this branch is the common case for simple
      // Access RowSource like `SELECT Id, Name FROM Customers`.
      const column = stripBrackets(clean);
      if (column === "") continue;
      if (fallbackTable !== "") {
        refs.push({ table: fallbackTable, column });
      }
    }
  }

  return refs;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Validate every binding in the form contract against the supplied schema.
 *
 * Pure function. Returns a flat list of `BindingFinding`s — never mutates
 * the input `ir` or `schema`, never throws. The caller decides how to
 * render the findings; the validator emits structured `data` so consumers
 * can format their own messages without parsing the English string.
 *
 * Severity is always `"warning"`. The dispatch route for the MCP tool is
 * `read-only`; this module never gates.
 */
export function validateBindings(
  ir: FormIR,
  schema: FormBindingSchema,
  options?: ValidateBindingsOptions,
): BindingFinding[] {
  // options reserved for additive extension (strict mode, etc.).
  void options;
  const findings: BindingFinding[] = [];
  const controls = walkControls(ir.root);

  for (const control of controls) {
    const controlSource = control.properties.ControlSource;
    const rowSource = control.properties.RowSource;

    // ── ControlSource ────────────────────────────────────────────────────
    if (controlSource !== undefined) {
      if (controlSource.trim() === "") {
        findings.push({
          code: "FORM_BINDING_EMPTY",
          severity: "warning",
          message: `Control "${control.name}" has an empty ControlSource binding.`,
          controlName: control.name,
          data: { binding: "ControlSource" },
        });
      } else {
        const refs = extractBindingsFromControlSource(controlSource);
        for (const ref of refs) {
          if (ref.table === undefined) continue; // bare column: no table to validate
          const columns = schema[ref.table];
          if (columns === undefined) {
            findings.push({
              code: "FORM_BINDING_MISSING_TABLE",
              severity: "warning",
              message: `Control "${control.name}" binds to table "${ref.table}" which is not in the supplied schema.`,
              controlName: control.name,
              data: { table: ref.table, column: ref.column, binding: "ControlSource" },
            });
            continue;
          }
          if (ref.column !== undefined) {
            const exists = columns.some((c) => c.name === ref.column);
            if (!exists) {
              findings.push({
                code: "FORM_BINDING_MISSING_COLUMN",
                severity: "warning",
                message: `Control "${control.name}" binds to column "${ref.table}.${ref.column}" which is not in the schema for "${ref.table}".`,
                controlName: control.name,
                data: { table: ref.table, column: ref.column, binding: "ControlSource" },
              });
            }
          }
        }
      }
    }

    // ── RowSource ────────────────────────────────────────────────────────
    if (rowSource !== undefined) {
      const trimmedRowSource = rowSource.trim();
      if (trimmedRowSource !== "") {
        const refs = extractBindingsFromRowSource(rowSource);
        const fromRegex = /\bFROM\b/i;
        const hasFromClause = fromRegex.test(rowSource);
        const isSqlLike = /\bSELECT\b/i.test(rowSource);

        if (refs.length === 0 && (hasFromClause || !isSqlLike)) {
          // The SQL parser emitted no refs and either it had a FROM clause
          // (so it should have produced refs) or it does not look like SQL
          // at all. Both surfaces map to FORM_BINDING_SQL_UNPARSEABLE so
          // the agent knows the binding is opaque to the validator.
          //
          // Note: a SELECT *literal* (no FROM) legitimately returns [] — we
          // only flag when a FROM was attempted or the input is not SQL.
          if (hasFromClause || !isSqlLike) {
            findings.push({
              code: "FORM_BINDING_SQL_UNPARSEABLE",
              severity: "warning",
              message: `Control "${control.name}" has a RowSource that could not be parsed as SQL.`,
              controlName: control.name,
              data: { rowSourcePreview: trimmedRowSource.slice(0, 80), binding: "RowSource" },
            });
            continue; // skip the type-mismatch check; the SQL is opaque
          }
        }

        // Validate every ref.
        for (const ref of refs) {
          if (ref.table === undefined) continue; // bare column from RowSource: skip (no table)
          const columns = schema[ref.table];
          if (columns === undefined) {
            findings.push({
              code: "FORM_BINDING_MISSING_TABLE",
              severity: "warning",
              message: `Control "${control.name}" RowSource references table "${ref.table}" which is not in the supplied schema.`,
              controlName: control.name,
              data: { table: ref.table, column: ref.column, binding: "RowSource" },
            });
            continue;
          }
          if (ref.column !== undefined) {
            const exists = columns.some((c) => c.name === ref.column);
            if (!exists) {
              findings.push({
                code: "FORM_BINDING_MISSING_COLUMN",
                severity: "warning",
                message: `Control "${control.name}" RowSource references column "${ref.table}.${ref.column}" which is not in the schema for "${ref.table}".`,
                controlName: control.name,
                data: { table: ref.table, column: ref.column, binding: "RowSource" },
              });
            }
          }
        }

        // ComboBox/ListBox shape check: SELECT must return 2+ columns
        // (value + display pair). 1 column is a known smell — the value
        // column doubles as the display, which makes the UX ambiguous.
        if (control.type === "ComboBox" || control.type === "ListBox") {
          const selectMatch = /\bSELECT\b([\s\S]+?)\bFROM\b/i.exec(rowSource);
          if (selectMatch && selectMatch[1] !== undefined) {
            const columns = selectMatch[1]
              .split(",")
              .map((c) => c.trim())
              .filter((c) => c !== "" && c !== "*");
            if (columns.length === 1) {
              findings.push({
                code: "FORM_BINDING_TYPE_MISMATCH",
                severity: "warning",
                message: `Control "${control.name}" (${control.type}) RowSource returns exactly one column; ${control.type} expects 2+ (value + display).`,
                controlName: control.name,
                data: {
                  reason: `${control.type} expects 2+ columns (value + display)`,
                  columnCount: columns.length,
                  binding: "RowSource",
                },
              });
            }
          }
        }
      }
    }
  }

  return findings;
}
