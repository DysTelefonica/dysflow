# Exploration: detect-dead-code (#705)

## Topic

Add a dead-code detection feature (`dysflow_detect_dead_code`) that identifies VBA
procedures and module-level declarations that are defined but never referenced.

## Current State

The codebase already ships #701 procedure-introspection tools built on
`vba-procedure-service.ts`:

- `listVbaProcedures` (line 79): parses declaration lines stripped of string
  literals via `stripStrings`, then matched against `DECLARATION_RE`.
- `findVbaReferences` (line 255): accepts a `modules` map and a symbol name,
  returns all lines where the symbol appears (definition lines excluded).

`stripStrings` exists at line 61 of `vba-procedure-service.ts`:

```typescript
function stripStrings(text: string): string {
  return text.replace(/"([^"]|"")*"/g, "''");
}
```

However, **`findVbaReferences` does NOT call `stripStrings`** before searching.
At line 269 it calls `removeComment(rawLine)`, which strips comment text
(char-by-char, respecting `"` toggle) but leaves string content intact. This means
`Application.Run "UnusedProcedure"` is currently counted as a live reference to
`UnusedProcedure` — the string literal is not stripped.

This is the gap dead-code detection must close: string literals must be stripped
before the reference-search regex is tested.

## Affected Areas

| File | Why affected |
|------|-------------|
| `src/core/services/vba-procedure-service.ts` | New `detectDeadCode` core function; `findVbaReferences` search phase must strip string literals |
| `src/adapters/mcp/tools.ts` | Append `"dysflow_detect_dead_code"` to `MODERN_TOOL_NAMES`; wire custom handler alongside `#701` procedure tools |
| `src/adapters/mcp/mcp-tool-contracts.ts` | `modernContracts.dysflow_detect_dead_code` entry (`read-only`, `writeGate: none`) |
| `src/adapters/mcp/schemas/dysflow-schemas.ts` | `DETECT_DEAD_CODE_SCHEMA` (with `additionalProperties: false`) |
| `test/core/services/vba-procedure-service.test.ts` | New unit tests for `detectDeadCode` including string-literal exclusion cases |
| `test/adapters/mcp/` | Integration / contract tests for the new MCP tool |

NOT touched: `dispatch-routes.ts`, `mcp-tool-registry.ts` — modern tools bypass those legacy registries.

## Approaches

### Approach A — Pure core service + read-only MCP adapter (recommended)

**Design**: Add `detectDeadCode(modules: Record<string, string>, opts?: { scope?: "binary" | "source" | "module"; module?: string }): DeadCodeReport | undefined`
to `vba-procedure-service.ts`. The function:

1. Collects all declared procedures via `listVbaProcedures` across all modules.
2. For each procedure, calls `findVbaReferences` (patched to strip strings before
   the search regex) to determine if it has any non-string, non-definition references.
3. Procedures with zero references are returned as dead code.

The MCP adapter exposes `dysflow_detect_dead_code` as a read-only tool (no binary
mutation, no filesystem write), wired through the existing `vba-sync` route kind.

**String-literal exclusion implementation**: in `findVbaReferences`, apply
`stripStrings` to `cleanLine` before the `searchRegex.test(cleanLine)` check.
This must be done only in the reference-search phase (not the definition-check
phase), so definition checks continue to work correctly (a `Const Foo = "Bar"`
declaration is still found as a definition even though `"Bar"` contains `Bar`).

**Pros**:
- Orthogonal to `vba_orphan_audit`: the orphan audit is about module-level
  temporary/orphan modules; dead-code is about procedure-level reachability.
- Read-only MCP contract — no write gate, no binary mutation risk.
- Feels natural alongside `dysflow_list_procedures` / `dysflow_find_references`.
- Core logic stays in `core/services`, adapters only wire the tool.

**Cons**:
- Modifies `findVbaReferences` search phase — must be verified carefully to avoid
  breaking the existing reference-search behavior for non-dead-code use cases.

**Effort**: Medium — small core change + MCP wiring + tests.

---

### Approach B — Separate `stripStrings`-aware reference searcher

**Design**: Keep `findVbaReferences` unchanged. Add a new internal helper
`findStringAwareReferences` in `vba-procedure-service.ts` that is used only by
`detectDeadCode`. This avoids any risk to existing `findVbaReferences` callers.

**Pros**:
- Zero risk to existing `findVbaReferences` behavior.
- Clear separation: dead-code has its own string-aware search.

**Cons**:
- Code duplication: two similar search functions that differ only in the
  string-stripping step.
- Maintenance burden over time.

**Effort**: Medium — similar to A but with duplication.

---

### Approach C — Extend `vba_orphan_audit` to include procedure-level dead-code

**Design**: Add dead-code detection as a sub-capability of the orphan audit tool.

**Cons**:
- `vba_orphan_audit` operates at module granularity (temporary/inline modules),
  not procedure granularity. Mixing concerns violates single responsibility.
- Read-only vs. write-gated questions arise: orphan audit is read-only
  (`mutatesBinary: false, mutatesFilesystem: false`) — same as A — but the
  semantic scope mismatch makes this a poor fit.
- Explicitly called out in the brief as the wrong direction.

**Effort**: High — significant refactor of existing tool scope.

## Recommendation

**Approach A** is the recommended path.

`findVbaReferences` is used only in `tools.ts` (3 callers) and has a single
well-defined responsibility. The string-stripping gap in the search phase is a
targeted fix: add `stripStrings(cleanLine)` before the `searchRegex.test(...)`
check in the reference-search loop (line 301), and create `detectDeadCode` as a
new exported function. The MCP adapter wires `dysflow_detect_dead_code` as a
read-only tool consistent with the existing `#701` procedure tools.

## Risks

1. **Behavioral regression in `findVbaReferences`**: If the string-stripping
   change to the search phase is not scoped precisely, existing callers that
   depend on the current (string-aware) reference search could break. Mitigation:
   unit tests with explicit string-literal scenarios must be added alongside the
   change, and `findVbaReferences` must retain its current behavior for all
   non-dead-code use cases.
2. **VBA string edge cases**: The `stripStrings` regex `"([^"]|"")*"` handles
   basic string literals but VBA strings can contain escaped double-quotes via
   `""`. The regex collapses `""` to `''` which preserves placeholder length,
   but a string containing the symbol name (e.g. `Const Msg = "UnusedProcedure"`)
   would still have `UnusedProcedure` stripped and not counted as a reference —
   which is the desired dead-code behavior.
3. **Public vs. published API**: If an external consumer calls `findVbaReferences`
   and relies on string content being searchable (an unusual but possible use
   case), this change would alter behavior. Given the tool is internal
   (`src/core`), this risk is low.

## Ready for Proposal

**Yes.** The feature is well-scoped, the foundation (#701 procedure tools) is
in `origin/main`, the string-literal gap is confirmed, and the approach is
low-risk with clear boundaries. The next step is `sdd-propose` to formalize
intent and scope.
