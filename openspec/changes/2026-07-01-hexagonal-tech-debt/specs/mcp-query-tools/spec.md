# Delta for mcp-query-tools

Closed by **PR 3** (`[#624/3] #F override mapping dedup + coerceTimeoutMs
helper`). The triplicated 10-field override block lives at
`src/core/mapping/access-query-request-mapper.ts:144-157,185-200,255-264`;
the `timeoutMs` string→number coercion at the same mapper's 147-152,
190-195, 246-251 sites is dead-by-Zod (the schemas declare
`timeoutMs: z.number().optional()`).

> Audit-precision note: the audit says "string→number coercion never
> executes" — the correct intent holds for the mapper's 3 sites, but the
> blast radius is 5 sites overall (3 mapper + `execution-target.ts:36` +
> `stdio.ts:556`). PR3 covers the mapper's 3 sites. The 2 external sites
> are explicitly out of scope per proposal and ship untouched in this
> cycle.

## ADDED Requirements

### Requirement: Override fields share a single pickOverrides helper

`buildQueryReadRequest`, `buildWriteFixtureRequest`, and
`buildMaintenanceRequest` in
`src/core/mapping/access-query-request-mapper.ts` MUST share one helper
`pickOverrides(params)` that returns the canonical 10-field override
shape (projectId, contextId, accessPath, backendPath, destinationRoot,
projectRoot, strictContext, expectedAccessPath, expectedProjectRoot,
expectedDestinationRoot). Each of the 3 builders MUST spread
`pickOverrides(params)` instead of inline-redeclaring the override block.
TypeScript MUST fail the build if any builder spreads the override block
inline.

(Addresses audit finding #F. The `timeoutMs` field stays in the per-builder
mapping because `coerceTimeoutMs` (next requirement) is its sole home.)

#### Scenario: All 3 builders produce identical override shapes (happy)

- **GIVEN** a fixed input object `params` containing every one of the 10
  override fields (the full set), one field omitted, and every field as a
  string
- **WHEN** each of `buildQueryReadRequest`, `buildWriteFixtureRequest`,
  and `buildMaintenanceRequest` runs with the same input
- **THEN** the override fields in each builder's output MUST be
  deep-equal to one another
- **AND** the result MUST be a deep-equal snapshot of the pre-refactor
  behavior (no behavior drift)

#### Scenario: `pickOverrides` is the single source (structural)

- **GIVEN** `src/core/mapping/access-query-request-mapper.ts`
- **WHEN** its override-handling code is inspected
- **THEN** exactly one function named `pickOverrides` MUST exist and
  return the override shape
- **AND** no override-spreading literal (e.g. an inline 10-field object
  with the override fields) MUST appear in any of the 3 builders

#### Scenario: missing-field default is `undefined` (regression)

- **GIVEN** a `params` object that omits some override fields
- **WHEN** `pickOverrides(params)` runs
- **THEN** those missing fields MUST be `undefined` in the result
- **AND** the builders MUST NOT default them to any new value
  (no accidental fallbacks introduced)

#### Scenario: snapshot regression for one builder (adversarial)

- **GIVEN** `buildQueryReadRequest` runs with an input that lacks
  `expectedAccessPath`
- **WHEN** the output is compared against the pre-refactor snapshot (a
  fixture in the test)
- **THEN** the output MUST deep-equal the snapshot
- **AND** any accidental default change (e.g. filling in a new value) MUST
  fail the snapshot test

### Requirement: timeoutMs coercion lives in coerceTimeoutMs

A single helper `coerceTimeoutMs(value: number | string | undefined): number | undefined`
MUST be the sole `timeoutMs` string→number coercion site in
`src/core/mapping/access-query-request-mapper.ts`. The 3 inline
`typeof === "string" ? parseFloat(...) : ...` blocks at lines 147-152,
190-195, 246-251 MUST be deleted. `pickOverrides(params)` MUST delegate
`timeoutMs` to `coerceTimeoutMs(params.timeoutMs)`.

Zod schemas declare `timeoutMs` as `z.number().optional()` — the string
branch in the deleted blocks is unreachable in practice (dead-by-Zod, not
"live coercion"). After the helper exists, the existing tests (which only
pass numbers or omit the field) MUST remain GREEN; no new string-passing
test SHOULD be added (would re-introduce the dead branch's reachability).

#### Scenario: mapper has a single coercion site (structural)

- **GIVEN** `src/core/mapping/access-query-request-mapper.ts`
- **WHEN** its `timeoutMs` handling is scanned
- **THEN** there MUST be exactly one `coerceTimeoutMs` function and
  exactly one call site (inside `pickOverrides`)
- **AND** the 3 inline `typeof === "string"` blocks MUST be deleted

#### Scenario: pickOverrides delegates to coerceTimeoutMs

- **GIVEN** a `params` object with `timeoutMs: 12345`
- **WHEN** `pickOverrides(params)` runs
- **THEN** the resulting `timeoutMs` field MUST be `12345` (number, not
  string)
- **AND** TypeScript MUST show `pickOverrides` calling `coerceTimeoutMs`
  on `params.timeoutMs`

#### Scenario: number pass-through is unchanged (regression)

- **GIVEN** `coerceTimeoutMs(12345)`
- **WHEN** called
- **THEN** it MUST return `12345`

#### Scenario: undefined pass-through is `undefined` (regression)

- **GIVEN** `coerceTimeoutMs(undefined)`
- **WHEN** called
- **THEN** it MUST return `undefined`

#### Scenario: dead string branch is unreachable (audit-imprecision surfaced)

- **GIVEN** the Zod schema for the 3 builders declares
  `timeoutMs: z.number().optional()`
- **WHEN** a caller passes `timeoutMs: "15000"` (a string, against the
  schema)
- **THEN** Zod MUST reject the string at parse time, BEFORE reaching
  `coerceTimeoutMs`
- **AND** the new `coerceTimeoutMs` helper MUST NOT silently accept a
  string — either it returns a `number | undefined` typed result, or it
  throws a `TypeError` for non-number input
- **AND** the audit's "dead branch" claim holds: the schema's number type
  makes the string branch unreachable in practice

### Test surface

| Test file | New test name | Class |
|---|---|---|
| `test/core/mapping/access-query-request-mapper.test.ts` | `pickOverrides is the single source of override fields` | identity / structural |
| `test/core/mapping/access-query-request-mapper.test.ts` | `all 3 builders produce identical override shapes for the same input` | happy |
| `test/core/mapping/access-query-request-mapper.test.ts` | `pickOverrides preserves missing-field defaults as undefined` | edge |
| `test/core/mapping/access-query-request-mapper.test.ts` | `coerceTimeoutMs is the only timeoutMs coercion site in the mapper` | structural |
| `test/core/mapping/access-query-request-mapper.test.ts` | `coerceTimeoutMs number pass-through returns the number` | regression |
| `test/core/mapping/access-query-request-mapper.test.ts` | `coerceTimeoutMs undefined pass-through returns undefined` | regression |
| `test/core/mapping/access-query-request-mapper.test.ts` | `pickOverrides delegates timeoutMs to coerceTimeoutMs` | identity |
