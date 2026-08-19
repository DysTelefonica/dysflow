# Tasks: `test_vba` filter object support (`{tag: "..."}`)

> **SDD phase:** tasks
> **GitHub issue:** [#1442](https://github.com/DysTelefonica/dysflow/issues/1442)
> **Proposal:** `openspec/changes/test-vba-tag-filter-object/proposal.md`
> **Spec:** `openspec/changes/test-vba-tag-filter-object/specs/mcp-tool-test-vba/spec.md`
> **Design:** `openspec/changes/test-vba-tag-filter-object/design.md`

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 200–300 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

---

## Phase 1: Schema & Type Foundation

- [x] **1.1** Update `SCHEMA_PROPS.filter` description in `src/shared/validation/schema-props.ts:169` to declare both shapes (`string` and `{tag: string}`) with `additionalProperties: false` guidance. Type stays `"string"` per D1.
  **Files:** `src/shared/validation/schema-props.ts`
  **Verify:** `pnpm exec biome check src/shared/validation/schema-props.ts`

- [x] **1.2** Verify `test_vba` inputSchema in `src/adapters/mcp/schemas/vba-sync-schemas.ts:533-558` references `SCHEMA_PROPS.filter`. If it inlines instead, mirror the description update inline.
  **Files:** `src/adapters/mcp/schemas/vba-sync-schemas.ts`
  **Verify:** `pnpm exec biome check src/adapters/mcp/schemas/vba-sync-schemas.ts`

- [x] **1.3** Add `TestFilterParts` discriminated union type co-located with `parseTestFilter` in `src/adapters/vba-sync/vba-execution-adapter.ts`.
  **Files:** `src/adapters/vba-sync/vba-execution-adapter.ts`
  **Verify:** `pnpm exec tsc --noEmit src/adapters/vba-sync/vba-execution-adapter.ts`

---

## Phase 2: Core Implementation

- [x] **2.1** Refactor `parseTestFilter` (`vba-execution-adapter.ts:1023`) to accept `unknown`, branch on shape, and return `TestFilterParts | undefined`. Empty object → `MCP_INPUT_INVALID`; empty `tag` → `MCP_INPUT_INVALID`; wrong-type `tag` → `MCP_INPUT_INVALID`; unknown field → `MCP_INPUT_INVALID` listing the unknown key; `{tags:[...]}` → `MCP_INPUT_INVALID` with redirect message.
  **Files:** `src/adapters/vba-sync/vba-execution-adapter.ts`
  **Verify:** `pnpm exec biome check src/adapters/vba-sync/vba-execution-adapter.ts && pnpm test test/adapters/vba-sync/vba-execution-adapter.test.ts --grep "parseTestFilter"`

- [x] **2.2** Extend `matchesTestFilter` (`vba-execution-adapter.ts:1033`) to accept the new union, add `kind === "tag_only"` branch that only consults `test.tags[]` case-insensitively (per spec scenario "object form does not consult name or procedure").
  **Files:** `src/adapters/vba-sync/vba-execution-adapter.ts`
  **Verify:** `pnpm test test/adapters/vba-sync/vba-execution-adapter.test.ts --grep "matchesTestFilter"`

- [x] **2.3** Update the filter-application call site at `resolveTestProceduresJson` (lines 744-748) to pass `TestFilterParts` instead of bare `string[]`.
  **Files:** `src/adapters/vba-sync/vba-execution-adapter.ts`
  **Verify:** `pnpm test test/adapters/vba-sync/vba-execution-adapter.test.ts`

---

## Phase 3: Unit Tests

- [x] **3.1** Add `describe("parseTestFilter object branch")` section in `test/adapters/vba-sync/vba-execution-adapter.test.ts` with at least 7 cases: `{tag:"smoke"}` → tag_only; `{tag:"  SMOKE  "}` → lowercased+trimmed; `{}` → `MCP_INPUT_INVALID` (empty); `{tag:""}` → `MCP_INPUT_INVALID` (empty tag); `{tag:123}` → `MCP_INPUT_INVALID` (type); `{tag:"x",foo:"y"}` → `MCP_INPUT_INVALID` (unknown field); `{tags:["smoke"]}` → `MCP_INPUT_INVALID` (redirect).
  **Files:** `test/adapters/vba-sync/vba-execution-adapter.test.ts`
  **Verify:** `pnpm test test/adapters/vba-sync/vba-execution-adapter.test.ts --grep "parseTestFilter object branch"`

- [x] **3.2** Add `describe("matchesTestFilter tag_only branch")` section in the same test file with at least 4 cases: tag substring match; name-only hit (substring in `name` but not `tags[]`) → no match; case-insensitive; empty `tags[]` → no match.
  **Files:** `test/adapters/vba-sync/vba-execution-adapter.test.ts`
  **Verify:** `pnpm test test/adapters/vba-sync/vba-execution-adapter.test.ts --grep "matchesTestFilter tag_only"`

- [x] **3.3** Add end-to-end integration cases in the same test file covering spec acceptance scenarios: `filter: {tag:"smoke"}` selects atom with `tags:["smoke","regression"]`; `filter: {tag:"smoke"}` does NOT select atom with `name:"Test_Smoke"` but empty `tags[]`; `filter: "smoke"` still OR-matches across name, procedure, and tags.
  **Files:** `test/adapters/vba-sync/vba-execution-adapter.test.ts`
  **Verify:** `pnpm test test/adapters/vba-sync/vba-execution-adapter.test.ts --grep "test_vba manifest filter"`

---

## Phase 4: Doc-Anchored & Runtime Tests

- [x] **4.1** Create `test/adapters/mcp/test-vba-filter-shape-doc-anchor-1442.test.ts` that calls `describe_tool({name:"test_vba"})` via `createDysflowMcpTools`, asserts the `filter` parameter description mentions both the string form and the `{tag:` form, and is anchored against the live runtime surface (not a string literal).
  **Files:** `test/adapters/mcp/test-vba-filter-shape-doc-anchor-1442.test.ts`
  **Verify:** `pnpm test test/adapters/mcp/test-vba-filter-shape-doc-anchor-1442.test.ts`

- [x] **4.2** Create `test/docs/test-vba-filter-doc.test.ts` that reads `docs/api/mcp-tools.md`, finds the `test_vba` section, and asserts the paragraph contains one `filter: string`-style literal AND one `filter: { tag:` literal.
  **Files:** `test/docs/test-vba-filter-doc.test.ts`
  **Verify:** `pnpm test test/docs/test-vba-filter-doc.test.ts`

---

## Phase 5: Documentation Updates

- [x] **5.1** Update `docs/api/mcp-tools.md` `test_vba` section: refresh the `filter` description string to cover both shapes; add one `{tag:"smoke"}` example under the same heading as the string examples.
  **Files:** `docs/api/mcp-tools.md`
  **Verify:** `pnpm test test/docs/test-vba-filter-doc.test.ts`

- [x] **5.2** Update `assets/examples/test-vba.md`: add a "Filter by tag" section with a `{tag:"smoke"}` example and a note that `{tags:[...]}` is not supported and must use the singular form.
  **Files:** `assets/examples/test-vba.md`
  **Verify:** `grep -n "filter.*tag" assets/examples/test-vba.md | wc -l` (should be ≥ 2)

- [x] **5.3** Update `skills/dysflow-usage/SKILL.md` `test_vba` section to show both shapes.
  **Files:** `C:\Users\adm1\.config\opencode\skills\dysflow-usage\SKILL.md`
  **Verify:** `grep -n "filter.*tag" "C:\Users\adm1\.config\opencode\skills\dysflow-usage\SKILL.md" | wc -l` (should be ≥ 1)

---

## Phase 6: Changelog

- [x] **6.1** Add entry in `CHANGELOG.md` under `[Unreleased]` (or `[v2.37.4]` if section exists) noting `feat(mcp): test_vba filter accepts {tag:"..."} object form for tag-only matching (#1442)`. If the unreleased section does not exist, create it above `[v2.37.3]`.
  **Files:** `CHANGELOG.md`
  **Verify:** `grep -n "1442" CHANGELOG.md`

---

## Verification Summary

| Command | Scope |
|---------|-------|
| `pnpm exec biome check src/shared/validation/schema-props.ts src/adapters/mcp/schemas/vba-sync-schemas.ts src/adapters/vba-sync/vba-execution-adapter.ts` | Lint all modified source |
| `pnpm exec tsc --noEmit` | TypeScript compile check |
| `pnpm test test/adapters/vba-sync/vba-execution-adapter.test.ts` | Unit + integration tests (all parseTestFilter + matchesTestFilter cases) |
| `pnpm test test/adapters/mcp/test-vba-filter-shape-doc-anchor-1442.test.ts` | Runtime-schema doc-anchor test |
| `pnpm test test/docs/test-vba-filter-doc.test.ts` | Doc-coverage test |
| `pnpm test` | Full vitest suite |

---

## Apply-phase deviations from design

Two design details were contradicted by the code and corrected during apply.
Both preserve D1's intent (the adapter owns object validation); neither changes
scope or the spec's acceptance scenarios.

### 1. `filter` declares no `type` — it could not stay `"string"`

Design §5 and task 1.1 specified `type: "string"` with a description-only
refresh. That shape makes the feature unreachable: `validateJsonSchemaProperty`
(`src/shared/validation/validator.ts:96-97`) rejects a mismatch before the
adapter runs, so `filter: { tag: "smoke" }` returned `filter must be a string.`
at the MCP boundary and `parseTestFilter` was never called.

Evidence (live validator, pre-fix): `validateInput({filter:{tag:"smoke"}}, VBA_SYNC_TOOL_SCHEMAS.test_vba)` → `"filter must be a string."`

`JsonSchemaProperty.type` is optional and `validateJsonSchemaProperty` skips
type enforcement when neither `type` nor `enum` is set (line 95) — that is the
validator's own escape hatch and the only way to express the union without
adding `oneOf` support. The property now omits `type`, which is exactly D1's
"validation belongs to `parseTestFilter`", enforced rather than merely stated.

### 2. `test_vba` uses a dedicated `testFilter` property

Design §4 predicted `vba-sync-schemas.ts:541` would inherit the change
automatically. `SCHEMA_PROPS.filter` is shared by five tools — `export_modules`,
`export_all`, `list_objects`, `test_vba`, and `harvest_form_catalog` — so
widening it in place would have stripped the boundary type guard from four
unrelated tools (design risk R5, realized). `test_vba` now points at a separate
`SCHEMA_PROPS.testFilter`; the shared property is untouched. The containment is
pinned by a parameterized case in the runtime-anchored test.

### 3. Unit tests exercise the port, not the private helpers

Tasks 3.1/3.2 name `parseTestFilter` / `matchesTestFilter` directly. Both are
file-local with no export, and design §5 explicitly forbids new exports. The
repo's testing philosophy (`docs/testing/testing-philosophy.md`) also requires
testing at the ports rather than private collaborators, and every spec scenario
is written as a `test_vba({ filter: ... })` invocation. The describe blocks keep
the task names, but assertions run through `adapter.execute("test_vba", ...)`
and check selected procedures and error codes — behavior that survives moving
logic between the two helpers.

### 4. Task 5.3 targeted the in-repo skill

Task 5.3 listed `C:\Users\adm1\.config\opencode\skills\dysflow-usage\SKILL.md`,
outside the repository. The in-repo `skills/dysflow-usage/SKILL.md` is the
canonical source this change ships; the user-level copy is regenerated by
`dysflow install` / `dysflow update`.

---

*Generated by `sdd-tasks` — 14 tasks, 6 phases, single PR target.*
