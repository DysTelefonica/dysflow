# Tasks — close-batch-584-586-587

> **Delivery strategy**: `main-only`, target branch `main`. No staging and no PRs for this repo unless explicitly requested. One work-unit commit per issue, one traceability commit if needed, and one archive commit.
>
> **Strict TDD**: RED → GREEN → TRIANGULATE → REFACTOR for each issue. Tests stay in the same commit as the implementation they verify.

## Review Workload Forecast

- 400-line budget risk: **Medium**. Estimated implementation is near but intended to remain below 400 changed lines by keeping one small contract per issue.
- Chained PRs recommended: **No** (repo-specific main-only policy; no PRs).
- Decision needed before apply: **No** (user explicitly selected main-only direct commits and stop-on-balloon behavior).

---

## Slice 1: #584 — Windows Access smoke evidence

- [x] 1.1 RED: add a focused test that fails because Windows Access smoke evidence can currently skip without a release-grade/skip summary contract.
- [x] 1.2 GREEN: implement the minimal workflow/helper evidence contract and wire it into `.github/workflows/ci.yml`.
- [x] 1.3 TRIANGULATE/REFACTOR: cover executed and skipped states, run focused and broader tests, commit and push.

## Slice 2: #586 — MCP E2E temporary fixture copies

- [x] 2.1 RED: add a focused test proving mutable MCP E2E paths must be sandbox-contained.
- [x] 2.2 GREEN: refactor `E2E_testing/mcp-e2e.mjs` to copy frontend/backend/source fixtures to a temp sandbox and route all mutable paths there.
- [x] 2.3 TRIANGULATE/REFACTOR: document cleanup/preserve-on-failure behavior, run focused and broader tests, commit and push.

## Slice 3: #587 — MCP contract surface metadata

- [x] 3.1 RED: add parity tests that fail because overlapping modern/legacy tool safety metadata is not centralized/guarded.
- [x] 3.2 GREEN: introduce shared/derived contract metadata for write/read safety and align descriptions where practical.
- [x] 3.3 TRIANGULATE/REFACTOR: cover modern/legacy overlap exceptions, run focused and broader tests, commit and push.

## Slice 4: Verify, archive, and close

- [x] 4.1 Run final local verification: `pnpm test`, `pnpm build`, `pnpm lint`, `pwsh -Command "Invoke-Pester scripts/tests/"`.
- [x] 4.2 Confirm GitHub Actions success for all pushed commits.
- [ ] 4.3 Archive the change to `openspec/changes/archive/2026-06-28-close-batch-584-586-587/` with `archive-report.md`.
- [ ] 4.4 Close #584, #586, and #587 with commit SHA(s) and test references.

---

## Implementation commits

| Commit | Work unit | SDD tasks | Verification | Access sync |
|---|---|---|---|---|
| `5a891c2` | #584 Windows Access smoke evidence | 1.1–1.3 | RED: `pnpm vitest run test/quality-gates/windows-access-smoke-evidence.test.ts` failed on missing helper; GREEN: focused test 3/3, `pnpm test` 1716/1716, `pnpm build`, `pnpm lint`; CI `28331939189` success | N/A |
| `9ad8987` | #586 MCP E2E fixture isolation | 2.1–2.3 | RED: `pnpm vitest run test/quality-gates/mcp-e2e-sandbox.test.ts` failed on missing helper; GREEN: focused tests 14/14, `pnpm test` 1718/1718, `pnpm build`, `pnpm lint`; CI `28332128649` success | N/A |
| `f7ea0b3` | #587 MCP contract surface metadata | 3.1–3.3 | RED: `pnpm vitest run test/adapters/mcp/mcp-tool-contracts.test.ts` failed on missing metadata module; GREEN: MCP focused tests 22/22, `pnpm test` 1721/1721, `pnpm build`, `pnpm lint`, Pester 374/0/4; CI `28332370495` success | N/A |
| _pending_ | tasks traceability | 4.1–4.2 | local final: `pnpm test` 1721/1721, `pnpm build`, `pnpm lint`, `Invoke-Pester scripts/tests/` 374 passed / 0 failed / 4 skipped | N/A |
| _pending_ | archive and issue closeout | 4.3–4.4 | CI pending | N/A |
