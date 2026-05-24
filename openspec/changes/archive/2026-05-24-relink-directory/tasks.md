# Tasks: `dysflow access relink-directory`

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1,220 total across 4 PRs |
| 400-line budget risk | PR 3: Medium (360–420 lines — may need split) |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 (or 3a+3b) → PR 4 |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Est. Lines | Notes |
|------|------|-----------|-----------|-------|
| 1 | TS layer: contracts + CLI routing + arg parser + unit tests + parity fixes | PR 1 | ~320 | Base: main; self-contained; no PS changes |
| 2 | PS scan: file enum + link info + classification + dry-run JSON | PR 2 | ~260 | Base: PR 1 merged to main |
| 3 | PS apply: backup + alias map + chain resolution + remove-unresolved | PR 3 | ~360–420 | Base: PR 2 merged; split into 3a/3b if > 380 |
| 4 | PS verify: strict-local + deny-prefix + E2E suite | PR 4 | ~280 | Base: PR 3 merged; skipped without Access |

---

## PR 1 — TS Layer: Contracts + CLI Routing + Unit Tests

> Base branch: `main`
> Scope: TypeScript only, no PS changes.

### Phase 1: Contracts (foundation — everything depends on this)

- [ ] 1.1 **RED** — Update `test/adapters/mcp/legacy-parity.test.ts`: add `"relink_directory"` to the expected actions array. Run `vitest run test/adapters/mcp/legacy-parity.test.ts` — confirm RED.
- [ ] 1.2 **RED** — Update `test/adapters/mcp/legacy-tool-schemas-parity.test.ts`: add `"relink_directory"` to expected tool names. Run — confirm RED.
- [ ] 1.3 **GREEN** — In `src/core/contracts/index.ts`: append `"relink_directory"` to the `AccessQueryRequest.action` union type.
- [ ] 1.4 In `src/core/contracts/index.ts`: add optional fields to `AccessQueryRequest` — `maps?: readonly { from: string; to: string }[]`, `denyPrefixes?: readonly string[]`, `strictLocal?: boolean`, `removeUnresolved?: boolean`, `recursive?: boolean`, `timeoutMs?: number`.
- [ ] 1.5 In `src/core/contracts/index.ts`: define and export `LinkClassification`, `RelinkDirectoryFileResult`, and `RelinkDirectoryReport` types (as specified in design).
- [ ] 1.6 In `src/core/contracts/index.ts`: add `relinkDirectory?: RelinkDirectoryReport` to `AccessQueryResult`.
- [ ] 1.7 Run parity tests — confirm GREEN. Run full `vitest run` — no regressions.

### Phase 2: CLI arg parser

- [ ] 2.1 Create `src/cli/commands/access/` directory.
- [ ] 2.2 **RED** — Create `test/cli/access/relink-directory.test.ts` with failing unit tests for `parseRelinkDirectoryArgs`: (a) happy path with all flags, (b) missing `--root` returns `{ ok: false }`, (c) `--map` repeated entries parsed into array, (d) `--deny-prefix` repeated entries parsed, (e) `--password-env` captured, (f) `--apply` sets `apply: true`, (g) no flags → default `apply: false` (dry-run). Run `vitest run test/cli/access/` — confirm RED.
- [ ] 2.3 **GREEN** — Create `src/cli/commands/access/relink-directory.ts`: implement `parseRelinkDirectoryArgs(args)` satisfying all test cases. Export `AliasMapEntry`, `RelinkDirectoryOptions`, `ParseResult<T>` types.
- [ ] 2.4 Run `vitest run test/cli/access/relink-directory.test.ts` — confirm GREEN.

### Phase 3: CLI handler

- [ ] 3.1 **RED** — Add handler tests to `test/cli/access/relink-directory.test.ts`: (a) handler calls `service.execute` with correct `AccessQueryRequest` shape (verify `action: "relink_directory"`, `rootPath`, `maps`, `denyPrefixes`), (b) handler formats human output when `--json` is absent, (c) handler outputs JSON when `--json` is present, (d) handler exits non-zero when `strictLocal` is true and `externalLinkCount > 0`, (e) handler exits non-zero when `denyPrefixMatchCount > 0`. Run — confirm RED.
- [ ] 3.2 **GREEN** — Implement `handleRelinkDirectoryCommand(args, context?, deps?)` in `src/cli/commands/access/relink-directory.ts` using `FakeQueryService`-compatible `deps` injection. Wire strict-local and deny-prefix exit codes.
- [ ] 3.3 Run `vitest run test/cli/access/relink-directory.test.ts` — confirm all GREEN.

### Phase 4: CLI wiring

- [ ] 4.1 Create `src/cli/commands/access.ts`: subcommand router that dispatches `relink-directory` → `handleRelinkDirectoryCommand`; exits with usage error for unknown subcommands.
- [ ] 4.2 Modify `src/cli/index.ts`: register `["access", handleAccessCommand]` in the COMMANDS map.
- [ ] 4.3 Modify `src/cli/commands/types.ts`: add `access` entry to HELP_TEXT.
- [ ] 4.4 Add routing test to `test/cli/commands.test.ts` (or new file): `dysflow access relink-directory --root <dir>` routes correctly; unknown subcommand prints usage error.
- [ ] 4.5 Run full `vitest run` — all GREEN. Commit PR 1.

---

## PR 2 — PS Scan: Enumeration + Classification + Dry-Run JSON

> Base branch: `main` (after PR 1 merged)
> Scope: PowerShell only + thin TS integration wiring for the bypass.

### Phase 1: Dispatch bypass

- [ ] 5.1 In `scripts/dysflow-access-runner.ps1`: add `relink_directory` dispatch block in the `query` branch BEFORE `Open-DatabaseWithBackendPassword`. Block calls `Invoke-RelinkDirectory -Payload $payload`, emits JSON, `exit 0`.
- [ ] 5.2 Create stub `Invoke-RelinkDirectory` function that returns a minimal valid `RelinkDirectoryReport` JSON (all counts zero). Confirms the bypass short-circuits correctly.

### Phase 2: File enumeration

- [ ] 5.3 Implement `Get-AccessFilesRecursive($rootPath, [bool]$recursive)` in `scripts/dysflow-access-runner.ps1`: uses `Get-ChildItem` with `-Recurse` when `$recursive`, filters `.accdb` and `.mdb`.
- [ ] 5.4 Implement `Build-AccessFileIndex($files)`: returns hashtable of `lower(basename) → @(fullpath, …)` for multi-match detection.

### Phase 3: Link info + classification

- [ ] 5.5 Implement `Resolve-LocalPath($backendBasename, $aliasMap, $accessFileIndex)`: apply `--map` alias first; then look up in index; return `$null` if not found or ambiguous; set `$ambiguous=$true` if multiple candidates.
- [ ] 5.6 Implement link classification loop inside `Invoke-RelinkDirectory`: for each `TableDef` with non-empty `Connect`, extract `DATABASE=` value, determine classification: `alreadyLocal`, `plannedRelink`, `ambiguous` (→ `unresolved`), `unresolved`.

### Phase 4: Dry-run JSON output

- [ ] 5.7 Build and emit complete `RelinkDirectoryReport` JSON in dry-run mode (no writes). All counter fields present with zero/empty defaults (FR-18).
- [ ] 5.8 **Test** — Add test to `test/cli/access/relink-directory.test.ts` (or new `test/integration/access-relink-dry-run.test.ts`) that invokes the full handler in dry-run mode against the PS runner on Windows CI (guarded by `hasAccessCom()`); asserts `backupPaths: []` and that no `.bak` file exists.
- [ ] 5.9 Run `vitest run` — all GREEN. Commit PR 2.

---

## PR 3 — PS Apply: Backup + Alias Map + Chain Resolution + Remove-Unresolved

> Base branch: `main` (after PR 2 merged)
> Scope: PowerShell apply logic. **Split into 3a + 3b if implementation exceeds 380 lines.**

### Phase 1 (3a boundary): Backup + Chain Resolution

- [x] 6.1 Implement `Backup-AccessFile($path)` in `scripts/dysflow-access-runner.ps1`: `Copy-Item` to `$path + ".bak-" + (Get-Date -AsUTC -Format "yyyyMMddHHmmss")`; never overwrite; returns backup path string.
- [x] 6.2 Implement `Resolve-LinkChain($dbEngine, $startDb, $tableName, $rootPath, $aliasMap, $accessFileIndex, [ref]$visited, $depth, $maxDepth=5)`: DFS; visited set keyed by `lower(fullpath)|lower(table)`; stops when native table found or `$depth >= $maxDepth`; returns `{ resolvedPath, resolvedTable, isLocal, cycleDetected, hops }`.
- [x] 6.3 Handle cycle detection in `Resolve-LinkChain`: if visited key already present, return `cycleDetected: $true`; do not recurse.
- [x] 6.4 Handle max-depth exceeded: return `cycleDetected: $false, resolvedPath: $null` with `hops: $maxDepth` and error note.

### Phase 2 (3b boundary): Apply Loop + Remove-Unresolved

- [x] 6.5 Wire backup into apply loop in `Invoke-RelinkDirectory`: call `Backup-AccessFile` once per file BEFORE any `RefreshLink` when `$dryRun -eq $false` and `$Payload.backup -ne $false`.
- [x] 6.6 Implement apply per-link: update `td.Connect` with `";DATABASE=" + $resolvedPath`; preserve `SourceTableName` and `ForeignName`; call `td.RefreshLink()`.
- [x] 6.7 Implement `--remove-unresolved` path: after apply loop, if `$Payload.removeUnresolved -eq $true`, call `$db.TableDefs.Delete($linkName)` for each unresolved link; record as `removed`.
- [x] 6.8 Implement locked-file error handling (FR-20): per-file `try/catch`; on open failure, add error string to `fileResult.errors`, continue to next file.
- [x] 6.9 Aggregate all `FileResult` entries into final `RelinkDirectoryReport`; include `backupPaths[]` from all files.
- [x] 6.10 Update `handleRelinkDirectoryCommand` in `src/cli/commands/access/relink-directory.ts` to pass `backup: !noBackup` in the request payload.
- [x] 6.11 **Test** — Add integration test `test/integration/access-relink-apply.test.ts` (guarded by `hasAccessCom()`): create temp `.accdb` fixture with external link in `beforeAll`; run `--apply`; assert `.bak-*` file exists; assert link now points to local path; run dry-run again to confirm `alreadyLocal` classification.
- [x] 6.12 **Test** — Add integration test for `--remove-unresolved`: fixture with unresolvable link; run `--apply --remove-unresolved`; assert TableDef no longer present.
- [x] 6.13 **Test** — Add integration test for chain resolution: fixture A→B→C (C has native table); run `--apply`; assert A's link points directly to C's table.
- [x] 6.14 **Test** — Add integration test for cycle detection: fixture A→B→A; run `--apply`; assert `cycleDetected: true` in result and neither file modified.
- [x] 6.15 Run `vitest run` — all GREEN. Commit PR 3 (or 3a then 3b if split).

> **Split boundary** (if PR 3 exceeds 380 lines during implementation):
> - PR 3a: tasks 6.1–6.4 (Backup-AccessFile + Resolve-LinkChain) — commit, PR to main
> - PR 3b: tasks 6.5–6.15 (apply loop + remove-unresolved + integration tests) — base off PR 3a merged

---

## PR 4 — PS Verify Mode + E2E Suite

> Base branch: `main` (after PR 3 merged)
> Scope: verify pass + full E2E. All PS/integration tests guarded by `hasAccessCom()`.

### Phase 1: Verify mode PS

- [x] 7.1 Implement `Test-LinkExternal($backendPath, $rootPath, $denyPrefixes)` in `scripts/dysflow-access-runner.ps1`: returns `{ external: bool, denied: bool, broken: bool }` — `external` if path not under `$rootPath`, `denied` if any deny-prefix matches (case-insensitive), `broken` if `Test-Path` fails.
- [x] 7.2 Implement verify scan in `Invoke-RelinkDirectory`: post-apply (or standalone if `$Payload.verifyOnly`), re-enumerate all links and call `Test-LinkExternal` per link; accumulate `externalLinkCount`, `datosteLinkCount`, `brokenLinkCount`.
- [x] 7.3 Implement `--deny-prefix` count aggregation: any link matching a deny-prefix increments `denyPrefixMatchCount`.

### Phase 2: TS exit code wiring for verify

- [x] 7.4 In `handleRelinkDirectoryCommand`: after receiving result, if `strictLocal && report.externalLinkCount > 0` → exit 1; if `report.denyPrefixMatchCount > 0` → exit 1. (These may already be stubbed from PR 1 — confirm and complete.)
- [x] 7.5 Update handler tests to cover verify-specific exit code paths if not already covered in PR 1.

### Phase 3: E2E test suite

- [x] 7.6 Create `test/e2e/access-relink-directory.test.ts` guarded by `hasAccessCom()`.
- [x] 7.7 E2E: `beforeAll` builds temp directory with `frontend.accdb` (links to external), `backendA.accdb` (links to `backendB.accdb`), `backendB.accdb` (native tables) via DAO.
- [x] 7.8 E2E test: dry-run — no `.bak` files, no link changes, result has correct `plannedRelinks` count.
- [x] 7.9 E2E test: apply — `.bak-*` file created for `frontend.accdb`; link now points to local path; exit code 0.
- [x] 7.10 E2E test: verify after apply — `externalLinkCount: 0`; exit code 0.
- [x] 7.11 E2E test: chain resolution — `frontend.accdb` → `backendA.accdb` → `backendB.accdb`; after apply, frontend links directly to `backendB.accdb` native table; `chainHops: 2` in result.
- [x] 7.12 E2E test: `--strict-local` fails when one link is deliberately unresolvable; exit code 1; `externalLinkCount: 1`.
- [x] 7.13 E2E test: `--deny-prefix "\\\\datoste\\"` — fixture with a remaining UNC link; verify returns `denyPrefixMatchCount: 1`; exit code 1.
- [x] 7.14 E2E test: cycle fixture A→B→A; result contains `cycleDetected: true`; no mutations; exit code 0 (errors[] is non-empty, exit non-zero per FR-20).
- [x] 7.15 Run `vitest run` — all GREEN. Commit PR 4.

---

## Dependency Diagram

```
PR 1 (TS contracts + routing + arg parser + unit tests + parity)
  └── PR 2 (PS file enum + link inspect + classification + dry-run JSON)
        └── PR 3 [or 3a → 3b] (PS apply + backup + chain + remove-unresolved)
              └── PR 4 (PS verify + E2E)
```

All PRs are strictly sequential (stacked-to-main). Each PR merges to main before the next begins.

---

## Risk Flags

| Risk | PR | Mitigation |
|------|----|------------|
| PR 3 may exceed 400 lines if chain logic is complex | PR 3 | Split into 3a (chain) + 3b (apply); boundary defined above |
| E2E requires Access COM — will skip in CI without Windows+Access | PR 4 | `hasAccessCom()` guard; tasks remain testable in unit form |
| `accessDbPath` bypass must branch BEFORE `Open-DatabaseWithBackendPassword` — wrong placement silently opens wrong DB | PR 2 | Task 5.1 is explicit; verify bypass with stub before full implementation |
| Alias map + chain resolution interact — alias applied BEFORE chain means first hop may reroute unexpectedly | PR 3 | Integration test 6.13 covers alias-then-chain; document in code |
| `.mdb`↔`.accdb` non-cross-match (OQ-1 resolved): must be enforced in `Resolve-LocalPath` extension-exact comparison | PR 2 | Task 5.5 includes extension-inclusive comparison; test with mismatched ext fixture |
