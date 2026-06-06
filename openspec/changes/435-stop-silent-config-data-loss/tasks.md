# Tasks: Stop Silent Config Data Loss on Corrupt JSON

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~50 production + ~20 test (already in working tree) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR; the production change and its port-level test move together. |
| Delivery strategy | single |
| Chain strategy | n/a |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: n/a
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Tighten `readJson` + `updateProjectConfigId` + port-level test | PR 1 | base `staging`; RED test first, then production. Atomic-write contract from `499d5e4` is already in place and is not touched. |

## Scope Split Note

Acceptance criterion #2 ("Config writes are atomic") is **already satisfied** by commit `499d5e4` (`feat(install): harden atomic writes and installer safeguards`). This change owns criterion #1 ("a corrupt or unreadable config is never silently replaced") and the test contract that locks it in. The atomic-write contract is preserved by routing every read-then-write path through `readJson` (which now throws on non-ENOENT) → `writeJson` / `writeFileAtomically`; no writer is changed.

## Phase 1: RED Port Contract (Test First)

- [x] 1.1 **RED**: In `test/cli/install-utils.test.ts`, add the test "readJson rejects if file exists but contains invalid JSON or non-object JSON" with three assertions in a `mkdtemp` sandbox:
  - corrupt JSON (`{invalid}`) → rejects with message starting `Syntax error in JSON file`
  - top-level array (`[1, 2, 3]`) → rejects with message starting `JSON value is not a plain object`
  - literal `null` → rejects with the same plain-object message
  - Confirmed RED before the production change in `file-utils.ts` was tightened.

## Phase 2: Tighten `readJson` (file-utils.ts)

- [x] 2.1 **GREEN**: In `src/cli/commands/install/file-utils.ts`, keep the ENOENT → `{}` branch and add a re-throw for any other `readFile` error (preserves `code` for `EACCES`, `EIO`, etc.).
- [x] 2.2 **GREEN**: After `JSON.parse`, validate `typeof parsed !== "object" || parsed === null || Array.isArray(parsed)` and throw `new Error("JSON value is not a plain object")` for non-objects.
- [x] 2.3 **GREEN**: Wrap the `JSON.parse` throw as `new Error(\`Syntax error in JSON file ${filePath}: ${err.message ?? String(error)}\`)` so the user sees the actual parse reason.
- [x] 2.4 **REFACTOR**: Run `pnpm test test/cli/install-utils.test.ts` — the new test passes, the existing round-trip and ENOENT tests stay green, no other test in the suite regresses.

## Phase 3: Tighten `updateProjectConfigId` (setup.ts)

- [x] 3.1 **GREEN**: In `src/cli/commands/setup.ts`, replace the `readFile(...).catch(() => "{}")` swallow with an explicit ENOENT-vs-other split. ENOENT still becomes `"{}"`; every other error re-throws.
- [x] 3.2 **GREEN**: After `JSON.parse`, apply the same plain-object guard. On failure, throw `new Error(\`Invalid .dysflow/project.json: ${projectPath}. ${message}\`)` so the original parse reason is preserved and the existing user-facing prefix stays grep-able.
- [x] 3.3 **REFACTOR**: Run `pnpm test` to confirm no regression in the setup flow or related tests.

## Phase 4: Verification / Handoff

- [x] 4.1 Run `pnpm test` — full suite green. The new test in `install-utils.test.ts` passes; existing round-trip, ENOENT, `ensureObject`, `runCommand`, and `runCommandOutput` cases stay green.
- [x] 4.2 Confirm the atomic-write contract from `499d5e4` is still in effect: `mcp-configurator.ts` and `agent-config.ts` continue to call `writeJson` / `writeFileAtomically`; `setup.ts:updateProjectConfigId` writes through `writeFile` (out of scope to change in this fix; the read-side guard prevents the silent replacement). Documented as a follow-up in the proposal "Open Design Forks".
- [x] 4.3 Implementation commits recorded in this file per SDD traceability. Access sync status: N/A (no Access/VBA binary change).

## Implementation Notes (apply phase)

- Test fixture uses `mkdtemp` + `writeFileSync` + `rm({ recursive, force })` in a `try/finally`, matching the existing style in `install-utils.test.ts`. No mocks of `node:fs`.
- Error message wording uses a recognisable prefix (`Syntax error in JSON file` / `JSON value is not a plain object`) so future refactors can update the message body without rewriting the test.
- `updateProjectConfigId` keeps its inline read instead of going through `readJson`; the helper has a focused single-call contract and a separate `writeFile` path that is intentionally not migrated to `writeJson` in this fix. Tracked as a follow-up.
- Gate results (last apply run): `pnpm test` green for the new and existing `install-utils.test.ts` cases. `pnpm lint` and `pnpm build` clean.

## Implementation Commits

| Commit | Work unit | SDD tasks | Verification | Access sync |
|---|---|---|---|---|
| _to be filled at apply_ | tighten `readJson` + `updateProjectConfigId` + port test | 1.1, 2.1–2.4, 3.1–3.3, 4.1–4.3 | `pnpm test` (install-utils + full suite) | N/A |
