# Delta for mcp-stdio-adapter

Closed by **PR 2** (`[#624/2] #B.1 + #E constants consolidation + dead code
removal` — the dead-code sub-bullet for `query-write-fixture`). The PR also
drops the redundant `form-lint.ts:520-522` guard (covered under
`access-core-services`) and consolidates `FORM_NOISE_KEYS` (also covered
under `access-core-services`). This capability delta owns ONLY the dispatch
side: the dead `McpToolRoute` union member and the unreachable `case`
branch.

> Audit-precision note: the audit claims "Inaccessible guard" but reads
> correctly as "dead code at the dispatch layer" — the
> `query-write-fixture` kind has no entry in `MCP_TOOL_ROUTES` (the union
> member is preserved for future expansion with no live caller, and the
> `case` branch at `dispatch-factory.ts:156-161` is unreachable in
> practice). Removal is safe.

## ADDED Requirements

### Requirement: No dead query-write-fixture route kind

The `McpToolRoute` union in `src/adapters/mcp/dispatch-routes.ts` MUST
NOT include a `"query-write-fixture"` kind (currently the last member at
line 17). The corresponding `case "query-write-fixture":` branch in
`src/adapters/mcp/dispatch-factory.ts:156-161` MUST be removed. No tool
in `MCP_TOOL_ROUTES` uses `kind: "query-write-fixture"` — verification
pre-removal confirms the kind has zero live callers. Future re-introduction
MUST be an explicit type-widening change with a documented rationale (a
JSDoc note above the `McpToolRoute` union).

#### Scenario: union no longer contains the dead kind (structural)

- **GIVEN** `src/adapters/mcp/dispatch-routes.ts`
- **WHEN** its `McpToolRoute` type is inspected
- **THEN** `query-write-fixture` MUST NOT appear in any union member
- **AND** no object literal `kind: "query-write-fixture"` MUST exist in
  `MCP_TOOL_ROUTES`

#### Scenario: dispatch switch has no dead branch (structural)

- **GIVEN** `src/adapters/mcp/dispatch-factory.ts`
- **WHEN** its `switch (route.kind)` statement is read end-to-end
- **THEN** no `case "query-write-fixture":` label MUST exist
- **AND** no `return ...`/ `break` exclusively owned by that branch MUST
  remain

#### Scenario: exhaustiveness guard still rejects unknown kinds (regression)

- **GIVEN** the dispatch switch with the union narrowed (3 remaining
  kinds: `vba-sync`, `query-read`, `query-maintenance`)
- **WHEN** TypeScript checks a `switch (route.kind)` with no `default`
  and an incomplete case list
- **THEN** the `never`-typed exhaustiveness assertion MUST still fail the
  build
- **AND** re-adding a 4th kind later MUST be a deliberate type-widening
  change the author cannot do by accident

#### Scenario: documented re-introduction path (edge)

- **GIVEN** the `McpToolRoute` type after removal
- **WHEN** a future contributor reads the type's JSDoc
- **THEN** a note SHOULD explain that `query-write-fixture` was removed
  in [#624/2] because no live caller existed, and that re-introduction
  requires adding an entry to `MCP_TOOL_ROUTES` first

#### Scenario: tooling payloads unaffected (regression)

- **GIVEN** every entry in `MCP_TOOL_ROUTES`
- **WHEN** the dispatch factory routes a tool call
- **THEN** the tool call's response MUST be byte-equivalent to the
  pre-removal behavior
- **AND** no MCP client SHOULD observe any change in tool names, schema
  shapes, or response payloads

### Test surface

| Test file | New test name | Class |
|---|---|---|
| `test/adapters/mcp/dispatch-factory.test.ts` | `McpToolRoute union has no query-write-fixture kind` | structural |
| `test/adapters/mcp/dispatch-factory.test.ts` | `dispatch switch has no query-write-fixture case branch` | structural |
| `test/adapters/mcp/dispatch-factory.test.ts` | `exhaustiveness guard still rejects unknown kinds` | regression |
| `test/adapters/mcp/dispatch-factory.test.ts` | `every existing tool still routes to its documented handler (regression)` | regression |
