# Proposal: Stop Silent Config Data Loss on Corrupt JSON

## Intent

Issue #435 (audit C3, `docs/AUDIT_2026-06-05.md`) flags a critical data-loss footgun in the install runtime:

- `readJson` in `src/cli/commands/install/file-utils.ts:22-28` returns `{}` when `JSON.parse` throws. Any subsequent `writeJson` then overwrites the user's real config with the empty object — the user loses everything.
- The same pattern is duplicated in `updateProjectConfigId` (`src/cli/commands/setup.ts:153-163`): corrupt JSON is silently replaced with `{}`, then re-serialised and written back.

This change closes acceptance criterion #1 ("a corrupt or unreadable config is never silently replaced — warn or fail loudly and preserve the original file") at the install-runtime port. Criterion #2 (atomic config writes) is already satisfied by commit `499d5e4` (`feat(install): harden atomic writes and installer safeguards`); see "Scope" below.

## Scope

### In Scope
- Distinguish ENOENT (file genuinely does not exist) from every other read error inside `readJson` and `updateProjectConfigId`. ENOENT keeps the existing "treat as empty object" semantics; any other error (parse failure, non-object JSON, permission denied, EIO, …) MUST throw.
- Validate the parsed value is a plain object inside both `readJson` and `updateProjectConfigId`. Arrays, `null`, numbers, strings, and booleans MUST be rejected with a clear error that includes the offending file path.
- Wrap the parse-error message in `readJson` with `Syntax error in JSON file <path>: <inner>` so the user sees the actual `JSON.parse` reason.
- In `updateProjectConfigId`, surface the underlying parse message in the thrown `Invalid .dysflow/project.json: <path>. <message>` error.
- Port-level test in `test/cli/install-utils.test.ts` covering corrupt JSON, top-level array, and `null` payloads. No assertion on the inner helper layout, internal state, or call order.
- `file-utils.ts` continues to be the canonical home for these helpers per the existing `product-cli` "Shared Install Utilities Module" requirement.

### Out of Scope
- Atomic writes for the agent and MCP config paths. Already delivered in commit `499d5e4` (`feat(install): harden atomic writes and installer safeguards`): `writeFileAtomically` is exported from `file-utils.ts` and used by `mcp-configurator.ts` and `agent-config.ts` (both call `writeJson` which is now atomic, and `codex` paths call `writeFileAtomically` directly). Atomic-write coverage is owned by that commit; this change does not regress or re-test it.
- New MCP tools, schema changes, command-surface changes, or runtime layout changes.
- Auto-recovery (backup-restore, last-known-good): out of scope. The contract is "fail loudly and preserve the file", not "silently heal".
- Tightening the ENOENT path (e.g. also treating empty files as ENOENT): follow-up if a future audit surfaces that case.
- Refactoring `updateProjectConfigId` to use `readJson` from `file-utils.ts`. Possible follow-up, but the two helpers' contracts differ (the setup helper writes through `writeFile`, not the atomic `writeJson`, and lives in the `setup` command module). Not in scope here.

## Capabilities

### New Capabilities
- `install-runtime` (new delta target): adds a "Corrupt Config Never Silently Replaced" requirement covering the read-error split (ENOENT vs throw), plain-object validation, parse-error message preservation, and port-level test contract.

### Modified Capabilities
None. The existing `product-cli` "Shared Install Utilities Module" requirement continues to govern the helper's location and exports; this change only tightens one of its behaviours.

## Approach

Treat "file genuinely missing" and "file present but unreadable / unparseable" as fundamentally different conditions. ENOENT means "there is nothing to lose — start fresh". Anything else means "the user's data may be at risk — stop and surface the error".

`readJson` is the canonical JSON-loader for the install runtime. Tighten it once at the port so every call site (MCP configurator, agent configurator, project id updater, future helpers) inherits the safer contract.

For `updateProjectConfigId`, replicate the same split locally because the helper predates `readJson` and is the only `setup` flow that reads the project config — duplicating ~10 lines of ENOENT handling is cheaper than refactoring the write path to go through `writeJson` in this change.

Plain-object validation is non-negotiable: an array or `null` JSON file is just as much a "do not silently replace" case as a syntax error, because the next write would emit a non-object that downstream consumers (the Dysflow core, agents that parse `mcpServers`) will reject later with a worse error.

Strict TDD: write the corrupt-JSON / array / null test first (RED), then tighten `readJson` and `updateProjectConfigId` (GREEN). The existing round-trip and ENOENT tests in `test/cli/install-utils.test.ts` stay green to prove no regression on the happy path.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/cli/commands/install/file-utils.ts` | Modified | `readJson` validates parsed value is a plain object; wraps parse error with file path; non-ENOENT read errors re-thrown. |
| `src/cli/commands/setup.ts` | Modified | `updateProjectConfigId` splits ENOENT from other read errors, validates plain object, and includes the inner parse message in the thrown error. |
| `test/cli/install-utils.test.ts` | Modified | New "readJson rejects if file exists but contains invalid JSON or non-object JSON" test covers corrupt JSON, top-level array, and `null`. |
| `openspec/changes/435-stop-silent-config-data-loss/` | New | SDD proposal, design, delta spec, tasks. |

## Open Design Forks

- Reuse `readJson` inside `updateProjectConfigId` vs keep the inline read. Keep inline for scope control: the helper's contract is "load project config, set `id`, write" and a refactor to `writeJson` would be a separate behaviour change. File as a follow-up.
- Cover `EACCES`/`EPERM` in the new test. The split is on `code !== "ENOENT"`, so any non-ENOENT error re-throws; a one-line test asserting `EACCES` propagates is cheap. Included via the "non-ENOENT read error" scenario in the design.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Existing callers relied on the silent `{}` fallback and now throw | Med | ENOENT path unchanged; non-ENOENT was an unsafe contract; user-facing failure is the intended behaviour. |
| Test couples to the new `readJson` error message string | Low | Test asserts the message *prefix* (`Syntax error in JSON file` / `JSON value is not a plain object`) — behaviour, not exact wording. |
| Future refactor removes the plain-object guard | Low | New "Corrupt Config Never Silently Replaced" requirement in `install-runtime` spec is enforced by the test. |
| Setup's `updateProjectConfigId` drift from `readJson` (two ENOENT split copies) | Low | Documented in "Open Design Forks"; follow-up will consolidate. |

## Rollback Plan

Revert the production changes in `file-utils.ts` and `setup.ts` and the new test. The original behaviour (silent `{}` replacement) is restored with no data migration. No external API, schema, or runtime layout change.

## Dependencies

- Strict TDD; port-level test precedes production change.
- Repo standards: clean architecture, behaviour/port tests, `pnpm test`.
- Atomic-write contract from commit `499d5e4` (`writeFileAtomically`, `writeJson` → `writeFileAtomically`) — not modified by this change.

## Success Criteria

- [ ] A corrupt or unreadable config is never silently replaced: `readJson` throws with `Syntax error in JSON file <path>: <inner>` for parse errors and `JSON value is not a plain object` for non-object payloads; non-ENOENT read errors propagate.
- [ ] `updateProjectConfigId` in `setup.ts` throws `Invalid .dysflow/project.json: <path>. <inner>` for parse errors and the same "plain object" error for non-object payloads; non-ENOENT read errors propagate; ENOENT continues to behave as "start from `{}`".
- [ ] The original file is preserved on failure: a thrown error from `readJson` / `updateProjectConfigId` never reaches a `writeFile` / `writeJson` call site.
- [ ] Port-level test in `test/cli/install-utils.test.ts` covers corrupt JSON, top-level array, and `null` without coupling to internal helper layout.
- [ ] Atomic config writes remain in effect through `writeFileAtomically` / `writeJson` from commit `499d5e4`; this change does not regress that contract.
