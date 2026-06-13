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
- Integration/E2E: `vitest.integration.config.ts` (`test/e2e/**`, `test/scripts-access-runner.test.ts`) — requires Windows + Access COM.
- Real MCP E2E: `node E2E_testing/mcp-e2e.mjs` (requires `ACCESS_VBA_PASSWORD`).

## VBA semantic diff — behavioral contract

`verify_code` / `verify_binary` / `reconcile_binary` run in **semantic mode** by default. The job
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
- **Form serialization noise is a LOCKED allow-list** (`Checksum`, `PrtDevMode*`, `PrtDevNames*`,
  `PrtMip`, `RecSrcDt`, `LayoutCached*`, `PublishOption`, `NoSaveCTIWhenDisabled`). `NameMap` and
  `GUID` are functional — do not strip them. Unknown keys are retained (functional).
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
- A GitHub release **title must equal its tag name exactly** (e.g. tag `v1.2.8` → title `v1.2.8`).
- Keep business logic in `src/core`; never let domain logic leak into adapters.
- Update path security: the ONLY update mechanism is the GitHub Release tar.gz with SHA-256
  verification. There is NO git-clone / source-build fallback. See
  [`docs/security/update-trust-model.md`](./docs/security/update-trust-model.md).
