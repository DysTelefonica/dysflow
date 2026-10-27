# Repository Quality Gates

Owner: repo-engineering-hardening

## Current gates

- `pnpm test` — Vitest unit suite (fast, no Access/PowerShell).
- `pnpm test:integration` — Vitest integration suite (requires Access/PowerShell).
- `pnpm test:e2e:mcp` — MCP E2E battery (`node E2E_testing/mcp-e2e.mjs`).
- `pnpm test:ps1` — PowerShell/Pester contracts (`pwsh -Command "Invoke-Pester scripts/tests/"`).
- `pnpm build` — TypeScript compile.
- `pnpm lint` — three-stage check:
  1. `node scripts/check-core-adapter-boundary.mjs` — `src/core` must not import `src/adapters`.
  2. `node scripts/check-optional-presence-guards.mjs` — no unchecked `in` / `hasOwnProperty` on optional config/params fields.
  3. `tsc -p tsconfig.json --noEmit && tsc -p tsconfig.test.json --noEmit && biome check src/ test/ scripts/ E2E_testing/`.
     Biome lint covers `src/`, `test/`, `scripts/*.mjs`, and all of `E2E_testing/*.mjs`.

     The battery is in scope with `noUndeclaredVariables` as an error.

     A name used without an import is a ReferenceError that would otherwise
     surface only in the 30-minute release run.

     Its formatter and unused-symbol rules stay off.
  - `pnpm format` / `pnpm format:check` — auto-format / verify formatting.
- `pnpm coverage` — Vitest coverage for `src/**/*.ts`.

## CI and release authority

Every pull request and every push to `main` runs one job, `CI`, in
`.github/workflows/ci.yml` on a hosted Linux runner: `pnpm lint`,
`pnpm build`, and `pnpm test`. `CI` is the single required status check on
`main`. No Windows, Access, or documentation-quality job runs per change.

Pull requests prove adapter-level contracts through the in-process MCP protocol
E2E tests listed in `UNIT_E2E_TESTS` (`test/e2e-suite-authority.ts`), which run
inside `pnpm test`.

The Access E2E battery runs automatically only when a release tag is pushed.
`.github/workflows/release.yml` repeats lint, build, and test in its
`quality-authority` job and runs `pnpm test:e2e:mcp:release` in its
`e2e-validation` job on the self-hosted `dysflow-e2e` runner. The GitHub Release
is published only after both succeed.

That job uses pre-staged fixture copies, `ACCESS_VBA_PASSWORD`, and a
repository-local `test-runtime`; it never falls back to the production runtime.
Configure `DYSFLOW_FIXTURES_SOURCE` with the runner-owned fixture directory
outside every Git checkout (currently `C:\actions-runner\_fixtures\dysflow`).

On demand, the same battery runs through the manual workflow
`.github/workflows/access-e2e-manual.yml` ("Access E2E (manual)",
`workflow_dispatch` only) on any branch, and is never a required check.

It builds from source and records the #1918 COM shutdown trace and Access crash
events by default. It can also run the real-Access Vitest suite.

CodeQL runs weekly and on `workflow_dispatch` (`.github/workflows/codeql.yml`),
not on pull requests.

## Manual Access suites

`test/e2e-suite-authority.ts` classifies every E2E/integration Vitest file
exactly once; `test/quality-gates/e2e-suite-authority.test.ts` pins that.

- `UNIT_E2E_TESTS` — in-process tests included in `pnpm test`.
- `PR_SMOKE_TESTS` — Windows smoke tests without real Access.
- `NIGHTLY_ACCESS_TESTS` — real-Access tests; run only this subset with
  `vitest run -c vitest.nightly-access.config.ts`.
- `E2E_EXEMPTIONS` — the manual template-clone benchmark, which needs a
  gitignored fixture.

`pnpm test:integration` runs both Windows subsets on a Windows host.

No workflow schedules the Windows or real-Access suites. Run them by hand when
a change touches Access COM, PowerShell, or form import paths.

## Coverage thresholds

> Coverage is a **regression floor and a diagnostic, not a target.** See
> [`testing-philosophy.md`](./testing-philosophy.md) for what a good test is. Never add an
> implementation-coupled test just to raise a number.

Thresholds are set at measured baseline minus a safety margin (ADR-6). Current floors:

| Metric     | Floor   |
|------------|---------|
| statements | 82%     |
| branches   | **80%** |
| functions  | 85%     |
| lines      | 84%     |

> **Coverage runs locally (`pnpm coverage`), not in CI.** Vitest uses two independent concurrency
> controls: `maxWorkers: 1` serializes test execution for Windows spawn stability, while
> `coverage.processingConcurrency: 1` serializes V8 coverage-result processing so the result does
> not depend on host CPU availability. Measure on Windows, the platform that hosts Microsoft
> Access and PowerShell in production.

The branch floor keeps its historical 80% value. Port-level coverage for the telemetry-evidence
CLI raises the deterministic Windows measurement from 80.55% to 80.97%.

That leaves approximately 0.9 percentage points of measured margin; it does not claim
headroom comparable to the deliberately broader floors on the other metrics.

> Raise thresholds only after sustained coverage improvements.

## PowerShell test quality rule

Tests for PowerShell runner behavior (scripts in `scripts/dysflow-access-runner.ps1`,
`scripts/dysflow-vba-manager.ps1`, and `scripts/lib/dysflow-access-com.ps1`) have a
single evidence rule.

They MUST assert observable behavior through a port-level Vitest contract or a Pester
behavior contract.

**Prohibited**: tests that read `.ps1` files and assert internal variable names, function-body
text, dispatcher-arm source snippets, or any source layout.

These assertions fail on behavior-preserving refactors (variable renames, code
reorganization) and violate the [testing philosophy](./testing-philosophy.md) north star.

**Required for PowerShell contracts**:

- Use Pester in `scripts/tests/*.Tests.ps1`, loading functions via AST extraction (not
  `readFileSync`/`toContain`). AST extraction is a *loader* only — never assert extracted
  function body text.
- Assert observable outputs: return values, emitted JSON/status, thrown error messages,
  and effects on mocked I/O seams (fake COM objects, fake filesystem, fake process spawn).
- For TS↔PowerShell runner contracts (command arguments, stdout/stderr, result JSON,
  diagnostics, cleanup), use `AccessPowerShellRunner` Vitest port tests with an injected
  `PowerShellExecutor` — no `.ps1` file reads.

**Gate**: run `pnpm test:ps1` when Pester coverage for PowerShell contracts changes.

No workflow runs Pester; run `pnpm test:ps1` locally with Pester **5.7.1**.

Call out skipped Pester execution with an explicit reason, such as no `pwsh` on the host.
