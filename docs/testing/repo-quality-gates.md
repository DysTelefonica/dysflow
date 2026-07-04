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
  3. `tsc -p tsconfig.json --noEmit && tsc -p tsconfig.test.json --noEmit && biome check src/ test/ scripts/ E2E_testing/_helpers/`.
     Biome lint covers `src/`, `test/`, `scripts/*.mjs`, and `E2E_testing/_helpers/*.mjs`.
  - `pnpm format` / `pnpm format:check` — auto-format / verify formatting.
- `pnpm coverage` — Vitest coverage for `src/**/*.ts`.

## Coverage thresholds

> Coverage is a **regression floor and a diagnostic, not a target.** See
> [`testing-philosophy.md`](./testing-philosophy.md) for what a good test is. Never add an
> implementation-coupled test just to raise a number.

Thresholds are set at measured baseline minus a safety margin (ADR-6). Current floors:

| Metric     | Floor   |
|------------|---------|
| statements | 82%     |
| branches   | **78%** |
| functions  | 85%     |
| lines      | 84%     |

> **CI is the authoritative gate.** The unit suite is serialized with `maxWorkers: 1` for
> Windows spawn stability, but Linux v8 coverage still measures slightly lower than local
> Windows for the same source (~79.7% Linux vs ~80.3% local). The branch floor of 78%
> absorbs this environment variance and prevents false-gate flakes on every push.

> Raise thresholds only after sustained coverage improvements and CI validation.

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
