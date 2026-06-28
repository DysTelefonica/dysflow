# Spec — CI Test File References (#580)

## Context

`.github/workflows/ci.yml`, `vitest.config.ts` y `vitest.integration.config.ts` referencian archivos de test que NO existen en el árbol: `test/scripts-access-runner.test.ts` y `test/scripts-vba-manager.test.ts`. Esto puede hacer fallar CI o dar falsa confianza. El quality gate actual (`test/quality-gates/ci-workflow.test.ts`) PINEA el comando roto en lugar de detectar el drift.

## ADDED Requirements

### Requirement: Config files MUST NOT reference nonexistent test files

`vitest.config.ts`, `vitest.integration.config.ts` y `.github/workflows/ci.yml` MUST NOT reference any path matching `test/**/*.test.ts` (or `test/foo/bar.test.ts`) that does not exist on disk.

#### Scenario: Vitest unit config references only existing files

- **Given** `vitest.config.ts` with an `include` array
- **And** an `exclude` array
- **When** every `*.test.ts` path referenced is resolved against the filesystem
- **Then** every referenced path exists on disk

#### Scenario: Vitest integration config references only existing files

- **Given** `vitest.integration.config.ts` with an `include` array
- **When** every `*.test.ts` path referenced is resolved against the filesystem
- **Then** every referenced path exists on disk

#### Scenario: CI workflow references only existing files

- **Given** `.github/workflows/ci.yml`
- **When** every `*.test.ts` path mentioned in any `run:` step is resolved against the filesystem
- **Then** every referenced path exists on disk

### Requirement: Quality gate MUST verify referenced paths exist

The quality gate at `test/quality-gates/ci-workflow.test.ts` MUST parse the three config files, extract every `*.test.ts` path mentioned, and assert that each path exists on disk. The gate MUST NOT pin a specific shell command verbatim — it MUST verify the structural property "no broken references" so it survives renaming and reordering.

#### Scenario: Quality gate fails when a config references a nonexistent file

- **Given** `vitest.config.ts` includes `"test/foo.test.ts"`
- **And** `test/foo.test.ts` does not exist
- **When** the quality gate runs
- **Then** it fails with a message naming the broken reference and the config file

#### Scenario: Quality gate passes when all referenced files exist

- **Given** all configs reference only paths that exist
- **When** the quality gate runs
- **Then** it passes

### Requirement: Windows integration command MUST stay in sync with vitest integration config

The `windows-integration-smoke` job in `.github/workflows/ci.yml` MUST list exactly the files matched by `vitest.integration.config.ts`'s `include` glob. Any drift between the job and the config MUST be detected by the quality gate.

#### Scenario: Windows integration command includes every integration config file

- **Given** `vitest.integration.config.ts` `include` globs expand to a set of files
- **And** `.github/workflows/ci.yml` `windows-integration-smoke.run` lists a set of files
- **When** the quality gate runs
- **Then** both sets are equal (modulo globs that intentionally exclude)

## REMOVED Requirements

The pre-existing Windows integration test command in `.github/workflows/ci.yml` line 85-86 MUST be updated to remove `test/scripts-access-runner.test.ts` and `test/scripts-vba-manager.test.ts`. (Reason: those files do not exist and never have; pinning them in CI is a phantom reference.)

The pre-existing `vitest.config.ts` line 19 include and line 23 exclude entries for the two phantom files MUST be removed.

The pre-existing `vitest.integration.config.ts` lines 10-11 include entries for the two phantom files MUST be removed.

## Cross-references

- Affected capability: `ci-workflow`
- Issue: #580
- Test path: `test/quality-gates/ci-workflow.test.ts` (modify — extend the "Windows PowerShell smoke" test with a structural scan; remove the verbatim pin of nonexistent paths)
