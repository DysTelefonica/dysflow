# v4.5.11

## Summary

- Agents that read only the text of a large result, like the Pi facade, now see its verdict: a bounded projection replaces the bare field list.
- `verify_code` stops reporting a GUID-only form change as functional drift.
- The import dry-run says when `apply:true` will be refused and which flag lifts the refusal.
- A frontend whose own startup is broken can be repaired through `query_execute`. Cleanup can now terminate the Access a timed-out operation left behind.
- No Access database migration or project-configuration migration is introduced.

## Provenance

| Item | Value |
| --- | --- |
| Previous published release | `v4.5.10`, tag commit `530fc466` |
| Complete source comparison | [v4.5.10...v4.5.11](https://github.com/DysTelefonica/dysflow/compare/v4.5.10...v4.5.11) |
| Distributed artifact | `dysflow-v4.5.11.tar.gz`, with `SHA256SUMS` and `SHA256SUMS.sig` in the release assets |
| Release authority | `.github/workflows/release.yml` run for the `v4.5.11` tag |

## Product fixes

### Bounded projection for large results — PR #2021, closes #2020

- **Before:** a result over 16 KiB carried only its field names in `content[0].text`. A text-only client could not see `actionableOk` from `verify_code` or the final counts from `get_test_run`.
- **Now:** `summary.projection` holds a copy of the payload that fits the same 16 KiB. Lists are capped, failing entries come first, and `summary.truncated` names each shortened list.
- **Where:** `src/adapters/mcp/response-envelope.ts`. `structuredContent` is unchanged.

### GUID-only form deltas are serialization noise — PR #2021, closes #2019

- **Before:** a regenerated control or form `GUID` made `verify_code` report `binaryNewer` and recommend a merge.
- **Now:** `GUID` is in `FORM_NOISE_KEYS`, so a GUID-only delta is `formSerializationOnly`. A changed control still differs through its own lines.
- **Where:** `src/core/services/form-noise-keys.ts`. `classifierRules` and the verify-base canonical version change, so stored bases are recomputed.

### The import plan names the refusal — PR #2021, closes #2018

- **Before:** `FORM_CODE_BEHIND_DIVERGES` appeared only among the warnings of an `apply:false` plan.
- **Now:** the plan carries `wouldRefuse[]` with the code, `requiredFlags: ["acknowledgeCodeBehindWins"]`, the files and the remediation.
- **Where:** `import_modules` and `import_all` dry runs, and the `dysflow-usage` import recipe.

### Frontend repair and cleanup of a left-behind Access — PR #2021, refs #2017

- **Before:** an applied frontend write started Access and opened the frontend with the backend password. Cleanup could not identify the Access that dysflow had started.
- **Now:** the write runs through DAO with the frontend password and never starts Access. Cleanup reads the probe's start time and accepts a bare `MSACCESS.EXE -Embedding` command line. A failed probe is `CLEANUP_INSPECTION_FAILED` and kills nothing.
- **Where:** `scripts/dysflow-access-runner.ps1` and `src/core/operations/access-operation-cleanup.ts`.

## Repository, tests, and release engineering

- **Crash-event collector — PR #2021, refs #1918:** the collector opened its window one UTC offset early, so series collected on the UTC+1 runner could include an hour of prior events.
- **Context budget:** text-fallback wire ceilings rose by the measured projection delta; logical ceilings are unchanged. See `docs/testing/mcp-context-budget.md`.
- **Release notes for v4.5.10 — PR #2013:** documentation added after that release was published.

## Integrated pull requests

| PR | Included change |
| --- | --- |
| #2013 | Reader-oriented release notes for v4.5.10 and their checker |
| #2021 | Fixes for #2017, #2018, #2019, #2020 and the #1918 collector |
| Release PR | v4.5.11 preparation and these notes |

## Verification evidence

- Each fix landed test-first: the new test was observed failing on its expected assertion before the change.
- Required CI passed for PR #2021: lint, build, context budget and the full Vitest suite.
- An independent verifier reviewed the cleanup guard change and found no blocker. Its two concerns were fixed with regression tests.
- A semantic audit of the candidate runtime reported no drift and no runtime contract gap.
- The release battery runs on the self-hosted Access runner before publication.

## Compatibility and configuration

- `verify_code` results change for forms whose only difference is a `GUID` block. Consumers that pinned `classifierRules` see the new value.
- Large-result text grows up to the existing 16 KiB threshold. `structuredContent` is unchanged.
- Frontend writes without a `databasePath` use the frontend password, not the backend password.

## Upgrade and rollback

1. Run `dysflow update --channel stable` and check that `dysflow --version` prints `4.5.11`.
2. Reconnect MCP clients to load the new server.
3. To roll back, reinstall the signed `v4.5.10` archive. No project data needs changing.

## Closure register

| Issue | Disposition |
| --- | --- |
| #2018 | Closed by #2021; the optional "no refusal" point is declined, because the verify base does not record the code-behind copy |
| #2019 | Closed by #2021 |
| #2020 | Closed by #2021 |
| #2017 | Closed by #2021; the defects that blocked the repair are fixed, though the hang trigger was not reproduced |

### Remaining work

- **#1918 remains open.** A quiet-machine experiment of 40 COM activations produced no crash, and the collector bug is fixed. The crash cause is not established.
