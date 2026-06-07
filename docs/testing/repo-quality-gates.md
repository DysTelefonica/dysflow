# Repository Quality Gates

Owner: repo-engineering-hardening

## Current gates

- `pnpm test` runs the Vitest suite.
- `pnpm build` runs the TypeScript build.
- Lint uses TypeScript strict checking, Biome, and the optional config/params presence guard through `pnpm lint`
  (`node scripts/check-optional-presence-guards.mjs && tsc -p tsconfig.json --noEmit && tsc -p tsconfig.test.json --noEmit && biome check src/ test/`). Use
  `pnpm format` to auto-format, `pnpm format:check` to verify.
- `pnpm coverage` runs Vitest coverage for `src/**/*.ts`.

## Coverage thresholds

> Coverage is a **regression floor and a diagnostic, not a target.** See
> [`testing-philosophy.md`](./testing-philosophy.md) for what a good test is. Never add an
> implementation-coupled test just to raise a number.

Thresholds are set at measured baseline minus 2 percentage points (ADR-6).
Current floors (raised in GH #372 — branch coverage improvement):

| Metric     | Floor |
|------------|-------|
| statements | 82%   |
| branches   | 80%   |
| functions  | 85%   |
| lines      | 84%   |

> The CI quality gate runs `pnpm coverage` on Linux (ubuntu), where
> Windows/PowerShell-specific branches do not execute. CI branch coverage
> (~81.15%) is therefore slightly below a local Windows run (~82.08%). **CI is the
> authoritative gate — floors must stay at or below the CI measurement.** The
> branch floor is 80% (≈1pp margin under CI).

Raise the thresholds after significant coverage improvements.

## PowerShell test quality rule

Tests for PowerShell runner behavior (scripts in `scripts/dysflow-access-runner.ps1`,
`scripts/dysflow-vba-manager.ps1`, and `scripts/lib/dysflow-access-com.ps1`) MUST assert
observable behavior through a port-level Vitest contract or a Pester behavior contract.

**Prohibited**: tests that read `.ps1` files and assert internal variable names, function-body
text, dispatcher-arm source snippets, or any source layout. These assertions fail on
behavior-preserving refactors (variable renames, code reorganization) and violate the
[testing philosophy](./testing-philosophy.md) north star.

**Required for PowerShell contracts**:
- Use Pester in `scripts/tests/*.Tests.ps1`, loading functions via AST extraction (not
  `readFileSync`/`toContain`). AST extraction is a *loader* only — never assert extracted
  function body text.
- Assert observable outputs: return values, emitted JSON/status, thrown error messages,
  and effects on mocked I/O seams (fake COM objects, fake filesystem, fake process spawn).
- For TS↔PowerShell runner contracts (command arguments, stdout/stderr, result JSON,
  diagnostics, cleanup), use `AccessPowerShellRunner` Vitest port tests with an injected
  `PowerShellExecutor` — no `.ps1` file reads.

**Gate**: `pnpm test:ps1` should be run when Pester coverage for PowerShell contracts changes.
Skipped Pester execution must be called out with an explicit reason (e.g., no pwsh available
in CI environment for this run).
