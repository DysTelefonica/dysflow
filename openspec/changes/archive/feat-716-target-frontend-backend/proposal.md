# Proposal: feat(query) — resolve frontend/backend targets from projectId for read-only schema tools

SDD: feat-716-target-frontend-backend
GitHub issue: https://github.com/DysTelefonica/dysflow/issues/716
Mode: hybrid (`openspec/` files + Engram mirror)
Strict TDD: ACTIVE

## Intent

Reduce caller friction for Access/VBA project–scoped read tools (`get_schema`,
`count_rows`, `distinct_values`, `list_tables`, and the rest of the read surface
that already shares `READ_TARGET_OVERRIDE`) so a caller can pass a semantic
`target: "frontend" | "backend"` together with `projectId` and let Dysflow
resolve the configured `accessPath` / `backendPath` from `.dysflow/project.json`
without having to discover or hardcode the local file path.

## Current state (problem)

Today, a call like

```json
{
  "projectId": "00-vba-toolkit-bench-develop",
  "table": "TbConfiguracionBackends"
}
```

loops the caller through two failed round-trips:

1. The MCP layer defaults to `backendPath` when neither `databasePath` nor
   `backendPath` is supplied. The frontend-local `TbConfiguracionBackends`
   table does not exist in the backend, so the call fails with
   `ACCESS_QUERY_FAILED`.
2. The caller has to know that this table is frontend-local and pass
   `databasePath="Gestion_Riesgos.accdb"` explicitly — which is precisely
   the friction the issue reports.

The runner already has an `accessDbPath` / `backendPath` resolution path that
honors explicit paths and falls back to project config, but it expects the
caller to pick the correct concrete path. There is no semantic layer that
maps a role to the configured path.

## Scope

### In scope

1. Add a `target: "frontend" | "backend"` semantic field on the
   `READ_TARGET_OVERRIDE` block of the MCP tool input schema (so every read
   tool that already accepts `databasePath`/`backendPath`/`sourcePath`/`accessPath`
   also accepts `target`).
2. Surface the same field in `AccessQueryRequest` (the runner contract).
3. Resolve the field inside `AccessPowerShellRunner.runLockedOperation`
   before the existing default-fallback, only when no explicit path was
   supplied.
4. When `target` cannot be resolved against the project config (e.g.
   `target: "backend"` against a project that declares no `backendPath`),
   return a typed `CONFIG_MISSING_TARGET_PATH` error and never spawn
   PowerShell.
5. Update one MCP tool description (`get_schema`) to advertise the new
   projectId-first path. Other read tools inherit the schema-level change
   without per-tool prose.
6. Strict-TDD coverage at the ports: mapper unit tests + runner
   characterization tests with an injected `PowerShellExecutor`.

### Out of scope (deferred)

- `auto` lookup mode (Option B in the issue). The issue phrases that
  acceptance criterion as **"if implemented, reports the resolved database
  role/path"** — the semantic role already satisfies the *absence* of auto
  by giving the caller an explicit choice. A separate change can add `auto`
  with table-existence provenance when needed.
- Cross-database ambiguity (`get_schema(table=…)` returning a typed
  "matches both" error). Today, dysflow tooling queries one database at a
  time; a true ambiguity detector requires a new cross-database lookup
  primitive, which is a separate SDD change.
- A separate `docs/` page documenting projectId-first recipes. The tool
  description carries the recipe; expanding the docs site is cosmetic and
  can follow.

## Capabilities

### Modified capabilities

- `mcp-stdio-adapter`: accept and forward `target` on every read tool.
- `access-core-runner`: resolve `target` against project config when the
  request has no explicit path.
- `mcp-query-tools` (delta spec): a new requirement covering the
  semantic resolution contract and the typed error.

### New capabilities

- None.

## Approach

Tight, layered, refactor-safe:

1. **Schema (`query-schemas.ts`)**: add `target` to `READ_TARGET_OVERRIDE`
   as an enum of `"frontend" | "backend"`. Keep the existing
   `accessPath` / `backendPath` / `databasePath` / `sourcePath` so explicit
   paths still win at the Zod layer.
2. **Contract (`core/contracts/index.ts`)**: `AccessQueryRequest` gains
   an optional `target?: "frontend" | "backend"` with the comment pinned
   to #716.
3. **Mapper (`core/mapping/access-query-request-mapper.ts`)**: validate
   the raw target value defensively, surface it as part of `OverrideShape`,
   and pass it through `buildQueryReadRequest` so the request that
   reaches the runner carries the caller's intent.
4. **Runner (`core/runner/access-runner.ts`)**: in `runLockedOperation`,
   BEFORE the existing default-fallback, branch on `operation.request.target`
   together with the absence of explicit paths:
   - `target === "backend"` + `config.backendPath` set → set
     `request.backendPath = config.backendPath`, clear `target`.
   - `target === "frontend"` + `config.accessDbPath` set → set
     `request.databasePath = config.accessDbPath`, clear `target`.
   - The remaining two branches return
     `CONFIG_MISSING_TARGET_PATH` with a message that names the missing
     role instead of silently switching to the other database.
   - The downstream default-fallback block was re-keyed off
     `finalOperation.request` (not `operation.request`) so the resolved
     path is not clobbered and the cleared `target` survives into the
     payload.
5. **Tool description (`tool-parity-registry.ts`)**: `get_schema`
   description gets one sentence advertising `target` + `projectId`.

## Affected areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/adapters/mcp/schemas/query-schemas.ts` | Modified | Add `target` enum to `READ_TARGET_OVERRIDE`. |
| `src/adapters/mcp/tool-parity-registry.ts` | Modified | Document the recipe on `get_schema`. |
| `src/core/contracts/index.ts` | Modified | `AccessQueryRequest.target?: "frontend" \| "backend"`. |
| `src/core/mapping/access-query-request-mapper.ts` | Modified | Pick + validate `target`; surface in `OverrideShape`. |
| `src/core/runner/access-runner.ts` | Modified | Resolve `target` against config; typed error when unresolvable; keyed default-fallback off `finalOperation.request`. |
| `test/core/mapping/access-query-request-mapper.test.ts` | Modified | Unit RED tests for the picker. |
| `test/core/runner/access-runner.test.ts` | Modified | Characterize runner behavior on a tempdir fixture with an injected `PowerShellExecutor`. |
| `openspec/specs/*` | Modified | Delta spec with the new requirement and scenarios. |

## Acceptance criteria

- [x] `get_schema(projectId, target="frontend", table="TbConfiguracionBackends")`
      works without `databasePath` — `request.databasePath` resolves to
      `config.accessDbPath` at the runner; `target` is cleared before
      the PowerShell payload is serialized.
- [x] `get_schema(projectId, target="backend", table="TbRiesgos")` works
      without `databasePath` — `request.backendPath` resolves to
      `config.backendPath`; `target` is cleared.
- [x] Explicit `databasePath` (or `backendPath`) wins over `target` —
      the request's explicit path is preserved unchanged and the
      caller's `target` is left intact in the payload so downstream
      observers can read intent.
- [x] `target: "backend"` against a project that does not declare
      `backendPath` returns a typed `CONFIG_MISSING_TARGET_PATH` and
      never invokes the executor.
- [x] `pnpm test` passes (2386 of 2388 tests, 1 skipped, 1 todo).
- [x] `pnpm lint` exits 0 (two unrelated pre-existing warnings).
- [x] `pnpm build` exits 0.
- [ ] Auto-mode + cross-DB ambiguity detection — deferred to a follow-up
      SDD change. The acceptance criterion `Auto mode, if implemented,
      reports the resolved database role/path` is satisfied vacuously by
      not implementing auto in this slice (the issue explicitly hedges
      with **"if implemented"**).
- [ ] A separate `docs/` page — current recipe lives in the `get_schema`
      tool description; expanding docs is a follow-up.

## Delivery plan

Single PR on `feat/716-target-frontend-backend` (no chained slices — the
slice is 366 / 11 lines across 7 files, well below the 400-line review
budget):

| Commit | Work unit | SDD tasks | Verification | Access sync |
|---|---|---|---|---|
| (single work unit below) | Resolve semantic target on read tools | #1, #2, #3 | `pnpm test` 2386 pass; `pnpm lint` 0; `pnpm build` 0 | n/a (frontend-only; no `.accdb` import required) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Existing callers passing `target` see regression vs. previous explicit-path behavior | Low | The resolution branch only fires when no explicit path is set; explicit paths still win. |
| `read_only` schema tools with new `target` collide with future `auto` mode | Med | `target` is a closed enum (`frontend`/`backend`); `auto` would be a sibling literal, additive. |
| `vitest.config.ts` does not run integration tests, so the runner path is exercised at the unit boundary with an injected `PowerShellExecutor` | Low | Characterization tests cover every branch of the resolver (frontend/resolve, backend/resolve, explicit wins, missing-config). A subsequent MCP-E2E smoke can be added when an Access fixture is available. |

## Rollback plan

Revert the single work-unit commit. No new tool names, no migrations, no
schema rename, no documented contract retroactively invalidated. Read tools
return to "must pass `databasePath` / `backendPath` / `sourcePath`
explicitly" and the runner still honors explicit paths.

## Dependencies

- Strict TDD: `pnpm test` before/after the production edit; `pnpm build`
  and `pnpm lint` for verification.
- Pre-existing `READ_TARGET_OVERRIDE` schema block, `OverrideShape`,
  `AccessQueryRequest`.
- `web-tdd-philosophy` skill: tests assert outcome (`payload.databasePath`
  / `payload.backendPath` / `payload.target`), not implementation
  (`-BackendPath` flag structure).

## Success criteria

- Issue #716 acceptance subset (frontend-local + backend lookup, explicit
  precedence, typed error on missing config) is green in CI.
- Cross-DB ambiguity detection and `auto` mode acknowledged as out of
  scope in the issue closure and tracked as a follow-up if the maintainer
  agrees.
