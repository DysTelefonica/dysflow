# Proposal: projectId Form Source Resolution

> Issue #718 — Phase 0 of epic #811 "AI-first Access form UI".

## Intent

Form tools resolve their on-disk source path three incompatible ways, so a
caller cannot rely on `projectId` (or a project-relative `sourcePath`) to reach
the right file. Concretely:

- **Group A** (`lint_form_code`, `inspect_form`, `compare_form`, `form_serialize`)
  ignores `projectId` entirely and takes the first raw `destinationRoot`/`sourceRoot`
  string (#718 Case A).
- **Group B** (`form_add_control`, `form_move_control`, `form_rename_control`,
  `form_deserialize`) is `projectId`-aware but double-nests `src/`: `destinationRoot`
  is already `<projectRoot>/src`, then `resolveMutationPath` blind-joins a
  `sourcePath` that also starts with `src/` → `<root>/src/src/...` → `FORM_NOT_FOUND`
  (#718 Case B, confirmed at `vba-forms-paths.ts:30`).
- **Group C** (`create_form_from_template`) hardcodes `forms/{name}.form.txt` under
  `projectRoot`, bypassing `destinationRoot` altogether.

Without a single trustworthy resolver, the epic's AI form-UI tools cannot address a
form by identity, and failures surface as opaque `[PATH]`-scrubbed errors with no
remediation. This phase makes form source resolution one predictable, testable
contract.

## Scope

### In Scope

- A shared **pure** source resolver in `src/core` composed on the existing
  `resolveExecutionTarget` / `loadDysflowConfigAsyncWith` stack (do NOT reinvent
  `project.json` discovery). Given `{projectId or config, formName or project-relative
  sourcePath}` it returns an absolute path plus the ordered list of attempted
  candidates. No I/O — filesystem existence and config loading stay in the adapter.
- **Additive** retrofit of Group A: add optional `projectId`/`formName` inputs;
  existing raw `destinationRoot`/`sourceRoot` params keep working unchanged.
  Backward compatibility is MANDATORY.
- **Fix Group B's double-`src` join**: idempotent join so a project-relative
  `sourcePath` already containing the source root resolves correctly (not blind
  concatenation).
- A typed **resolution failure diagnostic** (`projectId`, resolved `projectRoot`,
  attempted source roots, attempted final path, remediation).
- Standardize on `destinationRoot` (the real schema field); treat `sourceRoot` only
  as a deprecated alias where already public. Fix the nonexistent-field read in
  `resolve-project-tool.ts`.
- Align Group C (`create_form_from_template`) to the `destinationRoot` convention,
  backward-compatible — **flagged for design-phase confirmation** (the bench-cache
  convention may be intentional).

### Out of Scope (spun off)

- **Follow-up issue (NEW): repo-wide `[PATH]` sanitizer + dropped-`details` channel.**
  `sanitizeMcpErrorMessage` (`sanitize-error.ts`) runs unconditionally on every failed-op
  message (`result-translation.ts:164`) and `DysflowError.details` is dropped by the failure
  branch (`result-translation.ts:159-170`). Refactoring these is MCP-wide blast radius and
  is DEFERRED to a separate issue. **Key design constraint carried into this phase**: #718
  must still satisfy "no user-facing resolver error shows `[PATH]`", so the resolver's typed
  diagnostic MUST reach the caller through a channel the sanitizer does not collapse (a
  structured result field, or a diagnostic message carrying no raw absolute path for the
  regex to eat). Do NOT solve the sanitizer here — only scope the constraint for design.
- Any new form business logic, layout semantics, or data-layer changes.
- The downstream AI form-UI tools of epic #811 (later phases).

## Capabilities

### New Capabilities

- `form-source-resolution`: pure resolution of a form's on-disk source path from
  `projectId`/config + `formName`/project-relative `sourcePath`, returning the absolute
  path, attempted candidates, and a typed failure diagnostic.

### Modified Capabilities

- None (tool input surfaces change additively; no existing spec-level requirement is
  redefined — new behavior lives under the new capability).

## Approach

- Build the resolver in `src/core` **on top of** the canonical stack
  (`dysflow-config.ts` `loadDysflowConfigAsyncWith`, `execution-target.ts`
  `resolveExecutionTarget`). Never build on the naive `tryResolveProject`
  (`resolve-project-tool.ts`), which is single-level and reads a nonexistent
  `sourceRoot` field.
- Resolver signature (pure): `{ projectId?/config, formName?/sourcePath }` →
  `{ absolutePath, attemptedCandidates[] }` or a typed diagnostic. The adapter feeds it
  a loaded config and performs the existence check, then emits the diagnostic on miss.
- Fix the Group B join by making `resolveMutationPath` (or its resolver caller)
  idempotent when `childPath` already starts with the resolved source root — strip the
  redundant leading segment instead of concatenating.
- Retrofit Group A adapters to optionally accept `projectId`/`formName`, delegate to the
  resolver, and fall back to the existing raw-path behavior when neither is supplied.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/core/**` (new resolver) | New | Pure form source resolver + typed diagnostic type. |
| `src/adapters/vba-sync/vba-forms-lint-adapter.ts` | Modified | Group A: additive `projectId`/`formName`; delegate to resolver. |
| `inspect_form`, `compare_form`, `form_serialize` adapters | Modified | Group A: same additive retrofit. |
| `src/adapters/vba-sync/vba-forms-paths.ts` | Modified | Idempotent join to kill Group B double-`src`. |
| `src/adapters/vba-sync/vba-forms-managed-source.ts` | Modified | Group B: route through shared resolver. |
| `src/adapters/vba-sync/vba-forms-clone-tools.ts` | Modified | Group C: align to `destinationRoot` (design-confirmed). |
| `src/adapters/mcp/resolve-project-tool.ts` | Modified | Fix nonexistent-`sourceRoot` read; prefer `destinationRoot`. |
| `E2E_testing/.dysflow/project.json` | Reused | Fixture for the one projectId-resolution E2E. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Backward-compat regression across ~9 call sites | High | Additive-only inputs; raw-path path preserved; port tests pin old behavior. |
| Deferred sanitizer blocks the "no `[PATH]`" criterion | Med | Diagnostic reaches caller via structured field / path-free message — a design-phase gate. |
| Group C realignment breaks an intentional bench-cache convention | Med | Confirm in design before changing; keep backward-compatible. |
| Resolver leaks I/O and stops being pure/testable | Low | Existence check + config load stay in adapter; resolver takes loaded config only. |

## Rollback Plan

Remove the change folder and revert the resolver + adapter deltas. Because every input is
additive and raw-path behavior is preserved, reverting restores prior tool behavior with no
data or schema migration.

## Dependencies

- Canonical config stack: `dysflow-config.ts`, `execution-target.ts` (build on these).
- Spun-off follow-up issue for the `[PATH]` sanitizer / dropped-`details` channel.
- Existing `E2E_testing/.dysflow/project.json` fixture.

## Testing Plan

- **Ports (`pnpm test`)**: unit-test the pure resolver with a mock filesystem —
  projectId→path, project-relative `sourcePath` with idempotent join (Case B regression),
  Group A additive-input parity with raw-path callers, and the typed failure diagnostic
  shape. Test at the ports; mock only the I/O boundary.
- **One E2E (`E2E_testing/`)**: exercise real `projectId` resolution against the existing
  `.dysflow/project.json` fixture, asserting the resolved absolute path and that a resolver
  error surfaces remediation without a `[PATH]`-scrubbed message.

## Success Criteria

- [ ] A single shared resolver drives form source resolution across Groups A, B, and C.
- [ ] Case A: `projectId`-only callers resolve to the correct file.
- [ ] Case B: a project-relative `sourcePath` including `src/` no longer double-nests.
- [ ] All existing raw `destinationRoot`/`sourceRoot` callers behave identically (backward compat).
- [ ] Resolution failures return a typed diagnostic with remediation and **no** user-facing `[PATH]`.
- [ ] `resolve-project-tool.ts` no longer reads a nonexistent `sourceRoot` field.
- [ ] Port tests + one projectId E2E pass under strict TDD.
