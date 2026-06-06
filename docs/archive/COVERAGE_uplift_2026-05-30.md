# Test Coverage Uplift — Living Plan (started 2026-05-30)

> Living handoff doc. Any agent can resume from here. Update checkboxes as you go:
> `[ ]` todo · `[~]` in progress · `[x]` done. Keep "Current state" accurate and always
> re-measure with `pnpm coverage` before claiming a number.

**Current state:** PLAN DRAFTED — no coverage work started yet. Branch coverage is the lagging
metric and the gate was lowered as tracked debt; goal is to earn it back.

---

## Why this exists

The branch-coverage threshold was lowered **82% → 77%** in commit `8793737`
("chore: lower branch coverage threshold to 77% while coverage debt is tracked").
The gate now passes by lowering the bar, not by adding tests. This plan earns the 82% back
with real tests, then restores the threshold.

## Baseline (measured 2026-05-30 via `pnpm coverage`)

| Metric | Current | Gate now | Target |
|--------|---------|----------|--------|
| Statements | 86.56% | 82 | keep ≥82 |
| **Branches** | **78.10%** | **77** (lowered) | **82** |
| Functions | 87.78% | 85 | keep ≥85 |
| Lines | 88.39% | 84 | keep ≥84 |

Branches is the only lagging metric. ~1716/2197 branches covered; reaching 82% needs roughly
**+85 covered branches**. Focus exclusively on branch coverage in the files below.

## How to re-measure
```powershell
pnpm coverage            # full table + summary
```
Read the per-file `% Branch` column and the `Uncovered Line #s`. Threshold lives in
`vitest.config.ts` → `test.coverage.thresholds`.

## Definition of done
- [ ] Overall branches ≥ 82% (verified by `pnpm coverage`)
- [ ] Raise `branches` threshold back to `82` in `vitest.config.ts`
- [ ] `pnpm test` and `pnpm build` green
- [ ] No production code changed just to game coverage (tests only, unless a real bug is found)
- [ ] CHANGELOG note that coverage debt is repaid and gate restored

---

## Prioritized worklist (lowest branch% / highest value first)

Each item: write tests until the file's branch coverage is meaningfully up, then check it off
with the new measured %. Inject dependencies; keep tests hermetic (no real Access/PowerShell/network).

- [ ] **`src/adapters/mcp/stdio.ts`** — 51.19% → target ~80%. Core protocol entry; uncovered: 255-272, 305. Highest single win.
- [ ] **`src/cli/commands/install/downloader.ts`** — 55.81% → target ~80%. The fragile install path (double win: coverage + install stability). Uncovered: 166-167, 195, 212. Cover checksum-missing, HTTP-not-OK, hash-mismatch branches.
- [ ] **`src/cli/commands/mcp.ts`** — 55.55% → target ~80%. Small file; uncovered 14, 24-25.
- [ ] **`src/cli/commands/access.ts`** — 58.82% → target ~80%. Uncovered 13, 25, 32, 38-43.
- [ ] **`src/cli/commands/tui.ts`** — 58.97% → target ~75%. Uncovered 85, 114, 133-185 (large block; may need render injection).
- [ ] **`src/core/services/vba-source-comparison.ts`** — 61.97% → target ~78%. Uncovered 322, 328, 340; the `as unknown as` failure paths.
- [ ] **`src/core/services/vba-form-service.ts`** — 63.41% → target ~78%. Uncovered 95, 145, 180, 193.
- [ ] **`src/adapters/http/http-services-factory.ts`** — 50% → target ~90%. Tiny; uncovered 34-38. Quick win.
- [ ] **`src/core/operations/access-operation-registry.ts`** — 72.89% → target ~82%. Uncovered ...46, 270, 286-287.
- [ ] **`src/core/operations/access-operation-cleanup.ts`** — 72.72% → target ~82%. Uncovered ...65, 177, 218, 229.
- [ ] **`src/core/operations/windows-processes.ts`** — 72.72% → target ~82%. Uncovered 39-65, 79, 112 (needs process-inspector injection).
- [ ] **`src/adapters/mcp/tools.ts`** — 76.63% → target ~82%. Large; uncovered 693-696, 714-718. Smaller marginal gains but high branch count.

> Note: `src/cli/commands/doctor.ts` branch coverage will have improved after the 2026-05-30
> opencode-mcp-wiring work — re-measure before targeting it.

## Suggested order of attack
1. Quick wins first to bank branches: `http-services-factory.ts`, `mcp.ts`, `access.ts`.
2. Then the high-value protocol/install files: `stdio.ts`, `downloader.ts`.
3. Then services + operations.
4. Re-measure after each file. Once overall ≥ 82%, flip the threshold and run the full suite.

## Test conventions in this repo (match these)
- Vitest, ESM, `.js` import extensions. Tests live under `test/**` mirroring `src/**`.
- Dependencies are injected via constructor options / context objects (see how
  `CliCommandContext` and service options are faked in `test/cli/**` and `test/core/services/**`).
- No real Access, PowerShell, or network in unit tests — inject fakes.
- English identifiers/comments.

## Related docs
- `docs/AUDIT_2026-05-30.md` — full project audit (coverage debt is listed as HIGH).
- `docs/INCIDENT_mcp-connection_2026-05-30.md` — MCP connection incident (added the doctor wiring tests).

## Progress log
- 2026-05-30 — Plan drafted from a fresh `pnpm coverage` baseline. No test work started yet.
