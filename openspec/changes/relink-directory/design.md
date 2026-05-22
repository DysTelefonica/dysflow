# Design: `dysflow access relink-directory`

## Technical Approach

Single PS batch action (`relink_directory`) invoked by a thin TS handler. TS parses CLI args, builds an `AccessQueryRequest`, dispatches via `AccessQueryService` (existing `runner.run({ kind: "query", request }, config)` path). PS enumerates `.accdb`/`.mdb` under `--root`, opens each with `DAO.DBEngine.120`, classifies links, optionally resolves linked→linked chains, backs up, applies `RefreshLink`, and returns one aggregated JSON. Strict-local / deny-prefix produce non-zero exits in TS based on the aggregated counts.

## Architecture Decisions

| ADR | Choice | Rejected | Rationale |
|-----|--------|----------|-----------|
| ADR-1 Batch shape | One PS invocation, in-loop file open/close | N spawns from TS | Avoid COM startup cost × N; single transaction-like audit trail; one `DYSFLOW_PROGRESS` stream |
| ADR-2 `accessDbPath` bypass | Pass `--root` value as `accessDbPath`; PS skips opening it for action `relink_directory` (early branch BEFORE `Open-DatabaseWithBackendPassword`) | New runner method or relax `[Mandatory]` | Keeps runner contract intact; isolated to action dispatch; documented in handler comment |
| ADR-3 Chain resolution | Depth-first, max depth 5, visited set keyed by `lower(fullpath)\|lower(tablename)`; cycle → record `cycleDetected:true`, do NOT remap | Unbounded recursion; depth 3 | Real-world chains rarely exceed 2; cap of 5 prevents pathological loops without blocking legitimate hops |
| ADR-4 Backup naming | `<file>.bak-YYYYMMDDHHmmss` (UTC, compact). Multiple runs produce distinct files; never overwrite | `<file>.bak` (collides), `<file>.bak.N` (race-prone) | Auditability; restore = pick latest matching pattern |
| ADR-5 UNC→local match | (a) Parse `DATABASE=(.+)$` from `Connect`; (b) `basename` case-insensitive; (c) apply `--map old=new` first (basename rewrite); (d) candidate must exist under `--root` (recursive); (e) extension case-insensitive, `.mdb`↔`.accdb` NOT cross-matched (require exact ext match); (f) if multiple matches, take shortest relative path; tie → first sorted, record `ambiguous:true` in result | Match by any-substring; auto-cross-ext | Predictable, deterministic, no surprise rewrites |

## Data Flow

```
CLI args ──► parseRelinkDirectoryArgs ──► RelinkDirectoryOptions
                                            │
                            handleRelinkDirectoryCommand
                                            │
                            AccessQueryRequest { action:"relink_directory", ... }
                                            │
                            AccessQueryService.execute(request)
                                            │
                            AccessPowerShellRunner.run
                                            │
                            PS: dispatch "relink_directory" (skip open of accessDbPath)
                                            │
              ┌──── Get-AccessFiles($rootPath) ──── per-file loop ────┐
              │  Open DB ─► Get-LinkInfo ─► classify (local/external/unresolved)
              │            └─► Resolve-LinkChain (depth ≤ 5, cycle set)
              │            └─► if --apply: Backup-AccessFile → set Connect → RefreshLink
              │            └─► collect per-file FileResult
              └─────────────────────► aggregate ──► JSON
                                            │
                            TS: format human/JSON; apply --strict-local / --deny-prefix exit rules
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/cli/index.ts` | Modify | Register `["access", handleAccessCommand]` in `COMMANDS` |
| `src/cli/commands/access.ts` | Create | Subcommand router; dispatches `relink-directory` |
| `src/cli/commands/access/relink-directory.ts` | Create | Arg parser + handler |
| `src/cli/commands/types.ts` | Modify | Add `access` line to `HELP_TEXT` |
| `src/core/contracts/index.ts` | Modify | Append `"relink_directory"` to `action` union; extend `AccessQueryRequest` with `maps`, `denyPrefixes`, `strictLocal`, `removeUnresolved`, `recursive`, `timeoutMs`; extend `AccessQueryResult` with `relinkDirectory` batch payload |
| `src/core/services/query-service.ts` | Modify | Add `relinkDirectory?: RelinkDirectoryReport` field to `AccessQueryResult` |
| `scripts/dysflow-access-runner.ps1` | Modify | New `Invoke-RelinkDirectory` function + dispatch branch before `Open-Database...` |
| `test/cli/access/relink-directory.test.ts` | Create | Unit tests (FakeQueryService) |
| `test/e2e/access-relink-directory.test.ts` | Create | E2E, `hasAccessCom()` skip |
| `test/contracts/legacy-parity.test.ts` | Modify | Add `relink_directory` to expected actions |
| `test/contracts/legacy-tool-schemas-parity.test.ts` | Modify | Same |

## Interfaces / Contracts

```ts
// src/cli/commands/access/relink-directory.ts
export type AliasMapEntry = { from: string; to: string };
export type RelinkDirectoryOptions = {
  rootPath: string;
  apply: boolean;            // default false → dry-run
  recursive: boolean;        // default true
  maps: readonly AliasMapEntry[];
  denyPrefixes: readonly string[];
  strictLocal: boolean;
  removeUnresolved: boolean;
  passwordEnv?: string;      // overrides DYSFLOW_ACCESS_PASSWORD name
  backendPasswordEnv?: string;
  json: boolean;
  timeoutMs?: number;
};
export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };
export function parseRelinkDirectoryArgs(args: readonly string[]): ParseResult<RelinkDirectoryOptions>;
export function handleRelinkDirectoryCommand(
  args: readonly string[],
  context?: CliCommandContext,
  deps?: { service?: AccessQueryService },
): Promise<CliResult>;
```

```ts
// src/core/contracts (extension)
// AccessQueryRequest gains (all optional):
//   maps?: readonly { from: string; to: string }[];
//   denyPrefixes?: readonly string[];
//   strictLocal?: boolean;
//   removeUnresolved?: boolean;
//   recursive?: boolean;
//   timeoutMs?: number;

// AccessQueryResult gains:
type LinkClassification = "alreadyLocal" | "plannedRelink" | "applied" | "unresolved" | "removed" | "external" | "denied" | "cycle";
type RelinkDirectoryFileResult = {
  filePath: string;
  backupPath?: string;
  links: ReadonlyArray<{
    name: string;
    originalBackendPath: string | null;
    resolvedBackendPath: string | null;
    classification: LinkClassification;
    chainHops?: number;
    cycleDetected?: boolean;
    ambiguous?: boolean;
    error?: string;
  }>;
  errors: readonly string[];
};
type RelinkDirectoryReport = {
  rootPath: string;
  applied: boolean;
  filesScanned: number;
  filesModified: number;
  linksRemapped: number;
  externalLinkCount: number;
  datosteLinkCount: number;
  brokenLinkCount: number;
  unresolved: number;
  files: readonly RelinkDirectoryFileResult[];
  backupPaths: readonly string[];
  errors: readonly string[];
};
```

### Password wiring

TS handler resolves password env name in order: `--password-env <NAME>` → `DYSFLOW_ACCESS_PASSWORD` → `ACCESS_VBA_PASSWORD`. The runner spawns PS with the resolved values placed into `env` (existing `PowerShellExecutorOptions.env`). PS reads from `$env:` as today. TS never logs the secret; `sanitizeSecrets` already redacts PS output.

## PowerShell Layer

### Dispatch placement

In the `query` branch, BEFORE `$db = Open-DatabaseWithBackendPassword ...`, add:

```
if ($action -eq 'relink_directory') {
  $result = Invoke-RelinkDirectory -Payload $payload
  Write-DysflowProgress -Percent 90 -Message "Finalizing"
  $result | ConvertTo-Json -Compress -Depth 30
  exit 0
}
```

This is the ADR-2 bypass: `$AccessDbPath` is never opened for this action.

### Helper functions (new in PS)

- `Get-AccessFilesRecursive($rootPath, [bool]$recursive)` — reuse `Get-AccessFiles`, gate recursion
- `Resolve-LocalPath($backendPath, $rootPath, $aliasMap, $accessFileIndex)` → `$null` or full path. Pure string ops + `Test-Path`
- `Resolve-LinkChain($dbEngine, $startDb, $tableName, $rootPath, $aliasMap, $accessFileIndex, [ref]$visited, $depth, $maxDepth=5)` → ordered hashtable `{ resolvedPath, resolvedTable, isLocal, cycleDetected, hops }`
- `Backup-AccessFile($path)` → `Copy-Item` to `$path + ".bak-" + (Get-Date -AsUTC -Format yyyyMMddHHmmss)`; returns backup path
- `Test-LinkExternal($backendPath, $rootPath, $denyPrefixes)` → `{ external: bool, denied: bool, broken: bool }`
- `Invoke-RelinkDirectory($Payload)` → main orchestrator

### Main pseudocode

```
function Invoke-RelinkDirectory($Payload):
  rootPath  := required, must exist as directory
  dryRun    := -not $Payload.apply  (default true)
  aliasMap  := dict of lower(from)→to from $Payload.maps
  denyList  := $Payload.denyPrefixes
  files     := Get-AccessFilesRecursive(rootPath, $Payload.recursive ?? true)
  index     := build lower(basename) → fullpath map from files
  report    := empty aggregate
  dbEngine  := DAO.DBEngine.120

  for each filePath in files:
    write progress
    fileResult := { filePath, links:[], errors:[] }
    try:
      db := Open-DatabaseWithBackendPassword(dbEngine, filePath)
      links := Get-LinkInfo($db)                        # reuse existing
      remapPlan := []
      for each link in links:
        cls := Test-LinkExternal(link.backendPath, rootPath, denyList)
        if cls.denied: record "denied"; continue
        chain := Resolve-LinkChain(dbEngine, db, link.name, rootPath, aliasMap, index, visited=new, depth=0)
        if chain.cycleDetected: record "cycle"; continue
        if chain.isLocal and chain.resolvedPath == link.backendPath:
          record "alreadyLocal"; continue
        if chain.resolvedPath != $null:
          remapPlan += { link, target: chain.resolvedPath, sourceTable: chain.resolvedTable, hops: chain.hops }
          record "plannedRelink"
        else:
          if $Payload.removeUnresolved: record "unresolved" (will delete on apply)
          else: record "unresolved"

      if not dryRun and remapPlan.Count > 0:
        fileResult.backupPath := Backup-AccessFile(filePath)
        for each entry in remapPlan:
          td := $db.TableDefs.Item(entry.link.name)
          td.Connect := ";DATABASE=" + entry.target + (BackendPassword ? ";PWD=$BackendPassword" : "")
          if entry.sourceTable: td.SourceTableName := entry.sourceTable
          td.RefreshLink()
          mutate record to "applied"
        if $Payload.removeUnresolved:
          for each link recorded "unresolved": $db.TableDefs.Delete(link.name); mutate to "removed"

      fileResult.links := records
    catch:
      fileResult.errors += $_.Exception.Message
    finally:
      try { $db.Close() } catch {}
      release COM objects

    report.files += fileResult
    aggregate counters

  return [ordered]@{ relinkDirectory = report }
```

## Testing Strategy

| Layer | What | How |
|-------|------|-----|
| Unit (PR1) | `parseRelinkDirectoryArgs` | Happy path; missing `--root`; conflicting `--dry-run`+`--apply`; multi `--map`; `--deny-prefix` repeats; `--password-env` |
| Unit (PR1) | `handleRelinkDirectoryCommand` | `FakeQueryService` returns canned `RelinkDirectoryReport`; assert request shape (action, rootPath, maps, flags); assert exit codes for strict-local / deny-prefix triggered counters; human vs `--json` output formatting |
| Unit (PR2/3) | PS helpers via Pester (only if Pester present in CI; otherwise covered by E2E) | `Resolve-LocalPath` table-driven; `Resolve-LinkChain` with stub TableDefs |
| Contract parity | `legacy-parity.test.ts` + `legacy-tool-schemas-parity.test.ts` | Add `"relink_directory"` to expected set |
| E2E (PR4) | `access-relink-directory.test.ts` | `hasAccessCom()` skip guard. Fixture: build temp dir with 3 `.accdb` (frontend, backendA, backendB) via DAO in `beforeAll`. Cases: dry-run produces no `.bak` and no DB change; apply produces `.bak-*`, all links point inside root; verify second pass yields 0 plannedRelinks; chain (frontend→A→B) collapses to direct link to B in one apply pass; cycle (A→B→A) recorded with `cycleDetected:true`, no mutation |

## Migration / Rollout

No data migration. Opt-in command. Backups (`.bak-*`) accumulate in-place; document cleanup in command help. Existing actions unchanged; only union expansion may surface in downstream consumers — covered by parity tests.

## PR Slice Estimates

| PR | Scope | Est. changed lines | Risk |
|----|-------|-----|----|
| PR 1 | TS routing + arg parser + contract union + unit tests + parity updates | ~320 | Low |
| PR 2 | PS: dispatch branch, file enumeration, `Get-LinkInfo` reuse, dry-run JSON, classification (no chain) | ~260 | Low |
| PR 3 | PS: `--apply` + `Backup-AccessFile` + alias map + `Resolve-LinkChain` + `--remove-unresolved` | ~360 | Medium (chain logic) |
| PR 4 | PS: `--strict-local` / `--deny-prefix` counts + E2E tests + docs | ~280 | Medium (Access required) |

All slices remain under the 400-line review budget. If PR 3 swells past 380 lines during implementation, split `Resolve-LinkChain` into its own PR 3a (chain) / PR 3b (apply+backup).

## Open Questions

- [ ] Confirm `.mdb`↔`.accdb` should NOT cross-match (ADR-5(e)). If operators expect cross-ext aliasing, document the explicit `--map old.mdb=new.accdb` workaround.
- [ ] `--remove-unresolved` deletes the TableDef entirely; should an alternative `--skip-unresolved` (default) also be explicit, or is dry-run/apply enough?
