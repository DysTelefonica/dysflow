# Archive Report: signed-release-checksums-ed25519

## Status

Archived after implementation and green CI.

## Change summary

- Embedded a new trusted Ed25519 release-signing public key in `RELEASE_SIGNING_PUBLIC_KEY_PEM`.
- Installed the matching private key as GitHub Actions secret `RELEASE_SIGNING_KEY` and did not commit any private key material.
- Made the updater fail closed when `SHA256SUMS.sig` is missing or invalid before checksum entries are trusted.
- Added release workflow enforcement so GitHub Releases require `RELEASE_SIGNING_KEY`, publish `SHA256SUMS.sig`, and fail on unmatched signature assets.
- Hardened the key generation helper so the default output directory is outside the repository.
- Updated update trust model and README guidance to remove optional-signature language.

## Implementation commits

| Commit | Work unit | SDD tasks | Verification | Access sync |
|---|---|---|---|---|
| `f90d09f` | `feat(update): enforce signed release checksums` | 1.3-1.8 | Focused Vitest; `pnpm test`; `pnpm build`; `pnpm lint`; Pester | N/A |
| `f5680c9` | `chore(sdd): trace signed checksum implementation` | 1.8 | Trace-only; CI run 28351832798 green | N/A |

## Verification evidence

- Focused RED/GREEN: `pnpm vitest run test/cli/commands/install/downloader.test.ts test/docs/release-signing-key-flow.test.ts`
- Focused regression: `pnpm vitest run test/cli/install.test.ts test/cli/commands/install/downloader.test.ts test/docs/release-signing-key-flow.test.ts`
- Full local: `pnpm test` — 138 files / 1753 tests passed
- Build: `pnpm build`
- Lint: `pnpm lint`
- Pester: `pwsh -Command "Invoke-Pester scripts/tests/"` — 379 passed / 4 skipped
- CI: `https://github.com/DysTelefonica/dysflow/actions/runs/28351832798` — success on `f5680c9`

## Issue closure evidence

Issue #572 was closed on 2026-06-29 with commits `f90d09f`, `f5680c9`, and `d9a5bf3`, tests listed above, CI run links, and the note that `RELEASE_SIGNING_KEY` is installed for `DysTelefonica/dysflow`; if it is rotated before the next release, the operator must update the secret and matching public key together.
