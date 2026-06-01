# Test Port-Alignment Migration — Progress & Handoff

> **Living document.** Any agent (human or AI) can pick this up and continue from the status board.
> Update the **Status** and **Progress notes** of each task as you work. Keep the whole unit suite
> green after every task.

## Goal

Remove the implementation-coupled smells found in the test audit so the suite fully matches
[`testing-philosophy.md`](./testing-philosophy.md): tests assert on **outputs / boundary effects**,
never on internal call order or private collaborators. Behavior coverage must stay identical — we are
removing coupling, not deleting checks.

## Ground rules for whoever continues this

- After each task: run the affected test file, then `pnpm test` (full unit suite) — must be GREEN.
- Do not weaken assertions. Replace "was this internal called" with "what did the public surface
  produce". If a behavior was genuinely being verified, keep verifying it via output.
- Strict TDD is active for this repo. For test refactors: change the test to the port-aligned form,
  confirm it still fails for the right reason if you break the behavior, then confirm green.
- Conventional commits, no AI attribution. Do not commit unless the user asks.

## Verification commands

- Single file: `pnpm test <path-to-test>` (Vitest, `vitest.config.ts`).
- Full unit suite: `pnpm test`.
- Lint/build gate: `pnpm lint`.

## Status board

| ID | File | Smell | Touches prod? | Status |
|----|------|-------|---------------|--------|
| T1 | `test/cli/commands/tui.test.ts` | `vi.mock` of internal `cli/commands/install` module | **YES** | Done |
| T2 | `test/adapters/vba-sync/vba-sync-adapter.test.ts` (~L391-409) | `vi.spyOn(service.formService, ...)` reaches into the SUT | No | Done |
| T3 | `test/adapters/vba-sync/vba-operations-adapter.test.ts` (~L58, L88-105) | `toHaveBeenCalledWith` on internal routing / `limit:50` | No | Done |
| T4 | `test/core/runner/powershell-executor.test.ts` (~L46, L57-59) | positional `mockSpawn.mock.calls[0]?.[2]` access | No | Done |

Status values: `Pending` → `In progress` → `Done`. Add a date + one-line note in Progress notes.

---

## T1 — `tui.test.ts`: replace `vi.mock` with injected seams (requires prod change)

**Why it's coupled:** the test does `vi.mock("../../../src/cli/commands/install", ...)`. That module
is CLI command logic, not an I/O adapter. Mocking the module hides any routing regression in
`handleTuiCommand` and breaks if imports are reorganized.

**Root cause in prod (`src/cli/commands/tui.ts`):** two paths call the install module directly with
no injection seam:
- L17-21: `tuiSelectedAgents` path → calls `applyIntegrationSelection(...)` directly.
- L23-27: args path → calls `handleInstallCommand(...)` directly.
- (The integration loop at L119-128 ALREADY uses the `context.tuiApplyIntegrationSelection` seam — mirror that pattern.)

**Plan:**
1. `src/cli/commands/types.ts` — add to `CliCommandContext`:
   - reuse existing `tuiApplyIntegrationSelection?: (agents) => Promise<CliResult> | CliResult` (already present, L37).
   - add `tuiHandleInstall?: (args: readonly string[], options: { env?: ... }) => Promise<CliResult> | CliResult;`
2. `src/cli/commands/tui.ts`:
   - L17-21: `return (context.tuiApplyIntegrationSelection ?? ((agents) => applyIntegrationSelection(agents, { env: context.env ?? process.env })))(context.tuiSelectedAgents);`
   - L23-27: `return (context.tuiHandleInstall ?? ((a) => handleInstallCommand(a, { env: context.env ?? process.env })))(args, { env: context.env ?? process.env });`
3. `test/cli/commands/tui.test.ts`:
   - delete the `vi.mock(...)` block.
   - in the two affected tests, pass fakes via context:
     - test 1: `tuiApplyIntegrationSelection: async () => ({ exitCode: 0, stdout: "FAKE_APPLY", stderr: "" })` and assert `stdout === "FAKE_APPLY"`.
     - test 2: `tuiHandleInstall: async () => ({ exitCode: 0, stdout: "FAKE_INSTALL", stderr: "" })` and assert `stdout === "FAKE_INSTALL"`.
     - test 6 (loop): already exercises the loop → pass `tuiApplyIntegrationSelection` fake instead of relying on the module mock.

**Verify:** `pnpm test test/cli/commands/tui.test.ts` then `pnpm test`.

### Progress notes (T1)
- [2026-06-01] Done — Added `tuiHandleInstall` seam to `CliCommandContext` (types.ts), wired both early-exit paths in `tui.ts` through context seams (reusing existing `tuiApplyIntegrationSelection` pattern), deleted `vi.mock` block from `tui.test.ts` and injected fakes via context. All 6 tests pass; full suite 59/59 green; lint clean.

---

## T2 — `vba-sync-adapter.test.ts`: drop `vi.spyOn(service.formService, ...)`

**Why it's coupled:** the test grabs `service.formService` off the constructed SUT and spies on
`validateFormSpec`, then asserts `toHaveBeenCalledTimes(1)`. That's an internal-collaborator call
check, not an output check.

**Plan:** drive the behavior through the public API (`service.execute("validate_form_spec", ...)`)
and assert only on the returned `OperationResult` (shape/ok/payload). If a fake `formService` is
needed, inject it through the adapter's constructor/port like the rest of the suite, returning a
controlled result, and assert that result surfaces in the output. Remove the spy entirely.

**Verify:** `pnpm test test/adapters/vba-sync/vba-sync-adapter.test.ts` then `pnpm test`.

### Progress notes (T2)
- [2026-06-01] Done — Removed `vi.spyOn(service.formService, "validateFormSpec")` and its mock/restore calls; replaced with a direct `service.execute("validate_form_spec", { spec: { name: "SpyForm" } })` call asserting on the real returned `OperationResult` shape (`ok:true, data.valid, data.name, data.kind, data.controlCount`). 17 tests pass; full suite 59/59 green.

---

## T3 — `vba-operations-adapter.test.ts`: drop `toHaveBeenCalledWith` on internals

**Why it's coupled:** asserts the exact arg shape forwarded to `cleanupService.cleanup({...})` and
`registry.listRecent({ limit: 50 })`. Breaks if the adapter normalizes args or the limit becomes
configurable — both behavior-preserving.

**Plan:** replace `vi.fn()` doubles with simple hand-written fakes (matching the suite's style) that
return controlled `OperationResult`s. Assert on the adapter's returned `OperationResult` only. Drop
the `toHaveBeenCalledWith({... limit: 50 ...})` and forwarded-arg assertions. If "recent ops are
listed" is the behavior under test, assert it via the output the adapter returns, not via the call.

**Verify:** `pnpm test test/adapters/vba-sync/vba-operations-adapter.test.ts` then `pnpm test`.

### Progress notes (T3)
- [2026-06-01] Done — Dropped `toHaveBeenCalledWith({ limit: 50 })` from `list_access_operations` test (output assertion on `result.data` kept); dropped `toHaveBeenCalledWith({...})` from `delegates to the injected cleanup service` test (output `result.ok` kept); replaced `toHaveBeenCalledWith` in `defaults accessPath to empty string` test with output assertions on `result.ok` and `result.data`. 8 tests pass; full suite 59/59 green.

---

## T4 — `powershell-executor.test.ts`: de-brittle the spawn-options access (minor)

**Note:** `vi.mock("node:child_process")` here is LEGITIMATE — spawn IS the OS I/O boundary. The only
brittleness is positional access `mockSpawn.mock.calls[0]?.[2]` to read the options object.

**Plan:** extract a tiny helper, e.g. `const spawnOptions = () => mockSpawn.mock.calls.at(0)?.[2];`
or read the env via a named accessor, so a spawn-signature change is localized. Keep the env-filtering
assertions. Low priority — do last.

**Verify:** `pnpm test test/core/runner/powershell-executor.test.ts` then `pnpm test`.

### Progress notes (T4)
- [2026-06-01] Done — Extracted `const spawnOptions = () => mockSpawn.mock.calls.at(0)?.[2] ?? {}` helper at describe-block scope; replaced all four `mockSpawn.mock.calls[0]?.[2]` positional accesses in the env-construction tests with `spawnOptions()`. 11 tests pass; full suite 59/59 green.

---

## Do NOT touch

- `test/core/runner/access-runner-progress.test.ts` — its `onProgress` `toHaveBeenCalledWith`
  assertions are CORRECT: the caller's callback IS the observable boundary for progress reporting.
  This is port-level testing, not coupling. Leave it.

---

## Session status (2026-06-01)

**All four migrations (T1–T4) are DONE.** Full unit suite green: 59/59 files, 714 pass / 3 skipped;
`pnpm lint` clean. Committed together with the testing-criterion docs (`testing-philosophy.md`,
`AGENTS.md`, `CLAUDE.md`, this file) in a single `test:` conventional commit on `main`.

## Follow-ups (NOT done — open for a next session)

1. **Encapsulate `VbaSyncAdapter.formService` (root-cause of the T2 smell).** The adapter exposes a
   public getter for an internal sub-service collaborator. The T2 spy was only possible because of
   that leak. The test is now port-aligned, but the design smell remains: the public surface should
   not expose internal collaborators. Consider removing/privatizing the getter and routing form
   validation solely through `execute(...)`. Out of scope for the test migration; needs its own change.
2. **Optional:** revisit the 4 audit offenders' neighbours for the same patterns if the suite grows.
