# Tasks: signed-release-checksums-ed25519

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~120-220 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single commit/work unit |
| Delivery strategy | single-pr |
| Chain strategy | N/A |
| Decision needed before apply | No |

## Work Unit: Release checksum authenticity

- [x] 1.1 Read issue #572 and inspect current updater implementation/tests.
- [x] 1.2 Create SDD proposal and delta spec for signed checksum verification.
- [x] 1.3 Write RED tests for missing and invalid `SHA256SUMS.sig` fail-closed behavior.
- [x] 1.4 Generate/install a new Ed25519 release keypair, configure the trusted public key, and make the updater enforce signature verification before checksum trust.
- [x] 1.5 Ensure release workflow/tooling/docs explicitly state public-key-only repository storage, private-key secret handling, and no source fallback.
- [x] 1.6 Run focused tests and complete strict TDD evidence.
- [x] 1.7 Run full verification (`pnpm test`, `pnpm build`, `pnpm lint`, `pwsh -Command "Invoke-Pester scripts/tests/"`).
- [x] 1.8 Commit and push the implementation with SDD/Tests/Ref traceability.
- [x] 1.9 Archive the change only after CI is green.
- [ ] 1.10 Close issue #572 with implementation commit SHA(s) and test references.

## Keypair decision

The user approved generating and using a new Ed25519 keypair because no prior release signing key exists. Store the private key only as GitHub Actions secret `RELEASE_SIGNING_KEY`; store the matching public key in `RELEASE_SIGNING_PUBLIC_KEY_PEM` for updater verification. Do not commit the private key.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.3-1.6 | `test/cli/commands/install/downloader.test.ts`, `test/docs/release-signing-key-flow.test.ts` | Unit/port-level + docs/tooling contract | ✅ Existing downloader/docs tests passing before production edits | ✅ `pnpm vitest run test/cli/commands/install/downloader.test.ts test/docs/release-signing-key-flow.test.ts` failed: missing embedded public key, missing signature not enforced, unsafe default key output, missing private-key ignore | ✅ Focused tests passed after embedding public key, requiring signatures, signing workflow hardening, and safe keygen docs/tooling | ✅ Added valid-signature happy path, missing-signature fail-closed, invalid-signature fail-closed, signature-before-checksum failure ordering, keygen safety, no checksum-only workflow text | ✅ No extra production refactor needed; full gates passed |

## Verification

- ✅ Focused: `pnpm vitest run test/cli/commands/install/downloader.test.ts test/docs/release-signing-key-flow.test.ts`
- ✅ Focused regression: `pnpm vitest run test/cli/install.test.ts test/cli/commands/install/downloader.test.ts test/docs/release-signing-key-flow.test.ts`
- ✅ Full: `pnpm test` — 138 files / 1753 tests passed
- ✅ Build: `pnpm build`
- ✅ Lint: `pnpm lint`
- ✅ Pester: `pwsh -Command "Invoke-Pester scripts/tests/"` — 379 passed / 4 skipped
- ✅ CI: `https://github.com/DysTelefonica/dysflow/actions/runs/28351832798` — green on `f5680c9`

## Key material status

- Public key committed in `RELEASE_SIGNING_PUBLIC_KEY_PEM`.
- Matching private key installed as GitHub Actions secret `RELEASE_SIGNING_KEY` on `DysTelefonica/dysflow` at 2026-06-29T05:43:09Z.
- No private key is stored in git.

## Implementation commits

| Commit | Work unit | SDD tasks | Verification | Access sync |
|---|---|---|---|---|
| `f90d09f` | `feat(update): enforce signed release checksums` | 1.3-1.8 | Focused Vitest; `pnpm test`; `pnpm build`; `pnpm lint`; Pester | N/A |
| `f5680c9` | `chore(sdd): trace signed checksum implementation` | 1.8 | Trace-only; CI run 28351832798 green | N/A |
