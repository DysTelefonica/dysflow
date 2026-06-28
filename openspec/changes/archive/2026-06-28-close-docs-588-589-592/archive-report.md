# Archive Report — close-docs-588-589-592

## Summary

Closed documentation/security-docs issues #588, #589, and #592 with strict docs-gate TDD. The change keeps the docs aligned with the release tarball trust model and env-first HTTP token configuration.

## Implementation commits

| Commit | Issue | Work unit | Verification |
|---|---:|---|---|
| `efc060a` | #588 | README install guidance now points to current GitHub Release assets instead of a pinned Git URL tag. | `pnpm vitest run test/docs/readme-release-doc.test.ts` |
| `7ee1a81` | #588 | Formatted the README release docs gate after CI lint failure. | `pnpm vitest run test/docs/readme-release-doc.test.ts`; `pnpm lint`; CI `28334101220` |
| `e48142f` | #589 | README/security update guidance now states GitHub Release archive + SHA-256 verification, hard aborts, and no source-build/git-clone fallback. | `pnpm vitest run test/docs/readme-release-doc.test.ts`; `pnpm lint`; CI `28334223107` |
| `00e0063` | #592 | README and HTTP API docs now prefer `httpTokenEnv` / `DYSFLOW_HTTP_TOKEN`, document precedence, and warn that inline `httpToken` is local-only and must not be committed. | `pnpm vitest run test/docs/readme-release-doc.test.ts test/docs/http-api-doc.test.ts`; `pnpm lint`; CI `28334361015` |

## Test summary

- `pnpm vitest run test/docs/readme-release-doc.test.ts` — passed for #588/#589.
- `pnpm vitest run test/docs/readme-release-doc.test.ts test/docs/http-api-doc.test.ts` — passed for #592.
- `pnpm test` — 135 files passed, 1729 tests passed.
- `pnpm build` — passed.
- `pnpm lint` — passed.
- `pwsh -Command "Invoke-Pester scripts/tests/"` — 374 passed, 0 failed, 4 skipped.

## CI runs

| Run | Commit | Result |
|---|---|---|
| `28333969717` | `efc060a` | Failed in `pnpm lint` due to Biome formatting; fixed by `7ee1a81`. |
| `28334101220` | `7ee1a81` | Success. |
| `28334223107` | `e48142f` | Success. |
| `28334361015` | `00e0063` | Success. |

## Outstanding items

- None for implementation. Issue closure comments are posted after the archive commit is green.
