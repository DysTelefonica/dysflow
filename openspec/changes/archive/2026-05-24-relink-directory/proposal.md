# Proposal: `dysflow access relink-directory`

## Intent

Operators have Access frontends whose linked tables point to network UNC paths (e.g. `\\datoste\share\backend.accdb`) while local copies of the same backends exist under a project directory. There is no bulk tool to safely remap every link in every `.accdb`/`.mdb` under a root, with dry-run, backup, and verification. Manual VBA scripts are error-prone and lack auditability. GitHub issue #282 (`status:approved`).

## Scope

### In Scope
- New top-level CLI router: `dysflow access` + subcommand `relink-directory`
- New PowerShell action `relink_directory` using `DAO.DBEngine.120`
- Path remapping: UNC/external `DATABASE=...` -> local basename under `--root`
- Modes: `--dry-run` (default), `--apply`, verify via `--strict-local` / `--deny-prefix`
- Backup `.bak` per file before write; alias overrides via `--map old=new`
- Cycle detection for linked -> linked chains
- Auditable JSON result with `filesScanned`, `linksRemapped`, `unresolved`, `errors`, `backupPaths`
- Unit tests with `FakeQueryService`; E2E tests guarded by `hasAccessCom()`

### Out of Scope
- GUI / TUI integration (CLI only)
- Editing forms/queries/reports referencing tables (only `TableDef.Connect`)
- Remote/SMB backend mutation (links must point inside `--root`)
- Compaction or repair of `.accdb` files
- Non-Windows / no-Access environments (same constraint as existing code)

## Capabilities

### New Capabilities
- `access-relink-directory`: bulk-remap linked-table backends in every Access file under a directory, with dry-run, backup, alias mapping, chain resolution, and strict verification.

### Modified Capabilities
- None.

## Approach

**Approach B - DAO batch PS action.** Single PS invocation per CLI run; PS uses `DAO.DBEngine.120` (no `Access.Application`) to enumerate `.accdb`/`.mdb` under `--root`, open each, walk `TableDefs` with non-empty `Connect`, parse `DATABASE=`, match basename against local files, apply `--map` aliases, resolve linked->linked chains with cycle detection, backup before `RefreshLink`. Rejected Approach A (N spawns) due to COM startup cost and lifecycle complexity. Rejected Approach C (overload `localize_backend_links`) to avoid breaking existing callers.

TS layer is thin: parse args -> `AccessQueryRequest { action: "relink_directory", rootPath, ... }` -> `queryService.execute()` -> format JSON or human output. `accessDbPath` validation is bypassed by passing `rootPath` in its slot; PS ignores it for this action.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/cli/index.ts` | Modified | Register `access` top-level command |
| `src/cli/commands/access.ts` | New | Subcommand router + `relink-directory` handler + arg parser |
| `src/cli/commands/types.ts` | Modified | `HELP_TEXT` for new command |
| `src/core/contracts/index.ts` | Modified | Add `"relink_directory"` to `AccessQueryRequest.action`; extend `AccessQueryResult` with batch fields |
| `scripts/dysflow-access-runner.ps1` | Modified | New `relink_directory` action: scan, inspect, backup, remap, verify |
| `test/cli/commands/access.test.ts` | New | Unit tests for arg parsing + handler with `FakeQueryService` |
| `test/e2e/access-relink-directory.test.ts` | New | E2E guarded by `hasAccessCom()` |
| `test/contracts/legacy-parity.test.ts` | Modified | Parity update for new action |
| `test/contracts/legacy-tool-schemas-parity.test.ts` | Modified | Schema parity for new action |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `AccessQueryRequest.action` union expansion breaks parity contract tests | High | Update both parity tests in PR 1; treat as mechanical migration |
| `accessDbPath` bypass: runner enforces this field for directory mode | Medium | Pass `--root` value as `accessDbPath`; document in handler comment. Revisit if runner adds first-class directory mode |
| `.ldb`/`.laccdb` lock files when another process holds the .accdb open | Medium | Catch per-file open errors, record in `errors[]`, never abort the batch |
| `DAO.DBEngine.120` absent without Access install (Windows-only) | Medium | Same as existing code; surface clear error; E2E uses `hasAccessCom()` skip guard |
| UNC basename case-sensitivity / `.mdb` vs `.accdb` variants | Medium | Case-insensitive basename compare; consider both extensions during matching |

## Delivery Plan

Stacked-to-main chained PRs, 400-line budget each:

- **PR 1 - CLI routing + arg parsing**: `access` router, `relink-directory` arg parser, help text, unit tests with `FakeQueryService`. No PS changes. Parity tests updated.
- **PR 2 - PS core (scan + inspect + dry-run)**: `relink_directory` action skeleton, file enumeration, link inspection, dry-run JSON output. Read-only, no writes.
- **PR 3 - PS apply + backup + chain resolution**: `--apply` path, `.bak` backup, alias `--map`, chain resolution with cycle detection, `--remove-unresolved`.
- **PR 4 - Verify mode + E2E**: `--strict-local`, `--deny-prefix`, `externalLinkCount` / `datosteLinkCount` / `brokenLinkCount`, E2E test guarded by `hasAccessCom()`.

If a slice exceeds 400 lines, split the PS action further (e.g. backup into its own PR).

## Rollback Plan

- Per-PR: `git revert` the merge commit; each PR is autonomous and leaves the prior PR in a working state.
- For data: every modified `.accdb`/`.mdb` has a sibling `.bak` written before `RefreshLink`. Manual rollback = restore `.bak` over original.
- If a release ships with a regression, `dysflow access relink-directory` is opt-in (new command); users simply do not invoke it.

## Dependencies

- Windows + Microsoft Access (DAO COM) - same constraint as the rest of `dysflow access`.
- No new npm dependencies.

## Success Criteria

- [ ] `dysflow access relink-directory --root <dir> --dry-run` lists every link, classifying `alreadyLocal` / `plannedRelinks` / `unresolved` without modifying any file.
- [ ] `--apply` writes `.bak` for every modified file before mutation; `RefreshLink` succeeds for every planned remap; unresolved are skipped unless `--remove-unresolved`.
- [ ] No output link points outside `--root` after `--apply`.
- [ ] `--strict-local` returns non-zero exit when `externalLinkCount > 0`; `--deny-prefix "\\datoste\"` returns non-zero when `datosteLinkCount > 0`.
- [ ] `--json` output matches the schema defined in the feature requirements.
- [ ] Existing `vitest run` suite stays green; new unit + E2E tests added.
- [ ] Parity contract tests updated and green.
