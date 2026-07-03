# Tasks: MCP Contract Safety — Honest Schema-vs-Runtime Parity

## Review Workload Forecast

| PR  | Estimated changed lines | 400-line budget risk | Files touched | Tests added | Notes |
| --- | ----------------------- | -------------------- | ------------- | ----------- | ----- |
| PR1a | 300–340                | Med (≈400 budget)   | 11            | 4           | MCP-handler gate only; test_vba parallel gate moved to PR1b |
| PR1b | 55–70                  | Low                  | 2             | 1           | VbaExecutionAdapter test_vba parallel gate; ~65 lines |
| PR2  | 230–310                | Low                  | 6             | 3           | allowTables/denyTables + cleanup cast |
| PR3  | 35–75                  | Low                  | 3             | 1           | release-title-guard.yml + test |

**BUDGET ALERT**: PR1a as scoped (MCP-handler side only) fits within 400 lines. PR1b (VbaExecutionAdapter parallel gate) adds ~65 lines. If both are merged before the security gate is complete, the combined review load ≈ 400 lines — within budget but tight. The split is clean and keeps PR1a atomic for the security fix.

Decision needed before apply: **No** — split is self-evident from budget; orchestrator proceeds with PR1a then PR1b then PR2 then PR3.
Chained PRs recommended: **Yes**
Chain strategy: **stacked-to-main** (each PR merges to main; fast iteration)
400-line budget risk: **Med** (PR1a≈340, PR1b≈65, combined review≈400 — within budget but tight)

---

## Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | MCP-handler default-deny gate + contract reclassification | PR1a | canonical-handlers, schemas, contracts, descriptions |
| 2 | test_vba parallel gate in VbaExecutionAdapter | PR1b | ~65 lines; depends on PR1a merged |
| 3 | allowTables/denyTables + cleanup cast parity | PR2 | depends on PR1b |
| 4 | CI release-title guard | PR3 | CI-only; depends on PR2 |

---

## PR1a — #5 Honest VBA Execution Contract (MCP Handler Side)

**Commit**: `fix(mcp): VBA execution default-deny gate (#621, F1)`

**Commit body**:
```
SDD: mcp-contract-safety
Issue: #621
Tests: test/adapters/mcp/canonical-handlers.test.ts,
       test/adapters/mcp/tools.test.ts (allowlist tests + dryRun escape),
       test/adapters/mcp/mcp-tool-contracts.test.ts (updated assertions),
       test/adapters/mcp/alias-tools.test.ts (dryRun field in buildRunVbaRequest)
Access: source-only; manual compile not required (standard/class modules only)
```

### Phase 1: Core Types + Gate Logic

- [x] 1.1 Add `dryRun?: boolean` to `AccessVbaRequest` (`src/core/contracts/index.ts:88-104`) — after `expectedDestinationRoot?`
- [x] 1.2 Flip `ensureProcedureAllowed` to default-deny (`src/adapters/mcp/canonical-handlers.ts:26-40`) — add `dryRun: boolean | undefined` param; reject when `allowedProcedures` empty AND `dryRun !== true`
- [x] 1.3 Update call site at `canonical-handlers.ts:56-57` to pass `request.dryRun` to `ensureProcedureAllowed`

### Phase 2: Schemas

- [x] 2.1 Add `dryRun: SCHEMA_PROPS.dryRun` to `VBA_EXECUTE_SCHEMA` (`src/adapters/mcp/schemas/dysflow-schemas.ts:45-71`) — after `arguments` property
- [x] 2.2 Add `dryRun: SCHEMA_PROPS.dryRun` to `run_vba` schema (`src/adapters/mcp/schemas/vba-sync-schemas.ts:27-39`) — after `argsJson`
- [x] 2.3 Thread `dryRun` through `buildRunVbaRequest` (`src/adapters/mcp/alias-tools.ts:117-141`) — add `dryRun: obj.dryRun === true ? true : undefined` to returned object

### Phase 3: Contract Reclassification

- [x] 3.1 Reclassify `run_vba` contract (`src/adapters/mcp/mcp-tool-contracts.ts:56-61`) — `access: "conditional-write"`, `writeGate: "conditional"`, updated summary mentioning allowlist + dryRun
- [x] 3.2 Reclassify `dysflow_vba_execute` contract (`src/adapters/mcp/mcp-tool-contracts.ts:105-111`) — same pattern
- [x] 3.3 Reclassify `test_vba` contract metadata only (`mcp-tool-contracts.ts` — generated route, add explicit entry with `access: "conditional-write"`, `writeGate: "conditional"`, summary mentioning allowlist — runtime gate deferred to PR1b)

### Phase 4: Descriptions

- [x] 4.1 Update `dysflow_vba_execute` description (`src/adapters/mcp/tools.ts:92`) — append `dryRun` and allowlist to existing description
- [x] 4.2 Update `run_vba` description (`src/adapters/mcp/tool-parity-registry.ts:120-121`) — append allowlist + dryRun mention
- [x] 4.3 Update `test_vba` description (`tool-parity-registry.ts:122-123`) — append allowlist mention (PR1b adds runtime gate)

### Phase 5: Tests

**RED first**: write failing tests before implementation changes.

- [x] 5.1 NEW FILE `test/adapters/mcp/canonical-handlers.test.ts` — test `ensureProcedureAllowed` with `dryRun` param: (a) rejects when allowlist empty + no dryRun, (b) accepts when dryRun=true, (c) accepts when procedure in allowlist
- [x] 5.2 In `test/adapters/mcp/tools.test.ts:1284-1290` — flip `allows any procedure when allowlist is empty (unconfigured)` to assert `REFUSAL` (`isError: true`)
- [x] 5.3 In `tools.test.ts:1342-1348` — same flip for `run_vba` alias
- [x] 5.4 In `tools.test.ts` — add new test: `accepts dryRun:true as escape hatch when no allowlist` (proceduresJson path for `dysflow_vba_execute`)
- [x] 5.5 In `tools.test.ts` — add new test: `accepts dryRun:true for run_vba alias when no allowlist`
- [x] 5.6 In `test/adapters/mcp/mcp-tool-contracts.test.ts:36-99` — update assertions: `dysflow_vba_execute` → `writeGate: "conditional"`, `access: "conditional-write"`; summary contains `allowlist` AND `dryRun`
- [x] 5.7 In `test/adapters/mcp/alias-tools.test.ts` — add `dryRun` field assertion to `buildRunVbaRequest` test (existing test at line 37 extended with `dryRun: true` input → `dryRun: true` in output)

### Verification

- Run `pnpm test -- --run test/adapters/mcp/canonical-handlers.test.ts test/adapters/mcp/tools.test.ts test/adapters/mcp/mcp-tool-contracts.test.ts test/adapters/mcp/alias-tools.test.ts` — all must pass
- Run `pnpm lint` — no new warnings
- Run `pnpm build` — must succeed

### Rollback

Revert the commit. `ensureProcedureAllowed` reverts to allow-by-default; schemas lose `dryRun`; contracts revert to `read-only/none`; descriptions revert to pre-gate wording.

---

## PR1b — test_vba Parallel Gate in VbaExecutionAdapter

**Commit**: `fix(mcp): add test_vba default-deny gate in VbaExecutionAdapter (#621, F1)`

**Commit body**:
```
SDD: mcp-contract-safety
Issue: #621
Tests: test/adapters/vba-sync/vba-execution-adapter.test.ts (test_vba gate tests)
Access: source-only; manual compile not required
```

### Phase 1: Parallel Gate

- [ ] 1.1 Add `allowedProcedures?: readonly string[]` parameter to `VbaExecutionAdapter.constructor` and store as `private readonly allowedProcedures`
- [ ] 1.2 Add `ensureTestProcedureAllowed(params, allowedProcedures)` private method mirroring the `canonical-handlers.ts` gate logic — reject when `allowedProcedures` empty AND no `dryRun: true` in params
- [ ] 1.3 Call `ensureTestProcedureAllowed` at the top of `executeTestVba` (`src/adapters/vba-sync/vba-execution-adapter.ts:293`) — before any other logic
- [ ] 1.4 Thread `allowedProcedures` from `VbaSyncAdapter` → `VbaExecutionAdapter` constructor (find the instantiation site and pass the config value)

### Phase 2: Tests

**RED first**:

- [ ] 2.1 NEW FILE `test/adapters/vba-sync/vba-execution-adapter.test.ts` — test `executeTestVba`: (a) refuses when `allowedProcedures` unconfigured and no `dryRun`, (b) accepts when `dryRun: true`, (c) accepts when procedure name in `allowedProcedures`

### Verification

- Run `pnpm test -- --run test/adapters/vba-sync/vba-execution-adapter.test.ts` — must pass
- Run `pnpm lint && pnpm build` — must succeed

### Rollback

Revert the commit. `executeTestVba` loses the gate and any procedure runs.

---

## PR2 — #6a + #6b Modern/Legacy Alias Parity

**Commit**: `fix(mcp): allowTables/denyTables on dysflow_query_execute + cleanup pass-through parity (#621, F2+F3)`

**Commit body**:
```
SDD: mcp-contract-safety
Issue: #621
Tests: test/adapters/mcp/tools.test.ts (write-mode pass-through, TABLE_DENIED),
       test/adapters/mcp/alias-tools.test.ts (field parity),
       test/adapters/mcp/schemas.test.ts (QUERY_EXECUTE_SCHEMA allowTables/denyTables)
Access: source-only; manual compile not required
```

### Phase 1: Schema Changes

- [ ] 1.1 Add `allowTables: SCHEMA_PROPS.allowTables` and `denyTables: SCHEMA_PROPS.denyTables` to `QUERY_EXECUTE_SCHEMA` (`src/adapters/mcp/schemas/dysflow-schemas.ts:73-106`) — after `apply: SCHEMA_PROPS.apply`
- [ ] 1.2 Verify `tools.ts:115-119` spread already carries `allowTables`/`denyTables` through — no change needed, but add a comment noting parity

### Phase 2: Cleanup Cast Replacement

- [ ] 2.1 Import `buildCleanupRequest` from `./alias-tools.js` in `tools.ts`
- [ ] 2.2 Replace the bare cast `(validatedInput) => validatedInput as { operationId: string; accessPath: string; force?: boolean }` at `tools.ts:151-153` with `(validatedInput) => buildCleanupRequest(validatedInput)`

### Phase 3: Tests

**RED first**:

- [ ] 3.1 In `test/adapters/mcp/schemas.test.ts` (or extend existing schema tests) — assert `QUERY_EXECUTE_SCHEMA.properties.allowTables.type === "array"` and same for `denyTables`
- [ ] 3.2 In `tools.test.ts` — add test: `dysflow_query_execute write mode passes allowTables/denyTables through to core service` (fake queryService captures request; assert `allowTables` and `denyTables` present)
- [ ] 3.3 In `tools.test.ts` — add test: `dysflow_query_execute write mode respects denyTables via TABLE_DENIED` (fake queryService returns `failureResult({ code: "TABLE_DENIED" })`; assert `isError: true` with text matching `/TABLE_DENIED/`)
- [ ] 3.4 In `tools.test.ts` — add test: `dysflow_query_execute read mode ignores allowTables/denyTables` (fake queryService not called with these fields in read mode)
- [ ] 3.5 In `tools.test.ts` — add test: `dysflow_access_cleanup modern pass-through mirrors buildCleanupRequest` (invoke with full field set; assert all schema fields present in captured request)
- [ ] 3.6 In `alias-tools.test.ts` — add test: `legacy and modern cleanup pass-through field sets are equal` (call both builders with same input; assert same field keys)

### Verification

- Run `pnpm test -- --run test/adapters/mcp/tools.test.ts test/adapters/mcp/alias-tools.test.ts` — must pass
- Run `pnpm lint && pnpm build` — must succeed

### Rollback

Revert the commit. `QUERY_EXECUTE_SCHEMA` loses `allowTables`/`denyTables`; modern cleanup handler reverts to bare cast dropping fields.

---

## PR3 — #7 CI Release Title == Tag

**Commit**: `ci(release): enforce title == tag_name on release events (#621, F4)`

**Commit body**:
```
SDD: mcp-contract-safety
Issue: #621
Tests: test/quality-gates/release-title-guard.test.ts
Access: not applicable (CI change)
```

### Phase 1: release.yml Update

- [ ] 1.1 Add `name: ${{ github.ref_name }}` to the `softprops/action-gh-release@v3` step (`.github/workflows/release.yml:79-89`) — before `files:` key

### Phase 2: New Guard Workflow

- [ ] 2.1 NEW FILE `.github/workflows/release-title-guard.yml`:
  ```yaml
  name: Release Title Guard
  on:
    release:
      types: [created, edited]
  permissions:
    contents: read
  jobs:
    assert:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v5
        - name: Assert title == tag_name
          run: |
            if [ "${{ github.event.release.title }}" != "${{ github.event.release.tag_name }}" ]; then
              echo "Release title must equal tag_name." >&2
              echo "  title    = ${{ github.event.release.title }}" >&2
              echo "  tag_name = ${{ github.event.release.tag_name }}" >&2
              exit 1
            fi
  ```

### Phase 3: Tests

**RED first**:

- [ ] 3.1 NEW FILE `test/quality-gates/release-title-guard.test.ts` — read both workflow files; assert `release.yml` contains `name: ${{ github.ref_name }}`; assert `release-title-guard.yml` contains both `title` and `tag_name` references and `exit 1` on mismatch

### Verification

- Run `pnpm test -- --run test/quality-gates/release-title-guard.test.ts` — must pass
- `pnpm lint` — must pass (no build needed for CI-only change)

### Rollback

Revert the commit. Delete `release-title-guard.yml` and remove `name:` from `release.yml`. AGENTS.md manual rule is the backstop.

---

## CHANGELOG Tasks

### PR1a + PR1b (when both merged — use single CHANGELOG entry)

Add under `[Unreleased]` in `CHANGELOG.md`:

```markdown
### mcp-contract-safety (#621)

#### Breaking
- **`run_vba` / `dysflow_vba_execute` / `test_vba` now default-deny** when no `allowedProcedures` is configured and `dryRun: true` is not passed. Agents that relied on implicit ad-hoc VBA execution without an allowlist will now receive `MCP_INPUT_INVALID`. Set `allowedProcedures` in `.dysflow/project.json` to restore access (see `docs/mcp-examples.md`).
```

### PR2

Add under same `[Unreleased] mcp-contract-safety` section:

```markdown
#### Added
- **`dysflow_query_execute` write mode now accepts `allowTables`/`denyTables`** — same semantics as `exec_sql`. The `QUERY_EXECUTE_SCHEMA` now advertises these fields and the modern handler passes them through to `AccessQueryService.execute()`.
- **`dysflow_access_cleanup` now passes through all `CLEANUP_SCHEMA` fields** (including `strictContext`, `expectedAccessPath`, etc.) instead of silently dropping them via a bare cast.
```

### PR3

Add under same section:

```markdown
#### CI
- **Release CI now fails when `title !== tag_name`** on `release: [created, edited]`. The `release-title-guard.yml` workflow enforces this invariant and reports both values on mismatch.
```

---

## Implementation Commits

| Commit | Work unit | SDD tasks | Verification | Access sync |
|--------|-----------|-----------|-------------|-------------|
| `b08c33f` | `#621/1a` MCP-handler default-deny gate + contract reclassification | 1.1–5.7 | `pnpm test` 1898/1898 (8 test files); `pnpm build` clean | source-only; no compile needed |
| `<sha>` | `#621/1b` test_vba parallel gate in VbaExecutionAdapter | PR1b Phase 1–2 | `pnpm test` (vba-execution-adapter.test.ts) | source-only |
| `<sha>` | `#621/2` allowTables/denyTables + cleanup cast parity | PR2 Phase 1–3 | `pnpm test` (tools + alias-tools + schemas) | source-only |
| `<sha>` | `#621/3` CI release-title guard | PR3 Phase 1–3 | `pnpm test` (release-title-guard.test.ts) | not applicable |
