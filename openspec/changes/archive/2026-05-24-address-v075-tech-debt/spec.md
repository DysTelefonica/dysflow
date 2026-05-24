# Delta Spec: address-v075-tech-debt

> Artifact store: hybrid | Change: address-v075-tech-debt | Date: 2026-05-23

This change is internal refactoring and bug fixes. It introduces **no new public capabilities** and **no removed capabilities**. All deltas below are behavioral corrections or structural constraints that restore or clarify documented contracts.

---

## PR1 — Quick Wins

### MODIFIED Requirement: Environment Injection in MCP Adapter

`toLegacyMaintenanceRequest` MUST derive environment values exclusively from the `env` parameter passed through context. It MUST NOT read `process.env` directly.
(Previously: the function read `process.env` directly, bypassing env injection.)

#### Scenario: Env value from injected context
- GIVEN `toLegacyMaintenanceRequest` is called with an `env` parameter containing a key
- WHEN the function builds the legacy request
- THEN it MUST use the value from `env`, not from `process.env`

#### Scenario: process.env not accessed
- GIVEN `process.env` differs from the injected `env`
- WHEN the function executes
- THEN the result MUST reflect only the injected `env` values

---

### ADDED Requirement: Canonical Dry-Run Resolution

A single exported function `resolveIsDryRun(input: unknown): boolean` MUST exist and be the sole entry point for computing dry-run state from tool input. All four dry-run evaluation sites in `tools.ts` MUST delegate to it.

Resolution rules (in priority order):
1. If `apply === true` → MUST return `false` (writes enabled), regardless of `dryRun`.
2. If `dryRun === false` → MUST return `false`.
3. Otherwise → MUST return `true` (dry-run active).

#### Scenario: apply true overrides dryRun true
- GIVEN tool input `{ apply: true, dryRun: true }`
- WHEN `resolveIsDryRun` is called
- THEN it MUST return `false`

#### Scenario: apply false with dryRun false
- GIVEN tool input `{ apply: false, dryRun: false }`
- WHEN `resolveIsDryRun` is called
- THEN it MUST return `false`

#### Scenario: default — no apply, no dryRun
- GIVEN tool input `{}`
- WHEN `resolveIsDryRun` is called
- THEN it MUST return `true`

#### Scenario: apply true alone
- GIVEN tool input `{ apply: true }`
- WHEN `resolveIsDryRun` is called
- THEN it MUST return `false`

#### Scenario: all four sites delegate
- GIVEN any tool that previously computed dry-run state inline
- WHEN the tool evaluates dry-run
- THEN it MUST call `resolveIsDryRun`, not reimplement the logic

---

### ADDED Requirement: Unified Context Schema Props

A single `CONTEXT_SCHEMA_PROPS` object MUST replace both `CONTEXT_PROPERTIES` and `CTX` in `tools.ts`. All tool schema definitions MUST reference `CONTEXT_SCHEMA_PROPS`.

#### Scenario: Single source of truth
- GIVEN a tool schema definition
- WHEN it references context property definitions
- THEN it MUST use `CONTEXT_SCHEMA_PROPS` — importing neither `CONTEXT_PROPERTIES` nor `CTX`

#### Scenario: No duplicate definitions
- GIVEN the module is loaded
- WHEN any context property key is looked up
- THEN exactly one definition for that key SHALL exist in the module

---

### MODIFIED Requirement: Sanitizer Regex Safety

The UNC-path branch of `sanitizeErrorMessage` MUST use a linear regex free of nested repetition.
(Previously: used nested quantifiers that could trigger catastrophic backtracking on adversarial input.)

#### Scenario: Safe UNC path sanitization
- GIVEN an error message containing a UNC path `\\server\share\file`
- WHEN `sanitizeErrorMessage` processes it
- THEN it MUST redact the path without regex timeout or catastrophic backtracking

#### Scenario: Non-UNC message unchanged
- GIVEN an error message without a UNC path
- WHEN `sanitizeErrorMessage` processes it
- THEN it MUST return the message with only standard redactions applied

---

### MODIFIED Requirement: Test Quality in release-matrix-gate

`release-matrix-gate.test.ts` MUST contain no `as any` type casts and no bare `console.log` calls in test bodies.
(Previously: contained both for legacy compatibility scaffolding.)

#### Scenario: No as-any casts
- GIVEN the test file is compiled
- WHEN TypeScript strict mode is active
- THEN no `as any` casts SHALL appear in the file

#### Scenario: No ungated console output
- GIVEN a test suite run
- WHEN any test in `release-matrix-gate.test.ts` executes
- THEN no `console.log` calls SHALL execute unconditionally in test bodies

---

### MODIFIED Requirement: Explicit Scanner Parameter

`scanAndCleanOrphans` MUST declare `processScanner` as an explicit typed parameter. It MUST NOT use a non-null assertion to access it.
(Previously: accessed `processScanner` via non-null assertion `!`.)

#### Scenario: Parameter required
- GIVEN a call to `scanAndCleanOrphans`
- WHEN `processScanner` is omitted
- THEN TypeScript MUST reject the call at compile time

#### Scenario: No runtime non-null assertion
- GIVEN `processScanner` is passed
- WHEN the function executes
- THEN it MUST not use `!` to assert the value is non-null

---

### MODIFIED Requirement: InMemory Registry Purge Parity

`InMemoryAccessOperationRegistry.create()` and `update()` MUST call `records.delete(operationId)` when the resulting status is in `PURGED_PERSISTENT_STATUSES`, matching `FileRegistry` behavior.
(Previously: InMemory registry retained completed/cleaned records indefinitely, diverging from FileRegistry.)

#### Scenario: Completed status purges record
- GIVEN an operation that transitions to a status in `PURGED_PERSISTENT_STATUSES`
- WHEN `create` or `update` completes
- THEN the record MUST be removed from the in-memory store

#### Scenario: Active status retains record
- GIVEN an operation with an active (non-purged) status
- WHEN `create` or `update` completes
- THEN the record MUST remain in the in-memory store

#### Scenario: Parity with FileRegistry
- GIVEN both registries receive the same sequence of operations
- WHEN the final status is in `PURGED_PERSISTENT_STATUSES`
- THEN both registries MUST have deleted the record

---

## PR2 — Config Sync/Async

### MODIFIED Requirement: Single-Implementation Config Loading

Core routing logic for configuration loading MUST reside in exactly one function. The synchronous variant MUST be a thin wrapper that adapts the async implementation (or vice versa). No routing logic SHALL be duplicated between sync and async paths.
(Previously: `loadDysflowConfig` and `loadDysflowConfigAsync` each contained independent routing logic.)

#### Scenario: Sync result matches async result
- GIVEN identical inputs
- WHEN both `loadDysflowConfig` and `loadDysflowConfigAsync` are called
- THEN both MUST return the same resolved configuration

#### Scenario: No routing duplication
- GIVEN the source module `dysflow-config.ts`
- WHEN a routing condition is updated
- THEN exactly one code site requires the change

---

## PR3 — VBA Service Split

### ADDED Requirement: VBA Form Service Module

`src/core/services/vba-form-service.ts` MUST own the operations `validateFormSpec`, `generateForm`, `catalogAddControl`, `harvestFormCatalog`, and `resolveFormSpec`. These functions MUST be exported from this module.

#### Scenario: Form operations importable from vba-form-service
- GIVEN a consumer that needs `validateFormSpec` or `generateForm`
- WHEN they import
- THEN the symbol MUST be resolvable from `vba-form-service.ts`

#### Scenario: Not duplicated in legacy service
- GIVEN `vba-sync-legacy-service.ts`
- WHEN it needs a form operation
- THEN it MUST import from `vba-form-service.ts`, not reimplement it

---

### ADDED Requirement: VBA Source Comparison Module

`src/core/services/vba-source-comparison.ts` MUST own the operations `compareSourceAgainstBinary`, `compareVbaSourceTrees`, and `collectVbaSourceFiles`. These functions MUST be exported from this module.

#### Scenario: Comparison operations importable from vba-source-comparison
- GIVEN a consumer that needs `compareSourceAgainstBinary`
- WHEN they import
- THEN the symbol MUST be resolvable from `vba-source-comparison.ts`

---

### MODIFIED Requirement: VBA Sync Legacy Service Public API Preserved

`VbaSyncLegacyService` MUST retain its existing public API. Callers MUST require no import path or signature changes after the split.
(Previously: the service contained all form and comparison logic inline; now it delegates.)

#### Scenario: Public API unchanged
- GIVEN existing call sites for `VbaSyncLegacyService`
- WHEN PR3 lands
- THEN all call sites MUST compile and pass tests without modification

#### Scenario: Delegation to sub-modules
- GIVEN the service receives a form-related operation
- WHEN it executes
- THEN it MUST delegate to `vba-form-service.ts` — not contain inline form logic

---

## PR4 — Install Utils Extraction

### ADDED Requirement: Shared Install Utilities Module

`src/cli/install-utils.ts` MUST export `fileExists`, `readJson`, `writeJson`, `ensureObject`, `runCommand`, and `runCommandOutput`. These are the canonical implementations for file system and command helpers in the CLI layer.

#### Scenario: Helpers importable from install-utils
- GIVEN any CLI module needing `fileExists` or `runCommand`
- WHEN it imports
- THEN the symbol MUST be resolvable from `install-utils.ts`

---

### MODIFIED Requirement: Uninstall Does Not Import From install.ts

`uninstall.ts` MUST import shared helpers from `install-utils.ts`. It MUST NOT import any symbol from `install.ts`.
(Previously: `uninstall.ts` imported helpers directly from `install.ts`, creating a dependency on the install command module.)

#### Scenario: No install.ts import in uninstall
- GIVEN `uninstall.ts`
- WHEN its import graph is resolved
- THEN no transitive or direct import from `install.ts` SHALL exist

#### Scenario: Uninstall functions correctly after decoupling
- GIVEN `install.ts` is modified
- WHEN `uninstall.ts` executes
- THEN it MUST not be affected by changes to non-shared install logic

---

### MODIFIED Requirement: install.ts Imports From install-utils.ts

`install.ts` MUST import its file system and command helpers from `install-utils.ts` rather than defining them inline.
(Previously: helpers were defined inline in `install.ts`.)

#### Scenario: install.ts delegates helper calls
- GIVEN `install.ts` needs to call `fileExists` or `runCommand`
- WHEN the function executes
- THEN it MUST invoke the implementation from `install-utils.ts`
