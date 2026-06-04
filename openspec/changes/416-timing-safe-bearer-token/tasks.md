# Tasks: Timing-safe bearer token comparison (#416)

## Status: COMPLETE

## Tasks

- [x] **T1** Add failing behavior tests to `test/adapters/http/server.test.ts` in the
  `HTTP Bearer Authentication` describe block:
  - Same-length wrong token → 401 (exercises timingSafeEqual path)
  - Different-length wrong token → 401 and NOT 500 (key guard test)
  - Empty token after `Bearer ` prefix → 401
  - Correct token → 200 (pre-existing, extended coverage)

- [x] **T2** Add `import { timingSafeEqual } from "node:crypto"` to `src/adapters/http/server.ts`.

- [x] **T3** Replace `token !== context.httpToken` with:
  ```ts
  const tokenBuf = Buffer.from(token, "utf8");
  const expectedBuf = Buffer.from(context.httpToken, "utf8");
  if (tokenBuf.length !== expectedBuf.length || !timingSafeEqual(tokenBuf, expectedBuf)) {
  ```

- [x] **T4** Verify full suite green: `pnpm test` — 863 passed, 3 skipped.

- [x] **T5** Verify type-check clean: `pnpm exec tsc --noEmit` — no output (clean).

- [x] **T6** Commit with conventional commit message on branch `fix/416-timing-safe-bearer-token`.
