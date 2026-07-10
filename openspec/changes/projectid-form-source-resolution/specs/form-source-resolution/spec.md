# Form Source Resolution Specification

## Purpose

Defines a single, pure, testable contract for resolving a form's on-disk
source path from either `projectId`/loaded config + `formName`, or a
project-relative `sourcePath`, or a raw `destinationRoot`/`sourceRoot` legacy
input. Backs Group A/B/C form tools with one predictable resolver instead of
three incompatible path strategies.

## Requirements

### Requirement: projectId-driven resolution

The resolver MUST accept a loaded project config (derived from `projectId`)
and a `formName`, and MUST return the absolute path to that form's source
file plus the ordered list of candidate paths it attempted.

#### Scenario: projectId-only caller resolves to the correct file

- GIVEN a loaded config for a valid `projectId` with a known source root
- WHEN the resolver is called with that config and `formName: "MyForm"`
- THEN it returns an absolute path ending in `forms/Form_MyForm.form.txt` under the project's source root
- AND the returned candidate list includes that path as the one that matched

### Requirement: Idempotent source-root join

The resolver MUST NOT double-nest a project-relative `sourcePath` that
already starts with the resolved source root segment (e.g. `src/`). It MUST
strip the redundant leading segment instead of concatenating it.

#### Scenario: sourcePath already containing the source root does not double-nest

- GIVEN a resolved source root of `<projectRoot>/src`
- WHEN the resolver is called with `sourcePath: "src/forms/Form_MyForm.form.txt"`
- THEN the resulting absolute path is `<projectRoot>/src/forms/Form_MyForm.form.txt`
- AND it is NOT `<projectRoot>/src/src/forms/Form_MyForm.form.txt`

#### Scenario: sourcePath without the source root joins normally

- GIVEN a resolved source root of `<projectRoot>/src`
- WHEN the resolver is called with `sourcePath: "forms/Form_MyForm.form.txt"`
- THEN the resulting absolute path is `<projectRoot>/src/forms/Form_MyForm.form.txt`

#### Scenario: basename collision in a non-split project is not stripped

- GIVEN a non-split project where `destinationRoot === projectRoot` (no separate source-root sub-segment) and the project directory's own basename equals a leading segment of the caller's `sourcePath`
- WHEN the resolver is called with that `sourcePath`
- THEN it does NOT strip that leading segment, because the idempotent strip only applies when a real source-root sub-segment (e.g. `src`) is detected, i.e. `destinationRoot !== projectRoot`
- AND it resolves to the correct un-stripped path

### Requirement: Backward-compatible raw-path resolution

When neither `projectId` nor `formName` is supplied, the resolver MUST
produce the same absolute path a caller would have obtained by directly
joining the raw `destinationRoot`/`sourceRoot` and path arguments prior to
this change.

#### Scenario: raw destinationRoot/sourceRoot caller is unaffected

- GIVEN a caller supplying only a raw `destinationRoot` and a relative path, with no `projectId` and no `formName`
- WHEN the resolver is invoked with those raw inputs
- THEN the resolved absolute path is identical to the pre-existing raw-path join behavior
- AND no resolution-failure diagnostic is produced for a path that previously succeeded

#### Scenario: literal sourcePath passthrough for read-only tools

- GIVEN a caller of `inspect_form`, `compare_form`, or `form_serialize` that today reads a literal `sourcePath` straight from disk, supplying NEITHER `projectId` NOR `formName`
- WHEN resolution runs for that call
- THEN the literal `sourcePath` is used verbatim and is NEVER re-joined against `destinationRoot`
- AND this is distinct from `lint_form_code`, which does join its path against `destinationRoot` today, so pre-existing callers of these three read-only tools are unaffected

### Requirement: Typed resolution-failure diagnostic

When resolution fails (no candidate path exists), the resolver MUST return a
typed diagnostic containing: the `projectId` (if any), the resolved source
root expressed relative to the project root (`sourceRootRelative`), the
ordered, relative-only list of every candidate path attempted
(`attemptedRelative`), and a remediation message. The diagnostic MUST NOT
contain a raw absolute filesystem path in any field the caller surfaces as
free text to the user — including when a path-shaped value (Windows drive,
UNC, or POSIX absolute) is supplied through `formName` instead of
`sourcePath`, which MUST be guarded identically. Path data MUST be exposed
only through structured fields a downstream sanitizer does not scrub into
`[PATH]`.

#### Scenario: resolution failure returns actionable diagnostic

- GIVEN a `projectId` whose config resolves to a `projectRoot`, but the requested `formName` does not exist under any attempted source root
- WHEN the resolver attempts resolution
- THEN it returns a typed diagnostic with `projectId`, `sourceRootRelative`, `attemptedRelative`, and a remediation string
- AND the diagnostic's free-text remediation message contains no raw absolute path substring subject to `[PATH]` scrubbing

#### Scenario: a path-shaped formName is redacted the same as an absolute sourcePath

- GIVEN a caller supplies a `formName` that is itself a Windows-drive, UNC, or POSIX-absolute path (instead of a bare identity string)
- WHEN the resolver builds a resolution-failure diagnostic for that input
- THEN neither `attemptedRelative` nor the free-text `remediation` message contains the raw path-shaped `formName` value
- AND the affected candidate's contribution to `attemptedRelative` is redacted the same way an absolute `sourcePath` candidate would be

#### Scenario: caller surfaces remediation without a scrubbed path

- GIVEN a resolution-failure diagnostic produced by the resolver
- WHEN an MCP tool adapter translates that diagnostic into a caller-facing error
- THEN the resulting error message is non-empty and actionable
- AND it does NOT contain the literal substring `[PATH]`

### Requirement: Resolver purity

The resolver MUST be a pure function of its inputs: given the same loaded
config/raw inputs, it MUST return the same result with no filesystem or
network I/O. Filesystem existence checks and config loading MUST happen only
in the calling adapter, never inside the resolver.

#### Scenario: resolver performs no I/O

- GIVEN the resolver is invoked with an in-memory config object and no filesystem access is provided
- WHEN it computes candidate paths and a result
- THEN it returns a result using only its input arguments
- AND no filesystem read/write or network call occurs during the resolver's execution

#### Scenario: existence check stays in the adapter

- GIVEN a resolver result naming a candidate absolute path
- WHEN the adapter determines whether that path exists on disk
- THEN the adapter performs the existence check itself, not the resolver
- AND the resolver's output is unchanged regardless of whether the path exists
