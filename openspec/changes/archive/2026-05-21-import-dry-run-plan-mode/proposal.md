# Proposal: Import Dry-run Plan Mode

## Issue

GitHub issue: #129

## Problem

Access import operations can modify the wrong `.accdb` when project context resolves incorrectly. A safe preflight is required before sensitive operations such as `import_all` and `import_modules`.

## Goal

Add `dryRun` / plan mode for import operations that resolves and reports the full target plan without opening Access or registering an operation.

## Dependencies

This builds on the project resolution fix from #128: explicit `projectId` / `contextId` must resolve registered projects before cwd fallback.

## Functional Contract

When `dryRun: true`, import tools MUST:

- resolve configuration and project identity;
- resolve planned modules/forms;
- validate relevant paths;
- return a structured plan;
- NOT open Access;
- NOT modify `.accdb` files;
- NOT create `.laccdb` locks;
- NOT register active Access operations.

## Strict Context

Real execution may pass `strictContext: true` and expected paths. Dysflow MUST abort before opening Access if the resolved target does not exactly match expectations.

## Acceptance Criteria

- Multi-worktree dry-run regression proves develop is resolved from staging cwd.
- Unknown explicit project id fails clearly with no cwd fallback.
- Explicit overrides win and report `explicit-overrides`.
- `import_modules` dry-run lists only requested modules.
- `import_all` dry-run lists all detected modules and count.
- Real runs include uniform target diagnostics.
