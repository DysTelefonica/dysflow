# Design: `test_vba` filter object support (`{tag: "..."}`)

> **SDD phase:** design (HOW)
> **GitHub issue:** [#1442](https://github.com/DysTelefonica/dysflow/issues/1442)
> **Proposal:** `openspec/changes/test-vba-tag-filter-object/proposal.md`
> **Spec:** `openspec/changes/test-vba-tag-filter-object/specs/mcp-tool-test-vba/spec.md`
> **Artifact store:** hybrid (this file + Engram `sdd/test-vba-tag-filter-object/design`)
> **Rollout target:** v2.37.4

---

## 1. Technical Approach

Widen the `test_vba` `filter` parameter from `string` to `string | { tag: string }`
without changing the matching algorithm. `matchesTestFilter` at
`src/adapters/vba-sync/vba-execution-adapter.ts:1033` already implements the
spec's exact tag-substring semantics; `parseTestFilter` at line 1023 only feeds
it `filterParts: string[]` derived from the string shape. Three moves:

1. **Schema layer (`src/shared/validation/schema-props.ts:185`)**: add a new
   dedicated `SCHEMA_PROPS.testFilter` property whose description advertises
   both shapes and whose `type` field is intentionally omitted — see Decision
   D1 and the apply-phase note in `tasks.md`. The shared `SCHEMA_PROPS.filter`
   stays string-only so `export_modules`, `export_all`, `list_objects`, and
   `harvest_form_catalog` keep their boundary type guard.
2. **Adapter layer (`vba-execution-adapter.ts:1023, :1033, :744-748`)**:
   `parseTestFilter` returns a discriminated union; `matchesTestFilter` switches
   on `kind`. Object validation (empty body, empty `tag`, non-string `tag`,
   unknown keys, legacy `{tags:[...]}`) lives in `parseTestFilter` and emits
   `MCP_INPUT_INVALID` per the spec.
3. **Doc surface**: mirror the shape in `docs/api/mcp-tools.md`,
   `assets/examples/test-vba.md`. No new files in `src/`.

No data migration, no new error code, no new public type beyond an in-file
`TestFilterParts` consumed only by the two adapter functions.

> **Apply-phase note:** `SCHEMA_PROPS.filter` is shared by five tools
> (`export_modules`, `export_all`, `list_objects`, `test_vba`,
> `harvest_form_catalog`). Widening it in place would strip the boundary type
> guard from four unrelated tools. Apply introduced a dedicated
> `SCHEMA_PROPS.testFilter` and pointed `test_vba`'s schema at it. Apply also
> corrected D1's site shape: the property **omits** `type` (rather than
> keeping `type: "string"`) because the validator boundary would reject
> objects before `parseTestFilter` ran. See `tasks.md § "Apply-phase
> deviations from design"`.

---

## 2. Architecture Decisions

### D1 — Object validation lives in the adapter, not the schema

| Option | Tradeoff | Decision |
|---|---|---|
| Widen schema property type to a multi-type union `["string","object"]` | dysflow's `validateJsonSchemaProperty` only knows `type`, `enum`, `additionalProperties`, etc. (`src/shared/validation/validator.ts:86-167`); multi-type at property level is silently ignored. | Reject. |
| Use `oneOf: [string, object]` on the property | `JsonSchemaProperty` has no `oneOf` field, and the in-tree notes at `src/adapters/mcp/schemas/vba-sync-schemas.ts:191, :1206` confirm the validator has no `oneOf`/`anyOf`/`allOf` support. Adding it is out of scope for an additive surface extension. | Reject. |
| Declare both shapes in `filter`'s description; do real validation in `parseTestFilter` | Adapter-level matches existing pattern (`form_set_property`, kind-discriminated unions, etc.); gives explicit `MCP_INPUT_INVALID` messages with one canonical site. | **Choose.** |

### D2 — `parseTestFilter` returns a discriminated union, not a tagged `string[]`

```ts
type TestFilterParts =
  | { kind: "name_or_tag"; parts: readonly string[] }
  | { kind: "tag_only"; tag: string };     // lowercased once, at parse time
```

`matchesTestFilter` gains the `tag_only` branch (single-line body, `name`/`procedure` never consulted) and keeps the existing `name_or_tag` body verbatim. Per-atom cost is unchanged; per-filter allocation drops to `O(1)` for `tag_only` since the lowercase happens at parse time, not per atom.

### D3 — Intersection applies INSIDE the `testsPath` path only; `proceduresJson` continues to be atomic

`executeTestVba` at line 461 honors `proceduresJson` as the final authoritative list and does NOT apply the filter on that branch. `resolveTestProceduresJson` (line 712) applies the filter to the manifest-derived list — same shape as today for `filter: string`, equivalent shape for `filter: { tag }`. This preserves the spec's "proceduresJson alone still works" backward-compat invariant. The user-locked "intersection" line refers to "manifest list ↔ filter substring" within one path, not "across proceduresJson-vs-testsPath".

---

## 3. Data Flow

```
MCP request
  ▼
dispatch-factory.ts:177  validateInput(input, test_vba schema)
  │     (legacy path: string / unknown-key / required / type checks)
  ▼
VbaExecutionAdapter.executeTestVba(params)                 line 456
  ├─► directProceduresJson ?                  line 461 — bypasses filter
  └─► resolveTestProceduresJson(params)        line 712
        ├─► normalizeTestPlan(manifest)        line 942 — VbaTestPlanEntry[]
        ├─► parseTestFilter(params.filter)     line 1023 — MODIFIED
        │     ├─ stringValue(value) ───────────►{ kind:"name_or_tag", parts }
        │     ├─ isRecord(value) && "tag" ─────►{ kind:"tag_only",     tag }
        │     ├─ isRecord(value) && "tags" ────►MCP_INPUT_INVALID (redirect)
        │     ├─ isRecord(value), no tag ──────►MCP_INPUT_INVALID (empty obj)
        │     └─ unknown fields ───────────────►MCP_INPUT_INVALID (lists keys)
        ├─► tests.filter(t => matchesTestFilter(t, filter))   line 748
        └─► if selected.length === 0 ──────────►VBA_NO_TESTS_SELECTED
```

Hot call cost for `tag_only`: zero per-atom allocations; one `.includes()` per
tag, identical to the legacy string path's per-atom hot loop.

---

## 4. File Changes

| File | Action | Why |
|---|---|---|
| `src/shared/validation/schema-props.ts:185` | Add | New `SCHEMA_PROPS.testFilter` property — description advertises both shapes; `type` omitted (D1 — see apply-phase note). |
| `src/shared/validation/schema-props.ts:169` | Untouched | Shared `SCHEMA_PROPS.filter` keeps `type: "string"` for the four other tools. |
| `src/adapters/mcp/schemas/vba-sync-schemas.ts:545` | Modify | `test_vba`'s `filter` now points at `SCHEMA_PROPS.testFilter` instead of the shared property. |
| `src/adapters/vba-sync/vba-execution-adapter.ts:1023` | Modify | `parseTestFilter`: add object branch; reject 5 invalid shapes with `MCP_INPUT_INVALID`; return `TestFilterParts \| undefined`. |
| `src/adapters/vba-sync/vba-execution-adapter.ts:1033` | Modify | `matchesTestFilter`: switch on `kind`; `tag_only` consults `test.tags` only. |
| `src/adapters/vba-sync/vba-execution-adapter.ts:744-748` | Modify (in-place) | Pass `TestFilterParts` (instead of bare array) into the matcher. |
| `test/adapters/vba-sync/vba-execution-adapter.test.ts` | Modify | Add `describe("parseTestFilter object branch")` and `describe("matchesTestFilter tag_only branch")` (see §6). Tests exercise the port (adapter.execute), not the file-local helpers. |
| `test/shared/validation/schema-props.test.ts` | Modify | Pin that the shared `SCHEMA_PROPS.filter` keeps `type: "string"` while `testFilter` does not. |
| `test/adapters/mcp/test-vba-filter-shape-doc-anchor-1442.test.ts` | Create | Doc-anchor test: pulls live schema, asserts description mentions both shapes. |
| `test/docs/test-vba-filter-doc.test.ts` | Create | Doc-coverage test: asserts the `test_vba` paragraph mentions both shapes. |
| `docs/api/mcp-tools.md:337-339` | Modify | Replace `filter` description; add one `{tag:"smoke"}` example under the same heading. |
| `assets/examples/test-vba.md` | Modify | New "Filter by tag" section with one example + the rejection matrix. |
| `skills/dysflow-usage/SKILL.md` | Modify | `test_vba` section shows both shapes. (In-repo skill is canonical; user-level copy is regenerated by `dysflow install` / `dysflow update`.) |
| `E2E_testing/mcp-e2e-issue-1442-test-vba-tag-filter.mjs` | Create | Real-binary MCP E2E happy-path test, gated by `DYSFLOW_REQUIRE_ACCESS_E2E`. Picked up automatically by `release.yml:e2e-validation` via `pnpm test:e2e:mcp:release`. |
| `CHANGELOG.md` | Modify | Note the additive shape under `[Unreleased] / v2.37.4`. |
| `references/error-codes.md` | Verify only | `MCP_INPUT_INVALID` row already covers this; no edit required. |

Out of scope: `http-api.md`, `testing-philosophy.md`, the `validate_manifest` tool. No behavior change for the HTTP surface.

---

## 5. Interfaces / Contracts

### D1 site — `SCHEMA_PROPS.testFilter` (new dedicated property)

```ts
testFilter: {
  // type intentionally omitted — see D1 + apply-phase note.
  // The validator (`validateJsonSchemaProperty`) skips type enforcement when
  // neither `type` nor `enum` is set; that is the only way to express the
  // string|object union without adding `oneOf`/`anyOf` support to the
  // validator (out of scope for this slice). Object validation is performed
  // by `parseTestFilter` in the adapter, which emits `MCP_INPUT_INVALID`.
  description:
    "Substring filter for procedure-name, test-name, and/or tags. " +
    "String form (e.g. \"smoke\") splits on '|' for OR-match and matches " +
    "any of {name, procedure, tags[]} case-insensitive substring. " +
    "Object form { tag: 'smoke' } narrows to tags[] only and skips name/procedure. " +
    "Empty tag, unknown fields, and {tags:[...]} are rejected with MCP_INPUT_INVALID.",
} as JsonSchemaProperty,
```

`SCHEMA_PROPS.filter` (shared with `export_modules`, `export_all`, `list_objects`,
`harvest_form_catalog`) is **untouched** and keeps `type: "string"`. The
containment is pinned by a parameterized case in
`test/adapters/mcp/test-vba-filter-shape-doc-anchor-1442.test.ts`.

### `TestFilterParts` — new file-local type

```ts
type TestFilterParts =
  | { kind: "name_or_tag"; parts: readonly string[] }
  | { kind: "tag_only";     tag: string };
```

### `parseTestFilter` — new signature

```ts
function parseTestFilter(value: unknown): TestFilterParts | undefined;
```

Steps (in order): undefined / null → `undefined`. `stringValue(value)` truthy → `{ kind: "name_or_tag", parts }` (legacy). `isRecord(value)`:
- `"tags" in value` → `failureResult(MCP_INPUT_INVALID, "...use filter: { tag: 'smoke' }")`.
- `Object.keys(value).length !== 1 || !"tag" in value` → `MCP_INPUT_INVALID` ("object must include a non-empty 'tag' string").
- `typeof value.tag !== "string"` → `MCP_INPUT_INVALID` ("filter.tag must be a string (got <type>)").
- `value.tag.trim() === ""` → `MCP_INPUT_INVALID` ("filter.tag must be a non-empty string").
- else → `{ kind: "tag_only", tag: value.tag.trim().toLowerCase() }`.

`parseTestFilter` is a file-local function; its return type is consumed only by `matchesTestFilter` and the line-748 caller. No new exports.

### `matchesTestFilter` — new signature

```ts
function matchesTestFilter(test: VbaTestPlanEntry, filter: TestFilterParts): boolean {
  if (filter.kind === "tag_only") {
    return test.tags.some((tag) => tag.toLowerCase().includes(filter.tag));
  }
  return filter.parts.some(
    (part) =>
      test.name.toLowerCase().includes(part) ||
      test.procedure.toLowerCase().includes(part) ||
      test.tags.some((tag) => tag.toLowerCase().includes(part)),
  );
}
```

### Caller site — `resolveTestProceduresJson` (line 744-748)

```ts
const filter = parseTestFilter(params.filter);
const selected =
  filter === undefined ? tests : tests.filter((test) => matchesTestFilter(test, filter));
```

Only lines 744, 748 change. The outer `resolveTestProceduresJson` signature is unchanged.

---

## 6. Testing Strategy

| Layer | What | Where | Cases |
|---|---|---|---|
| Unit | `parseTestFilter` object branch | `test/adapters/vba-sync/vba-execution-adapter.test.ts` (new describe) | `{tag:"smoke"}` → tag_only; `{tag:"  SMOKE  "}` → lowercased + trimmed; `{}` → failure; `{tag:""}` → failure; `{tag:123}` → failure (type); `{tag:"x",foo:"y"}` → failure (unknown); `{tags:["smoke"]}` → failure (redirect). |
| Unit | `matchesTestFilter` tag-only | same file | tag-match happy path; name-only no-match (substring in `name` ignored); case-insensitive; empty `tags[]` no-match; legacy string branch unchanged (5 existing scenarios locked). |
| Integration | end-to-end via `execute("test_vba", {filter:{tag:"smoke"}})` against a manifest | same file (append to `test_vba manifests` describe) | mirror spec's 4 acceptance scenarios end-to-end. |
| Doc anchor (live schema) | `describe_tool({name:"test_vba"})` reports both shapes | new `test/adapters/mcp/test-vba-filter-shape-doc-anchor-1442.test.ts` | description contains both `name` and `tag` substrings (runtime-anchored — opens via `createDysflowMcpTools`). |
| Doc coverage | `docs/api/mcp-tools.md` `test_vba` paragraph shows both shapes | new `test/docs/test-vba-filter-doc.test.ts` | the `test_vba` paragraph contains one `filter: string`-style literal AND one `filter: { tag:` literal. |

Verification: `pnpm test` (vitest). No Access / PowerShell / COM needed.

---

## 7. Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file
classification, or process-integration boundary is touched. Only JSON-in
validation and a per-atom substring match change. No new credentials, no new
env vars, no new file-system writes.

---

## 8. Migration / Rollout

No data migration. No version bump required beyond the project's release
cadence; this ships in v2.37.4. No flag, no env, no `.dysflow/project.json`
change.

**Rollback**: revert the four code touches (`schema-props.ts:169`,
`vba-execution-adapter.ts:1023`, `:1033`, line-744-748 caller) and the two doc
touches. Doc-anchor tests revert with them. The new capability spec remains as
the durable contract; future slices can re-add the shape without renegotiating.

---

## 9. Risks

| # | Sev | From proposal | Design-tied mitigation |
|---|---|---|---|
| R1 | High | Schema `additionalProperties` misconfig lets unknown fields no-op the filter. | D1 carries validation in `parseTestFilter` step "unknown fields" — fails closed with `MCP_INPUT_INVALID` even if the schema description is later widened. Doc-anchor test pins the live description (D1 + §6 row 4). |
| R2 | Med | No tests today for `parseTestFilter` rejection paths. | §6 row 1 adds 7 explicit unit-test cases including all 5 rejection shapes; existing string branch is locked by an unchanged-call assertion. |
| R3 | Low | `mcp-tools.md` filter description drifts. | §6 row 5 doc-coverage test pins both shapes in the same paragraph. |
| R4 | Med | Future caller assumes `{tags:[...]}` works. | §5 step "tags in value" returns an explicit redirect message naming `filter: { tag: 'smoke' }`. The unit test in §6 row 1 case 7 pins the rejection string. |
| R5 | Low | Surface widening ripples to mirror tools. | `get_capabilities.adapterVersion` is the version pin; `references/error-codes.md` already names `MCP_INPUT_INVALID`; downstream consumers regenerate from `describe_tool`, which now reports both shapes. |

---

## 10. Open Questions

None blocking. One note for transparency: the task description asserts
"intersection matches existing string-filter behavior". The code evidence at
`vba-execution-adapter.ts:744` shows filter is only applied inside
`resolveTestProceduresJson` (the `testsPath` path), not on the direct
`proceduresJson` path. D3 honors the proposal's "proceduresJson is unchanged"
invariant by keeping that bypass and applies intersection only within the
manifest path — for both `filter: string` and `filter: { tag }`. No
renegotiation needed.

---

## Cross-reference

- `src/adapters/vba-sync/vba-execution-adapter.ts:744` (filter application site)
- `src/adapters/vba-sync/vba-execution-adapter.ts:1023` (`parseTestFilter`)
- `src/adapters/vba-sync/vba-execution-adapter.ts:1033` (`matchesTestFilter`)
- `src/shared/validation/schema-props.ts:169` (`SCHEMA_PROPS.filter`)
- `src/adapters/mcp/schemas/vba-sync-schemas.ts:541` (`test_vba` schema)
- `src/shared/validation/validator.ts:86-167` (property-level schema validator — no `oneOf`/`anyOf`/`allOf`)
- `src/adapters/mcp/schemas/vba-sync-schemas.ts:191, :1206` (in-tree confirmation of validator's union limitation)
- `docs/api/mcp-tools.md:337-339` (doc surface to update)
- `assets/examples/test-vba.md` (skill example to update)
- `references/error-codes.md:35` (`MCP_INPUT_INVALID` row already covers this)
- GitHub issue: [#1442](https://github.com/DysTelefonica/dysflow/issues/1442)

---

*Generated by `sdd-design` — code-binding, no placeholders, ready for `sdd-tasks` decomposition.*
