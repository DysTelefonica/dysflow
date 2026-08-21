# Proposal: `test_vba` filter object support (`{tag: "..."}`)

> **SDD phase:** propose (PRD-grade, no architecture / code)
> **GitHub issue:** [#1442](https://github.com/DysTelefonica/dysflow/issues/1442) — `feat(mcp): test_vba filter should accept object filter {tag: "..."} like the manifest does`
> **Exploration source:** Engram `sdd/test-vba-tag-filter-object/explore` (observation #25416)
> **Artifact store:** hybrid (this file + Engram `sdd/test-vba-tag-filter-object/proposal`)

---

## 1. Intent

Today the `test_vba` MCP tool accepts a `filter` parameter as a `string` only
(e.g. `"smoke|regression"`) and applies substring matching across the atom's
name, procedure, and tags. The manifest entry shape already supports per-atom
`tags: string[]`, but a caller who wants to filter by tag from the outside has
no way to say "I want only atoms tagged `smoke`" without accidentally matching
test names that happen to contain the word "smoke". Issue [#1442] asks us to
extend the `filter` parameter so a caller can pass an **object form**
`{tag: "smoke"}` and get tag-only matching — mirroring what the manifest
already supports, at the top-level filter surface.

This is a **minimum-viable, additive, backward-compatible** extension. The
existing string `filter` and the `proceduresJson` flow continue to work
unchanged. The new shape is an opt-in second form of the same parameter.

## 2. Scope

### In scope

- Accept `filter: {tag: "<substring>"}` as a second legal shape for the
  `test_vba` `filter` parameter.
- Apply the `tag` substring against the atom's `tags[]` array (the same
  case-insensitive substring semantics already implemented in
  `matchesTestFilter` at `vba-execution-adapter.ts:1033`).
- Return a `MCP_INPUT_INVALID` typed envelope (existing code) with a
  descriptive message for invalid object shapes (empty object, unknown field,
  non-string `tag`).
- Update the `test_vba` schema in `vba-sync-schemas.ts` and the shared
  property `SCHEMA_PROPS.filter` in `schema-props.ts:169` to declare the new
  union shape with `additionalProperties: false` on the object branch.
- Update `docs/api/mcp-tools.md` (`test_vba` section) to document the object
  form alongside the existing string form.
- Add unit tests covering the three acceptance shapes and the three rejection
  shapes (see §4).

### Out of scope (this slice)

- `tags[]` multi-tag filtering (reserved; semantics will be ANY — at least one
  match — when added in a future slice).
- `nameContains`, `name`, exact-match `tag`, regex matchers.
- Negation (`!tag`), exclusion lists, OR/AND combinators.
- Accepting the filter object as a JSON-encoded string
  (e.g. `'{"tag":"smoke"}'`). Only native objects are accepted.
- Changing the manifest entry shape. `tags: string[]` on each atom is already
  in place; the only addition here is exposing the same semantics at the
  top-level filter surface.
- Any change to `proceduresJson`, `allowWrites`, `humanCompilePending`, or
  other `test_vba` parameters.
- CLI flag changes (`dysflow test_vba`).

## 3. User-visible behavior

### 3.1 Acceptance shapes (legal input → legal output)

| Caller input | What happens | Rationale |
|---|---|---|
| `filter: "smoke"` (existing string) | Substring match against `name`, `procedure`, and any tag. Unchanged. | Backward-compat invariant. |
| `filter: { tag: "smoke" }` | Substring match against any entry in the atom's `tags[]`. Atom's `name` and `procedure` are NOT consulted. | New behavior — tag-only, no accidental name hits. |
| `filter: { tag: "" }` | Treated as "no filter" (empty substring → matches everything); or rejected as ambiguous. **Decision (locked):** reject with `MCP_INPUT_INVALID` and message "filter.tag must be a non-empty string". | Empty `tag` is never useful and would silently behave like no filter, which is the kind of surprise we are explicitly avoiding. |

### 3.2 Rejection shapes (illegal input → typed error envelope)

| Caller input | Error code | Message body (informative, not exact) |
|---|---|---|
| `filter: {}` | `MCP_INPUT_INVALID` | `filter object must include a non-empty 'tag' string` |
| `filter: { tag: 123 }` | `MCP_INPUT_INVALID` | `filter.tag must be a string (got number)` |
| `filter: { tag: "smoke", foo: "bar" }` | `MCP_INPUT_INVALID` | `filter object only accepts the 'tag' field (got extra: foo)` |
| `filter: { tags: ["smoke"] }` | `MCP_INPUT_INVALID` | `filter.tags[] is not supported in this slice — use filter: { tag: "smoke" }` |
| `filter: "smoke"` with no other change | (no error — unchanged) | n/a |

The error code `MCP_INPUT_INVALID` is reused; only the message body is new.
The `error.rejectedField`, `error.expectedType`, and `error.receivedFields`
fields are additive — consumers that ignore them keep working.

### 3.3 Top-level filter + manifest-level filter collision (locked rule)

- If the manifest entry itself declares a per-atom `tags: [...]` (the
  manifest-level filter is **already** the atom's own tag list — there is no
  separate manifest-level "filter field"), no collision exists. Each atom's
  `tags` are its own; the top-level `filter` simply selects which atoms run.
- If a future manifest entry shape introduces a per-manifest `filter` field,
  the top-level `filter` (when present) **wins** and the manifest-level is
  ignored for that run. This rule is locked now so the future slice does not
  have to renegotiate it.

In this slice there is no manifest-level filter field to collide with, so
rule 4 from the locked assumptions is a forward-looking guarantee, not a
behavior change today.

## 4. Backward compatibility

| Surface | Before this slice | After this slice |
|---|---|---|
| `filter: "smoke"` | Works (substring across name + procedure + tags) | **Identical** — no change |
| `filter: "smoke\|regression"` | Works (OR across substrings) | **Identical** — no change |
| `filter` omitted | No filter; all atoms run | **Identical** — no change |
| `proceduresJson` (inline subset) | Works | **Identical** — no change |
| `filter: null` | Treated as no filter | **Identical** — no change |
| `filter: 42` (legacy accidental number) | Treated as no filter (today) | **Stays** as no filter (no new rejection introduced for non-object non-string values) |
| `filter: { tag: "smoke" }` | n/a | **New** — accepted; tag-only matching |
| `filter: {}` / `{tag: 123}` / `{foo: "bar"}` | n/a | **New** — rejected with `MCP_INPUT_INVALID` |

The two **error-message changes** (intentional, additive):

- Existing `MCP_INPUT_INVALID` messages on `test_vba` keep their wording.
- New `MCP_INPUT_INVALID` messages for invalid object filter shapes carry a
  `rejectedField` / `expectedType` payload that consumers can branch on.

**Hard invariant:** no existing caller that passes `filter: string` or omits
`filter` observes any change in behavior, plan output, error envelope shape,
or test-run result count.

## 5. Edge cases (must be spec scenarios)

1. **Empty object `{}`.** Reject with `MCP_INPUT_INVALID`; no atom runs;
   no partial match.
2. **Unknown field `{foo: "bar"}`.** Reject with `MCP_INPUT_INVALID`
   enumerating the unknown key.
3. **Wrong type for `tag` (`{tag: 123}` or `{tag: null}` or `{tag: []}`).**
   Reject with `MCP_INPUT_INVALID` and a type-mismatch message.
4. **Top-level `filter` AND manifest-level `filter` both present** (forward
   rule). Top-level wins; manifest-level is ignored; no warning envelope.
5. **Empty string `tag` value (`{tag: ""}`).** Reject with
   `MCP_INPUT_INVALID`; do NOT silently treat as "match everything".
6. **Atom with empty `tags[]` and `filter: {tag: "smoke"}`.** Atom is
   filtered OUT (no tag matches "smoke"); consistent with substring semantics
   on an empty haystack.
7. **Multiple atoms, mixed tag sets.** Each atom is evaluated independently;
   one matching tag is enough (substring contains).
8. **Case sensitivity.** Substring match is **case-insensitive** on both
   sides, matching the existing manifest-level behavior
   (`test.tags.some(tag => tag.toLowerCase().includes(filterText))`).
9. **Unicode / diacritics in tag values.** Match is byte-exact after
   `toLowerCase()`; no normalization. (Matches existing behavior.)

## 6. Non-goals (explicit)

These are intentionally **NOT** in this slice. Listing them here so future
readers do not assume the slice under-delivered.

- `tags[]` array form (multi-tag ANY-match).
- `nameContains` / `procedureContains` explicit selectors.
- Exact-match `tag` (vs. substring).
- Regex / glob matchers.
- Negation (`!tag`), exclusion lists.
- AND/OR combinators between filter dimensions.
- JSON-string-of-object (`filter: '{"tag":"smoke"}'`).
- Per-atom override of the filter (e.g. atom says "ignore the top-level
  filter").
- Changes to other `test_vba` parameters (`proceduresJson`, `testsPath`,
  `apply`, `cwd`, `projectId`, etc.).
- A new manifest entry field beyond what already exists (`tags: string[]`).
- CLI surface changes.

## 7. Acceptance criteria

These become the `spec.md` scenarios in `sdd-spec`. Each is testable as a
unit test against `vba-execution-adapter.ts` and an integration check via
`describe_tool({name:"test_vba"})` on the live schema.

1. `test_vba({ filter: { tag: "smoke" } })` runs only atoms whose `tags[]`
   contains a case-insensitive substring "smoke".
2. `test_vba({ filter: { tag: "smoke" } })` does NOT select atoms whose
   `name` or `procedure` contains "smoke" but whose `tags[]` does not.
3. `test_vba({ filter: "smoke" })` continues to select atoms whose `name`,
   `procedure`, OR any `tag` contains "smoke" (substring, case-insensitive).
4. `test_vba({ filter: "smoke\|regression" })` continues to OR-match both
   substrings (legacy `|`-split semantics).
5. `test_vba({ filter: {} })` returns `MCP_INPUT_INVALID` with a message
   referencing the missing `tag` field.
6. `test_vba({ filter: { tag: 123 } })` returns `MCP_INPUT_INVALID` with a
   type-mismatch message.
7. `test_vba({ filter: { tag: "x", foo: "y" } })` returns `MCP_INPUT_INVALID`
   naming `foo` as the unknown field.
8. `test_vba({ filter: { tag: "" } })` returns `MCP_INPUT_INVALID`; no atoms
   run.
9. `describe_tool({ name: "test_vba" })` reports `filter` as
   `oneOf: [string, object]` with the object branch declaring
   `properties.tag: {type: "string"}` and `additionalProperties: false`.
10. `docs/api/mcp-tools.md` test_vba section documents both the string form
    and the object form under the same parameter heading, with one example
    of each.

## 8. Capabilities (contract for sdd-spec)

### New capabilities

- **`mcp-tool-test-vba`** — Owns the `test_vba` MCP tool input contract,
  output contract, and filter semantics. Today there is no dedicated spec
  folder for this tool; this slice introduces one so the contract has a
  durable home. The new spec covers the full `test_vba` surface (existing
  string `filter`, existing `proceduresJson` and `testsPath`, the new
  object `filter`, and the error envelope). Other slices that change
  `test_vba` in the future will modify this same spec via delta specs.

### Modified capabilities

- None. The change does not alter any existing capability's requirements —
  it adds a new shape to a parameter that previously had only one shape, and
  the new spec is introduced as a NEW capability rather than as a delta to an
  existing one because no spec covers `test_vba` today.

## 9. Approach (high level, not architecture)

- The matching logic (`matchesTestFilter` at
  `vba-execution-adapter.ts:1033`) already supports tag substring matching.
  It is fed `filterParts: string[]` from `parseTestFilter` at line 1023.
- Extend `parseTestFilter` to recognize the object form: when `value` is a
  record with `tag: string`, normalize the tag to a single-element
  `string[]` (or short-circuit into the existing matching path). Reject
  empty `tag`, unknown fields, or non-string `tag` with `MCP_INPUT_INVALID`.
- Widen the JSON schema declaration of `filter` in `SCHEMA_PROPS` from
  `type: "string"` to a `oneOf: [string, object]` with `additionalProperties:
  false` on the object branch — so the schema layer enforces the shape
  before the adapter ever sees the value.
- Reuse the existing `MCP_INPUT_INVALID` envelope; do not invent a new code.
- Mirror the description change in `docs/api/mcp-tools.md` so doc anchors
  stay aligned with the live schema.

No new files. No new dependencies. No new error codes. No new public types.

## 10. Affected areas

| Area | Impact | Description |
|---|---|---|
| `src/shared/validation/schema-props.ts` (`filter` prop, line 169) | Modified | Widen `filter` from `string` to `oneOf: [string, object]` with `additionalProperties: false`. |
| `src/adapters/mcp/schemas/vba-sync-schemas.ts` (line 541, `test_vba`) | Modified | Picks up the widened schema via `SCHEMA_PROPS.filter`; description updated. |
| `src/adapters/vba-sync/vba-execution-adapter.ts` (`parseTestFilter`, line 1023) | Modified | Branch on object form; validate `tag`; reject bad shapes with `MCP_INPUT_INVALID`. |
| `src/adapters/vba-sync/vba-execution-adapter.ts` (`matchesTestFilter`, line 1033) | Unchanged | Existing tag substring match is already correct. |
| `test/adapters/vba-sync/vba-execution-adapter.test.ts` (around line 525) | Modified | Add cases for object form + rejection shapes. |
| `docs/api/mcp-tools.md` (`test_vba` section) | Modified | Document the object form under the same heading. |
| `openspec/specs/mcp-tool-test-vba/spec.md` | **New** | New capability spec for the `test_vba` tool contract. |

## 11. Risks

| # | Severity | Description | Mitigation |
|---|---|---|---|
| R1 | High | The `additionalProperties: false` JSON-schema guard on the object branch could be misconfigured, allowing callers to pass unknown fields (e.g. `{tags: ["x"]}`) and silently treat them as no-filter — exactly the surprise this slice is meant to remove. | Spec scenario #7 explicitly asserts `{tag:"x", foo:"y"}` is rejected. A unit test in `vba-execution-adapter.test.ts` covers it. The schema declaration is reviewed before apply. |
| R2 | Medium | No tests exist today for `parseTestFilter`'s rejection paths; a regression that breaks string parsing under the new branch would ship unnoticed. | Add unit tests for the three rejection shapes (`{}`, `{tag: 123}`, `{tag:"x", foo:"y"}`) and one positive case for `{tag:"smoke"}` selecting only tag-matching atoms. |
| R3 | Low | `docs/api/mcp-tools.md` `test_vba` filter description is currently string-only; leaving it stale after the schema change creates drift between doc and runtime, which a doc-anchor test would catch only if we add one. | Update the doc in the same PR; the existing `mcp-readme-tool-surface.test.ts` runs a string-anchor check on the tool description (anchored against the live `tools/list`). Add a runtime anchor (not just a string anchor) so the description actually tracks the schema, not just a copy of itself. |
| R4 | Medium | A future caller who assumes `{tags: [...]}` works (mirroring the per-atom `tags[]` field) could be surprised by the rejection. | The rejection message for `{tags: [...]}` explicitly points to `{tag: "..."}` (see §3.2). The future `tags[]` slice is documented as a planned follow-up in §6. |
| R5 | Low | Adding the new shape widens the surface; a downstream consumer that mirrors or proxies the schema could now see two legal shapes and fail to handle both. | The new spec is the single source of truth. Any downstream consumer reading the live schema via `describe_tool` already gets both shapes; mirroring tools are expected to regenerate on schema change. |

## 12. Rollback plan

- All changes are behind the `filter` parameter; reverting the schema to
  `type: "string"` and removing the object branch in `parseTestFilter`
  restores the prior behavior in one commit.
- The new `mcp-tool-test-vba` spec is additive (no existing spec is
  modified); rollback can ship as a revert commit without a forward-migration
  step.
- No data is migrated. No persisted state changes. No flags, env vars, or
  config are introduced.

## 13. Dependencies

- None on other dysflow work.
- `dysflow-usage` skill references `filter: string` in the canonical
  `test_vba` schema notes (assets/examples/test-vba.md). The skill must be
  refreshed in the same PR so it points at the widened shape. This is a
  doc-anchor update, not a runtime change.

## 14. Success criteria

- [ ] Issue #1442 acceptance: a caller can pass
  `filter: { tag: "smoke" }` to `test_vba` and only tag-matching atoms run.
- [ ] No existing caller passing `filter: string` or omitting `filter`
  observes any change in plan output, error envelope, or result count.
- [ ] All three rejection shapes return `MCP_INPUT_INVALID` with a message
  that names the offending field / type / extra.
- [ ] New capability spec `openspec/specs/mcp-tool-test-vba/spec.md` exists
  and anchors the scenarios in §7.
- [ ] `docs/api/mcp-tools.md` `test_vba` section describes both shapes under
  the same parameter heading.
- [ ] `dysflow-usage` skill example for `test_vba` shows both shapes.
- [ ] Doc-anchor test for the schema description passes against the live
  `tools/list` surface.

## 15. Open questions

None. The user pre-resolved every product decision (filter shape, matching
semantics, override rule, error-code choice, backward-compat invariant).
Spec and design phases have a clear contract.

---

*Generated by `sdd-propose` — PRD-grade scope and acceptance criteria.
HOW is the job of `sdd-spec` and `sdd-design`.*
