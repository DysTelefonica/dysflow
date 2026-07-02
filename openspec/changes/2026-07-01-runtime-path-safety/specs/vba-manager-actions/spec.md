# Delta for vba-manager-actions

## ADDED Requirements

### Requirement: Runtime-Safe Export Write

`export_modules` and `export_all` MUST refuse any invocation whose **resolved** `destinationRoot` falls inside the dysflow production runtime directory, BEFORE the runner is invoked. The runner MUST NOT be invoked and the call MUST return `{ ok: false, error.code: "INVALID_INPUT" }`. The check MUST be applied uniformly whether `destinationRoot` is supplied explicitly as `exportPath`, as a parameter, or resolved from a project config or context. This MUST hold for both `export_modules` and `export_all`, including the `export_all prune:true` path.

#### Scenario: Explicit exportPath inside the production runtime — refused before runner

- GIVEN a caller passes `exportPath` whose absolute path falls inside the dysflow production runtime directory
- WHEN `export_modules` (or `export_all`) is invoked
- THEN the operation MUST return `{ ok: false, error.code: "INVALID_INPUT" }`
- AND the error message MUST mention the production runtime
- AND the runner MUST NOT be invoked

#### Scenario: Resolved destinationRoot inside the production runtime (no exportPath) — refused before runner

- GIVEN a caller does not pass `exportPath`
- AND the resolved `target.data.destinationRoot` (from `resolveExecutionTarget`) falls inside the dysflow production runtime directory
- WHEN `export_modules` (or `export_all`) is invoked
- THEN the operation MUST return `{ ok: false, error.code: "INVALID_INPUT" }`
- AND the runner MUST NOT be invoked
- AND no file system write under the resolved `destinationRoot` MAY occur

#### Scenario: destinationRoot outside the production runtime — runner invoked normally

- GIVEN a caller passes `exportPath` (or `destinationRoot`) that resolves outside the dysflow production runtime directory
- WHEN `export_modules` (or `export_all`) is invoked
- THEN the guard MUST NOT block
- AND the runner MUST be invoked

#### Scenario: test-runtime workdir is allowed (boundary case)

- GIVEN the resolved `destinationRoot` is inside a `test-runtime/` directory that itself lives OUTSIDE the resolved production runtime path
- WHEN `export_modules` (or `export_all`) is invoked
- THEN the guard MUST NOT block
- AND the runner MUST be invoked

#### Scenario: export_all prune refuses runtime destinationRoot pre-write

- GIVEN `export_all` is invoked with `prune: true`
- AND the resolved `destinationRoot` falls inside the dysflow production runtime directory
- WHEN the call resolves
- THEN the operation MUST return `{ ok: false, error.code: "INVALID_INPUT" }`
- AND the destructive `rm` loop MUST NOT execute
- AND the runner's `executeMappedTool` MUST NOT be invoked for the export step

### Requirement: Prune Allow-List Parity

The set of disk-file extensions that `export_all prune` and `import_all prune` are allowed to delete MUST equal the AGENTS.md documented allow-list (`.bas`, `.cls`, `.form.txt`, `.report.txt`). Files with any other extension — including the legacy `.frm` binary form format — MUST NOT be deleted by prune, regardless of whether they match a module name in the live VBE inventory.

#### Scenario: Legacy .frm orphan file is preserved by prune

- GIVEN an on-disk `LegacyForm.frm` orphan file exists under the resolved `destinationRoot`
- WHEN `export_all prune:true` runs after a clean export
- THEN the legacy `.frm` file MUST NOT be deleted
- AND the prune report MUST NOT list it under `deleted`

#### Scenario: .bas orphan file is pruned normally

- GIVEN an on-disk `Ghost.bas` orphan file exists under the resolved `destinationRoot`
- WHEN `export_all prune:true` runs after a clean export
- THEN the `.bas` file MUST be deleted
- AND the prune report MUST list it under `deleted`

#### Scenario: .cls orphan file is pruned normally

- GIVEN an on-disk `OrphanClass.cls` orphan file exists under the resolved `destinationRoot`
- WHEN `export_all prune:true` runs after a clean export
- THEN the `.cls` file MUST be deleted
- AND the prune report MUST list it under `deleted`

#### Scenario: Non-allow-listed file (e.g. .txt) is preserved

- GIVEN an on-disk `notes.txt` file exists under the resolved `destinationRoot`
- WHEN `export_all prune:true` runs after a clean export
- THEN the `.txt` file MUST NOT be deleted
- AND no file system write that removes it MAY occur

#### Scenario: Adversarial .frm masquerade attempt

- GIVEN an on-disk `ImportantModule.frm` orphan file exists under the resolved `destinationRoot`
- AND no module named `ImportantModule` exists in the live VBE inventory
- WHEN `export_all prune:true` runs after a clean export
- THEN the `.frm` file MUST NOT be deleted
- AND the prune report MUST NOT list it under `deleted`

---

## Test Surface

| Finding | Port (entry) | Existing test file | New test names |
|---------|--------------|--------------------|----------------|
| F1 (exportPath) | `VbaModulesAdapter.execute` | `test/adapters/vba-sync/runtime-guard-filesystem-writes.test.ts` | Already covered by `refuses export_modules when exportPath points inside the production runtime` and `refuses export_all when exportPath points inside the production runtime`. |
| F1 (resolved destinationRoot) | `VbaModulesAdapter.execute` | `test/adapters/vba-sync/runtime-guard-filesystem-writes.test.ts` | `refuses export_modules when resolved destinationRoot points inside the production runtime`; `refuses export_all when resolved destinationRoot points inside the production runtime`; `export_all prune refuses runtime destinationRoot pre-write (#619)`. |
| F4 (.frm removal) | `VbaModulesAdapter.execute("export_all", { prune: true })` | `test/adapters/vba-sync/vba-modules-adapter.test.ts` | `export_all prune never deletes .frm orphan files (#619)`; `export_all prune keeps .bas and .cls orphans deletable (#619)`. |

No E2E scenarios; unit-level + port-level integration tests only.