# Proposal: MCP Contract Safety — Read-Only Mislabel + Modern/Legacy Alias Drift + CI Release Title

## Intent

Close three contract-truth defects from the 2026-07-01 audit
(filed as issue #621). The MCP contract advertised to consuming
agents is lying in three different ways: a tool labeled
"read-only" can execute arbitrary compiled VBA, modern aliases
silently drop guards that their legacy counterparts expose, and
the CI does not enforce the AGENTS.md `release title == tag`
hard rule. Each finding has the same shape (contract ↔ reality
gap) but lives in a distinct sub-area; the chain splits cleanly
along those three lines.

## Scope

### In Scope

- **#5 (🔴)** Reclassify `run_vba`, `dysflow_vba_execute`, and
  `test_vba` from `read-only / writeGate: none` to
  `read-write / conditional-write` in
  `src/adapters/mcp/mcp-tool-contracts.ts:56-61, 106-111`. Add a
  default-deny gate in `handleMcpVbaExecute`
  (`canonical-handlers.ts:42-62`) that refuses to run unless
  either (a) the project config declares an
  `allowedProcedures` list AND the procedure is in it, or
  (b) the caller passes `dryRun: true`. Update the
  generated `description` (`tools.ts:92`,
  `tool-parity-registry.ts:120-123`) to declare the gate
  honestly.
- **#6 (🔴)** Add `allowTables`/`denyTables` parity to
  `dysflow_query_execute` (write mode): add the fields to
  `QUERY_EXECUTE_SCHEMA` (`schemas/dysflow-schemas.ts:73-106`)
  and verify `AccessQueryService.execute()` enforces them on
  write paths (currently enforced only via the
  `buildWriteFixtureRequest` path used by the legacy aliases).
  Reuse existing `SCHEMA_PROPS.allowTables/denyTables` atoms
  (`shared/validation/schema-props.ts:110-121`) — already in
  `AccessQueryRequest` (`core/contracts/index.ts:197-198`).
  Replace the modern `dysflow_access_cleanup` handler's silent
  field-drop in `tools.ts:141-154` with a `buildCleanupRequest`
  call (see audit-precision notes).
- **#7 (🟡)** Add a CI gate that fails the release job when
  the published release `title !== tag_name`. Two options; the
  fix chooses the cheapest: pass `name: ${{ github.ref_name }}`
  explicitly to `softprops/action-gh-release@v3`
  (`.github/workflows/release.yml:80`) AND add a
  `release-{created,edited}` workflow that re-asserts the
  invariant and fails the check on drift.

### Out of Scope

- Refactoring `MCP_TOOL_CONTRACTS` shape (the contract
  taxonomy stays; only the per-tool classifications move).
- Changing `AccessOperationCleanupService.cleanup()`'s
  runtime signature to accept `strictContext` (see Audit
  Notes — that is a separate, larger change).
- Re-naming the legacy aliases. `cleanup_access_operation`
  etc. stay; the modern handler simply catches up.
- New MCP tools, schema keyword additions, or CLI surface.

## Capabilities

### New Capabilities
None.

### Modified Capabilities

- **`mcp-stdio-adapter`**: "Tool Contract Truth" requirement —
  the `access`/`writeGate` classification of every MCP tool
  MUST agree with the gate(s) its handler actually enforces
  on the call path; the generated `description` MUST declare
  every gate (allowlist, dryRun, write-gate). Add
  "modern/legacy parity" requirement: for every pair
  (`X`, `dysflow_X`) where both exist, the modern handler
  MUST expose (or explicitly drop with documentation) every
  guard the legacy handler exposes.
- **`vba-manager-actions`**: Add the "VBA Execution Default-
  Deny" requirement — `run_vba`/`dysflow_vba_execute`/
  `test_vba` MUST refuse execution unless the project
  config declares `allowedProcedures` AND the procedure is
  in that list, OR the caller passes `dryRun: true`. The
  Current-Compiled-Project precondition moves to a hard
  refuse clause.
- **`mcp-query-tools`**: "Write Mode Table Guard Parity"
  requirement — `dysflow_query_execute` in write mode MUST
  accept and enforce `allowTables`/`denyTables` with the
  same semantics as `exec_sql`. The AccessQueryRequest
  shape already carries them; only the schema + service
  path needs bridging.
- **`access-operation-contracts`**: Add the
  `AccessOperationCleanupService` schema-vs-runtime parity
  requirement — every field advertised in
  `CLEANUP_SCHEMA` (`schemas/vba-sync-schemas.ts:14-26`)
  MUST be either (a) honored by the core service or (b)
  marked deprecated in the schema (closes the
  strictContext-shaped loop-hole surfaced in audit note 1).

## Approach

Each PR is a one-fix PR with RED-first unit tests at the
port(s) the consumer would touch. Strict TDD per the
campaign rule (NO E2E this cycle; integration tests in
`test/integration/**` OK).

Reference shape for the gate test (mirrors
`test/adapters/mcp/mcp-tool-contracts.test.ts:36-67` and
`test/adapters/mcp/tools.test.ts:468-475`):

```
it("refuses dysflow_vba_execute when no allowedProcedures and no dryRun", async () => {
  const tool = tools.find(t => t.name === "dysflow_vba_execute")!;
  const result = await tool.handler({ procedureName: "Module.Sub" }, ctx);
  expect(result.isError).toBe(true);
  expect(result.content[0].text).toMatch(/allowedProcedures|dryRun/);
});
```

Mirror for legacy: `run_vba` same gate, same reason.

No E2E. Real-Access `access-runner.test.ts:1358` flake is
expected (consistent across all PRs; not a regression).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/adapters/mcp/mcp-tool-contracts.ts` | Modified | #5: reclassify `run_vba` (56-61) + `dysflow_vba_execute` (106-111); mirror on `test_vba` (route at `dispatch-routes.ts:29` is `vba-sync`/`mutatesBinary:false` because running tests doesn't import — but the description still claims read-only and runs compiled user code, so the contract assertion moves). |
| `src/adapters/mcp/canonical-handlers.ts` | Modified | #5: add default-deny in `handleMcpVbaExecute` (lines 26-62) when no allowlist + no `dryRun`. #6b: drop the bare cast in `tools.ts:151-153`. |
| `src/adapters/mcp/tools.ts` | Modified | #5 description (92). #6b: replace `(validatedInput) => validatedInput as {operationId, accessPath, force?}` with a builder that mirrors `buildCleanupRequest`. |
| `src/adapters/mcp/tool-parity-registry.ts` | Modified | #5: rewrite `run_vba` (120-121) and `test_vba` (122-123) descriptions to declare the gate. |
| `src/adapters/mcp/schemas/dysflow-schemas.ts` | Modified | #6a: add `allowTables`/`denyTables` to `QUERY_EXECUTE_SCHEMA` (73-106). |
| `src/adapters/mcp/schemas/vba-sync-schemas.ts` | Modified | #5: add `dryRun` to `run_vba` schema (27-39). |
| `src/core/services/access-query-service.ts` (verify) | Possibly modified | #6a: confirm `allowTables`/`denyTables` enforcement on the modern `dysflow_query_execute` write path; if missing, port from the `buildWriteFixtureRequest` path. |
| `.github/workflows/release.yml` | Modified | #7: pass `name: ${{ github.ref_name }}` to `softprops/action-gh-release@v3`. |
| `.github/workflows/release-title-guard.yml` (new) | New | #7: a small `release: [created, edited]` job that asserts title === tag_name and fails on drift. |
| `test/adapters/mcp/mcp-tool-contracts.test.ts` | Modified | #5: update contract assertions for reclassified tools (tests at lines 26-99 pin current strings; rewrite the gate-words expected). |
| `test/adapters/mcp/tools.test.ts` | Modified | #5: RED→GREEN default-deny gate for both `dysflow_vba_execute` and `run_vba`. |
| `test/adapters/mcp/alias-tools.test.ts` | Modified | #5: RED→GREEN for the legacy `run_vba` path with no allowlist. |
| `test/adapters/mcp/mcp-tool-parity.test.ts` (new or extend) | New tests | #6: per-pair parity matrix (modern vs legacy) — fail if any modern name silently drops a guard. |
| `test/adapters/mcp/schemas.test.ts` (or extend) | New tests | #6: schema asserts `allowTables`/`denyTables` on `QUERY_EXECUTE_SCHEMA`. |
| `openspec/specs/mcp-stdio-adapter/spec.md` | Modified | Delta: tool contract truth + modern/legacy parity. |
| `openspec/specs/vba-manager-actions/spec.md` | Modified | Delta: VBA execution default-deny. |
| `openspec/specs/mcp-query-tools/spec.md` | Modified | Delta: write-mode table-guard parity. |
| `openspec/specs/access-operation-contracts/spec.md` | Modified | Delta: schema-vs-runtime parity. |

## Chain Split (force-chained PRs, 400-line budget)

| # | PR | Goal | Likely Δ | TDD evidence | Verification | Rollback |
|---|---|---|---|---|---|---|
| **1** | `[#621/1] #5 honest VBA execution contract` | Reclassify `run_vba` / `dysflow_vba_execute` / `test_vba`; add default-deny gate; rewrite the three descriptions | 200-280 | RED `tools.test.ts` + `alias-tools.test.ts` + update `mcp-tool-contracts.test.ts` fixtures | `pnpm test` (unit + integration); `pnpm lint`; `pnpm build` | Revert; tools return to advertised "read-only" misleading state (pre-bug) |
| **2** | `[#621/2] #6 modern/legacy alias parity` | `dysflow_query_execute` write-mode table guards; `dysflow_access_cleanup` field parity; `MCP_TOOL_CONTRACTS` parity matrix entry | 240-340 | RED `mcp-tool-parity.test.ts` (new) + `tools.test.ts` cleanup-cast + `schemas` test | `pnpm test` (unit + integration) | Revert; modern tools drop guards again (pre-fix) |
| **3** | `[#621/3] #7 CI release title == tag` | `release.yml` pass `name: ${{ github.ref_name }}`; new `release-title-guard.yml` job that fails on drift | 40-80 | RED release-title assertion: feed the new job a fixture release payload with mismatched title and assert non-zero exit | `pnpm test` (the PR also adds the test that uses a mocked release event) | Revert the explicit `name` and the new workflow — back to manual checklist |

Total: 480-700 changed lines across 3 PRs. Each is independently
reviewable and revertable. The user has authorized merging to
`main` as we go (per #619 / #620 campaign precedent) — no
`staging` gate.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| #5 default-deny breaks a legitimate agent that relied on ad-hoc `run_vba` with no allowlist | High | Document in CHANGELOG + release notes; the gate's error names the fix (set `allowedProcedures` in `.dysflow/project.json`). The audit's three previous campaigns (#619, #620) confirm the team already pins this config for the same reason. |
| `test_vba` reclassification ripples into dispatch-routes.ts (currently `mutatesBinary: false`) | Med | Tests, including test atoms, may legitimately mutate DB state; do NOT move `test_vba` to `mutatesBinary: true` (that breaks `isBinaryWrite` filter). Only reclassify the contract truth + description; the dispatch-route binary-mutation flag stays. |
| #6 `dysflow_access_cleanup` field-build change shifts the success-result envelope | Med | The builder mirrors `buildCleanupRequest` (`alias-tools.ts:88-108`); the only new prop is `strictContext` (currently dropped). Forward-compat: pass through, ignore downstream if service can't use it. |
| #7 release-title job fires false-positive on a bot edit | Low | The guard runs on `release: [created, edited]`; only fail when `title !== tag_name`, which the maintainer can re-set without a re-deploy. |
| Chained PRs touch overlapping test fixtures (`mcp-tool-contracts.test.ts`) | Med | Each PR updates only its own assertions; the third PR only adds a release-shape test, not contract assertions. |

## Rollback Plan

Each PR is independently revertable. PR1/PR2 restore prior
behavior with no data loss. PR3 removes the new workflow file
and the `name:` parameter; CI returns to the prior state (the
AGENTS.md manual rule is still in force).

## Dependencies

- Existing test ports:
  `test/adapters/mcp/tools.test.ts`,
  `test/adapters/mcp/alias-tools.test.ts`,
  `test/adapters/mcp/mcp-tool-contracts.test.ts`.
- Existing schema atoms:
  `SCHEMA_PROPS.allowTables`/`denyTables`
  (`src/shared/validation/schema-props.ts:110-121`).
- Existing builder:
  `buildCleanupRequest` (`alias-tools.ts:88-108`) — mirror
  for the modern handler.
- Real-Access `access-runner.test.ts:1358` flake — not a
  regression, consistent across all PRs (campaign note).

## Success Criteria

- [ ] **#5**: `dysflow_vba_execute` / `run_vba` `description`
      carries "allowlist" AND "dryRun" wording; the contract
      classification is `read-write / conditional-write`; the
      handler returns `MCP_INPUT_INVALID` when called with no
      allowlist AND no `dryRun: true`. Pinned via new RED
      tests in `tools.test.ts` / `alias-tools.test.ts` and
      updated assertions in `mcp-tool-contracts.test.ts`.
- [ ] **#6a**: `QUERY_EXECUTE_SCHEMA` accepts `allowTables` /
      `denyTables` (declared on the schema AND honored by
      `AccessQueryService.execute()` on the
      `dysflow_query_execute` write path). Pinned via new test.
- [ ] **#6b**: `dysflow_access_cleanup` handler passes through
      all fields the `CLEANUP_SCHEMA` advertises (including
      `strictContext`, `expectedAccessPath`, etc.); the modern
      handler is no longer a strict subset of `buildCleanupRequest`
      for the typed fields. Pinned via new parity test.
- [ ] **#7**: A maintainer attempting to publish a release with
      `title !== tag_name` sees a failed CI job with both
      values in the error. Pinned via release-event fixture
      test (no live release needed).
- [ ] `pnpm test`, `pnpm lint`, `pnpm build` pass after each PR.
- [ ] Each PR commit body carries `SDD: mcp-contract-safety`
      and `Issue: #621` per
      `gentle-ai:sdd-commit-traceability`.
- [ ] No commit body carries AI co-author attribution (the
      repo's hard rule).

## Audit-precision notes (informed by reading code)

Two findings were slightly imprecise; the proposed fix is
unchanged but the description is corrected, plus one scope
expansion the audit did not name but the code demands:

- **#6b "strictContext subset" imprecision.** The audit says
  `dysflow_access_cleanup` (modern) "is missing `strictContext`
  and multi-project targeting" relative to
  `cleanup_access_operation` (legacy). Reading the code, both
  tools use the SAME `CLEANUP_SCHEMA`
  (`vba-sync-schemas.ts:14-26`) — both advertise
  `strictContext`/`expectedAccessPath`/etc. The legacy
  handler routes those values through
  `buildCleanupRequest` (`alias-tools.ts:88-108`) and drops
  them silently when forwarding to the core service. The
  modern handler at `tools.ts:151-153` does the same drop but
  more visibly (`as {operationId, accessPath, force?}` cast).
  **The schema-vs-runtime gap exists on BOTH paths**, not
  only on the modern name. The fix surfaces this in
  PR2 (parity) but PR2 will not retrofit the core service
  to honor `strictContext` — that is a separate
  capability change. Scope of PR2 = "modern drops fields;
  stop the silent drop". Adding real `strictContext`
  enforcement in the service is a follow-up
  (touches `AccessOperationCleanupService.cleanup()`,
  `access-operation-preflight.ts`, the MCP request
  resolution path in `stdio.ts:243-255`). Surfaced here so
  the team decides explicitly whether to fold it in or punt.
- **#5 `test_vba` route stays `mutatesBinary: false`.** The
  audit lumps `test_vba` with `run_vba`/`dysflow_vba_execute`
  for the mislabel. The reclassification (PR1) moves the
  three TOOL descriptions to "executes compiled VBA code" and
  reclassifies the contract tuple, but does NOT touch
  `dispatch-routes.ts:29` where `test_vba` is registered as
  `kind: "vba-sync"` / `mutatesBinary: false`. That route
  classification gates the MCP write-gate, not the contract;
  flipping `mutatesBinary: true` would change whether a
  dry-run test invocation trips `MCP_WRITES_DISABLED`, which
  is a different question and a separate decision. Filed
  here as "out of scope for #5 fix".
- **File path correction (minor).** Audit correctly identifies
  `src/adapters/mcp/mcp-tool-contracts.ts:18-28` and
  `tools.ts:92` for the contract-injection site. The audit
  also references `executeMappedTool` for `run_vba`/`test_vba`
  routing; that path is `src/adapters/vba-sync/vba-execution-adapter.ts:88-89`
  (also an adapter outside `src/adapters/mcp/`) — confirms
  the bug is in BOTH adapters, not just MCP.
