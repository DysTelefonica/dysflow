# access-relink-directory Specification

## Purpose

Bulk-remap linked-table backends in every Access file under a root directory,
with dry-run, backup, alias mapping, chain resolution, and strict verification.
This is a new capability with no prior spec to delta against.

---

## Requirements

### Requirement: FR-1 Root Directory Scanning

The system MUST accept a `--root <path>` argument and recursively enumerate every
`.accdb` and `.mdb` file under that path. The `--root` argument is REQUIRED for
`relink-directory`; the command MUST exit with a non-zero code and a clear error
message if it is absent. Scanning is always recursive.

#### Scenario: Root contains nested Access files

- GIVEN a directory tree with `.accdb` files at multiple depths
- WHEN `dysflow access relink-directory --root <dir> --dry-run` is run
- THEN every `.accdb` and `.mdb` under `<dir>` at any depth is included in the scan result

#### Scenario: Missing --root argument

- GIVEN no `--root` flag is supplied
- WHEN the command is invoked
- THEN the process exits non-zero and prints a usage error naming `--root` as required

---

### Requirement: FR-2 Linked Table Enumeration

The system MUST enumerate all `TableDef` entries in each Access file whose
`Connect` property is non-empty, and MUST extract the `DATABASE=` value from
the connect string to determine the current backend path.

#### Scenario: TableDef with connect string

- GIVEN an `.accdb` with a linked table whose `Connect` is `";DATABASE=\\server\share\back.accdb"`
- WHEN the file is scanned
- THEN the link is enumerated and the extracted backend path is `\\server\share\back.accdb`

#### Scenario: Local table is ignored

- GIVEN an `.accdb` with a native (non-linked) table whose `Connect` is empty
- WHEN the file is scanned
- THEN that table is not included in any link enumeration results

---

### Requirement: FR-3 Target Classification

The system MUST classify each linked table as one of:

- `alreadyLocal` — `DATABASE=` path resolves to a file inside `--root`
- `plannedRelink` — a local file matching the basename was found under `--root`
- `unresolved` — no local match was found

#### Scenario: External link with matching local file

- GIVEN a link pointing outside `--root` and a file with the same basename exists under `--root`
- WHEN dry-run classification runs
- THEN the link is classified as `plannedRelink`

#### Scenario: External link with no local match

- GIVEN a link pointing outside `--root` and no file with that basename exists under `--root`
- WHEN dry-run classification runs
- THEN the link is classified as `unresolved`

#### Scenario: Link already points inside root

- GIVEN a link whose `DATABASE=` path is inside `--root`
- WHEN classification runs
- THEN the link is classified as `alreadyLocal` and no remapping is planned

---

### Requirement: FR-4 Filename-Based Remapping

The system MUST match external backend paths to local files by basename
comparison (case-insensitive, extension-included). When multiple local files
share the same basename, the system MUST report an ambiguity error for that link
and classify it as `unresolved`.

#### Scenario: Case-insensitive match

- GIVEN a link to `\\server\BACKEND.ACCDB` and a local file `backend.accdb` under `--root`
- WHEN remapping is resolved
- THEN `backend.accdb` is selected as the replacement target

#### Scenario: Ambiguous basename

- GIVEN two local files `sub1\backend.accdb` and `sub2\backend.accdb` under `--root`
- WHEN a link to `\\server\backend.accdb` is resolved
- THEN the link is classified as `unresolved` with an ambiguity note in the audit result

---

### Requirement: FR-5 Alias Map

The system MUST accept one or more `--map <old-basename>=<new-basename>` flags
(repeatable). Alias resolution MUST be applied before basename matching.
`<old-basename>` comparison is case-insensitive.

#### Scenario: Alias overrides basename match

- GIVEN `--map legacy.mdb=current.accdb` and a link pointing to `\\server\legacy.mdb`
- AND a local file `current.accdb` exists under `--root`
- WHEN remapping is resolved
- THEN the link is remapped to `current.accdb` (not `legacy.mdb`)

---

### Requirement: FR-6 Chain Resolution

The system MUST follow linked-to-linked chains: if a target `.accdb` under
`--root` is itself a frontend that links to another file, the resolution MUST
continue until a non-linked (native) source is found. The system MUST detect
cycles and MUST NOT follow a chain deeper than 10 hops; a cycle or depth
overflow MUST produce an error entry and classify the link as `unresolved`.

#### Scenario: Two-hop chain resolves to real table

- GIVEN file A links to file B, and file B links to file C (which has native tables)
- WHEN chain resolution runs during `--apply`
- THEN the link in A is remapped to point at C's native table directly

#### Scenario: Cycle detected

- GIVEN file A links to B and file B links back to A
- WHEN chain resolution runs
- THEN the link is classified as `unresolved` with a cycle error entry; no write occurs for that link

#### Scenario: Max depth exceeded

- GIVEN a chain longer than 10 hops
- WHEN chain resolution runs
- THEN the link is classified as `unresolved` with a max-depth error entry

---

### Requirement: FR-7 Unresolved Link Handling

In `--dry-run` mode, unresolved links MUST be reported in the `unresolved[]`
array without any write. In `--apply` mode, unresolved links MUST be skipped
(left unchanged) unless `--remove-unresolved` is also specified.

#### Scenario: Dry-run reports unresolved

- GIVEN a link with no matching local file
- WHEN `--dry-run` is active
- THEN the link appears in `unresolved[]` and no file is modified

#### Scenario: Apply skips unresolved by default

- GIVEN an unresolved link during `--apply` without `--remove-unresolved`
- WHEN apply runs
- THEN the link is skipped and an entry is added to `unresolved[]`; the `.accdb` is not modified for this link

---

### Requirement: FR-8 Backup

Before applying any modification to a file, the system MUST write a copy of the
original file to `<original-path>.bak`. Backup MUST happen once per file (not
once per link). If `--no-backup` is specified, the backup step is skipped.
`--backup` is the default.

#### Scenario: Backup created before apply

- GIVEN `--apply` is active and `--backup` (default)
- WHEN the first link in a file is about to be rewritten
- THEN `<file>.bak` is created BEFORE any `RefreshLink` call

#### Scenario: No-backup skips copy

- GIVEN `--apply --no-backup`
- WHEN a file is modified
- THEN no `.bak` file is created and the operation proceeds directly

---

### Requirement: FR-9 Apply Mode

In `--apply` mode, the system MUST call `TableDef.RefreshLink` for each
`plannedRelink` after updating the `Connect` string. The `SourceTableName` and
`ForeignName` properties MUST be preserved unchanged. The new `DATABASE=` value
MUST be the absolute local path resolved under `--root`.

#### Scenario: Link updated and refreshed

- GIVEN a link classified as `plannedRelink` during `--apply`
- WHEN the apply step runs
- THEN `Connect` is updated with the local `DATABASE=` path and `RefreshLink` is called
- AND `SourceTableName` and `ForeignName` are unchanged

---

### Requirement: FR-10 Dry-Run Mode

`--dry-run` is the default mode. In dry-run mode, no file writes, `.bak`
creation, `RefreshLink` calls, or table deletions MAY occur. The system MUST
produce a complete plan report including all classifications.

#### Scenario: Default invocation is dry-run

- GIVEN `dysflow access relink-directory --root <dir>` (no mode flag)
- WHEN the command runs
- THEN no files are modified and the output includes `plannedRelinks`, `alreadyLocal`, `unresolved`

---

### Requirement: FR-11 Verify Mode

The system MUST support a post-apply verification pass activated by
`--strict-local` or `--deny-prefix`. Verify re-opens each scanned `.accdb`,
re-enumerates links, and checks the post-apply state. The result MUST include
`externalLinkCount`, `denyPrefixMatchCount`, and `brokenLinkCount`.

#### Scenario: Verify passes after successful apply

- GIVEN all links were remapped to local paths
- WHEN `--strict-local` verify runs
- THEN `externalLinkCount` is 0 and the exit code is 0

---

### Requirement: FR-12 Deny-Prefix

The system MUST accept one or more `--deny-prefix <prefix>` flags (repeatable,
case-insensitive match). During verify, any remaining link whose `DATABASE=`
value starts with a deny-prefix MUST be counted in `denyPrefixMatchCount`. If
`denyPrefixMatchCount > 0`, the process MUST exit non-zero.

#### Scenario: Deny-prefix match after apply fails verify

- GIVEN `--deny-prefix "\\datoste\"`  and a link still pointing to `\\datoste\share\back.accdb` after apply
- WHEN verify runs
- THEN `denyPrefixMatchCount` is 1 and exit code is non-zero

---

### Requirement: FR-13 Strict-Local

When `--strict-local` is supplied, the verify pass MUST fail (non-zero exit) if
`externalLinkCount > 0` after apply.

#### Scenario: Strict-local fails with remaining external link

- GIVEN one link could not be remapped (unresolved) and still points outside `--root`
- WHEN `--strict-local` verify runs
- THEN `externalLinkCount` is 1 and exit code is non-zero

---

### Requirement: FR-14 Remove-Unresolved

When `--remove-unresolved` is supplied alongside `--apply`, the system MUST
delete the `TableDef` for any link that remains unresolved after alias and
basename matching. This flag is explicit and MUST NOT activate by default.

#### Scenario: Unresolved link deleted when flag is set

- GIVEN an unresolved link and `--apply --remove-unresolved`
- WHEN apply runs
- THEN the `TableDef` is deleted from the `.accdb` and the link no longer appears in the table list

#### Scenario: Unresolved link preserved without flag

- GIVEN an unresolved link and `--apply` (no `--remove-unresolved`)
- WHEN apply runs
- THEN the `TableDef` is not deleted and appears in `unresolved[]`

---

### Requirement: FR-15 Password Handling

The system MUST support `--password-env <VAR_NAME>` (reads database password from
environment variable `VAR_NAME`) and `--password <value>` (direct value). If
both are supplied, `--password-env` MUST take precedence. Passwords MUST NOT be
logged in plain text in any output.

#### Scenario: Password read from env var

- GIVEN `--password-env DB_PASS` and `DB_PASS=secret`
- WHEN the Access file is opened
- THEN the password `secret` is used and does not appear in logs or `--json` output

---

### Requirement: FR-16 JSON Output

When `--json` is supplied, the system MUST write a machine-readable JSON object
to stdout as the sole output. The JSON MUST include at minimum:
`filesScanned`, `linksRemapped`, `alreadyLocal`, `unresolved`, `errors`,
`backupPaths`, `externalLinkCount` (post-apply), `denyPrefixMatchCount`,
`brokenLinkCount`.

#### Scenario: JSON output is valid and complete

- GIVEN `--json` and a successful dry-run
- WHEN the command completes
- THEN stdout is valid JSON containing all required top-level fields with correct types

---

### Requirement: FR-17 Timeout

The system MUST accept `--timeout-ms <ms>` (positive integer). The PowerShell
process MUST be terminated and an error returned if it does not complete within
the specified duration. The default SHOULD be sufficient for typical batches
(implementation-defined).

#### Scenario: Timeout kills long-running PS

- GIVEN `--timeout-ms 100` and a PS invocation that takes longer than 100 ms
- WHEN the command runs
- THEN the process is killed and the result contains a timeout error with non-zero exit code

---

### Requirement: FR-18 Audit Result Shape

Every execution MUST produce an audit result conforming to the defined shape
regardless of mode. Fields that are not applicable in a given mode (e.g.
`backupPaths` in dry-run) MUST be present with zero/empty values, not absent.

#### Scenario: Dry-run result has empty backupPaths

- GIVEN `--dry-run`
- WHEN the command completes
- THEN the result contains `backupPaths: []` (not a missing field)

---

### Requirement: FR-19 No Project.json Required

The `relink-directory` command MUST operate without a `.dysflow/project.json`
file. It is a directory-mode operation and MUST NOT fail if that file is absent.

#### Scenario: Works in directory with no project.json

- GIVEN a directory containing `.accdb` files and no `.dysflow/project.json`
- WHEN `dysflow access relink-directory --root <dir> --dry-run` runs
- THEN the command succeeds and produces results (does not error on missing project file)

---

### Requirement: FR-20 Locked File Handling

If an `.accdb` or `.mdb` file is locked by another process (i.e. an `.ldb`/
`.laccdb` exists and the open attempt fails), the system MUST record an error
entry for that file and continue processing remaining files in the batch.

#### Scenario: Locked file skipped, batch continues

- GIVEN file `a.accdb` is locked and file `b.accdb` is available
- WHEN `--apply` runs over the directory
- THEN `b.accdb` is processed normally and `a.accdb` appears in `errors[]` with a lock-related message
- AND exit code reflects partial completion (non-zero if errors are present)

---

## Non-Functional Requirements

### Requirement: NFR-1 Windows-Only

The system MUST document and enforce that `relink-directory` is only supported
on Windows with Microsoft Access installed (`DAO.DBEngine.120` available). On
non-Windows platforms or absent COM, the command MUST exit with a clear
unsupported-platform error.

#### Scenario: Missing COM exits cleanly

- GIVEN a machine without `DAO.DBEngine.120` registered
- WHEN the command is invoked
- THEN it exits non-zero with a human-readable message identifying the missing COM dependency

---

### Requirement: NFR-2 Audit Integration

The command MUST integrate with Dysflow's standard audit/operation logging
pipeline. It MUST NOT be a standalone script that bypasses core logging.

#### Scenario: Operation logged via core pipeline

- GIVEN a successful `--apply` run
- WHEN the command completes
- THEN an audit log entry is written through the standard Dysflow operation logging path

---

### Requirement: NFR-3 Unit Tests Without Access

Unit tests for the TypeScript CLI layer (arg parsing, handler, result formatting)
MUST NOT require Access to be installed. They MUST use a `FakeQueryService` or
equivalent mock of the PS bridge.

#### Scenario: Unit suite passes without COM

- GIVEN an environment with no `DAO.DBEngine.120`
- WHEN `vitest run` is executed for the unit test files
- THEN all unit tests pass without attempting any COM call

---

### Requirement: NFR-4 E2E Guard

Integration and E2E tests that exercise the actual PS bridge MUST skip when
`hasAccessCom()` returns `false`.

#### Scenario: E2E tests skip on non-Access machine

- GIVEN `hasAccessCom()` returns `false`
- WHEN the test runner executes E2E specs
- THEN each E2E test is marked as skipped, not failed

---

### Requirement: NFR-5 Single PS Invocation

The entire batch (all files under `--root`) MUST be processed in a single
PowerShell process invocation. The system MUST NOT spawn one PS process per
`.accdb` file.

#### Scenario: Single process for N files

- GIVEN a directory with 10 `.accdb` files
- WHEN `--apply` runs
- THEN exactly one PS child process is spawned for the entire batch

---

### Requirement: NFR-6 PR Size Budget

Each chained PR implementing this feature MUST NOT exceed 400 changed lines
(additions + deletions combined). Slices that would exceed this limit MUST be
further subdivided.

---

## Out of Scope

- Cross-OS support (Linux, macOS)
- GUI or TUI integration
- Non-Access databases (SQL Server, SQLite, etc.)
- Editing Access forms, queries, or reports — only `TableDef.Connect` is modified
- Remote/SMB backend mutation — new targets MUST reside inside `--root`
- Compaction or repair of `.accdb` files

---

## Open Questions

| # | Question | Raised By | Default Assumed |
|---|----------|-----------|-----------------|
| OQ-1 | When multiple local files share the same basename but different extensions (`.accdb` vs `.mdb`), which wins? | Spec | Treat as ambiguity → `unresolved` unless exactly one match after extension-inclusive comparison |
| OQ-2 | Should `--apply` without `--backup` require an explicit confirmation flag to protect against accidental data loss? | Spec | No confirmation required; `--no-backup` is explicit opt-out |
| OQ-3 | What is the default `--timeout-ms` value? | Spec | Implementation-defined; design phase MUST specify a concrete default |
| OQ-4 | Is the `--apply` exit code non-zero when any link is skipped/unresolved, or only when an error occurs? | Spec | Non-zero only when `errors[]` is non-empty; skipped/unresolved alone does not trigger non-zero |
| OQ-5 | Should verify run automatically after `--apply`, or only when `--strict-local`/`--deny-prefix` is present? | Spec | Verify runs only when at least one verification flag is supplied |
