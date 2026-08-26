# Repository Quality Gates

Owner: repo-engineering-hardening

## Dependency audit evidence

The `main-integrity` job reports dependency audit evidence as `clean`,
`vulnerable`, or `unavailable`. High/critical advisories fail every main push.
Registry, protocol, malformed-response, and network failures are retried at
most three times and then fail the job. Pull requests do not repeat this audit;
their merge receives the exact-main-SHA audit before release automation may
continue. The job summary records the sanitized registry source, freshness,
attempts, and policy. `unavailable` is NEVER evidence that dependencies are clean.

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

## Pull-request and main-push authority

The full Windows quality and integration suites run against GitHub's synthetic
pull-request merge ref, so they verify the proposed change integrated with its
current base rather than the feature branch alone. Validated PR merges do not
repeat the full quality suite on the resulting `main` push. The lightweight
`main-integrity` job verifies the associated PR's merge, base, head, and green
CI identities, runs the fail-closed dependency audit, and preserves the exact
main-SHA `CI` conclusion consumed by release automation.

Direct, ambiguous, or API-unverifiable pushes remain fail-closed: they run the
complete Windows quality suite on `main`. Documentation-only pull requests keep
their existing path classification and omit code quality and integration jobs;
the same merged PR still receives the lightweight main integrity signal.

## Access E2E cadence and runner split

The full MCP battery runs from `main` every day at 02:17 UTC in
`.github/workflows/nightly-access-e2e.yml`. A nightly cadence bounds regression
detection to 24 hours without serializing every pull request behind the single
`dysflow-e2e` runner. The workflow queues overlapping nightlies rather than
cancelling an active Access operation.

The tag-only release gate in `.github/workflows/release.yml` remains mandatory
and unchanged.

Both workflows use the self-hosted Access runner, pre-staged fixture copies,
`ACCESS_VBA_PASSWORD`, and a repository-local `test-runtime`. Neither workflow
may fall back to the production runtime.

The issue #1503 audit classified the 30 previously unselected files as follows:

| Classification | Count | Evidence boundary |
|---|---:|---|
| Real Access / self-hosted | 17 | Access COM or DAO, `E2E_testing/*.accdb`, and password gates in the test files |
| Hosted Windows | 10 | In-memory MCP transports, pure filesystem/form transforms, or owned PowerShell child processes |
| Already in unit CI | 2 | Explicit `vitest.config.ts` includes for result-writer and temp-sweep contracts |
| No hosted signal | 1 | Every template-clone atom requires the gitignored `bench-cache` fixture |

The hosted subset is pinned by
`test/quality-gates/ci-workflow.test.ts` and runs in the existing
`windows-integration-smoke` job:

- `test/e2e/get-capabilities-write-policy-propagation.e2e.test.ts`
- `test/e2e/mcp-catalog-dryrun.e2e.test.ts`
- `test/e2e/mcp-harness-watchdog.e2e.test.ts`
- `test/e2e/mcp-input-validation.e2e.test.ts`
- `test/e2e/mcp-orphan-cleanup.e2e.test.ts`
- `test/e2e/mcp-query-validation.e2e.test.ts`
- `test/e2e/runtime-guard-mcp-integration.e2e.test.ts`
- `test/integration/form-ir-mutation-preservation.test.ts`
- `test/integration/mcp-harness-process-tree.test.ts`
- `test/integration/vba-manager-sentinel-trap.test.ts`

`test/integration/dysflow-result-writer-contract.test.ts` and
`test/integration/global-setup-temp-sweep.test.ts` stay in the unit suite.

The benchmark-only `test/integration/form-template-clone-bench.test.ts` stays
out of hosted CI until it has a deterministic committed or downloaded fixture.

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

> **CI is the authoritative gate.** Vitest uses two independent concurrency controls:
> `maxWorkers: 1` serializes test execution for Windows spawn stability, while
> `coverage.processingConcurrency: 1` serializes V8 coverage-result processing so the result does
> not depend on host CPU availability. The authoritative coverage measurement runs on the same
> Windows platform that hosts Microsoft Access and PowerShell in production.

The branch floor restores its historical 80% value after three repeated measurements converged
near 80.5%.

That leaves approximately 0.5 percentage points of measured margin; it does not claim
headroom comparable to the deliberately broader floors on the other metrics.

> Raise thresholds only after sustained coverage improvements and CI validation.

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

Call out skipped Pester execution with an explicit reason, such as no `pwsh` in the CI
environment for that run.
