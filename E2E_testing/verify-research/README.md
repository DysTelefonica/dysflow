# `verify_code` exploration and design

Research-only evidence and an implementable design for the existing MCP `verify_code` path. Nothing here is an approved production change, compiler, runtime-equivalence proof, or new CLI design. The CLI availability probe is retained only as historical scope evidence.

## Safety boundary

- Never edits `E2E_testing/NoConformidades*.accdb` or `E2E_testing/src/**`.
- `probe-installed-cli.ps1` runs only `--version`, `--help`, and the unsupported-command probe `verify`; it does not open Access.
- The mutation matrix exercises the source classifier in-process and writes only `results/mutation-matrix.json`.
- The real integration test creates a unique `%TEMP%/dysflow-verify-integration-*` workspace and copies both Access fixtures there before any mutation.
- Never compile VBA, run `run_vba`, install into `%LOCALAPPDATA%\dysflow`, or kill `MSACCESS.EXE` by name.
- Real Access runs are serialized and require `ACCESS_VBA_PASSWORD`; never print its value.

## Historical reproduction commands

These record how evidence was obtained; they are not authorization to rerun Access. Run no Access-backed command without fresh approval.

```powershell
# Installed-command availability only; no Access.
pwsh -NoProfile -NonInteractive -File .\E2E_testing\verify-research\probe-installed-cli.ps1

# Controlled lexical classifier matrix; no Access. It exits 1 while goal gaps remain.
pnpm exec vitest run -c E2E_testing/verify-research/vitest.config.ts

# The single approved import diagnostic has already run once. Do not rerun it
# without fresh authorization; see ACCESS-DIAGNOSTIC-PLAN.md.

# Existing bounded real-Access integration. It copies both fixture databases to
# a unique temp directory before export/import and removes that directory in finally.
pnpm exec vitest run -c vitest.integration.config.ts test/integration/vba-source-comparison-real-fixture.test.ts
```

Do not use `pnpm test -- <paths>` or `pnpm test:integration -- <path>` here. With the current package scripts, the literal `--` reaches Vitest and the requested file filter is ignored; that can unintentionally start a much broader suite.

## Expected interpretation

The implementation scope is MCP `verify_code`. Historically, installed and source versions were both `4.3.2`; neither source `COMMANDS` nor installed help advertised `dysflow verify`, and the direct CLI probe returned exit 1 with `Unsupported command: verify`. That negative probe prevents conflating the MCP work with a CLI feature; it is not a request to design one.

`results/mutation-matrix.json` separates:

- the functional goal (`expectedFunctional`),
- expected current category characterization (`expectedCategories`),
- the observed current classifier verdict,
- `goalPass`, which compares only `actionable` with the functional goal,
- and `categoryPass`, which checks that separate characterization.

The Vitest file contains ordinary goal assertions. Known mismatches fail the command normally; no `test.fails`, xfail, skip, or inverted assertion masks them. Category characterization and recommendation consistency never decide whether a functional-goal assertion passes.

All 39 cases are lexical classifier probes, not valid/compiled-VBA or runtime-parity evidence. Helper snippets are self-contained where practical but are not compiled. Form text is an unproven SaveAsText-shaped mock, and synthetic attribute placement is not Access round-trip evidence. A mismatch does not authorize changing production code.

## Real-Access status

The existing integration covers baseline parity, line-ending/trailing-whitespace noise, strict-mode contrast, class attribute noise, form serialization noise, and a functional change. The first research execution reached the disposable class import and failed at `test/integration/vba-source-comparison-real-fixture.test.ts:226` because `importClass.ok` was false. Earlier assertions passed; later form/functional scenarios were not executed. The test discarded that failure envelope.

One separately approved, no-retry diagnostic then repeated only `list_objects` plus the same one class import on fresh disposable copies. The captured import envelope had both outer and nested `ok: true`; that—not the green Vitest wrapper—establishes the one-run import success. The wrapper asserts capture stage/result presence, golden hashes, and cleanup, so it may also finish green after capturing a failed import. The earlier failure was not reproduced and its cause remains unknown.

Golden hashes were unchanged and temp cleanup succeeded. Pre/post empty operation registries and registry health came from out-of-band MCP checks and were manually appended to the historical JSON; they are not emitted by regenerating the diagnostic harness. `passwordLogged: false` records declarative harness intent. The sanitizer and persisted artifact were reviewed for exposed paths/credentials, but no independent automated secret-scan proof is claimed. Copying the backend beside the frontend did not prove linked-table relinking or topology isolation; safety came from startup suppression and selecting only object inventory/code import operations.

## Still unexecuted against real Access

- missing and extra module directionality,
- duplicate module identity,
- incomplete export fail-closed behavior,
- whole-project repeat/cache freshness,
- paired `.cls` versus `.form.txt` evidence,
- every matrix case after the disposable class-import failure.

These remain explicitly unexecuted. The one-import harness, exact source imports, temp-copy boundary, sanitization, cleanup, no-retry rules, and observed non-reproduction are documented in [`ACCESS-DIAGNOSTIC-PLAN.md`](./ACCESS-DIAGNOSTIC-PLAN.md). No further Access run is authorized.

Conservative design notes and acceptance boundaries are in [`DESIGN.md`](./DESIGN.md).
