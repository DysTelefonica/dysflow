# Delta for install-runtime

## ADDED Requirements

### Requirement: Corrupt Config Never Silently Replaced

When the install runtime loads a JSON config file that exists on disk, the loader MUST distinguish "file genuinely missing" (`ENOENT`) from "file present but unreadable" (parse error, non-object value, permission error, EIO, or any other `NodeJS.ErrnoException`). ENOENT MAY return an empty object so first-run flows can proceed. Every other condition MUST throw and MUST NOT cause the next write to overwrite the original file with an empty object.

The parsed value, when `JSON.parse` succeeds, MUST be validated as a plain object: arrays, `null`, numbers, strings, and booleans MUST be rejected with an error that names the offending file. The thrown error from a parse failure MUST include the underlying `JSON.parse` reason so the user can locate and fix the corruption.

`updateProjectConfigId` in `src/cli/commands/setup.ts` MUST apply the same contract when reading `.dysflow/project.json`. The thrown error message SHALL keep the `Invalid .dysflow/project.json: <path>` prefix and SHALL append the inner parse reason.

#### Scenario: ENOENT continues to return an empty object
- GIVEN a config file path that does not exist
- WHEN `readJson` is called
- THEN it MUST return `{}` without throwing
- AND the first write of a real config SHALL succeed without surfacing a load error

#### Scenario: Corrupt JSON throws with the file path and the underlying reason
- GIVEN a config file that exists and contains invalid JSON (e.g. `{invalid}`)
- WHEN `readJson` is called
- THEN the returned promise MUST reject with an `Error`
- AND the message MUST contain the file path
- AND the message MUST contain the underlying `JSON.parse` reason (e.g. `Unexpected token`, position info)

#### Scenario: Top-level array is rejected as not a plain object
- GIVEN a config file that exists and contains a JSON array (e.g. `[1, 2, 3]`)
- WHEN `readJson` is called
- THEN the returned promise MUST reject with an `Error`
- AND the message MUST indicate the value is not a plain object

#### Scenario: Top-level null is rejected as not a plain object
- GIVEN a config file that exists and contains the literal `null`
- WHEN `readJson` is called
- THEN the returned promise MUST reject with an `Error`
- AND the message MUST indicate the value is not a plain object

#### Scenario: Non-ENOENT read errors propagate to the caller
- GIVEN a config file path that exists but is unreadable for any reason other than ENOENT (e.g. `EACCES`, `EISDIR`, `EIO`)
- WHEN `readJson` is called
- THEN the returned promise MUST reject with the original error (or a wrapper that preserves the `code` field)
- AND the caller MUST be able to distinguish "missing" from "unreadable" so it can warn or abort appropriately

#### Scenario: setup `--set-project-id` aborts on corrupt project config and preserves the file
- GIVEN a `.dysflow/project.json` that exists but contains invalid JSON
- WHEN `dysflow setup --set-project-id <id>` runs
- THEN the command MUST fail with `exitCode: 1` and an error message that includes the file path and the underlying `JSON.parse` reason
- AND the original file on disk MUST remain byte-identical to its pre-call contents
- AND no partial write (no `.tmp` file, no truncated target) SHALL be observable after the failure

#### Scenario: setup `--set-project-id` aborts on a non-object project config
- GIVEN a `.dysflow/project.json` that exists but contains a JSON value that is not a plain object (array, null, scalar)
- WHEN `dysflow setup --set-project-id <id>` runs
- THEN the command MUST fail with `exitCode: 1`
- AND the original file on disk MUST remain unchanged
- AND the error message MUST indicate the value is not a plain object

### Requirement: Atomic Config Writes Are Preserved

The install runtime MUST continue to write config files through the atomic contract delivered in commit `499d5e4`: MCP configurator, agent configurator, codex-section updates, and any other config writer MUST go through `writeJson` (which uses `writeFileAtomically`) or `writeFileAtomically` directly. A thrown error from `readJson` MUST reach the caller before any atomic write begins, so a corrupt file is never replaced by a freshly-written empty object.

#### Scenario: Corrupt input does not reach the writer
- GIVEN any config write path (MCP, agent, project id, codex section)
- WHEN `readJson` rejects because the file is corrupt or non-object
- THEN the writer MUST NOT be invoked
- AND no `.tmp` file SHALL be left in the same directory as the target
- AND the target file MUST remain byte-identical to its pre-call contents

### Requirement: Corrupt-Config Tests Are Port-Level

Strict TDD MUST characterize the corrupt-config behaviour through the public `readJson` port and the `dysflow setup --set-project-id` command port, not through private predicates, mocked `node:fs` internals, or the specific error string. Tests SHALL assert observable behaviour — rejection with an informative message, the file path is named, the original file is preserved — and SHALL survive any internal refactor that preserves that behaviour, per `docs/testing/testing-philosophy.md`.

#### Scenario: RED coverage precedes production change
- GIVEN the new corrupt-config behaviour is not yet enforced
- WHEN implementation starts
- THEN a failing Vitest expectation MUST be added first in `test/cli/install-utils.test.ts` covering corrupt JSON, top-level array, and `null` payloads
- AND the production change SHALL wait until the RED failure proves the missing contract

#### Scenario: Tests survive internal refactor
- GIVEN the JSON loader is later refactored (helper extraction, predicate rename, message wording update)
- WHEN `pnpm test` runs
- THEN the corrupt-config tests MUST still pass by asserting behaviour, not exact message strings or private helper names
- AND the ENOENT happy path (returns `{}`) and round-trip (write → read) MUST continue to pass without modification
