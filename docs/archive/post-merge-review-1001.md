# Post-merge voluntary review — PR #1003 (issue #1001)

## Why this document exists

PR #1003 was merged into `main` after an explicit operator decision to
bypass the `gentle-ai` review-gate (see PR body + issue #1001's closure
comment + Engram observation id `20827`). The bypass acknowledged three
audit-trail gaps:

1. **No adversarial review lens ran over the 5-file diff before merge.**
2. **No content-bound receipt was produced.**
3. **Future rebases onto this commit inherit a hole in the binding chain.**

This document is the voluntary close-the-gap pass. It is opt-in. Nobody is
required to run it. Its sole purpose is to give a curious reviewer a
focused, repeatable procedure to validate the most material risks in the
diff that the gate would otherwise have surfaced.

If you run this and find a real defect, the path forward is to open a new
issue and ship a follow-up PR — the original PR stays as it is.

## What the diff touches

```
E2E_testing/mcp-e2e-import-grow-in-place.mjs                     (modified)
E2E_testing/mcp-e2e-issue-807-features.mjs                       (modified)
E2E_testing/mcp-e2e-issue-869-list-vba-modules-password-env.mjs (modified)
src/core/services/vba-source-comparison-chunking.ts              (modified)
test/core/services/vba-source-comparison-chunking.test.ts        (modified)
```

The first three are **the same fix repeated three times**: swap each
script from `cwd: scriptDir` to the canonical `mcp-e2e` sandbox pattern
(`buildMcpE2eSandboxPlan` + `initializeMcpE2eSandbox`), plus a null-safe
`formatDetail()` and a JSON-RPC envelope parse via
`response.result.content`. The E2E focused suite (20 / 20 + 11 / 11
assertions) covers these three scripts.

The fourth file (`vba-source-comparison-chunking.ts`) is where the
substantive risk lives.

## Lens selection

The orchestrator lens table maps the dominant risk of this diff:

- **Clear naming, structure, maintainability, small refactors → `review-readability`**
- **Behavior, state, tests, determinism, regressions → `review-reliability`**  ← chosen
- **Shell / process integration, partial failures, recovery, degraded deps → `review-resilience`**
- **Security, permissions, data exposure, architecture, dependencies → `review-risk`**

The chunking fix changes how `compareSourceAgainstBinary` is dispatched
from a chunked run; it touches retry / timeout / parallel-merge state
plumbing. That is behavior + state + regression territory → run
**`review-reliability`**.

## Focus questions (review-reliability)

Work through these in order. The first question is the most material.

### F1. Does the chunk-recursion guard actually guard?

**The bug.** `runChunkedVerify` produced a chunk-level `params` spread
that forwarded `chunkSize`, `parallelChunks`, and `onChunkTimeout` into
the inner `compareSourceAgainstBinary` call. The inner call then ran
`resolveChunkOptions(params)`, saw the chunking keys, and re-entered
`runChunkedVerify` — infinite recursion until the runtime stack blew.

**The fix.** The chunking keys are now stripped before the inner call,
so `resolveChunkOptions` returns `{ disabled: true }` and the inner path
is single-flight `compareSourceAgainstBinary`.

**What to verify.**

1. Open `src/core/services/vba-source-comparison-chunking.ts`. Find the
   inner per-chunk call inside `runOneChunk`. Confirm the call site does
   **not** include `chunkSize` / `parallelChunks` / `onChunkTimeout` in
   the `params` object passed to `compareFn`. The cleanest patterns are:
   - build a new object omitting those three keys (`const innerParams =
     { ...params }; delete innerParams.chunkSize; ...`), or
   - pass `compareFn` a frozen default that explicitly excludes them, or
   - have `compareSourceAgainstBinary` itself strip them at entry
     (defense-in-depth at the lower layer).
2. Open `src/core/services/vba-source-comparison.ts`. Find the entry of
   `compareSourceAgainstBinary`. Confirm the FIRST thing it does with
   `params` is either:
   - calls `resolveChunkOptions(params)` **after** stripping the three
     chunking keys, OR
   - explicitly does NOT call chunking for a chunk-internal dispatch, OR
   - documents why recursion is impossible (e.g. always calls the
     legacy path).
3. Run the focused test for the recursion fix:

   ```bash
   pnpm vitest run test/core/services/vba-source-comparison-chunking.test.ts
   ```

   The new 14 assertions should all pass. None of them should be marked
   `.skip`, `.todo`, or `it.fails()`.

### F2. Does `onChunkTimeout: "retry"` actually re-create the chunk?

In `runOneChunk` (look for the `while (attempt <= 1)` loop), the retry
path runs `compareFn` a second time on the SAME chunk slice. Before this
fix, the underlying Access session state from the first attempt could
leak into the second; now that the chunking keys are stripped, the inner
call is guaranteed single-flight.

**What to verify.**

- Read the retry path. The function passed to `compareFn` should be
  invoked **at most twice** for any given chunk (one initial + one
  retry). On a clean retry, the inner `compareSourceAgainstBinary`
  should treat the second invocation as a fresh single-flight compare
  (no cross-chunk state carried over).
- If the first attempt failed for non-timeout reasons, the loop should
  NOT retry — only `isTimeoutErrorCode(r.error.code) && onChunkTimeout
  === "retry" && attempt === 1` triggers the retry.

### F3. Does `parallelChunks > 1` actually overlap safely?

`parallelChunks` is bounded to `1..8` in `resolveChunkOptions`. Each
chunk runs its own preflight + export + compare + cleanup cycle. The
file's top comment explicitly notes that Access COM does not reliably
support concurrent invocations against the same `.accdb`.

**What to verify.**

- The worker pool at the bottom of `runChunkedVerify` (around the
  `worker` IIFE) should fan out `workerCount = Math.max(1,
  Math.min(parallelChunks, totalChunks))` workers. Each worker pulls
  the next cursor, so two workers must NOT race the same chunk.
- If `onChunkTimeout === "fail"` aborts mid-flight, `aborted` is set and
  subsequent workers must short-circuit and not push their outcomes
  into the merged result. Confirm the worker loop breaks on
  `aborted !== null`.

### F4. Determinism of the merged result

The merged result accumulates `matched`, `different`, `missingInSource`,
`missingInBinary`, `diffs`, `actionableDifferent`, and
`nonActionableDifferent` across chunks, then sorts each with
`compareComparisonEntries` / `compareDiffEntries`. Order of chunks in
the final list MUST be stable across runs.

**What to verify.**

- Same input + same fixtures + same chunk count + same parallelism →
  byte-identical merged result (modulo timestamps). If you have a
  reproducible dataset, run the chunked path twice and diff the
  outputs.
- The semantic summary (`semanticSummary`) is a `Record<string, number>`
  accumulated by key. Insertion order does not matter (object key
  enumeration is stable per JS engine), but if the engine defaults to
  numeric key sort it should not matter for `summary`.

## Commands to run

```bash
# 1. Lint
pnpm lint --filter @dysflow/dysflow

# 2. Unit / integration (the chunking test is the most material)
pnpm vitest run test/core/services/vba-source-comparison-chunking.test.ts
pnpm test

# 3. Focused E2E (per-issue scripts, the actual regression suite for the bug)
node E2E_testing/mcp-e2e-import-grow-in-place.mjs
node E2E_testing/mcp-e2e-issue-807-features.mjs
node E2E_testing/mcp-e2e-issue-869-list-vba-modules-password-env.mjs

# 4. If you want to stress the chunking fix specifically
node E2E_testing/mcp-e2e-issue-807-features.mjs --chunkSize=1 --parallelChunks=4 --onChunkTimeout=skip
```

## What passes look like

- `pnpm lint` exits 0 (526 files touched historically).
- `pnpm vitest run test/core/services/vba-source-comparison-chunking.test.ts`
  reports 14 passed, 0 failed. None skipped.
- `pnpm test` reports the same total as before the PR (was 93 +
  14 new = 107 passing).
- Focused E2E scripts report 20 / 20 + 11 / 11 + 1 / 1 assertions.
- `dist` and `test-runtime/bin/dysflow.cmd` parity SHA matches
  `f21df150c4332bea02d5bc0a15f7e15be3565fbe`.

## What to do if you find a real defect

1. Open a new issue. Title: `fix(<area>): <short description>`. Label
   `bug`. Reference PR #1003 in the body so the chain is traceable.
2. Ship the follow-up PR with conventional-commits format and a
   RED-GREEN-refactor narrative. Reference the new issue in the body.
3. Do NOT amend PR #1003. The original commit is preserved as is; the
   audit trail of the explicit bypass decision is in
   `dysflow/issue-1001/bypass` (Engram topic key).

## Provenance

- PR: <https://github.com/DysTelefonica/dysflow/pull/1003>
- Issue: <https://github.com/DysTelefonica/dysflow/issues/1001>
- Commit: `e9b06453`
- Authorization literal: `autorizo el bypass del review gate para #1001 por decisión del maintainer` (maintainer `@ardelperal`, 2026-07-19, in-session chat)
- Engram observation: `20827` (topic_key `dysflow/issue-1001/bypass`, type `decision`, scope `project`)
- Issue closure comment: <https://github.com/DysTelefonica/dysflow/issues/1001#issuecomment-5016409174>
