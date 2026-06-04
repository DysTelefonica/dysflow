# Tasks: #417 sanitize-marker-payloads

## Status: COMPLETED

### Task 1 — RED test [DONE]
Write a failing behavior test in `test/core/runner/access-runner-marker-sanitization.test.ts`
that feeds a mock executor calling `onAccessProcessCaptured` with a `commandLine` containing a
known secret, and asserts the registry update stores `[REDACTED]` not the raw secret.

### Task 2 — B5: move secrets before executor call [DONE]
In `src/core/runner/access-runner.ts`, move the `dynamicBackendPassword` + `secrets` derivation
to before the `this.executor(...)` call so the values are in closure scope.

### Task 3 — B5: sanitize commandLine in onAccessProcessCaptured [DONE]
In the `onAccessProcessCaptured` closure, apply `sanitizeSecrets(process.commandLine, secrets)`
before passing `commandLine` to `this.operationRegistry.update(...)`.

### Task 4 — D3: typed marker contract [DONE]
Add `AccessProcessMarker`, `ProgressMarker` types with `isAccessProcessMarker`,
`isProgressMarker` type guards. Add JSDoc comments at the parse seam. Replace `as` casts with
validated guards in `spawnPowerShell`.

### Task 5 — GREEN: all tests pass [DONE]
`pnpm test` green (pre-existing Access COM failures excluded). `tsc --noEmit` clean.
