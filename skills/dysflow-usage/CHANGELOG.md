# Changelog

## Unreleased

### Changed

- Document external `query_execute` reads and their write-mode rejection boundary.

## 2.0.0 (2026-08-23)

### Fixed

- Align progressive `bootstrap` → bounded capabilities → schema index/compact/full
  discovery with the Dysflow 3.0 contract.
- Separate callable and advertised inventories, require explicit schema views, and
  validate every example directly from candidate-runtime structured schema evidence.
- Ship the complete 47-example corpus, self-contained audit helpers, exact-byte hash
  tracker, UTF-8 cleanup, and recursive release-install support.

## 1.14.0 (2026-08-01)

### Added

- Document live `setup_project` bootstrap, opaque `resolve_project` recovery tokens and process-local caching, and standard plus namespaced workflow metadata.
- Add runtime-verified `setup-project.md` and `resolve-project-recovery.md` examples.

## 1.13.0 (2026-08-01)

### Fixed

- Align write intent with the live 2.31.0 and shipped 2.32.0 schemas: canonical `apply`, `diff` only for export compatibility, plan-by-default exports, and PID cleanup through the unified confirmation envelope.
- Replace removed `dryRun`, `confirmPid`, and `confirmOverwriteSource` input examples with schema-valid calls.

## Unreleased

### docs(consumer-skills)

- Explain additive preferred/legacy tool warnings and the intentional `forceSpecialized` escape hatch across six workflow examples; refresh their exact-byte hashes.
- Align v2.27 candidate contracts: `MCP_TOOL_NOT_FOUND`, missing required-input `missingParam`, conflicting write flags, local names-only invocation telemetry, and `logs` aggregates.
- Replace all fifteen example scaffolds with schema-verified call shapes, add `logs.md`, and refresh the example hash manifest.


## 1.9.1 (2026-07-25)

### docs(consumer-skills)

- Document the distinct `VBA_MANAGER_ABORTED` envelope introduced in dysflow v2.24.1
  for explicit `AbortSignal` cancellation without conflating it with timeout.

## 1.9.0 (2026-07-24)

### docs(consumer-skills)

- Align with dysflow v2.23.0 (Homogeneous MCP contract epic #1081):
  document `preferredAgentWorkflows`, `surface`, and `projectIdResolution`
  top-level fields; surface `compositionConstraints` per tool;
  describe the `MCP_INPUT_INVALID` envelope's `rejectedFlags[]` array
  for the contradictory-write-flag truth table.
- Fix the write-flag matrix claim that `commitFlag:"apply"` applies to
  every visible tool — `test_vba` reports `commitFlag:"dryRun"`.
- Add `OPENARGS_CONTRACT_MISMATCH` and `FORM_SOURCE_MALFORMED` to the
  verifier's canonical error-code allowlist (the runtime has emitted
  both since v2.19.0 / v2.22.x; the allowlist had drifted).
- Update `get-capabilities.md` example to document the new fields.

## 1.8.1 (2026-07-23)

### docs(agent-friction)

- Make `apply:false` / `apply:true` the primary preview/commit shape across
  operational examples while retaining runtime-reported aliases as compatibility notes.
- Document exact multiworktree read/write selection, `doctor` categories,
  `verify_code` count units, export isolation, LSN side effects, and current input remediation.
- Add live-runtime example verification coverage and a functionality-by-functionality
  agent friction map.

## 1.8.0 (2026-07-23)

### docs(consumer-skills)

- Align the runtime contract with dysflow v2.22.1: `describe_tool`,
  `canonicalCommitFlag`/`legacyAliases`, explicit one-way `acceptBothChanged`, and safe
  disposable-copy exports.
- Add the runtime-verified `describe-tool.md` example and correct `sync_binary` defaults.

## 1.7.0 (2026-07-19)

### docs(consumer-skills)

- Scaffold example for `cleanup_access_operation` (kebab: `cleanup-access-operation.md`).
  Covers the four call shapes: read-only reconcile, force-kill escalate, strict-context
  kill, and list-then-reconcile-iterate. 6 TODO placeholders for human-fill against a
  real worktree (TODO_PROJECT_ID, TODO_OPERATION_ID, TODO_ACCESS_PATH,
  TODO_EXPECTED_ACCESS_PATH, TODO_EXPECTED_PROJECT_ROOT, TODO_EXPECTED_DESTINATION_ROOT).
  Verified by `verify-examples-vs-runtime.ps1 -SkipLive` (33 files scanned, 47 tools
  referenced, 0 drift).

## 1.6.0 (2026-07-17)

### docs(consumer-skills)

- Align the runtime contract with dysflow v2.14.2: installed diagnostic-bundle metadata,
  canonical `apply` commit flags, form property pre-validation, transactional mutation rollback,
  and explicit compact/repair target selection.
- Scaffold examples for: analyze-form-layout, analyze-form-ui, apply-form-design-plan,
  compact-repair, copy-form-ui-pattern, diff-form-preview, form-align-controls,
  form-distribute-controls, form-set-property, generate-form-design-plan, map-form-behavior,
  render-form-preview, verify-form-bindings, verify-form-ui. Content uses TODO placeholders
  pending runtime-verified examples.
