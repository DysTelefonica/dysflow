# Proposal: TDD Coverage Holes — MCP E2E + VBA Module Forwarding

**Change key**: `tdd-coverage-holes`
**Project**: dysflow
**Date**: 2026-06-29

## Intent

The change closes ten TDD coverage holes that leave two real production risks unverified: (1) the `Object.hasOwn(params, "moduleNames")` bug at `src/adapters/vba-sync/vba-sync-adapter.ts:251` breaks single-name forwarding for `exists` and `delete_module`, sending PowerShell an empty module list and either throwing `"Exists requiere exactamente un nombre"` or silently doing nothing; (2) the E2E suite's stop-on-fail and zombie-guard guardrails are not unit-tested against the real `record()` body, so a future refactor could break the refuse-start and post-tool zombie-check contracts without any test going red. The change must satisfy two hard rules the user established on 2026-06-29: **stop-on-fail** (any FAIL row aborts the battery immediately, no further tools run) and **suite-owned PIDs only** (the guardrail watches only PIDs this E2E itself spawned; other Dysflow consumers on the same host are out of scope).

## Scope

| # | Hole | Test file (real) | Public API surface | Assertion contract |
|---|------|------------------|--------------------|---------------------|
| **H1** | `exists` single-name forwarding | `test/adapters/vba-sync/vba-sync-adapter-exists-forwarding.test.ts` (NEW) | `new VbaSyncAdapter({ executor: fake, ... }).execute("exists", { moduleName: "Foo" })` | captured request has `moduleNamesProvided === true` AND `moduleNames === ["Foo"]` |
| **H2** | `delete_module` single-name forwarding | `test/adapters/vba-sync/vba-sync-adapter-delete-forwarding.test.ts` (NEW) | `VbaSyncAdapter.execute("delete_module", { moduleName: "Foo", force: true })` | captured request has `moduleNamesProvided === true` AND `moduleNames === ["Foo"]` AND `extra.force === true` |
| **H3** | `record()` stop-on-fail edge cases | `test/quality-gates/mcp-e2e-record-stop-on-fail.test.ts` (REWRITE) | import `record` from `E2E_testing/_helpers/mcp-e2e-record.mjs`; `vi.mock("./mcp-harness.mjs")` | (a) `expected:"error"` + harness `isError:false` → throws REFUSE-START or STOP-ON-FAIL, (b) `expected:"error"` + `isError:true` → continues, (c) `expected:"success"` + `isError:true` → throws STOP-ON-FAIL |
| **H4** | Preflight catches a real leaked PID | `test/quality-gates/mcp-e2e-preflight-real-pid.test.ts` (NEW, integration-gated) | spawn a Node child that stays alive (`spawn(node, ["-e", "setInterval(...)"])`), call `waitForNoOwnPids(500, 100)`, then `record(...)` | first `record()` call detects the leaked PID and throws `REFUSE-START` before any tool starts |
| **H5** | Zombie detection walks descendants, not just the Node child | `test/quality-gates/mcp-e2e-grandchild-zombie.test.ts` (NEW) | spawn `node -e "child_process.spawn(node, ['-e', 'setInterval(...)'])"` so the inner Node outlives the outer; the outer PID is in `suiteOwnPids`; verify the inner grandchild is detected | `waitForNoOwnPids(2000, 100)` returns `{ found: true, pids: [grandchildPid] }` (or the test documents the limitation if GREEN cannot satisfy it) |
| **H6** | Final lingering-access-check end-to-end | `test/quality-gates/mcp-e2e-final-lingering-check.test.ts` (NEW) | drive the real `mcp-e2e.mjs` via a wrapper harness that leaves a zombie at the end; assert the report's last row | `rows.at(-1).tool === "lingering-access-check"` AND `rows.at(-1).pass === false` |
| **H7** | Per-tool post-tool zombie check | covered inside H3 (mock returns specific `childPid`, assert the `tool:zombie-check` row) | import real `record()` from extracted helper; mock harness | rows include `${tool}:zombie-check` with `pass === true` when child exits, `false` when it lingers |
| **H8** | `import_modules` dry-run path | `test/adapters/vba-sync/vba-sync-adapter-import-dry-run.test.ts` (NEW) | `VbaSyncAdapter.execute("import_modules", { moduleNames: ["Foo"], dryRun: true })` | returns `OperationResult` with `data.dryRun === true` and `data.plans[]`; no executor call when dry-run |
| **H9** | `import_modules` compile:true untrustworthy-doc path | `test/adapters/vba-sync/vba-sync-adapter-compile-untrustworthy.test.ts` (NEW) | `VbaSyncAdapter.execute("import_modules", { moduleNames: ["Form_MyForm"], compile: true })` with fake executor returning `compileResult.verified: false` | returned `data.compileVerified === false` AND `data.documentModuleWarning` is set |
| **H10** | `export_all` prune guardrails | `test/adapters/vba-sync/vba-sync-adapter-prune-guards.test.ts` (NEW) | `VbaSyncAdapter.execute("export_all", { exportPath, prune: true })` | (a) fake executor returns `warnings: [...]` → captured prune decision is `applied:false, reason:"export-had-warnings"`; (b) `exportPath` inside the dysflow runtime → `INVALID_INPUT` error returned |

## Non-goals

- **Not replacing `scripts/dysflow-vba-manager.ps1`**. The bug is upstream of PowerShell; we forward the right `-ModuleNamesJson` and the script needs no change.
- **Not changing the MCP transport or protocol**. `stdio.ts` dispatch, JSON-RPC framing, and the `MCP_WRITES_DISABLED` gate stay as-is.
- **Not modifying the production Access fixtures** under `E2E_testing/` (the `.accdb` files, the source tree). Tests use the existing `sandboxPlan`.
- **Not introducing a global MSACCESS.EXE scanner**. The suite-owned-PIDs-only contract is preserved.
- **Not changing `runMcpHarness`** beyond what extraction requires; behavior is identical.
- **Not adding new features** (no grandchild-tree walking is **promised** in GREEN; if the test in H5 documents a limitation, the limitation is the truthful answer, not a deferral).

## Approach

### Work unit A — RED: real forwarding tests (H1, H2)

Create `test/adapters/vba-sync/vba-sync-adapter-exists-forwarding.test.ts` and `...-delete-forwarding.test.ts`. Mirror the existing fake-executor pattern from `test/adapters/vba-sync/vba-sync-adapter.test.ts:25-50`:

```typescript
const captured: VbaManagerExecutionRequest[] = [];
const service = new VbaSyncAdapter({
  executor: async (req) => { captured.push(req); return { exitCode: 0, stdout: "DYSFLOW_RESULT {\"ok\":true}", stderr: "", durationMs: 1, timedOut: false }; },
  accessPath: "C:/db/front.accdb",
  destinationRoot: "C:/repo/src",
  env: {},
  operationRegistry: new InMemoryAccessOperationRegistry(),
});
await service.execute("exists", { moduleName: "Foo" });
expect(captured[0].moduleNamesProvided).toBe(true);
expect(captured[0].moduleNames).toEqual(["Foo"]);
```

Both tests MUST FAIL on the current code because the bug at line 251 makes `moduleNamesProvided === false` even though the mapping produces `["Foo"]`. Run `pnpm test` and confirm both new files are red; the bug is reproduced.

### Work unit B — GREEN: fix `Object.hasOwn` check (H1, H2)

Edit `src/adapters/vba-sync/vba-sync-adapter.ts:251` to follow the mapping's output, preserving R4. Replace the single line with:

```typescript
const moduleNamesProvided =
  (toolName === "import_all" && Object.hasOwn(params, "moduleNames")) ||
  moduleNames.length > 0;
```

Reasoning: for `import_all` the explicit-empty case (`moduleNames: []` provided) is a documented R4 no-op plan and must keep the PowerShell `-ModuleNamesJson` field absent; for every other mapping, the presence signal IS the mapping's resolved array — if the mapping produced names, the upstream caller clearly wanted them and PowerShell must receive `-ModuleNamesJson`. This makes H1 and H2 GREEN, keeps R4 green, and does not affect any mapping whose `moduleNames()` returns `[]` legitimately (none of the current MAPPINGS do for `import_all`-like cases).

Re-run `pnpm test`. The two new tests in work unit A go green. Existing tests must still pass.

### Work unit C — RED: extract `record()` and assert stop-on-fail (H3, H7)

Extract the `record()` body from `E2E_testing/mcp-e2e.mjs:122-202` into `E2E_testing/_helpers/mcp-e2e-record.mjs` exporting:

```javascript
export async function record(ctx, /* { area, tool, args, options } */)
// where ctx = { callMcp, runMcpHarness (or injected), suiteOwnPids, waitForNoOwnPids, isOwnPidAlive, rows, log }
```

The function's body stays byte-for-byte identical; only the dependency surface becomes explicit. Then rewrite `test/quality-gates/mcp-e2e-record-stop-on-fail.test.ts` to import the real `record` and assert all four cases (H3a, H3b, H3c, H7). Use `vi.mock()` on `mcp-harness.mjs` to control harness return values. Tests MUST FAIL because the existing file is an in-memory simulation that does not import the real function.

### Work unit D — GREEN: make `mcp-e2e.mjs` consume the extracted module (no behavior change)

`E2E_testing/mcp-e2e.mjs` imports the extracted `record` and passes its `ctx`. No observable change to the E2E suite. Run `node E2E_testing/mcp-e2e.mjs` (or the `pnpm test:e2e:mcp` shell) to confirm the suite still completes and produces the same row count. Work unit C's new tests turn green.

### Work unit E — RED: real-subprocess zombie test (H4, H5)

Create `test/quality-gates/mcp-e2e-preflight-real-pid.test.ts` and `test/quality-gates/mcp-e2e-grandchild-zombie.test.ts`. Use Node's `child_process.spawn` to create real long-lived children and grandchildren. The H4 test asserts `record()` aborts on a leaked child; the H5 test asserts `waitForNoOwnPids` can detect a grandchild that outlives its parent. These tests MUST FAIL on the current implementation because the preflight walks only `suiteOwnPids` (Node child PIDs) — a grandchild MSACCESS.EXE-shaped survivor is invisible.

### Work unit F — GREEN: extend the PID check, or document the limitation

If `isOwnPidAlive` (or a new `isDescendantAlive`) can be implemented portably on Windows (e.g. via `wmic process get ProcessId,ParentProcessId` or `tasklist /FO CSV /V`), extend it to walk descendants. The implementation must remain scoped to the suite's own PID set — never a global scan. If portable descendant detection is not feasible inside the change budget, H5's test asserts the **honest current behavior** (grandchild orphans are not detected) and `verify-report.md` records this as a known limitation with a follow-up issue reference. **The honest answer is preferred over a fake green.**

### Work unit G — verify: end-to-end green

Run the full gate:

```bash
pnpm test
pnpm test:ps1
pnpm test:e2e:mcp
```

Capture exit codes, test counts, and the `list_access_operations` result showing zero `MSACCESS.EXE -Embedding` orphans. Write `openspec/changes/tdd-coverage-holes/verify-report.md` with the SHA of every commit in the change, the three exit codes, and the orphan count.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/adapters/vba-sync/vba-sync-adapter.ts:251` | Modified | Replace `Object.hasOwn(params, "moduleNames")` with the mapping-output-aware rule |
| `E2E_testing/mcp-e2e.mjs:122-202` | Refactored | Body moves to `E2E_testing/_helpers/mcp-e2e-record.mjs`; `mcp-e2e.mjs` imports it |
| `E2E_testing/_helpers/mcp-e2e-record.mjs` | New | Extracted, exported, dependency-injected `record()` |
| `test/adapters/vba-sync/vba-sync-adapter-exists-forwarding.test.ts` | New | H1 real test |
| `test/adapters/vba-sync/vba-sync-adapter-delete-forwarding.test.ts` | New | H2 real test |
| `test/adapters/vba-sync/vba-sync-adapter-import-dry-run.test.ts` | New | H8 |
| `test/adapters/vba-sync/vba-sync-adapter-compile-untrustworthy.test.ts` | New | H9 |
| `test/adapters/vba-sync/vba-sync-adapter-prune-guards.test.ts` | New | H10 |
| `test/quality-gates/mcp-e2e-record-stop-on-fail.test.ts` | Rewritten | H3 + H7 against real `record()` |
| `test/quality-gates/mcp-e2e-preflight-real-pid.test.ts` | New | H4 |
| `test/quality-gates/mcp-e2e-grandchild-zombie.test.ts` | New | H5 |
| `test/quality-gates/mcp-e2e-final-lingering-check.test.ts` | New | H6 |
| `openspec/changes/tdd-coverage-holes/verify-report.md` | New | Commit SHAs + exit codes for the three suites |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| **R4 regression on `import_all`** (explicit empty `moduleNames: []` should be a no-op plan) | Low | Work unit B's rule preserves the `import_all` arm of the check verbatim. The existing `vba-modules-adapter-import-lists.test.ts` covers R4; it must remain green after work unit B. |
| Pre-existing tests relying on the old `Object.hasOwn` semantics | Low-Med | Run `pnpm test` after work unit A (RED) and inspect any unexpected pass/fail. Document each in `verify-report.md`. The only mapping where `moduleNames()` returns `[]` with `Object.hasOwn` also true is `import_all` — and the rule keeps that arm. |
| Extracting `record()` breaks the E2E suite | Low | Work unit D is the explicit GREEN step that runs `pnpm test:e2e:mcp` after the refactor. The refactor is a body move, not a logic change. |
| `isOwnPidAlive` extension to descendants is non-portable | Med | Work unit F allows the honest "test documents the limitation" outcome. A fake green is worse than a documented limitation. |
| `pnpm test:e2e:mcp` is Windows + Access COM-bound; CI may not run it | Med | `verify-report.md` records the host on which it ran. The unit tests (H1, H2, H3, H8, H9, H10) run on every CI host. |

## Acceptance signals

- `pnpm test` green.
- `pnpm test:ps1` green.
- `pnpm test:e2e:mcp` green, **zero `MSACCESS.EXE` orphans at end** (verified via `dysflow_access_operations_list` returning an empty list of `running` operations), exit code 0.
- `openspec/changes/tdd-coverage-holes/verify-report.md` records: every commit SHA in the change, the three exit codes, the orphan count, and any H5 limitation if GREEN was not achievable.
- The ten test files in §Scope exist, are real (no `modules.handle()` stubs, no in-memory simulations of the E2E), and exercise `VbaSyncAdapter.execute(toolName, params)` or the extracted `record()` directly.

## Rollback plan

Each work unit is a separate commit:

1. WU-A (RED tests for H1, H2) — revert last commit to drop the two failing tests if WU-B reveals the rule is wrong.
2. WU-B (one-line fix at `vba-sync-adapter.ts:251`) — revert to restore the buggy behavior; the WU-A tests will go red again, which is the safety net.
3. WU-C (extract `record()` + RED tests) — revert to restore the inline `record()`. WU-C tests go red, WU-A tests stay green.
4. WU-D (consume extracted module) — revert to restore the inline `record()` call. E2E suite must still run.
5. WU-E (real-subprocess RED tests) — revert last commit to drop the H4/H5 tests.
6. WU-F (GREEN or documented limitation) — revert last commit to drop any descendant-walking code; the H5 test then documents the limitation.
7. WU-G (verify-report) — revert last commit; the report is a markdown file, low risk.

If WU-N+1 breaks WU-N, revert only the WU-N+1 commit and stop. Do not amend. Do not rebase.
