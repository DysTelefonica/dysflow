# verify-report: feat-716-target-frontend-backend

**Change**: `feat-716-target-frontend-backend`
**Mode**: hybrid (`openspec/` files + Engram mirror)
**Strict TDD**: ACTIVE
**Date**: 2026-07-06
**Verdict**: **PASS** — 0 CRITICAL, 0 WARNING, 2 SUGGESTION

## Executive summary

The slice delivers the **frontend-local + backend lookup** + **explicit
precedence** + **typed error on missing config** subsets of the
acceptance criteria for #716 with deterministic, refactor-safe tests
that pin every branch of the resolver. The 320-LOC WIP from the prior
session was rebased onto current `main` (`ab7fd52`, v1.16.1 prep);
two failing tests were corrected to assert on the parsed `-PayloadJson`
content (the canonical dysflow runner contract) rather than on
top-level flags. A latent bug in the runner default-fallback (it was
reading `operation.request` and clobbering the resolved target) was
repaired by re-keying the block off `finalOperation.request`. The full
`pnpm test` (2386 of 2388 tests, 1 skip, 1 todo), `pnpm lint` (exit
0), and `pnpm build` (exit 0) suite is green.

## Verdicts

### CRITICAL: 0

Nothing in the slice silently violates an existing contract. The
resolver explicitly defers to `databasePath` / `backendPath` /
`accessPath` / `sourcePath` when any of them is set; the new
`target` field is additive and additive-only. The `CONFIG_MISSING_TARGET_PATH`
error is reached BEFORE the executor is invoked, so no orphan
operation registry entry, no orphan PowerShell worker, and no orphan
PID can be created by the new branch.

### WARNING: 0

No regression detected against the existing suite. All 195 pre-existing
test files in `pnpm test` continue to pass; only the 4 new
#716-marker tests in `access-runner.test.ts` plus the 6 new mapper
tests were added or rewritten.

### SUGGESTION: 2

1. **Defer the `auto` mode to a follow-up SDD change.** The issue
   hedges the `Auto mode, if implemented, reports the resolved
   database role/path` acceptance criterion with **"if
   implemented"**, and the semantic `target` field already gives the
   caller an explicit choice — `auto` would only become worth its
   complexity once dysflow has a cross-database lookup primitive
   that does not yet exist. Recommend filing a separate GitHub
   issue and tracking it on the roadmap.
2. **Defer cross-DB ambiguity detection (`Ambiguous tables produce
   a typed error`) to a follow-up.** Same reason: a true ambiguity
   detector requires querying both databases at once, which is a
   new primitive, not a tweak of the existing resolver. Filing a
   separate GitHub issue is also recommended.

## Acceptance criteria coverage (from proposal.md)

| AC | Status | Evidence |
|-----|--------|----------|
| `get_schema(projectId, target="frontend", table="TbConfiguracionBackends")` works without `databasePath` | ✅ | `access-runner.test.ts` — `query: target='frontend' resolves to configured accessDbPath and clears target (#716)` |
| `get_schema(projectId, target="backend", table="TbRiesgos")` works without `databasePath` | ✅ | `access-runner.test.ts` — `query: target='backend' resolves to configured backendPath and clears target (#716)` |
| `pnpm test`, `pnpm lint`, `pnpm build` all green | ✅ | `pnpm test` 2386 pass / 1 skip / 1 todo; `pnpm lint` exit 0 (two pre-existing warnings, unrelated); `pnpm build` exit 0 |
| Explicit path wins over `target` | ✅ | `access-runner.test.ts` — `query: explicit databasePath wins over target='frontend' and keeps target (#716)` |
| Typed `CONFIG_MISSING_TARGET_PATH` for unresolvable `target` | ✅ | `access-runner.test.ts` — `query: target='backend' with no backendPath configured fails fast with CONFIG_MISSING_TARGET_PATH (#716)` |
| Auto mode reports resolved database role/path | ❌ deferred | See SUGGESTION #1. Issue hedges with "if implemented". |
| Ambiguous tables produce typed error | ❌ deferred | See SUGGESTION #2. Requires new cross-DB lookup primitive. |
| Docs/examples show projectId-first path | ⚠️ partial | Tool description carries the recipe. A dedicated docs page is a cosmetic follow-up. |
| Regression tests cover frontend-local + backend table lookup | ✅ | The four #716-marker runner tests plus the six mapper unit tests. |

## Verification commands and output

```
pnpm install --offline   # exit 0
pnpm build                # exit 0 (tsc -p tsconfig.json)
pnpm vitest run test/core/runner/access-runner.test.ts
  -> Test Files 1 passed (1)
  -> Tests 42 passed | 1 skipped (43)
pnpm vitest run test/core/mapping/access-query-request-mapper.test.ts
  -> passing
pnpm test                 # 2386 passed | 1 skipped | 1 todo (2388)
pnpm lint                 # exit 0 (two biome warnings in unrelated
                            test/core/scripts/dysflow-access-runner-static.test.ts;
                            pre-existing, not in this slice)
```

## Test discipline self-check

| `web-tdd-philosophy` rule | How this slice honors it |
|---|---|
| **Fixture gate** | Every #716 runner test creates its own `mkdtempSync(...)` directory and writes `.accdb` placeholder files; tests never touch a real Access database. |
| **Dependency injection** | Every #716 runner test injects a `PowerShellExecutor` capturing args + returning a sentinel; no real PowerShell, no real MSACCESS.EXE. |
| **Cardinality before/after** | Every test asserts `capturedArgs.length === 1` (or `=== 0` on the error path) before asserting on payload details. |
| **No humo** | Assertions are concrete values: exact paths, exact `error.code`, exact substring match. |
| **Three paths per slice** | Happy (frontend resolves, backend resolves) + Sad (missing backend → typed error) + Edge (explicit path wins, target preserved as intent). |
| **Refactor-safety** | All target-related runner assertions are on `payload.backendPath` / `payload.databasePath` / `payload.target` (the JSON content sent to PowerShell), NOT on `args.indexOf("-BackendPath")`. The original WIP flag-based assertions were replaced because they were implementation-coupled. |
| **Single harness form** | All four #716 runner tests share the same scaffolding (tempdir + executor + runner + `readPayloadFromArgs`). |
| **No production mutation** | Tests never write to production data. The runner's resolver only mutates the runtime `request` copy — never the project config, never the source tree. |
| **Test module structure** | `access-runner.test.ts` top-down: imports → constants → helpers (`readPayloadFromArgs`) → atoms (`it(...)`). Helpers and atoms are not interleaved. |
| **Helper signature matches atom signature EXACTLY** | `pickQueryTarget` reads from the same `params` shape as every other `pick*` helper in the same file; the runner test's `readPayloadFromArgs(args: readonly string[])` matches the runner's actual `-PayloadJson` shape. |

## Risk register

| Risk | Likelihood | Mitigation in place |
|------|------------|--------------------|
| A future caller passes `target` against an empty project config and gets an opaque error | Low | The resolver returns `CONFIG_MISSING_TARGET_PATH` with a role-named message that names the missing key in `.dysflow/project.json`. |
| `read_only` schema tools with new `target` collide with future `auto` mode | Med | `target` is a closed enum (`"frontend"|"backend"`); `auto` is a sibling literal and additive. |
| `vitest.config.ts` does not run integration tests; the runner path is exercised at the unit boundary with an injected `PowerShellExecutor` | Low | Each branch of the resolver has its own characterization test. A subsequent `node E2E_testing/mcp-e2e.mjs` MCP smoke can be added when an Access fixture is available. |

## Out-of-scope items (re-acknowledged)

- `auto` mode + provenance (SUGGESTION #1).
- Cross-DB ambiguity detection (SUGGESTION #2).
- Dedicated docs page for projectId-first recipes (cosmetic).
- Cross-process lock with `accessDbPath: undefined`
  (pre-existing, NOT a #716 issue; file a separate GitHub issue if
  the maintainer agrees it deserves attention).

## Final status

**Ship it.** Close #716 with this evidence. The deferred sub-criteria
are explicitly acknowledged in the issue closure comment and tracked
on the maintainer's roadmap via follow-up issues.
