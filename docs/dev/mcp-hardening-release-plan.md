# MCP hardening — release plan & handoff

**Status:** #522 RESOLVED as by-design (documentation, no code). #523 is the only
code change remaining for this release.

> ### ✅ RESOLVED (2026-06-12) — #522 is by design, not a bug
> Writing the RED tests for #522 surfaced that "VBA runs with writes disabled" is
> **deliberately encoded in ~15 existing tests** (`test/adapters/mcp/tools.test.ts:1109-1223`,
> plus `:112-117`, `:199-236`, `:522-555`, `:1052-1068`, `:1091-1106`). In MCP, VBA is
> controlled by the `allowedProcedures` allowlist **by design**, not by the write-gate.
> The HTTP/MCP asymmetry is justified by **different threat models**: HTTP is a network
> surface (bearer-token auth) so it blanket-gates VBA; MCP is stdio, spawned by a trusted
> parent process, so the per-deployment control is the allowlist. Gating VBA like HTTP
> would be a wide breaking change against a tested contract and was rejected.
> **Outcome:** no code change. The decision is documented in
> `docs/security/adapter-write-gates.md`. #522 reclassified bug → documentation.
**Goal:** ship a release with the two verified MCP gaps repaired.
**Final acceptance:** the real MCP E2E (`node E2E_testing/mcp-e2e.mjs`) passes,
plus `pnpm test`, `pnpm run lint`, and the pre-release checklist
(`docs/release-checklist.md`).
**Mode:** strict TDD — write the failing test first, then the implementation.

This document is the contract for whoever continues the work (human or another
agent). It is self-contained: read it top to bottom and you know exactly what to
build, where, in what order, and when you are done.

---

## 1. Background — how we got here

An exhaustive, code-verified audit of the MCP adapter (`src/adapters/mcp/**`) was
run. Most of the surface is well-built and needs **no** change: the protocol layer
is delegated to the official `@modelcontextprotocol/sdk`, schema↔validation parity
is test-enforced, error handling is uniform (`isError` content, never JSON-RPC
errors for tool-domain failures), the stdin size-guard is solid, and test seams
exist. **Do not "improve" those — they are intentional.**

Two gaps were confirmed with code in hand. Both are tracked as issues and detailed
below. A handful of cosmetic items were explicitly judged **out of scope** (see §6).

---

## 2. The two changes (issues)

| # | Issue | Severity | Type | PR commit prefix |
|---|-------|----------|------|------------------|
| 1 | [#522](https://github.com/DysTelefonica/dysflow/issues/522) — VBA write-gate asymmetry | — (by design) | docs | `docs(security):` |
| 2 | [#523](https://github.com/DysTelefonica/dysflow/issues/523) — collapse `queryMode` to a single source of truth | MED (tech-debt) | refactor | `refactor(mcp):` |

**#522 is resolved as documentation** (see the resolved note above and
`docs/security/adapter-write-gates.md`) — no code. **#523 is the only code change.**
The release can ship once #523 lands and the gates in §5 pass.

### Repo gate before any PR
Both issues carry `status:needs-review`. Per repo convention a maintainer must add
`status:approved` before a PR is opened. Do not open PRs until the issue is approved.

---

## 3. Issue #522 — VBA write-gate asymmetry (RESOLVED: by design)

> **Resolved as documentation, not code.** The asymmetry is intentional (different
> threat models — see the resolved note in the header). Deliverable:
> `docs/security/adapter-write-gates.md`. **The "gate it" plan below is SUPERSEDED**
> and kept only as historical context for why gating was rejected. Do NOT implement it.

### (Superseded) original "gate it" plan

### Why
MCP and HTTP share the same `vbaService.execute`, but protect it differently.

- HTTP gates VBA behind `writesEnabled` first: `src/adapters/http/server.ts:276-280`.
- MCP does not: `dysflow_vba_execute` never receives `writesEnabled`
  (`src/adapters/mcp/tools.ts:92-100`); its handler `handleMcpVbaExecute`
  (`src/adapters/mcp/canonical-handlers.ts:41-61`) has no gate. Only the
  `allowedProcedures` allowlist applies, and only when configured/non-empty
  (`canonical-handlers.ts:29-33`). The legacy alias `run_vba`
  (`src/adapters/mcp/alias-tools.ts`) has the same gap.

Result: a default deployment (writes off, no allowlist) runs arbitrary VBA over MCP
while HTTP rejects it. Inconsistent with the repo's posture — SQL writes are gated
(`canonical-handlers.ts:76-81`), `force` cleanup is gated (`canonical-handlers.ts:122-127`).

### Decision
Gate VBA on MCP exactly like HTTP: **VBA can write → gate behind `writesEnabled`**.
One shared contract. No new config, no opt-out (deliberately simple).

### Where to change
- `src/adapters/mcp/tools.ts` — pass `writesEnabled` + `writeAccessResolver` into
  `dysflow_vba_execute` (copy the wiring `dysflow_query_execute` already uses at
  `tools.ts:106-115`).
- `src/adapters/mcp/alias-tools.ts` — same wiring for the `run_vba` handler.
- `src/adapters/mcp/canonical-handlers.ts` — add the gate inside
  `handleMcpVbaExecute`, mirroring `handleMcpQueryExecute` (`:76-81`) with the
  existing `isWriteAllowed` / `writesDisabled` helpers. Return `MCP_WRITES_DISABLED`.
  Keep the `allowedProcedures` check as a second, independent control.
- `src/adapters/mcp/schemas/dysflow-schemas.ts` — add `minLength: 1` so `run_vba`'s
  `procedureName` matches the modern tool's inline constraint (`:56-62`).

### TDD steps (RED → GREEN)
1. RED: `dysflow_vba_execute`, `writesEnabled=false`, no allowlist → `isError:true`
   `MCP_WRITES_DISABLED`, and `vbaService.execute` is **not** called (fake service).
2. RED: same for `run_vba`.
3. RED: `writesEnabled=true` → VBA still reaches `vbaService.execute` (positive path).
4. RED: empty `procedureName` on `run_vba` rejected at schema validation.
5. GREEN: implement gate + schema fix until green.

Test files live under `test/adapters/mcp/` — follow the existing patterns there
(handlers are called directly with fake services; no spawning).

### Done when
- New gate tests + `pnpm test` green; `pnpm run lint` clean.
- HTTP behavior unchanged.
- E2E still green — see §5 (the E2E env runs with `allowWrites: true`, so the gate
  is transparent to the existing VBA cases at `mcp-e2e.mjs:186,237`).

---

## 4. Issue #523 — single source of truth for `queryMode`

### Why
`queryMode` lives in two hand-maintained tables that must agree:
- `MCP_TOOL_ROUTES[name].queryMode` — `src/adapters/mcp/dispatch-routes.ts:40-48`
- `maintenanceQueryModes` via `getToolDefinition().queryMode` —
  `src/adapters/mcp/tool-parity-registry.ts:20-30`

`dispatch-factory.ts` gates with `route.queryMode` (`:36`) but builds the request
with `getToolDefinition(name).queryMode ?? "write"` (`:71`). The `?? "write"`
fallback is a footgun: a `read` route missing its `maintenanceQueryModes` entry
would build a **write** request while the gate treats it as an ungated read. The
current test (`test/adapters/mcp/tool-parity.test.ts:345-348`) checks only 4 entries.

### Where to change
- `src/adapters/mcp/dispatch-factory.ts:71` — use `route.queryMode` directly
  (already narrowed to `"read" | "write"` in the `query-maintenance` branch); drop
  the `getToolDefinition` lookup and the `?? "write"` default.
- `src/adapters/mcp/tool-parity-registry.ts` — remove `maintenanceQueryModes` and
  the `queryMode` field on `ParityToolDefinition` **only if** orphaned after step 1
  (grep `queryMode` first). Update `tool-parity.test.ts` accordingly.

### TDD steps (RED → GREEN)
1. RED: parametrized over `MCP_TOOL_ROUTES`, assert every `query-maintenance` tool
   builds an `AccessQueryRequest` whose `mode` equals the route's `queryMode`.
2. RED: regression guard — a `read` maintenance route never yields a `write` request.
3. GREEN: refactor to read `route.queryMode`; delete the dead table if orphaned.
   Pure refactor — no behavior change.

### Done when
- `pnpm test` green, no behavior change; `pnpm run lint` clean.
- Single source of truth (the route table). E2E green.

---

## 5. Global acceptance — the release gate

Run in order. The release is **not** cut until all pass:

1. `pnpm test` — unit/spec (`vitest.config.ts`).
2. `pnpm run lint` — optional-presence guards + `tsc` (src & test) + `biome`.
3. Integration/E2E where the host supports it (`vitest.integration.config.ts`,
   requires Windows + Access COM).
4. **Real MCP E2E (final criterion):** `node E2E_testing/mcp-e2e.mjs` against the
   throwaway `test-runtime/` build with `DYSFLOW_E2E_COMMAND` pointing at it.
   Requires `ACCESS_VBA_PASSWORD`. **Never** run it against `%LOCALAPPDATA%\dysflow`
   or `~/.config/opencode/opencode.json` (hard rule in `AGENTS.md`).
5. Walk `docs/release-checklist.md` — tests, MCP protocol marker, release hygiene.

### Why the gate change is E2E-safe
`E2E_testing/.dysflow/project.json:6` sets `"allowWrites": true`. The E2E VBA cases
(`mcp-e2e.mjs:186` `dysflow_vba_execute`, `:237` `run_vba`) expect a "procedure not
found" error. With writes enabled the new gate is transparent: VBA passes through
and still returns that error. So #522 does not regress the E2E. If you want to prove
the *negative* path (VBA rejected when writes off), cover it in unit/integration
TDD (§3) — the single-runtime E2E config does not exercise writes-off.

---

## 6. Explicitly out of scope (do NOT pull into this release)

Verified as real but judged not worth blocking the release. Leave them unless asked:

- **Cancellation** (`notifications/cancelled`): no listener in `stdio.ts`. This is a
  *feature* (would need to kill the PowerShell subprocess via the operation
  registry), not a bug. Future work.
- **`server.server.setRequestHandler` SDK-internal coupling** (`stdio.ts:127-143`):
  documented and currently unavoidable; watch it on SDK bumps.
- **Cosmetics:** duplicated `createSdkTestHarness` test helper; `as` casts after
  validation without a `satisfies` cross-check in `tools.ts`. Noise, not debt.

---

## 7. Release steps (after both PRs merge & gates pass)

1. Bump version (follow the existing `chore(release): vX.Y.Z` pattern — see
   `git log`, e.g. `7987d95 chore(release): v1.2.42`).
2. Conventional commits only. **No** AI co-author / attribution lines.
3. Tag, then create the GitHub release whose **title equals the tag exactly**
   (`AGENTS.md` hard rule, e.g. tag `v1.2.43` → title `v1.2.43`).
4. Release notes: mention the VBA write-gate parity fix and the `queryMode`
   cleanup. No secrets, passwords, or environment-specific paths.

---

## 8. Progress checklist (update as you go)

- [x] #522 RESOLVED as by-design — no code; documented in `docs/security/adapter-write-gates.md`
- [ ] #522 reclassified on GitHub (bug → documentation) + doc PR merged
- [ ] #523 approved (`status:approved`)
- [ ] #523 tests RED written
- [ ] #523 implemented, tests GREEN
- [ ] #523 PR opened, reviewed, merged
- [ ] `pnpm test` + `pnpm run lint` green on main
- [ ] `node E2E_testing/mcp-e2e.mjs` green against `test-runtime/`
- [ ] `docs/release-checklist.md` walked
- [ ] Release tagged (title == tag)
