# Project config runtime contract

Every MCP process resolves `.dysflow/project.json` inside its current Git worktree on every call. `get_capabilities.projectConfig` is the canonical read-only diagnostic and includes normalized `cwd`, `configPath`, `projectRoot`, `projectId`, `accessPath`, `backendPath`, and `destinationRoot`, plus `status`, `writeReady`, `diagnostics`, and exact `remediation`.

Write-class tools fail before Access or PowerShell execution with `PROJECT_CONFIG_NOT_WRITE_READY` unless `status` is `valid`. Explicit path overrides and dry-run calls do not bypass ownership checks. There is intentionally no `allowUnconfiguredTarget` escape hatch.

`backendPath` may intentionally be a split-database or network path outside the frontend worktree. Its configured presence therefore does not invalidate frontend operations. When an operation explicitly targets the backend, the requested path must match the configured backend exactly; frontend and destination targets remain worktree-owned and canonicalized against junction/symlink escapes.

Use `dysflow doctor --cwd <worktree>` for a non-mutating diagnosis. Bootstrap explicitly with `dysflow setup --cwd <worktree> --apply --access-path <relative-or-absolute-path> [--backend-path <path>] [--project-id <id>]`. Setup never invents a target and does not write without `--apply` or the legacy `--write-project` consent flag.
