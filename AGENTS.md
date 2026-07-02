# AGENTS.md — dysflow

Canonical guide for **any** agent working in this repo — Claude Code, OpenCode/Codex, or otherwise.
This file is authoritative. Claude Code loads it via `CLAUDE.md` (which imports this file). Read it
before working, and do not silently override it.

## What this is

dysflow — a TypeScript **MCP + CLI runtime** that drives Microsoft Access (VBA sync, query tools,
the Access runner) through PowerShell scripts. Architecture is **hexagonal / clean**:

- `src/core` — domain and use cases (no dependency on adapters).
- `src/adapters` — MCP, HTTP, vba-sync, and the I/O boundaries.
- `src/cli` — command surface.

## Testing — READ THIS BEFORE WRITING ANY TEST

The authoritative testing criterion lives in **[`docs/testing/testing-philosophy.md`](./docs/testing/testing-philosophy.md)**.
Read it. The essence:

- **North star: a test must survive any internal refactor that preserves observable behavior.**
  If a behavior-preserving refactor turns the suite red, the test is the defect — fix the test.
- The real axis is **behavior vs implementation**, not unit vs e2e.
- **Test at the ports.** Exercise real domain/use-case logic; mock ONLY the I/O adapters
  (Access COM / PowerShell spawn, filesystem, network). Never assert on internal call order,
  private collaborators, or internal data shape.
- **Coverage is a diagnostic floor, not a target** (see
  [`docs/testing/repo-quality-gates.md`](./docs/testing/repo-quality-gates.md)). Never add an
  implementation-coupled test just to move a coverage number.

Commands:
- Unit/spec: `pnpm test` (`vitest.config.ts`).
- Integration/E2E: `vitest.integration.config.ts` (`test/e2e/**`, `test/integration/**`) — requires Windows + Access COM.
- Real MCP E2E: `node E2E_testing/mcp-e2e.mjs` (requires `ACCESS_VBA_PASSWORD`).

## VBA semantic diff — behavioral contract

`verify_code` (the single source/binary compare tool) runs in **semantic mode** by default. The job
is to keep `actionableDifferent` honest: a consuming agent decides what to sync based on it, so
non-functional noise must NEVER be reported as actionable. Full taxonomy lives in the README
([Semantic diff classification](./README.md#semantic-diff-classification)); the core is
`src/core/services/vba-semantic-classifier.ts`. Invariants — preserve them when editing:

- **Bias to functional.** When in doubt, classify as actionable. Only collapse a difference to a
  non-actionable category when you are certain it cannot change runtime behavior.
- **Case is non-functional only outside strings/comments.** VBA is case-insensitive for
  identifiers/keywords and the VBE re-cases them on import (`caseOnly`). Folding is **string-aware**:
  string-literal and comment bodies are compared case-sensitively, because their content is
  runtime-visible. Never fold the whole line blindly.
- **Lossy encoding (`►` → `?`) is `encodingOnly` outside string literals only.** A glyph change
  inside a quoted string stays functional.
- **A leading BOM / mojibake-BOM (`?Attribute VB_Name…`, U+FEFF, U+FFFD) on one side is stripped**
  before comparison — it is never functional. But a `VB_Name` VALUE change (e.g. `MigracionIssue18`
  vs `ModuloMigracionIssue18`) MUST stay actionable; only the leading marker is stripped, never the
  name itself.
- **Module/class header boilerplate is non-functional**: `Attribute VB_*` lines (in code modules
  AND a form's embedded `CodeBehindForm`) and the `VERSION x.x CLASS` + `BEGIN…END` instancing block
  are stripped — an Access export may emit them on one side only. `VB_Name` is the exception: it is
  functional whenever the two sides disagree — a real rename (both name it, values differ) OR one
  side omitting it entirely (a dropped-identity import defect, #646); non-functional only when both
  carry the same name or both omit it. A `.frm` starts with `VERSION 5.00` and a control `Begin…End`
  tree — that is functional and must NOT be stripped; only `VERSION <num> CLASS` headers are.
- **A form's code-behind is verified through its `forms/*.cls`, NOT its `.form.txt`.** The code lives
  canonically in the `.cls` (export writes it from `CodeModule.Lines`; import syncs it back into the
  document module). The `.form.txt` `CodeBehindForm` section is the same code serialized a second way
  (`SaveAsText`), so the classifier strips everything from `CodeBehindForm` onward and compares a
  `.form.txt` for its **UI/layout only**. Never compare form code-behind through the `.form.txt` — it
  double-counts and re-imports the serialization noise the `.cls` already owns.
- **Form serialization noise is an allow-list** (`Checksum`, `PrtDevMode*`, `PrtDevNames*`,
  `PrtMip`, `RecSrcDt`, `LayoutCached*`, `PublishOption`, `NoSaveCTIWhenDisabled`). `GUID` is
  functional — do not strip it. Unknown keys are retained (functional).
- **Toggle-property serialization is equivalent**: `Visible =0` ≡ `Visible = NotDefault` ≡
  `Visible =-1`. Access only serializes a non-default value, so the written value is always the same
  and only its `NotDefault`/`0`/`-1` representation varies. This collapse is value-token scoped — a
  non-toggle value (`Width =9070`, `SomeEnum =2`) stays exact and functional.
- **Strict mode (`strict: true`) bypasses every noise bucket** and does byte/text-exact comparison.
- Per-module `diff: true` entries expose `classification`, `reason`, `isActionable`,
  `recommendedAction`, and unique-line counts — these are the consumer contract; keep them additive.

## Hard rules

- **Never** build/install to or modify the production runtime at `%LOCALAPPDATA%\dysflow` or
  `~/.config/opencode/opencode.json` during development/testing. Build to the throwaway
  `test-runtime/` and point E2E at it with `DYSFLOW_E2E_COMMAND`.
- Conventional commits. No AI co-author / attribution lines in commit messages.
- A GitHub release **title must equal its tag name exactly** (e.g. tag `v1.2.8` → title `v1.2.8`). Enforced
  by CI via `.github/workflows/release-title-guard.yml` (`release: [created, edited]`); the job fails when the
  two values differ and the error message names both so a maintainer can re-set the title in the GitHub UI
  without re-running the workflow. `release.yml` also passes `name: ${{ github.ref_name }}` to the softprops
  action so the release is born matching the tag (defense-in-depth — the guard catches post-creation edits).
- Keep business logic in `src/core`; never let domain logic leak into adapters.
- Update path security: the ONLY update mechanism is the GitHub Release tar.gz with SHA-256
  verification. There is NO git-clone / source-build fallback. See
  [`docs/security/update-trust-model.md`](./docs/security/update-trust-model.md).
- **`export_all` prune is destructive — preserve its guards.** When `prune: true`, deletions are
  gated on a fully clean export (skip on ANY warning), scoped to managed source extensions
  (`.bas`/`.cls`/`.form.txt`/`.report.txt`), keyed off the export's own `exported` list, and the
  saved-queries folder is never scanned. `prune` + `filter` is rejected (`INVALID_INPUT`) because a
  filtered export would make every non-matching file look orphaned. Never weaken these when editing
  `exportAllWithPrune` in `src/adapters/vba-sync/vba-modules-adapter.ts`. The legacy `.frm` binary
  form format is **not** in the managed allow-list — prune must leave `.frm` files alone, even when
  no matching VBE module exists. See issue #619.

## MCP workflow recipes

Use these recipes before calling individual MCP tools. They keep Access automation auditable,
recoverable, and aligned with the write-gate contract.

### Bootstrap / doctor / config verification

1. Confirm the repo has `.dysflow/project.json`; if it does not, ask the human for frontend/backend
   paths and run `dysflow setup --write-project --project-id <id> --access-path <frontend.accdb>`
   with `--backend-path <backend.accdb>` when the project is split.
2. Keep secrets in environment variables, never in committed config.
3. Run `dysflow doctor` before tool calls and prefer short MCP payloads with `projectId` once the
   project is configured.

### Daily VBA sync loop

1. Inspect drift with `verify_code` or export the current binary with `export_all` when the binary is
   the source to mirror.
2. Edit disk source.
3. Import only the touched modules with `import_modules` when possible; use `import_all` only for a
   whole-tree resync.
4. Compile with `compile_vba` after standard/class module edits.
5. Re-run `verify_code` and the focused `test_vba` plan before trusting the binary.

### Timeout and orphan recovery

1. Start with `dysflow_access_operations_list` to see tracked operationId, PID, status, and target
   path.
2. Use `dysflow_access_cleanup` without `force` to reconcile stale terminal records; this path kills
   nothing.
3. Use `dysflow_access_force_cleanup_orphaned` without `confirmPid` to list orphan candidates.
4. Pass `confirmPid` only after verifying the process is headless, holds the same `accessPath`, and
   is not owned by a running Dysflow operation.
5. Never kill `MSACCESS.EXE` by process name.

### Safe write enablement

1. Run write-capable tools with `dryRun` first whenever the tool supports it.
2. `dysflow mcp` (stdio) enables writes by default — the stdio surface is process-ownership-trusted.
   Scope a repo to read-only with `"allowWrites": false` in `.dysflow/project.json`, or start the
   whole session read-only with `dysflow mcp --disable-writes`. `dysflow serve` (HTTP) still starts
   writes-disabled by default; enable it explicitly per session with `--enable-writes` only for
   trusted local maintenance.
3. Use `apply: true` only for intentional writes after reviewing the dry-run plan.
4. Treat `MCP_WRITES_DISABLED` as a safety stop, not as a reason to bypass the adapter.

### Frontend vs backend target selection

- Use `accessPath` for the frontend `.accdb` that owns VBA/forms/reports and linked table defs.
- Use `backendPath` for the split data backend when relinking or comparing backend data.
- Use `databasePath` or its alias `sourcePath` for SQL/schema tools when you need an explicit target
  and do not want project config fallback to choose for you.
- Explicit per-call overrides win over `.dysflow/project.json`; use them when diagnosing context
  skew.

### Form/report sync ownership

- Code-behind lives in `.cls`; layout lives in `.form.txt` or `.report.txt`.
- Edit behavior in the `.cls`, then `import_modules` and `compile_vba` where headless compilation can
  verify the module.
- Edit controls/layout in `.form.txt`, then `import_modules`; ask the user to manually compile forms
  or reports when Access cannot verify document modules headlessly.
- Verify form behavior through the `.cls` with `verify_code`; do not treat embedded
  `CodeBehindForm` serialization as the source of truth.

## Form inspection and generation — agent guide

These MCP tools let agents read and author Access forms offline, without opening Access.

### inspect_form — read the control tree of an existing form

```
inspect_form({ sourcePath: "forms/Form_MyForm.form.txt" })
```

Returns `{ name, kind, controls, events }`:
- `name` — form name (derived from filename; prefix `Form_`/`Report_` and suffix `.form.txt` are stripped).
- `kind` — `"Form"` or `"Report"`.
- `controls` — flat array of `{ name, type, properties }` objects for every named control in the tree.
- `events` — array of event-procedure names bound at the form level (e.g. `"OnOpen"`, `"OnClose"`).

Works **offline** — reads the version-controlled `.form.txt` source file directly, no Access/COM required.
Read-only: never mutates any file.

The `path` parameter is accepted as an alias for `sourcePath`. The tool returns
`FORM_SPEC_MISSING` if neither is provided, and `FORM_NOT_FOUND` if the file cannot be read.

### validate_form_spec / generate_form — design and write a new form

1. **`validate_form_spec`** — parse and lint a JSON form specification (`.form.json`).
2. **`generate_form`** — write a `.form.json` stub from the spec. This does **not** create or
   compile a live Access form; it produces the source artifact that `import_all` or `import_modules`
   later synchronises into the database.

### catalog_add_control / harvest_form_catalog — control catalog management

- **`harvest_form_catalog`** — scan existing forms and index their controls into a catalog file.
- **`catalog_add_control`** — add or update a single control definition in the catalog.

### Key source paths

| Artifact | Path convention |
|---|---|
| Form SaveAsText export | `forms/Form_<Name>.form.txt` |
| Form code-behind (VBA) | `forms/<Name>.cls` |
| Report SaveAsText export | `reports/Report_<Name>.report.txt` |
| Form JSON spec | `forms/<Name>.form.json` (generated by `generate_form`) |

When verifying form code changes use `verify_code` against the `.cls` file — never compare
code-behind through the `.form.txt` (it is serialization noise; see VBA semantic diff section above).

### FormIR — intermediate representation (for implementors)

- **A form's code-behind is verified through its `forms/*.cls`, NOT its `.form.txt`.** The code lives
  canonically in the `.cls` (export writes it from `CodeModule.Lines`; import syncs it back into the
  document module). The `.form.txt` `CodeBehindForm` section is the same code serialized a second way
  (`SaveAsText`), so the classifier strips everything from `CodeBehindForm` onward and compares a
  `.form.txt` for its **UI/layout only**. Never compare form code-behind through the `.form.txt` — it
  double-counts and re-imports the serialization noise the `.cls` already owns.
- **Form serialization noise is an allow-list** (`Checksum`, `PrtDevMode*`, `PrtDevNames*`,
  `PrtMip`, `RecSrcDt`, `LayoutCached*`, `PublishOption`, `NoSaveCTIWhenDisabled`). `GUID` is
  functional — do not strip it. Unknown keys are retained (functional).
- **Toggle-property serialization is equivalent**: `Visible =0` ≡ `Visible = NotDefault` ≡
  `Visible =-1`. Access only serializes a non-default value, so the written value is always the same
  and only its `NotDefault`/`0`/`-1` representation varies. This collapse is value-token scoped — a
  non-toggle value (`Width =9070`, `SomeEnum =2`) stays exact and functional.
- **Strict mode (`strict: true`) bypasses every noise bucket** and does byte/text-exact comparison.
- Per-module `diff: true` entries expose `classification`, `reason`, `isActionable`,
  `recommendedAction`, and unique-line counts — these are the consumer contract; keep them additive.

## Hard rules

- **Never** build/install to or modify the production runtime at `%LOCALAPPDATA%\dysflow` or
  `~/.config/opencode/opencode.json` during development/testing. Build to the throwaway
  `test-runtime/` and point E2E at it with `DYSFLOW_E2E_COMMAND`.
- Conventional commits. No AI co-author / attribution lines in commit messages.
- A GitHub release **title must equal its tag name exactly** (e.g. tag `v1.2.8` → title `v1.2.8`). Enforced
  by CI via `.github/workflows/release-title-guard.yml` (`release: [created, edited]`); the job fails when the
  two values differ and the error message names both so a maintainer can re-set the title in the GitHub UI
  without re-running the workflow. `release.yml` also passes `name: ${{ github.ref_name }}` to the softprops
  action so the release is born matching the tag (defense-in-depth — the guard catches post-creation edits).
- Keep business logic in `src/core`; never let domain logic leak into adapters.
- Update path security: the ONLY update mechanism is the GitHub Release tar.gz with SHA-256
  verification. There is NO git-clone / source-build fallback. See
  [`docs/security/update-trust-model.md`](./docs/security/update-trust-model.md).
- **`export_all` prune is destructive — preserve its guards.** When `prune: true`, deletions are
  gated on a fully clean export (skip on ANY warning), scoped to managed source extensions
  (`.bas`/`.cls`/`.form.txt`/`.report.txt`), keyed off the export's own `exported` list, and the
  saved-queries folder is never scanned. `prune` + `filter` is rejected (`INVALID_INPUT`) because a
  filtered export would make every non-matching file look orphaned. Never weaken these when editing
  `exportAllWithPrune` in `src/adapters/vba-sync/vba-modules-adapter.ts`. The legacy `.frm` binary
  form format is **not** in the managed allow-list — prune must leave `.frm` files alone, even when
  no matching VBE module exists. See issue #619.

## MCP workflow recipes

Use these recipes before calling individual MCP tools. They keep Access automation auditable,
recoverable, and aligned with the write-gate contract.

### Bootstrap / doctor / config verification

1. Confirm the repo has `.dysflow/project.json`; if it does not, ask the human for frontend/backend
   paths and run `dysflow setup --write-project --project-id <id> --access-path <frontend.accdb>`
   with `--backend-path <backend.accdb>` when the project is split.
2. Keep secrets in environment variables, never in committed config.
3. Run `dysflow doctor` before tool calls and prefer short MCP payloads with `projectId` once the
   project is configured.

### Daily VBA sync loop

1. Inspect drift with `verify_code` or export the current binary with `export_all` when the binary is
   the source to mirror.
2. Edit disk source.
3. Import only the touched modules with `import_modules` when possible; use `import_all` only for a
   whole-tree resync.
4. Compile with `compile_vba` after standard/class module edits.
5. Re-run `verify_code` and the focused `test_vba` plan before trusting the binary.

### Timeout and orphan recovery

1. Start with `dysflow_access_operations_list` to see tracked operationId, PID, status, and target
   path.
2. Use `dysflow_access_cleanup` without `force` to reconcile stale terminal records; this path kills
   nothing.
3. Use `dysflow_access_force_cleanup_orphaned` without `confirmPid` to list orphan candidates.
4. Pass `confirmPid` only after verifying the process is headless, holds the same `accessPath`, and
   is not owned by a running Dysflow operation.
5. Never kill `MSACCESS.EXE` by process name.

### Safe write enablement

1. Run write-capable tools with `dryRun` first whenever the tool supports it.
2. `dysflow mcp` (stdio) enables writes by default — the stdio surface is process-ownership-trusted.
   Scope a repo to read-only with `"allowWrites": false` in `.dysflow/project.json`, or start the
   whole session read-only with `dysflow mcp --disable-writes`. `dysflow serve` (HTTP) still starts
   writes-disabled by default; enable it explicitly per session with `--enable-writes` only for
   trusted local maintenance.
3. Use `apply: true` only for intentional writes after reviewing the dry-run plan.
4. Treat `MCP_WRITES_DISABLED` as a safety stop, not as a reason to bypass the adapter.

### Frontend vs backend target selection

- Use `accessPath` for the frontend `.accdb` that owns VBA/forms/reports and linked table defs.
- Use `backendPath` for the split data backend when relinking or comparing backend data.
- Use `databasePath` or its alias `sourcePath` for SQL/schema tools when you need an explicit target
  and do not want project config fallback to choose for you.
- Explicit per-call overrides win over `.dysflow/project.json`; use them when diagnosing context
  skew.

### Form/report sync ownership

- Code-behind lives in `.cls`; layout lives in `.form.txt` or `.report.txt`.
- Edit behavior in the `.cls`, then `import_modules` and `compile_vba` where headless compilation can
  verify the module.
- Edit controls/layout in `.form.txt`, then `import_modules`; ask the user to manually compile forms
  or reports when Access cannot verify document modules headlessly.
- Verify form behavior through the `.cls` with `verify_code`; do not treat embedded
  `CodeBehindForm` serialization as the source of truth.

## Form inspection and generation — agent guide

These MCP tools let agents read and author Access forms offline, without opening Access.

### inspect_form — read the control tree of an existing form

```
inspect_form({ sourcePath: "forms/Form_MyForm.form.txt" })
```

Returns `{ name, kind, controls, events }`:
- `name` — form name (derived from filename; prefix `Form_`/`Report_` and suffix `.form.txt` are stripped).
- `kind` — `"Form"` or `"Report"`.
- `controls` — flat array of `{ name, type, properties }` objects for every named control in the tree.
- `events` — array of event-procedure names bound at the form level (e.g. `"OnOpen"`, `"OnClose"`).

Works **offline** — reads the version-controlled `.form.txt` source file directly, no Access/COM required.
Read-only: never mutates any file.

The `path` parameter is accepted as an alias for `sourcePath`. The tool returns
`FORM_SPEC_MISSING` if neither is provided, and `FORM_NOT_FOUND` if the file cannot be read.

### validate_form_spec / generate_form — design and write a new form

1. **`validate_form_spec`** — parse and lint a JSON form specification (`.form.json`).
2. **`generate_form`** — write a `.form.json` stub from the spec. This does **not** create or
   compile a live Access form; it produces the source artifact that `import_all` or `import_modules`
   later synchronises into the database.

### catalog_add_control / harvest_form_catalog — control catalog management

- **`harvest_form_catalog`** — scan existing forms and index their controls into a catalog file.
- **`catalog_add_control`** — add or update a single control definition in the catalog.

### Key source paths

| Artifact | Path convention |
|---|---|
| Form SaveAsText export | `forms/Form_<Name>.form.txt` |
| Form code-behind (VBA) | `forms/<Name>.cls` |
| Report SaveAsText export | `reports/Report_<Name>.report.txt` |
| Form JSON spec | `forms/<Name>.form.json` (generated by `generate_form`) |

When verifying form code changes use `verify_code` against the `.cls` file — never compare
code-behind through the `.form.txt` (it is serialization noise; see VBA semantic diff section above).

### FormIR — intermediate representation (for implementors)

`src/core/models/form-ir.ts` defines `FormIR`, the in-memory tree produced by `parseFormTxt`.
Entries use **ordered arrays** (not maps) so duplicate keys (e.g. `NoSaveCTIWhenDisabled` appearing
twice in frmBusy) are preserved verbatim. Blob entries (`Key = Begin…End`) are kept opaque.
`codeBehind` is the raw VBA text after the `CodeBehindForm` marker, or `null` when absent.

### MCP real-world examples reference

For copy-pasteable, concrete JSON input payloads for everyday MCP tasks, see
[`docs/mcp-examples.md`](./docs/mcp-examples.md).

## Companion tool: codegraph-vba

For structural analysis, caller tracing, and impact analysis of the VBA/Access codebase, use the **`codegraph-vba`** MCP server.

Available custom agent skills in `codegraph-vba`:
- **`vba-event-tracer`**: Traces event declarations, raise sites, and custom `WithEvents` event handlers.
- **`vba-handler-backtrace`**: Traces form control event handlers, dynamic calls, circular references, UDT parameters, and reconstructs multiline SQL statements.
- **`vba-sql-impact`**: Traces database tables/columns touched by saved queries, extracts `RecordSource` and `RowSource` layout properties, and resolves SQL table aliases.
