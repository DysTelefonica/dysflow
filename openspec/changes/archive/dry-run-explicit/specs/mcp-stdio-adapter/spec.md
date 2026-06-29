# Delta for mcp-stdio-adapter

## MODIFIED Requirements

### Requirement: Canonical Dry-Run Resolution

A single exported function `resolveIsDryRun(input: unknown): boolean` MUST remain the sole entry point for computing dry-run state from tool input. All dry-run evaluation sites in `tools.ts` MUST delegate to the canonical resolution behavior and MUST NOT reimplement it.

Resolution rules, in priority order:
1. If `apply === true`, the request MUST be treated as write-enabled, regardless of `dryRun`.
2. If `dryRun === false`, the request MUST be treated as write-enabled.
3. Otherwise, the request MUST be treated as dry-run active.

For write-capable legacy MCP tools, when both `apply` and `dryRun` are omitted and dry-run is selected by default, the MCP response MUST include a visible text content item containing the sentinel `DRY_RUN_DEFAULT:`. The primary MCP response shape MUST remain compatible: the normal result content MUST remain at `content[0]`, and the warning MUST NOT replace or reorder that primary content.

Explicit `dryRun: true` SHOULD be treated as intentional dry-run and SHOULD NOT be labeled as default dry-run. Explicit write-enabled requests using `apply: true` or `dryRun: false` MUST NOT emit the default warning.

(Previously: omitted `apply` and `dryRun` safely defaulted to dry-run but did not require any visible MCP response warning.)

#### Scenario: apply true overrides dryRun true
- GIVEN tool input `{ apply: true, dryRun: true }`
- WHEN dry-run state is resolved
- THEN the request MUST be write-enabled
- AND no `DRY_RUN_DEFAULT:` warning SHALL be emitted

#### Scenario: apply false with dryRun false
- GIVEN tool input `{ apply: false, dryRun: false }`
- WHEN dry-run state is resolved
- THEN the request MUST be write-enabled
- AND no `DRY_RUN_DEFAULT:` warning SHALL be emitted

#### Scenario: explicit apply true and dryRun false writes without warning
- GIVEN tool input `{ apply: true, dryRun: false }`
- WHEN a write-capable legacy MCP tool returns a response
- THEN the request MUST be write-enabled
- AND no `DRY_RUN_DEFAULT:` warning SHALL be emitted

#### Scenario: default dry-run emits visible warning
- GIVEN a write-capable legacy MCP tool input with neither `apply` nor `dryRun`
- WHEN the tool returns an MCP response
- THEN dry-run MUST be active
- AND the response content MUST include a visible text item containing `DRY_RUN_DEFAULT:`

#### Scenario: primary MCP content remains stable
- GIVEN a write-capable legacy MCP tool defaults to dry-run due to omitted flags
- WHEN the MCP response is returned
- THEN the normal result content MUST remain at `content[0]`
- AND the `DRY_RUN_DEFAULT:` warning MUST be additional content, not a replacement

#### Scenario: explicit dryRun true is intentional
- GIVEN a write-capable legacy MCP tool input `{ dryRun: true }`
- WHEN the tool returns an MCP response
- THEN dry-run MUST be active
- AND the response SHOULD NOT include a `DRY_RUN_DEFAULT:` warning

#### Scenario: apply true alone
- GIVEN tool input `{ apply: true }`
- WHEN dry-run state is resolved
- THEN the request MUST be write-enabled
- AND no `DRY_RUN_DEFAULT:` warning SHALL be emitted

#### Scenario: all sites delegate
- GIVEN any MCP tool that evaluates dry-run state
- WHEN the tool decides whether writes are enabled
- THEN it MUST use the canonical dry-run resolution behavior
- AND MUST NOT reimplement the priority rules inline
