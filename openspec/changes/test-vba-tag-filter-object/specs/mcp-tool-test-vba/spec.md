# Spec Delta: mcp-tool-test-vba

## ADDED Requirements

### Requirement: test_vba filter accepts object form
`test_vba` SHALL accept `filter` as `string` (existing) or object `{ tag: string }` (new). Object form SHALL match each atom's `tags[]` only — never `name`/`procedure`. Matching SHALL be case-insensitive substring (mirrors `matchesTestFilter` at `vba-execution-adapter.ts:1033`).

#### Scenario: object form filters by tag substring
- GIVEN A `tags:["smoke","regression"]`, B `tags:["load"]`, C `tags:[]` `name:"Test_Smoke"`
- WHEN `test_vba({ filter: { tag: "smoke" } })`
- THEN only A runs

#### Scenario: object form is case-insensitive
- GIVEN atom `tags:["Smoke"]`
- WHEN `test_vba({ filter: { tag: "SMOKE" } })`
- THEN atom selected

#### Scenario: object form does not consult name or procedure
- GIVEN X `name:"Test_Smoke"` `tags:[]`, Y `procedure:"RunSmokeCheck"` `tags:[]`
- WHEN `test_vba({ filter: { tag: "smoke" } })`
- THEN neither selected (string-filter behavior NOT inherited)

#### Scenario: no matching tag yields empty selection
- GIVEN three atoms with no tag containing "xyz"
- WHEN `test_vba({ filter: { tag: "xyz" } })`
- THEN selection is empty

### Requirement: string filter and proceduresJson are unchanged
Existing `filter: string` substring+`|` OR-match and `proceduresJson` SHALL be preserved exactly.

#### Scenario: string filter still OR-matches with pipe
- GIVEN atom `name:"Test_Smoke"` and atom `tags:["regression"]`
- WHEN `test_vba({ filter: "smoke|regression" })`
- THEN both selected

#### Scenario: proceduresJson alone still works
- GIVEN manifest atoms A, B, C
- WHEN `test_vba({ proceduresJson: "[\"A\",\"C\"]" })`
- THEN only A and C run

#### Scenario: omitted filter still runs every atom
- WHEN `test_vba({})` with no `filter`
- THEN every atom runs (backward-compat)

### Requirement: object form validates against MCP_INPUT_INVALID
When `filter` is an invalid object, the tool SHALL reject with `MCP_INPUT_INVALID`; empty object, empty `tag`, unknown fields, wrong-type `tag`, and `{tags:[...]}` SHALL each be rejected with a message naming the offender.

#### Scenario: empty object is rejected
- WHEN `test_vba({ filter: {} })`
- THEN rejected with `MCP_INPUT_INVALID`; message references missing `tag`

#### Scenario: empty tag string is rejected
- WHEN `test_vba({ filter: { tag: "" } })`
- THEN rejected with `MCP_INPUT_INVALID`; message states `filter.tag must be a non-empty string`

#### Scenario: wrong-type tag is rejected
- WHEN `test_vba({ filter: { tag: 123 } })`
- THEN rejected with `MCP_INPUT_INVALID`; message names expected `string`, received `number`

#### Scenario: unknown field is rejected
- WHEN `test_vba({ filter: { tag: "x", foo: "y" } })`
- THEN rejected with `MCP_INPUT_INVALID`; message names `foo` as unknown
- AND `additionalProperties: false` blocks it at schema layer

#### Scenario: legacy tags[] shape is rejected with a redirect
- WHEN `test_vba({ filter: { tags: ["smoke"] } })`
- THEN rejected with `MCP_INPUT_INVALID`; message points to `filter: { tag: "smoke" }`

### Requirement: top-level filter overrides manifest-level filter (forward rule)
If a future manifest shape introduces per-manifest `filter`, top-level SHALL win, manifest-level SHALL be ignored, no warning. Forward-looking — no manifest-level `filter` exists in this slice.

#### Scenario: top-level filter wins over manifest-level (forward rule)
- GIVEN hypothetical future manifest entry `filter: { tag: "regression" }`
- WHEN `test_vba({ filter: { tag: "smoke" } })`
- THEN only `tag:"smoke"` atoms run; manifest-level is ignored

### Requirement: schema and doc surface declare both shapes
`describe_tool({ name: "test_vba" })` SHALL declare `filter` as `oneOf: [string, object]` with `properties.tag: { type: "string" }` and `additionalProperties: false`. `docs/api/mcp-tools.md` SHALL describe both shapes under one `filter` heading.

#### Scenario: live schema reports union shape
- WHEN `describe_tool({ name: "test_vba" })`
- THEN `parameters[filter]` is `oneOf: [string, object]` with `properties.tag: { type: "string" }` and `additionalProperties: false`

#### Scenario: docs surface covers both shapes
- WHEN reader consults `docs/api/mcp-tools.md` `test_vba` section
- THEN section shows one example of `filter: string` and one of `filter: { tag: "smoke" }`

## OPEN QUESTIONS

- **Combined `proceduresJson` + object `filter`** — intersection (`proceduresJson` candidates, `filter` narrows) OR `proceduresJson` wins (filter ignored)? Proposal locks override only for top-level vs. manifest-level. Current `filter: string` + `proceduresJson` undocumented. Blocking for design.
