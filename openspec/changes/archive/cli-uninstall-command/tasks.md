# Tasks: Implement `dysflow uninstall` Command

This document details the tasks, work-unit commits, and PR chaining strategy to implement the `dysflow uninstall` command (GitHub issue #278). The tasks are structured to strictly follow test-driven development (TDD), keeping tests and behavior aligned.

---

## Quick Path

1. **Slice 1 (CLI Routing & Argument Parsing)**: Export helpers, parse arguments, and set up command routing.
2. **Slice 2 (Execution & Side-Effects)**: Write integration tests first, then implement surgical agent config removal, runtime dir deletion, marker cleanup, and env handling.

---

## Review Workload Forecast

| Metric | Value |
| :--- | :--- |
| **Estimated lines changed** | 370 |
| **Review budget** | 400 |
| **Chained PRs recommended** | Yes |
| **Decision needed before apply** | No |

### Recommendation Explanation
The entire feature is estimated at ~370 lines (approx. 130 lines of source code and 240 lines of unit/integration tests). While this is technically below the 400-line threshold, we recommend splitting the work into **two chained PRs** because:
1. It separates CLI syntax, argument validation, and routing from file system and integration side-effects.
2. It allows reviewers to audit the CLI API and interface logic before digging into the details of the uninstallation script deletion and config scrubbing.

---

## Chained PR Slices & Work Units

### PR Slice 1: CLI Routing, Arg Parsing, and Help
* **Branch Name**: `feat/uninstall-cli-routing`
* **Target Branch**: `main`
* **Focus**: Enable `dysflow uninstall`, parse arguments, and display help instructions.

#### [x] Work Unit 1.1: Export installer helpers and types
* **Commit**: `refactor(cli): export installer helpers and types`
* **Files**: [install.ts](file:///C:/Proyectos/dysflow/src/cli/commands/install.ts)
* **Tasks**:
  - [x] Add `export` keyword to `type AgentConfigPaths`.
  - [x] Add `export` keyword to functions:
    - `resolveRuntimeDir`
    - `getSystemMarkerPath`
    - `getHome`
    - `resolveAgentConfigPaths`
    - `removeAgentConfig`
    - `fileExists`
* **Verification**: Ensure project compiles successfully with `pnpm build` (or similar build command).

#### [x] Work Unit 1.2: Define routing and CLI help text
* **Commit**: `feat(cli): route uninstall command and add help text`
* **Files**:
  - [types.ts](file:///C:/Proyectos/dysflow/src/cli/commands/types.ts)
  - [index.ts](file:///C:/Proyectos/dysflow/src/cli/index.ts)
* **Tasks**:
  - [x] Add uninstall help entry to `HELP_TEXT` in `types.ts`.
  - [x] Import `handleUninstallCommand` and register `["uninstall", handleUninstallCommand]` in `COMMANDS` registry in `index.ts`.
* **Verification**: Verify command registry compile safety.

#### [x] Work Unit 1.3: TDD Uninstall command scaffolding & argument parsing
* **Commit**: `feat(cli): parse uninstall arguments`
* **Files**:
  - [uninstall.ts](file:///C:/Proyectos/dysflow/src/cli/commands/uninstall.ts) (New File)
  - [uninstall.test.ts](file:///C:/Proyectos/dysflow/test/cli/uninstall.test.ts) (New File)
* **Tasks**:
  - [x] **TDD (Red)**: Write unit tests in `uninstall.test.ts` for argument parsing:
    - Should print usage text and exit with `0` when `--help` or `-h` is passed.
    - Should reject unknown arguments with exit code `1`.
    - Should reject missing or invalid value for `--runtime-dir` with exit code `1`.
    - Should correctly parse valid `--runtime-dir` options.
  - [x] **TDD (Green)**: Implement `parseUninstallArgs` and `handleUninstallCommand` scaffolding in `uninstall.ts` to satisfy the parsing tests.
* **Verification**: Run `pnpm test` (vitest) to confirm parsing tests pass.

---

### PR Slice 2: Uninstall Execution and Side-Effects
* **Branch Name**: `feat/uninstall-execution`
* **Target Branch**: `feat/uninstall-cli-routing` (or `main` depending on features configuration)
* **Focus**: File system deletions, configuration scrubbing, and environment cleanup.

#### [x] Work Unit 2.1: Write Integration Test Suite for Side-Effects (TDD Red)
* **Commit**: `test(cli): add integration tests for uninstall side-effects`
* **Files**:
  - [uninstall.test.ts](file:///C:/Proyectos/dysflow/test/cli/uninstall.test.ts)
* **Tasks**:
  - [x] Set up a mock environment helper using `mkdtemp` to isolate filesystem changes.
  - [x] Write tests to verify:
    - Surgical removal of Dysflow server config from mock agent files (Codex, OpenCode, Claude, Pi) while keeping other server configs intact.
    - Safe handling when agent configuration files/folders do not exist (idempotency).
    - Recursive deletion of the target runtime directory.
    - Deletion of the system marker file `.dysflow-marker`.
    - Parent folder of the marker file is deleted if empty, or left untouched if not empty.
    - Cleanup of `DYSFLOW_HOME` and `DYSFLOW_RUNTIME_MARKER_PATH` from `context.env` when provided.
    - Stdout warnings when `DYSFLOW_HOME` or `DYSFLOW_RUNTIME_MARKER_PATH` remain in `process.env`.
* **Verification**: Run `pnpm test` and assert all new integration tests fail (Red).

#### [x] Work Unit 2.2: Implement surgical removal of agent integrations
* **Commit**: `feat(cli): implement uninstall MCP configuration removal`
* **Files**:
  - [uninstall.ts](file:///C:/Proyectos/dysflow/src/cli/commands/uninstall.ts)
* **Tasks**:
  - [x] Resolve the configuration paths.
  - [x] Revert agent configurations by calling `removeAgentConfig` for all agents.
* **Verification**: Run `pnpm test` and confirm integration tests for agent configuration removal now pass.

#### [x] Work Unit 2.3: Implement directory and marker file deletions
* **Commit**: `feat(cli): implement runtime directory and marker file deletion`
* **Files**:
  - [uninstall.ts](file:///C:/Proyectos/dysflow/src/cli/commands/uninstall.ts)
* **Tasks**:
  - [x] Delete resolved runtime directory recursively if it exists.
  - [x] Delete system marker file `.dysflow-marker` if it exists.
  - [x] Attempt to delete the parent directory of the marker file if empty, failing silently.
* **Verification**: Run `pnpm test` and confirm file deletion integration tests pass.

#### [x] Work Unit 2.4: Implement environment cleanup & warnings
* **Commit**: `feat(cli): clean up environment and emit shell warnings`
* **Files**:
  - [uninstall.ts](file:///C:/Proyectos/dysflow/src/cli/commands/uninstall.ts)
* **Tasks**:
  - [x] Remove `DYSFLOW_HOME` and `DYSFLOW_RUNTIME_MARKER_PATH` from `context.env` if present.
  - [x] Check `process.env` and format standard environment warnings.
  - [x] Format success console report to stdout.
* **Verification**: Run `pnpm test` and confirm ALL tests in `uninstall.test.ts` pass (Green).

---

## Rollback & Verification Plans

### Verification Plan
1. **Automated Unit Tests**: Run `pnpm test` to verify all test suites, especially `uninstall.test.ts`.
2. **Type Checking**: Run `pnpm build` to verify compilation and type-safety of exports.
3. **Manual Validation**:
   - Install Dysflow using `dysflow install` to a temporary directory.
   - Verify marker file and agent files are configured.
   - Run `dysflow uninstall` to ensure everything is deleted cleanly and appropriate warnings/reports are printed.

### Rollback Plan
Should any issues occur during or after uninstallation, the system can be restored by:
1. Reinstalling using the installer command `dysflow install`.
2. Restoring configurations from `.bak` files if agent config corruption occurred (agent config modification is already backed by existing robust handlers in `install.ts`).
