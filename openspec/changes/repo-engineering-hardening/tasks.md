# Tasks: Repo Engineering Hardening

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 650-900 across CI, config, tests, locking, and one seam |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 gates -> PR 2 #160 -> PR 3 #156 lock -> PR 4 #157 seam |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Quality gate foundation | PR 1 | Base `main`; smallest autonomous slice; tests/docs included. |
| 2 | Reconcile stale #160 | PR 2 | Base `main` after PR 1; no behavior change unless regression. |
| 3 | Registry cross-process lock | PR 3 | Base `main` after PR 2; implements #156 with RED/GREEN tests. |
| 4 | First legacy-service seam | PR 4 | Base `main` after PR 3; characterization before extraction. |

## Phase 1: Quality Gate Foundation

- [x] 1.1 RED: add workflow/script assertions proving `.github/workflows/ci.yml` runs `pnpm test` and `pnpm build`.
- [x] 1.2 GREEN: create `.github/workflows/ci.yml` with pnpm install, test, build, lint, and coverage steps.
- [x] 1.3 Update `package.json` and `vitest.config.ts` with minimal `lint`/`coverage` scripts and realistic exclusions.
- [x] 1.4 Document unavailable gate owner/follow-up if lint or coverage cannot be fully enforced now.
- [x] 1.5 Verify `pnpm test` and `pnpm build` pass.

## Phase 2: Issue #160 Reconciliation

- [x] 2.1 RED: ensure `test/cli/commands.test.ts` asserts malformed registry errors omit filesystem paths.
- [x] 2.2 GREEN: adjust `src/cli/commands/setup.ts` only if the sanitized `Invalid Dysflow project registry JSON` behavior regressed.
- [x] 2.3 Add concise issue/docs note recording close/update/follow-up status for #160.

## Phase 3: Registry Concurrency Safety

- [ ] 3.1 RED: add `test/core/runner/access-operation-registry.test.ts` cases for lock acquire/release and competing writer timeout/fail-safe behavior.
- [ ] 3.2 GREEN: add dependency-free file locking and atomic write flow in `src/core/operations/access-operation-registry.ts`.
- [ ] 3.3 Preserve existing in-process queue and constructor defaults; add optional `lockTimeoutMs`/`staleLockMs` only internally.
- [ ] 3.4 REFACTOR: keep locking helpers small and protocol-neutral; rerun `pnpm test` and `pnpm build`.

## Phase 4: Legacy Service Characterization Seam

- [ ] 4.1 RED: add characterization coverage in `test/core/services/vba-sync-legacy-service.test.ts` for one import-planning or form-catalog path.
- [ ] 4.2 GREEN: extract one helper group inside `src/core/services/vba-sync-legacy-service.ts` behind existing `execute` behavior.
- [ ] 4.3 REFACTOR: verify observable runner calls and protocol-neutral results stay equivalent.
