# access-core-runner Specification

## Purpose

Execute PowerShell-hosted Access operations in a bounded subprocess and surface
real-time progress events to callers without corrupting the structured result
payload.

## Requirements

### Requirement: Runner Execution Boundary

The system MUST spawn the PowerShell runner script in a child process, collect
its stdout as a single JSON payload, and return a typed result to the caller.
The stdout stream MUST NOT be used for any intermediate signaling.

#### Scenario: Successful run

- GIVEN a valid Access operation configuration
- WHEN the runner executes the PowerShell script
- THEN stdout MUST be collected in full and parsed as a single JSON result
- AND the parsed result MUST be returned to the caller

#### Scenario: Non-zero exit code

- GIVEN the PowerShell process exits with a non-zero code
- WHEN the runner handles process termination
- THEN it MUST return a structured error and MUST NOT throw an unhandled exception

### Requirement: Progress Callback Option

The runner MUST accept an optional `onProgress` callback in its options:

```
onProgress?(percent: number, total?: number, message?: string): void
```

When provided, the runner MUST invoke `onProgress` each time a valid
`DYSFLOW_PROGRESS` line is received on stderr. When absent, progress lines
MUST be silently discarded without affecting runner behavior.

#### Scenario: Runner receives valid progress line

- GIVEN the runner is executing and `onProgress` is provided in options
- WHEN stderr emits a line starting with `DYSFLOW_PROGRESS ` followed by valid JSON
- THEN the runner MUST parse `percent`, `total`, and `message` from the JSON
- AND MUST call `onProgress(percent, total, message)` immediately

#### Scenario: Runner receives malformed progress line

- GIVEN the runner is executing
- WHEN stderr emits a line starting with `DYSFLOW_PROGRESS ` followed by invalid JSON
- THEN the runner MUST silently discard the line
- AND MUST NOT throw, reject, or cause any runner failure

#### Scenario: onProgress absent

- GIVEN the runner is executing without `onProgress` in options
- WHEN stderr emits any number of `DYSFLOW_PROGRESS` lines
- THEN the runner MUST continue normally with no callback invocation
- AND the final result MUST be unaffected

### Requirement: PowerShell Progress Side-Channel Format

The PowerShell runner script MUST emit progress updates exclusively to stderr
using the prefix `DYSFLOW_PROGRESS ` followed by a compact JSON object:

```
DYSFLOW_PROGRESS {"percent": <number>, "total": <number>, "message": "<string>"}
```

Fields `total` and `message` are OPTIONAL. The `percent` field is REQUIRED and
MUST be a numeric value between 0 and 100 inclusive.

#### Scenario: Progress emitted during long operation

- GIVEN the PowerShell script is executing a multi-step operation
- WHEN a step completes
- THEN the script MUST write one `DYSFLOW_PROGRESS` line to stderr
- AND the line MUST contain at minimum `{"percent": <n>}`

#### Scenario: Progress does not appear in stdout

- GIVEN the PowerShell script emits progress
- WHEN the Node runner collects stdout
- THEN stdout MUST contain only the final JSON result
- AND MUST NOT contain any `DYSFLOW_PROGRESS` content
