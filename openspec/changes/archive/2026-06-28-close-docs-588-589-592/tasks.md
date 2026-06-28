# close-docs-588-589-592 Tasks

## Review Workload Forecast

- 400-line budget risk: Low
- Chained PRs recommended: No
- Decision needed before apply: No
- Delivery path: single direct-to-main work-unit commits, per user instruction.

## Tasks

### Issue #588 — README install release guidance

- [x] 1.1 Read `gh issue view 588` and identify stale/fixed install guidance.
- [x] 1.2 Add a RED docs gate for release guidance drift.
- [x] 1.3 Update README install guidance minimally.
- [x] 1.4 Run focused docs gate and commit/push the issue work unit.

### Issue #589 — update trust model docs

- [x] 2.1 Read `gh issue view 589` and identify trust-model drift.
- [x] 2.2 Add a RED docs gate for release tarball/checksum/no-fallback guidance.
- [x] 2.3 Update README/security docs minimally.
- [x] 2.4 Run focused docs gate and commit/push the issue work unit.

### Issue #592 — HTTP token env docs

- [x] 3.1 Read `gh issue view 592` and identify env-token documentation gaps.
- [x] 3.2 Add a RED docs gate for `httpTokenEnv` / `DYSFLOW_HTTP_TOKEN` guidance.
- [x] 3.3 Update README and HTTP API docs minimally.
- [x] 3.4 Run focused docs gate and commit/push the issue work unit.

### Verify, archive, and close

- [x] 4.1 Run `pnpm test`, `pnpm build`, `pnpm lint`, and `pwsh -Command "Invoke-Pester scripts/tests/"`.
- [x] 4.2 Confirm GitHub Actions success.
- [x] 4.3 Archive this change and add `archive-report.md`.
- [x] 4.4 Commit/push archive.
- [x] 4.5 Close #588, #589, and #592 with commit SHA + test evidence comments.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.x | `test/docs/readme-release-doc.test.ts` | Docs gate | Existing README docs gate failed as expected after new test | RED: focused test failed before README edit | GREEN: `pnpm vitest run test/docs/readme-release-doc.test.ts` | Single docs contract for issue #588 | None needed |
| 2.x | `test/docs/readme-release-doc.test.ts` | Docs gate | Existing #588 gate passed | RED: focused test failed before README/security docs edit | GREEN: `pnpm vitest run test/docs/readme-release-doc.test.ts` | README + security trust model checked | None needed |
| 3.x | `test/docs/readme-release-doc.test.ts`, `test/docs/http-api-doc.test.ts` | Docs gate | Existing #588/#589 gates passed | RED: focused tests failed before README/API docs edit | GREEN: `pnpm vitest run test/docs/readme-release-doc.test.ts test/docs/http-api-doc.test.ts` | README + HTTP API docs checked | None needed |

## Implementation commits

| Commit | Work unit | SDD tasks | Verification | Access sync |
|---|---|---|---|---|
| `efc060a`, `7ee1a81` | Issue #588 README install release guidance + CI formatting fix | 1.1-1.4 | `pnpm vitest run test/docs/readme-release-doc.test.ts`; `pnpm lint`; CI `28334101220` | N/A |
| `e48142f` | Issue #589 update trust model docs | 2.1-2.4 | `pnpm vitest run test/docs/readme-release-doc.test.ts`; `pnpm lint`; CI `28334223107` | N/A |
| `00e0063` | Issue #592 HTTP token env docs | 3.1-3.4 | `pnpm vitest run test/docs/readme-release-doc.test.ts test/docs/http-api-doc.test.ts`; `pnpm lint`; CI `28334361015` | N/A |
| Pending archive commit | Archive and closeout | 4.1-4.5 | `pnpm test`; `pnpm build`; `pnpm lint`; `pwsh -Command "Invoke-Pester scripts/tests/"` | N/A |
| `PENDING-FOLLOW-UP` | Fresh review blocker fix for #592 README HTTP API token guidance | follow-up | RED: `pnpm vitest run test/docs/readme-release-doc.test.ts test/docs/http-api-doc.test.ts` failed on stale README HTTP API section; GREEN: focused docs tests, `pnpm test`, `pnpm build`, `pnpm lint`, `pwsh -Command "Invoke-Pester scripts/tests/"` | N/A |
