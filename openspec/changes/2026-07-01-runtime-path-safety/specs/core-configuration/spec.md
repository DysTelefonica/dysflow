# Delta for core-configuration

## ADDED Requirements

### Requirement: ExecutionTarget Override Precedence

`resolveExecutionTarget` MUST honor every caller-supplied override that the `ExecutionTarget` type declares, in every branch. Specifically: when branch 2 fires (`context.accessPath` is provided and no explicit config override was requested), the returned target MUST include the caller-supplied `backendPath` if one was provided (and was non-empty). The result MUST remain stable across all three branches of `resolveExecutionTarget`: branch 0 (explicit config override), branch 1 (repo config loaded), and branch 2 (runtime default).

#### Scenario: Branch 2 with caller-supplied backendPath — caller's path wins

- GIVEN `resolveExecutionTarget` is invoked with branch 2 active (`context.accessPath` defined and no explicit config override requested)
- AND `params.backendPath` is a non-empty string `"C:/worktrees/feature/backend.accdb"`
- WHEN the call resolves
- THEN the returned `ExecutionTarget.data.backendPath` MUST equal `"C:/worktrees/feature/backend.accdb"`
- AND it MUST NOT be `undefined` while `params.backendPath` was provided

#### Scenario: Branch 2 with no backendPath override — backendPath is undefined

- GIVEN `resolveExecutionTarget` is invoked with branch 2 active
- AND `params.backendPath` is `undefined` or empty
- WHEN the call resolves
- THEN the returned `ExecutionTarget.data.backendPath` MUST be `undefined`
- AND other fields (`destinationRoot`, `projectRoot`, `timeoutMs`) MUST still resolve normally from params/context/cwd

#### Scenario: Branch 2 with empty-string backendPath — treated as no override

- GIVEN `resolveExecutionTarget` is invoked with branch 2 active
- AND `params.backendPath` is `""` or whitespace-only
- WHEN the call resolves
- THEN the returned `ExecutionTarget.data.backendPath` MUST be `undefined`
- AND the empty string MUST NOT be passed through to the result

#### Scenario: Branches 0/1 backendPath parity — caller's path still wins

- GIVEN `resolveExecutionTarget` is invoked with branch 0 (explicit config override) or branch 1 (repo config loaded)
- AND `params.backendPath` is a non-empty string
- WHEN the call resolves
- THEN the returned `ExecutionTarget.data.backendPath` MUST equal `params.backendPath`
- AND the result MUST remain stable across all three branches

#### Scenario: Branch 2 preserves caller accessPath override alongside runtime-default

- GIVEN `resolveExecutionTarget` is invoked with branch 2 active (`context.accessPath = "C:/runtime/default.accdb"`)
- AND `params.backendPath = "C:/worktrees/feature/backend.accdb"`
- AND no other overrides are present
- WHEN the call resolves
- THEN the returned target's `accessDbPath` MUST equal `context.accessPath` ("C:/runtime/default.accdb")
- AND the returned target's `backendPath` MUST equal the caller's `"C:/worktrees/feature/backend.accdb"`
- AND both fields MUST be populated independently (no silent drop)

### Requirement: Empty-String Override Normalization

`buildProjectConfig` MUST normalize empty-string caller overrides to `undefined` for the four path fields (`accessDbPath`, `backendPath`, `destinationRoot`, `projectRoot`) BEFORE the precedence resolution (`??` against repo-config defaults). This MUST mirror the symmetry already present in `buildExplicitConfig` (lines 222-225). An empty string MUST NOT silently win the precedence test and overwrite a real repo-config value.

#### Scenario: Empty-string destinationRoot override is treated as no override

- GIVEN a repo `.dysflow/project.json` defines `destinationRoot: "src"` and `accessPath: "front.accdb"`
- AND the caller invokes `loadDysflowConfigAsync` (or `loadDysflowConfig`) with `destinationRoot: ""`
- WHEN the config resolves
- THEN the returned `destinationRoot` MUST be the repo-config-resolved value (its projectRoot-resolved absolute form)
- AND it MUST NOT be the empty string

#### Scenario: Empty-string backendPath override is treated as no override

- GIVEN a repo `.dysflow/project.json` defines `backendPath: "backend.accdb"`
- AND the caller invokes `loadDysflowConfigAsync` with `backendPath: ""`
- WHEN the config resolves
- THEN the returned `backendPath` MUST be the repo-config-resolved `"backend.accdb"`
- AND it MUST NOT be `undefined` (which is what silently happens today via `resolveProjectPath("")`)

#### Scenario: Whitespace-only destinationRoot override is treated as no override

- GIVEN a repo `.dysflow/project.json` defines `destinationRoot: "src"`
- AND the caller invokes `loadDysflowConfigAsync` with `destinationRoot: "   "`
- WHEN the config resolves
- THEN the returned `destinationRoot` MUST be the repo-config-resolved `"src"`
- AND whitespace MUST be trimmed before the precedence test

#### Scenario: Empty-string accessDbPath override — repo config wins, no CONFIG_MISSING_ACCESS_PATH

- GIVEN a repo `.dysflow/project.json` defines `accessPath: "front.accdb"`
- AND the caller invokes `loadDysflowConfigAsync` with `accessDbPath: ""`
- WHEN the config resolves
- THEN the returned `accessDbPath` MUST be the repo-config-resolved `"front.accdb"`
- AND it MUST NOT return `CONFIG_MISSING_ACCESS_PATH`
- AND the empty-string override MUST be normalized before the precedence test

#### Scenario: Non-empty caller override still wins after normalization

- GIVEN a repo `.dysflow/project.json` defines `destinationRoot: "src"`
- AND the caller invokes `loadDysflowConfigAsync` with `destinationRoot: "C:/worktrees/feature/src"`
- WHEN the config resolves
- THEN the returned `destinationRoot` MUST be `"C:/worktrees/feature/src"` (or its projectRoot-resolved form)
- AND the caller override MUST still win after the normalization step

---

## Test Surface

| Finding | Port (entry) | Existing test file | New test names |
|---------|--------------|--------------------|----------------|
| F2 (branch 2 backendPath) | `resolveExecutionTarget` | `test/core/config/execution-target.test.ts` | `branch 2 returns caller-supplied params.backendPath (#619)`; `branch 2 normalizes empty-string params.backendPath to undefined (#619)`; `branches 0/1/2 backendPath parity — caller override wins in every branch (#619)`. |
| F3 (empty-string normalization) | `loadDysflowConfigAsync` (which routes through `buildProjectConfig`) | `test/core/config/dysflow-config.test.ts` | `empty-string destinationRoot override is treated as no override (#619)`; `empty-string backendPath override is treated as no override (#619)`; `whitespace-only destinationRoot override is treated as no override (#619)`; `empty-string accessDbPath override does not trigger CONFIG_MISSING_ACCESS_PATH (#619)`. |

No E2E scenarios; unit-level tests exercise `loadDysflowConfigAsync` end-to-end against a temp workspace with a real `.dysflow/project.json`, which is the same port the MCP stdio adapter uses.