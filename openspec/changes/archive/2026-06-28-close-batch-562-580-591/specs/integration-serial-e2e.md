# Spec — Integration Serial Execution + Temp Sandbox Cleanup (#562)

## Context

La suite `vitest.integration.config.ts` corre archivos de test que abren instancias reales de Access (DAO, ROT, `.laccdb`). Con contención COM los symptoms son `MCP call timed out`, `EBUSY ... unlink '...\NoConformidades.accdb'` y `compile hung`. Adicionalmente los sandboxes `dysflow-*` bajo `%TEMP%` se acumulan sin limpieza confiable.

## ADDED Requirements

### Requirement: Integration suite MUST serialize Access COM tests

`vitest.integration.config.ts` MUST configure Vitest so only one fork process is alive at a time AND test files within that fork run sequentially. The configuration MUST include all three of:

- `pool: "forks"`
- `poolOptions.forks.singleFork: true`
- `fileParallelism: false`

Vitest with `maxWorkers: 1` alone is insufficient because Vitest may still schedule multiple files in a single worker under contention; `singleFork` + `fileParallelism: false` is the contract that guarantees a single Access instance at a time.

#### Scenario: Config pins single-fork serialization

- **Given** the project vitest integration config at `vitest.integration.config.ts`
- **When** the config is parsed
- **Then** it contains `pool: "forks"`
- **And** it contains `singleFork: true` under `poolOptions.forks`
- **And** it contains `fileParallelism: false`

### Requirement: Integration suite MUST sweep stale temp sandboxes before running

A Vitest global setup MUST run before the integration suite and remove `dysflow-*` directories under `os.tmpdir()` older than a configurable threshold (default: 24 hours). The sweep MUST tolerate a still-locked `.laccdb` (best-effort removal; if `rmSync` throws `EBUSY`, the directory is left to the OS reaper — sweep MUST NOT crash the suite).

#### Scenario: Global setup sweeps stale dysflow-* dirs

- **Given** `%TEMP%` contains a `dysflow-stale-XXXX` directory older than the threshold
- **And** `%TEMP%` contains a `dysflow-fresh-XXXX` directory younger than the threshold
- **When** the global setup runs
- **Then** the stale directory is removed
- **And** the fresh directory is preserved

#### Scenario: Global setup tolerates a locked .laccdb

- **Given** `%TEMP%` contains a `dysflow-locked-XXXX` directory with an active `.laccdb` lock
- **When** the global setup runs
- **Then** the sweep does NOT throw
- **And** the suite proceeds normally

### Requirement: Quality gate MUST verify integration serialization + sweep

A quality gate test MUST assert:
1. The integration config contains the three serialization flags.
2. The integration config references a `globalSetup` script.
3. The `globalSetup` script exists on disk and exports a default async function.

#### Scenario: Quality gate fails when serialization flags are missing

- **Given** `vitest.integration.config.ts` without `singleFork: true`
- **When** the quality gate runs
- **Then** it fails with a message naming the missing flag

## Cross-references

- Affected capability: `integration-tests`
- Issue: #562
- Test path: `test/quality-gates/integration-config.test.ts` (new)
- Test path: `test/integration/global-setup-temp-sweep.test.ts` (new; fast unit-level test of the sweep helper)
