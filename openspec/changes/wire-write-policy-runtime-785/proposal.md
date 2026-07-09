# Wire risk-based write execution policy to MCP dispatch path

**Status**: proposed · **Target release**: v2.1.1 · **Branch**: `feat/785-wire-write-policy-runtime` · **Worktree**: `C:\Proyectos\dysflow-785`

## Why

Issue #779 (PR #784, v2.1.0) shipped the foundation for a risk-based write execution policy: a per-tool risk classification, a `(mode, risk)` truth table, the policy resolver `resolveWriteExecutionPolicy()`, the unified registry `MCP_TOOL_RISKS`, the per-tool helper `effectiveDryRunDefaultForTool(name, mode)`, and a snapshot surface in `get_capabilities` that reports the active `writeExecutionPolicy` and `effectiveDryRunDefault` for every contract tool.

The v2.1.0 release stopped at metadata. A follow-up audit by an external AI reviewer (issue #785) flagged that the dispatch layer never consults the resolved policy, so a caller cannot benefit from `developer` mode in the standard `import_modules → test_vba → verify_code` workflow.

## Problem (verified on main, c3348c6a)

`src/adapters/vba-sync/vba-modules-adapter.ts:231` still hardcodes:

```ts
const dryRun = params.apply === true ? false : params.dryRun !== false;
if (dryRun && (toolName === "import_all" || toolName === "import_modules")) {
  return this.planImport(toolName, params);
}
```

`src/adapters/vba-execution-adapter.ts:353,404` holds the same logic for `test_vba` / `run_vba`. The MCP dispatch boundary at `src/adapters/mcp/dispatch-factory.ts:216` forwards `normalizedInput` straight to `vbaSyncToolService.execute(name, normalizedInput)` without consulting the active policy, and `registerMcpTools` / `createDispatchTool` do not even receive `writeExecutionPolicy` from `createDysflowMcpTools` (which already destructures it at `src/adapters/mcp/tools.ts:490,505` but only forwards it to `createGetCapabilitiesTool`).

Symptom: with `capabilities.writeExecutionPolicy: "developer"` set, `import_modules({"moduleNames": ["SomeModule"]})` STILL returns an import plan instead of importing, the snapshot says `effectiveDryRunDefault.import_modules === false`, and the documented "zero-friction dev loop" is unreachable.

Additionally: the v2.1.0 README §3b promised a runtime guard for `export_modules` / `export_all` when the destination overlaps the active source root (`confirmOverwriteSource` enforcement). That runtime guard was deferred from #779 and is the second half of the substantive fix.

## Goal

Make `writeExecutionPolicy` actually drive the dispatch + adapter execution path so:

1. In `developer` mode, `import_modules` / `import_all` / `test_vba` execute by default (no `dryRun: false` ceremony) when the write-gate and allowlist permits.
2. In `safe-by-default` mode, the v2.1.x behavior is preserved byte-for-byte (every write-class tool still defaults to dry-run).
3. `export_modules` / `export_all` with a destination overlapping the active source root and missing `confirmOverwriteSource: true` is refused with `EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION`, but only in `developer` mode for `destructive-write` tools (resolver-driven).
4. The hard gates (`writesProcess.enabled`, `writesProject.allowWrites`, allowed-procedures allowlist) remain authoritative — the policy never bypasses them. Explicit caller intent (`dryRun: true` / `dryRun: false` / `apply: true`) always wins.

## Non-goals

- No change to `mutatesBinary` / `mutatesFilesystem` route semantics (risk is additive metadata).
- No new tool names, no removed tool names.
- No `developer-mode-extra-strict` mode (extending `confirmOverwriteSource` to non-export tools). That is a separate follow-up outside v2.1.1.
- No per-call gating changes for `cleanup_access_operation(force)` / `access_force_cleanup_orphaned(confirmPid)` — they keep their existing per-call gating regardless of policy. (Tracked in #783 only as a documentation cross-link, not as a v2.1.1 deliverable.)

## Acceptance criteria (lifted from #785 + #783 subset)

- [ ] In `developer` mode, `import_modules` without `dryRun`/`apply` performs the import (not a plan).
- [ ] In `developer` mode, `import_all` without `dryRun`/`apply` performs the import.
- [ ] In `developer` mode, `test_vba` without `dryRun`/`apply` reaches the runner when `allowedProcedures` permits it.
- [ ] In `safe-by-default` mode, the v2.1.x behavior is preserved unchanged.
- [ ] `dryRun: true` explicitly plans in both policy modes.
- [ ] Explicit `apply: true` / `dryRun: false` always executes (subject to other gates).
- [ ] `allowWrites: false` still blocks writes even in `developer` mode.
- [ ] `test_vba` without `allowedProcedures` is still rejected with `MCP_ALLOWLIST_NOT_CONFIGURED` in both modes.
- [ ] `developer` mode + `export_modules` with destination overlapping source root + missing `confirmOverwriteSource` → `EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION`.
- [ ] `developer` mode + `export_modules` with explicit `confirmOverwriteSource: true` → executes (subject to write-gate).
- [ ] `safe-by-default` mode + `export_modules` always defaults to plan; export-source guard never fires in `safe-by-default` mode.
- [ ] Per-tool `effectiveDryRunDefault` snapshot agrees with actual dispatch behavior (consistency test).
- [ ] Tests pin all of the above.

## Cross-references

- Issue #779 — closed by PR #784, v2.1.0 foundation.
- Issue #785 — opened 2026-07-08 by the AI reviewer. Closes with this change.
- Issue #783 — opened 2026-07-08 by `sdd-archive`. Subset of its scope (the runtime enforcement of the export-source guard) is delivered here; the rest (alias per-call gating, extra-strict mode) remains in #783 as separate follow-ups.

## Release

- Version bump: v2.1.0 → v2.1.1 (patch — backwards compatible; new behavior only fires in `developer` mode, which is opt-in).
- CHANGELOG entry under `### Fixed` and `### Changed`.
- Tag `v2.1.1`, push, GitHub release with title == tag.
- Close #785 and the relevant subset of #783 via release workflow (issue-closure-traceability rule: commit SHAs + test refs in closure comments).
