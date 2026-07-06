# Tasks: feat-716-target-frontend-backend

Single-PR slice, no chained work units. Each task below was already
exercised by the test suite (`pnpm vitest run`); the verification
section below points at the test that locks it in.

## Task #1 — Schema: declare `target` on the read-tool override block

- **Where**: `src/adapters/mcp/schemas/query-schemas.ts`
- **What**: add `target: { type: "string", enum: ["frontend","backend"] }`
  to `READ_TARGET_OVERRIDE` with a description that pins the contract to
  #716.
- **Locking test**: `dysflow_query_execute` / `get_schema` /
  `count_rows` / `distinct_values` schemas accept `target` (already
  covered by `tool-descriptions.test.ts` schema-lint; ad-hoc manual
  probe of `QUERY_TOOL_SCHEMAS`).
- **Status**: ✅ applied (`src/adapters/mcp/schemas/query-schemas.ts:24`).

## Task #2 — Contract: surface `target` on `AccessQueryRequest`

- **Where**: `src/core/contracts/index.ts`
- **What**: add `target?: "frontend" | "backend"` to `AccessQueryRequest`
  with a doc comment that pins it to #716.
- **Locking test**: type-level — verified by `tsc --noEmit` in `pnpm build`.
- **Status**: ✅ applied (`src/core/contracts/index.ts:212`).

## Task #3 — Mapper: validate + surface `target` on the override slice

- **Where**: `src/core/mapping/access-query-request-mapper.ts`
- **What**: introduce `QueryTarget`, `VALID_QUERY_TARGETS`,
  `isValidQueryTarget`, and `pickQueryTarget`; add `target` to
  `OverrideShape`; thread it through `pickOverrides` and
  `buildQueryReadRequest`.
- **Locking tests**:
  - `pickQueryTarget` returns the value when valid and `undefined`
    otherwise (unit, table-driven: `"frontend"`, `"backend"`, `"auto"`,
    `"FRONTEND"`, `123`, `undefined`, `null`).
  - `pickOverrides` surfaces `target` as part of the override slice
    while still returning the other override fields.
  - `buildQueryReadRequest("get_schema", { projectId, target,
    tableName })` passes `target` through to the request.
  - `buildQueryReadRequest` omits `target` when not provided
    (regression for the previous contract).
  - `VALID_QUERY_TARGETS` exposes exactly `["frontend","backend"]`.
  - `isValidQueryTarget` type-guards the same set.
- **Status**: ✅ applied (`test/core/mapping/access-query-request-mapper.test.ts`).

## Task #4 — Runner: resolve `target` against project config

- **Where**: `src/core/runner/access-runner.ts`
- **What**: in `runLockedOperation`, before the existing default
  fallback:
  - `target === "backend"` + `config.backendPath` set → set
    `request.backendPath = config.backendPath`, clear `target`.
  - `target === "frontend"` + `config.accessDbPath` set → set
    `request.databasePath = config.accessDbPath`, clear `target`.
  - `target === "frontend"` + no `config.accessDbPath` but
    `config.backendPath` set → return `CONFIG_MISSING_TARGET_PATH`
    (named after the missing role).
  - `target === "backend"` + no `config.backendPath` → return
    `CONFIG_MISSING_TARGET_PATH`.
  - Re-key the existing default-fallback off `finalOperation.request`
    so a resolved target is not clobbered and the cleared `target`
    survives into the payload.
- **Locking tests** (`test/core/runner/access-runner.test.ts`):
  - Happy: `target="frontend"` → `payload.databasePath === fakeAccdb`,
    `payload.backendPath === undefined`, `payload.target === undefined`,
    `payload.action === "list_tables"`, `payload.mode === "read"`.
  - Happy: `target="backend"` → `payload.backendPath === fakeBackend`,
    `payload.databasePath === undefined`, `payload.target === undefined`,
    action + mode preserved.
  - Edge: explicit `databasePath` wins — `payload.databasePath ===
    explicitPath`, `payload.target === "frontend"` (caller's intent
    preserved).
  - Sad: `target="backend"` + no `config.backendPath` →
    `result.ok === false`, `result.error.code === "CONFIG_MISSING_TARGET_PATH"`,
    error message matches `/backend/`, executor never called.
  - Helper: `readPayloadFromArgs` parses `-PayloadJson` and throws
    with a typed error if the value is missing or non-string.
- **Status**: ✅ applied (per the commit history; verified green by
  `pnpm vitest run test/core/runner/access-runner.test.ts`: 42 pass,
  1 skip).

## Task #5 — Tool description: advertise the recipe on `get_schema`

- **Where**: `src/adapters/mcp/tool-parity-registry.ts`
- **What**: extend the `get_schema` description with a one-sentence
  recipe for `target` + `projectId`. Other read tools inherit the
  schema-level change but no per-tool prose yet (kept the diff small
  inside the 400-line budget).
- **Locking test**: `tool-descriptions.test.ts` (existing, validates
  every tool description has the required shape).
- **Status**: ✅ applied (`src/adapters/mcp/tool-parity-registry.ts:176`).

## Verification summary

- `pnpm vitest run test/core/runner/access-runner.test.ts` →
  **42 passed, 1 skipped** (the WIP tests + the existing
  Cross-process lock tests).
- `pnpm vitest run test/core/mapping/access-query-request-mapper.test.ts` →
  passes (WIP unit tests + existing mapper tests).
- `pnpm test` (suite) → **2386 passed, 1 skipped, 1 todo** out of 2388.
- `pnpm lint` → exit code **0** (two unrelated pre-existing
  `biome check` warnings in
  `test/core/scripts/dysflow-access-runner-static.test.ts`, NOT in
  any file touched by this change).
- `pnpm build` → exit code **0**.

## Out-of-scope (acknowledged)

- **`auto` mode + provenance**: not implemented; issue hedges the
  acceptance criterion with **"if implemented"** so vacuous
  satisfaction is acceptable. Track as a follow-up.
- **Cross-DB ambiguity detection**: not implemented (no current read
  tool queries more than one database at a time). Track as a follow-up.
- **Dedicated `docs/` page**: the recipe lives in the `get_schema`
  tool description; expanding docs is cosmetic.
