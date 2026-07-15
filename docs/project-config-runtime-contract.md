# Project config runtime contract

Every MCP process resolves `.dysflow/project.json` inside its current Git worktree on every call. `get_capabilities.projectConfig` is the canonical read-only diagnostic and includes normalized `cwd`, `configPath`, `projectRoot`, `projectId`, `accessPath`, `backendPath`, and `destinationRoot`, plus `status`, `writeReady`, `diagnostics`, and exact `remediation`. When the resolved owning tree is recognized as a sibling Git worktree (v2.12.0, issue #873) the diagnostic also carries `owningWorktree`.

Write-class tools fail before Access or PowerShell execution with `PROJECT_CONFIG_NOT_WRITE_READY` unless `status` is `valid`. Explicit path overrides and dry-run calls do not bypass ownership checks. There is intentionally no `allowUnconfiguredTarget` escape hatch.

`backendPath` may intentionally be a split-database or network path outside the frontend worktree. Its configured presence therefore does not invalidate frontend operations. When an operation explicitly targets the backend, the requested path must match the configured backend exactly; frontend and destination targets remain worktree-owned and canonicalized against junction/symlink escapes.

Use `dysflow doctor --cwd <worktree>` for a non-mutating diagnosis. Bootstrap explicitly with `dysflow setup --cwd <worktree> --apply --access-path <relative-or-absolute-path> [--backend-path <path>] [--project-id <id>]`. Setup never invents a target and does not write without `--apply` or the legacy `--write-project` consent flag.

## Sibling worktrees (v2.12.0, issue #873)

A single repository's `accessPath` may legitimately live in a **sibling Git worktree** — a different worktree at the SAME parent directory (for example, `dysflow-worktrees/fix-811` and `dysflow-worktrees/fix-873` both under `dysflow-worktrees/`). `diagnoseProjectConfig` recognizes this as a valid owning tree for the binary side when **all three** of the following hold concurrently (the **three-way AND criterion**):

1. **Not a reparse point.** The configured `accessPath`'s lexical resolution equals its canonical realpath. Windows junctions, directory symlinks, and any other reparse point fail this check and are still rejected as `OUTSIDE_PROJECT_ROOT` — sibling recognition does NOT relax the reparse-point detector.
2. **Real Git worktree.** Walking up from `dirname(canonical(accessPath))` reaches a directory that owns a `.git` entry (real Git worktree), not just any directory at the same parent.
3. **Same parent, different identity.** The discovered sibling root is at the SAME `dirname` as the active worktree AND has a DIFFERENT identity (Windows case-insensitive compare via `identity()`).

If all three hold, the diagnostic carries `owningWorktree: "sibling:<abs-canonical-sibling-root>"` where `<abs-canonical-sibling-root>` is the canonical realpath of the resolved sibling. For the historical happy path where the configured target lives inside `cwd`, the value is `"cwd"`. The field is **optional** on `ProjectConfigDiagnostic`; consumers reading `get_capabilities.projectConfig.owningWorktree` MUST treat absence as the historical happy path.

Since v2.13.0 (#880), `destinationRoot` uses the same effective owning-worktree identity as `accessPath`: it may remain under the active worktree or live inside the recognized sibling that owns the binary. A destination in any other worktree or arbitrary external directory still fails with `OUTSIDE_PROJECT_ROOT`.

`PATH_MISMATCH` and `OUTSIDE_PROJECT_ROOT` retain their original meanings: `PATH_MISMATCH` is what you get for arbitrary cross-project paths (e.g. a sibling directory with NO `.git` anywhere along its ancestors); `OUTSIDE_PROJECT_ROOT` is what you get for junctions, symlinks, or targets whose canonical worktree is neither cwd nor a recognized sibling.

### Worked example (EXPEDIENTES layout)

Repository root lives at `C:\Proyectos\dysflow`. Sprint worktrees live under `C:\Proyectos\dysflow-worktrees\<repo>-<branch>\`. A consumer runs dysflow from `C:\Proyectos\dysflow-worktrees\fix-811-sprint-12\` (cwd), and the binary lives at `C:\Proyectos\dysflow-worktrees\fix-873-sibling-worktree-owning-tree\Expedientes.accdb`. Both worktrees are siblings under `C:\Proyectos\dysflow-worktrees\`; both have their own `.git`.

The project's `.dysflow/project.json` (under the active cwd) declares:

```json
{
  "id": "expedientes",
  "accessPath": "../fix-873-sibling-worktree-owning-tree/Expedientes.accdb",
  "destinationRoot": "src"
}
```

`diagnoseProjectConfig(cwd)` returns `{ status: "valid", writeReady: true, owningWorktree: "sibling:C:/Proyectos/dysflow-worktrees/fix-873-sibling-worktree-owning-tree" }` and write-class tools (`import_modules`, `export_modules`, `test_vba`, …) proceed against the sibling's binary.

The junction equivalent — `cwd/.worktrees/link` as a Windows junction pointing at the sibling — stays REJECTED with `OUTSIDE_PROJECT_ROOT` because the reparse-point check is the first of the three conditions and runs unconditionally. A sibling with no `.git` ancestor (any random directory at the parent level) is rejected with `PATH_MISMATCH`.
