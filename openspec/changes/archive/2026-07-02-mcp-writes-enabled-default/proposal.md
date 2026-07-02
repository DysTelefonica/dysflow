# Proposal: MCP stdio writes-enabled by default

## Intent

Issue #645: `dysflow mcp` (stdio) requires `--enable-writes` to allow write-gated
tools, so every local agent session starts read-only and must be manually
re-launched to sync VBA/SQL. The friction is unjustified for the stdio surface:
`docs/security/adapter-write-gates.md` already treats MCP-stdio as a **local,
process-ownership-trusted** surface (the parent process is the operator), and
writes-disabled is not even its sole safety mechanism (per-repo `allowWrites`,
`allowedProcedures`, and the ad hoc `buildExplicitConfig` floor still apply).
Flip the default so bare `dysflow mcp` enables writes; add an explicit
`--disable-writes` opt-out.

## Scope

### In Scope

- Flip `src/cli/commands/mcp.ts:18` default: writes ON unless `--disable-writes`.
- Add `--disable-writes` flag; keep `--enable-writes` as an accepted back-compat
  no-op (explicit confirmation).
- Reject passing both flags together (`exitCode 1` + usage) — unambiguous mistake.
- Flip the `src/adapters/mcp/stdio.ts:96` `?? false` fallback to `?? true` so
  direct `startMcpStdioAdapter()` callers/tests match the new stdio default.
- Update `MCP_USAGE` string in `mcp.ts`.
- Tests: flip/add per strict TDD (see Approach).
- Docs: README.md (~476, 487-491, 760), AGENTS.md / `docs/architecture/dysflow-core-and-adapters.md:35`, and `docs/security/adapter-write-gates.md` (state new default + why stdio is safe-on while HTTP stays off). CHANGELOG entry — user-visible trust-posture change.

### Out of Scope

- `dysflow serve` / HTTP (`server.ts`, `serve.ts`) — network surface stays
  writes-disabled by deliberate threat-model asymmetry (locked decision).
- `dispatch-common.ts` gate/resolver, `dysflow-config.ts` `buildExplicitConfig`
  ad hoc floor (stays hardcoded false), per-repo `allowWrites` semantics.
- The separate `2026-07-01-mcp-contract-safety` change.
- New env var (`MCP_WRITES_DISABLED` reused only as error code — locked decision).

## Capabilities

### New Capabilities
None.

### Modified Capabilities

- **`mcp-stdio-adapter`**: Add requirement — the stdio adapter's process-wide
  write default is ENABLED; a caller MUST pass an explicit disable signal to run
  read-only. Per-request per-repo `allowWrites` resolution is unchanged.
- **`product-cli`**: Add requirement — bare `dysflow mcp` enables writes;
  `--disable-writes` opts out; `--enable-writes` is an accepted no-op; both flags
  together is rejected with usage.

## Approach

Approach A (exploration): flip the CLI-computed boolean's default source and the
stdio fallback only. Core gate logic (`isWriteAllowed`,
`resolveMcpWriteAccessForInput`) is untouched — precedence order is identical,
only the process-wide default input changes. Strict TDD: RED first for each.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/cli/commands/mcp.ts` | Modified | Default true; parse `--disable-writes`; reject both flags; usage string. |
| `src/adapters/mcp/stdio.ts` | Modified | `writesEnabled` fallback `?? false` → `?? true`. |
| `test/cli/commands.test.ts` | Modified | Add assertion for bare `dysflow mcp` default (currently unpinned, ~198-215); add `--disable-writes` + conflicting-flags cases. |
| `README.md`, `AGENTS.md`, `docs/architecture/dysflow-core-and-adapters.md`, `docs/security/adapter-write-gates.md` | Modified | New default + stdio-vs-HTTP rationale. |
| `CHANGELOG.md` | Modified | Prominent trust-posture change note. |
| `openspec/specs/mcp-stdio-adapter/spec.md`, `openspec/specs/product-cli/spec.md` | Modified | Delta requirements above. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Existing users' stdio default silently flips to write-capable on upgrade | Med | Loud CHANGELOG + `adapter-write-gates.md` update; per-repo `allowWrites`/`allowedProcedures`/ad hoc floor still gate actual writes. |
| Doc self-contradiction (stdio on, HTTP off) | Med | `adapter-write-gates.md` explicitly explains the trust asymmetry as intentional. |
| `stdio.ts` fallback flip weakens a non-CLI caller expecting safe-off | Low | CLI always passes explicit boolean; document that stdio's own default is now on. |
| Line budget creep from doc edits | Low | Est. <200 lines total; flag if docs push past 400. |

## Rollback Plan

Single revert restores writes-disabled default. Change is a default-value flip
plus additive flag/tests/docs — no data migration, no schema change.

## Dependencies

- Existing write-gate chain (`dispatch-common.ts`, `stdio.ts` resolver) — unchanged.
- `docs/security/adapter-write-gates.md` threat model.

## Success Criteria

- [x] Bare `dysflow mcp` starts with writes enabled (pinned test).
- [x] `dysflow mcp --disable-writes` starts read-only (pinned test).
- [x] `--enable-writes` accepted as no-op; both flags together rejected (pinned test).
- [x] `startMcpStdioAdapter()` with no `writesEnabled` option defaults enabled.
- [x] `dysflow serve` / HTTP default unchanged (regression guard stays green).
- [x] Docs + CHANGELOG state new default and stdio-vs-HTTP rationale.
- [x] `pnpm test` and `pnpm build` pass.

## Proposal assumptions (automatic mode — no interactive round run)

Scope decisions were pre-locked by the orchestrator: stdio-only flip, flag-only
opt-out, core gate/config untouched. No open product questions remain; the sole
residual is line-budget monitoring during apply.
