# Design: detect-dead-code (#705)

## Approach

Add `detectDeadCode(modules, opts)` to `src/core/services/vba-procedure-service.ts`
and expose it as the read-only MCP tool `dysflow_detect_dead_code`. Walks every
module's procedures via `listVbaProcedures`, calls the patched
`findVbaReferences` (string-stripping before search) per procedure, emits a
structured report with definition site, allowlist reason, and risk.

Two corrections to the proposal, verified against `feat/705-dead-code`:

- `findVbaReferences` already uses `\b<symbol>\b` (line 283). No regex change needed.
- `#701` tools live in `MODERN_TOOL_NAMES` (`tools.ts:249-261`) and
  `modernContracts` (`mcp-tool-contracts.ts:121-176`), NOT in
  `dispatch-routes.ts` or `mcp-tool-registry.ts`. The new tool follows the
  **modern path** (same as `dysflow_find_references`); `vba_orphan_audit` is
  the wrong sibling.

## Architecture Decisions

| Decision | Choice | Why |
|---|---|---|
| Location | `vba-procedure-service.ts` (core) | Pure, no I/O; same module as `findVbaReferences`. |
| Patch `findVbaReferences` | **Patch** search phase only | Avoids duplication; one canonical search is the bug surface. |
| Apply `stripStrings` | Reference-search phase only, after `removeComment` | Definition phase must keep seeing `Const X = "Y"` to detect Y's site. |
| Substring handling | None | `\b<sym>\b` already enforces. |
| Excluded names | Regex allowlist (lifecycle + event suffixes + AutoExec) | Bounded per proposal's "no `.form.txt` parsing". Pinned in tests. |
| Risk | Static only, three tiers | Cross-binary reachability out of scope (#705). |
| MCP wiring | Modern tool pattern (custom handler) | Mirrors `#701`; matches multi-source input shape. |

## Data Flow

```
caller -> dysflow_detect_dead_code(?, modules?, module?, scope?)
   inline `modules`?  -> detectDeadCode(modules, opts)
   else               -> resolveAllProjectModules(input, ctx) -> modules
detectDeadCode(modules, opts):
   procs = unique(listVbaProcedures across modules)
   for each proc:
      refs = findVbaReferences(modules, proc.name)  // patched
      if refs == 0 AND name not in EXCLUDED_NAMES:
         emit DeadCodeFinding { risk = classify(proc) }
```

## Result Shape

Exports `DeadCodeKind = "sub"|"function"|"property"|"declaration"`; `DeadCodeRisk
= "Low"|"Med"|"High"`; `DeadCodeFinding { symbol, module, kind, line, evidence:
{ scannedModules, referenceCount }, risk }`; `DeadCodeReport
{ scope, module?, scannedModules, scannedAt, findings, summary: { total, low,
med, high } }`; and `detectDeadCode(modules, opts?): DeadCodeReport | undefined`.
The function returns `undefined` when a requested `module` filter matches no
input module; the MCP handler maps that signal to `MODULE_NOT_FOUND`.

## Reference-Search Patch

One new line in `findVbaReferences` (loop at line 296-317): before
`searchRegex.test(cleanLine)`, derive `searchLine = stripStrings(cleanLine)`
and run the regex on `searchLine`. `isDefinitionLine` keeps using `cleanLine`
so a body like `Public Sub X() : Const M = "X" : End Sub` still recognises X as
the definition site. Definition phase untouched. Public API preserved.

## Exclusion & Risk

Allowlist (no `.form.txt` parsing): `AutoExec` (case-insensitive);
`^(Form|Report|Class)_[A-Z]\w+$` lifecycle;
`_(?:Click|DblClick|Change|GotFocus|LostFocus|KeyPress|KeyDown|KeyUp|MouseDown|MouseUp|MouseMove|BeforeUpdate|AfterUpdate|BeforeInsert|AfterInsert|BeforeDelConfirm|AfterDelConfirm|Enter|Exit|NotInList|Updated|Dirty|Undo|Filter)$`
control events; `^Auto(?:Exec|Open|Close|Exit|New|Compact)$`, `^NewConnection$`
reserved. Public `Const`/`Type`/`Enum` are NOT auto-excluded — reported as
Risk `High`.

Risk tiers when reported as dead: `Low` = Private Sub/Function/Property;
`Med` = Public or unnamed visibility; `High` = Public module-level
`Const`/`Type`/`Enum` (callers may live in unparsed sources).

## MCP Tool Contract (read-only)

- Append `"dysflow_detect_dead_code"` to `MODERN_TOOL_NAMES` (`tools.ts`).
- `modernContracts`: `{ access: "read-only", writeGate: "none", summary: "Read-only MCP contract." }`.
- Schema `DETECT_DEAD_CODE_SCHEMA` (`schemas/dysflow-schemas.ts`): `projectId`,
  `contextId`, `modules: { [k:string]:string }`, `module?:string`,
  `scope: "binary"|"source"|"module"`, `kind?: VbaProcedureKindFilter`, plus
  `...ACCESS_OVERRIDE`, `...STRICT_CTX`; `additionalProperties: false`.
- Handler after `dysflow_find_references`: inline `modules` → call directly;
  else `resolveAllProjectModules(input, destinationRoot, ctx)`; on `undefined`
  → `MODULE_NOT_FOUND` (same wording as `#701`); else JSON-serialise report.
- Never opens Access, never spawns PowerShell. No `dryRun`/`apply`.

Errors: empty source tree → `findings: []`; missing `module` constraint →
`MODULE_NOT_FOUND`; bad `scope` or `modules` shape → schema rejects.

## File Changes

| File | Action |
|---|---|
| `src/core/services/vba-procedure-service.ts` | Add `stripStrings(cleanLine)` line; export types, `EXCLUDED_NAME_PATTERNS`, `detectDeadCode`. |
| `src/adapters/mcp/tools.ts` | Append to `MODERN_TOOL_NAMES`; add handler entry. |
| `src/adapters/mcp/mcp-tool-contracts.ts` | Add `modernContracts` entry. |
| `src/adapters/mcp/schemas/dysflow-schemas.ts` | Add `DETECT_DEAD_CODE_SCHEMA`. |
| `test/core/services/vba-procedure-service.test.ts` | RED-first scenarios + regression pins. |
| `test/adapters/mcp/` | Contract tests. |
| `docs/mcp-examples.md` | Add inline-modules and project-scope payloads. |

NOT touched: `dispatch-routes.ts`, `mcp-tool-registry.ts`,
`schemas/vba-sync-schemas.ts` — modern tools bypass these.

## Testing Strategy

**Unit (core, 15 cases).** Detection: definition-only dead→Low;
`Application.Run "X"` → dead; cross-module ref → not dead; `AutoExec` excluded;
`cmdSave_Click` excluded; `Form_Load` excluded; `MyFoo`+`Foo` defs, only
`MyFoo` referenced → `Foo` dead; Public `Const` no ref → High; scope narrows;
kind filters; empty modules → empty report; symbol escaping (`Foo$Bar`).
Regression pins for `findVbaReferences`: `'Call X` → 0 refs;
`Application.Run "X"` → 0 refs; existing 2-ref case still 2 refs.

**Integration (4 cases).** Bad `scope` rejected; inline `modules` returns
report; missing module → `MODULE_NOT_FOUND`;
`modernContracts.dysflow_detect_dead_code.access === "read-only"`.

All unit tests string-in/string-out — no FS or Access dependency.

## Risks

| Risk | Mitigation |
|---|---|
| `findVbaReferences` drift for `#701` callers (Low) | Regression pins; public contract preserved. |
| Allowlist drops legitimate dead code (Med) | Documented; every exclusion pinned in tests; Risk tier surfaces unknown applicability. |
| Symbol with non-word chars (Low) | `escapeRegExp` before regex build; tested. |
| `Application.Run "Module1.ProcName"` → reported dead (Med) | Desired — string literal is non-code; pinned. |

## Open Questions, Rollback & Traceability

- Open: `confidence:"strict"|"loose"` toggle? Default `"strict"` (allowlist honored); defer. Open: `.form.txt` event-binding parsing for tighter Public-tier risk — out of scope (#705).
- Rollback: additive + read-only. `git revert` removes the patch line + new exports. No binary, no FS state. `pnpm test` gates CI.
- Traceability: GitHub #705 (primary), #615 (duplicate). Sibling: `vba_orphan_audit` (module-level; orthogonal).
