# Detached test_vba runs with a structured result fetch (#1993)

Route chosen by the owner: (a) the detached run lives in its own process, outside the stdio MCP server, and writes its marker and final result under `.dysflow/`; `get_test_run` only reads disk.
Synchronous `test_vba` stays unchanged. Built on v4.5.7 (#1990 progress marker, #1991 per-process attribution).

## Specs

- S1 Detached start: "`test_vba({ ..., detach: true })` (name open) starts the run under the existing operation registry and returns at once with `{ operationId, testsPlanned }`." Contract test: "returns an `operationId` in under ~2 s for a manifest whose run takes longer than that."
- S2 One Access per accessPath: "Tests still run **sequentially, one Access at a time**. Detached runs on the same `accessPath` queue or are refused with a clear code; they never run in parallel." Test: "a second detached run on the same `accessPath` does not start a second Access in parallel." Acceptance: "At most one Access process per `accessPath` is driven by dysflow tests at any time."
- S3 Fetch: "one read-only call, for example `get_test_run({ operationId, wait?: seconds })`, returns `status` (`running|passed|failed|cancelled|crashed`) and progress (`completed/planned`, current procedure, per #1990). When the run is finished it returns **the same `structuredContent` that a synchronous `test_vba` returns**. `wait` lets a client long-poll without a busy loop." Contract test: "returns `running` with progress while the run is active, then the same `passed`, `failed` and `tests[]` as the synchronous call for the same manifest."
- S4 Survive the client: "the result is persisted (operation registry or a results file under `.dysflow/`), so a client timeout, a reconnect or a new session can still read it." Test: "after the MCP client disconnects and reconnects, `get_test_run` still returns the finished result."
- S5 Docs: "`dysflow-usage` `references/test-runs.md` documents the pattern: start detached, keep working, fetch the result when the run ends. The ad-hoc stdio client is no longer needed."
- S6 Unchanged sync path: "The synchronous `test_vba` is unchanged." Acceptance: "`test-runs.md` documents the detached route, and synchronous `test_vba` behaves exactly as before."
- S7 Cleanup awareness (#1991): "Detached runs should register their Access PID so cleanup can tell them apart."

## Design (T1, approved)

Evidence: T0 map (no per-accessPath lock on the vba-sync path; `completed` registry records are purged; no detached-spawn precedent; `inspectTestResult` builds the final result and failures come back as a `VBA_TESTS_FAILED` error envelope).

- D1 Start (server, synchronous): `test_vba({..., apply:true, detach:true})` runs the same plan resolve, dryRun short-circuit and allowlist gate as today, so input errors return immediately. It then checks the lock (D3), writes `.dysflow/runtime/test-runs/<operationId>/request.json` (no password), spawns the runner detached and returns `{ operationId, testsPlanned, status:"running" }`. `detach` without `apply:true` stays a plan.
- D2 Runner: hidden CLI command `dysflow test-run --run-dir <dir>`, spawned with `process.execPath dist/cli/index.js`, `detached:true`, `windowsHide:true`, stdio to `runner.log` file descriptors, `unref()`; the password travels by env only. It builds the services with `createConfiguredServices` and calls the same `test_vba` tool handler as the MCP server, so the persisted payload is byte-for-byte the synchronous result (S3). Progress (#1990 `onProgress`) is written to `state.json`; the final MCP result goes to `result.json` (temp file + rename, transient EPERM/EBUSY retried).
- D3 One Access per accessPath: a per-accessPath lock file under `.dysflow/runtime/test-runs/` naming the active `operationId`, runner PID and start time. A second detached start while a live run holds it is refused fast with a new code `TEST_RUN_ALREADY_ACTIVE` carrying the active `operationId` (no queue). A lock whose runner is dead (PID gone or start time differs) is stale and taken over.
- D4 Fetch: new read-only tool `get_test_run({ operationId, wait? })`. Reads only disk, never the registry lock. Returns `status` `running|passed|failed|cancelled|crashed`, progress `{completed, planned, currentTest, passed, failed}`, and when terminal the stored synchronous result. `wait` long-polls the state file once a second, capped at 50 s so a 60 s client timeout is never hit.
- D5 Crash: a non-terminal state whose runner PID is dead or recycled reads as `crashed`, with the progress reached and the runner log tail. `cancelled` is reserved for the cancel route below and is never produced in this change.
- D6 Retention: the last 20 runs per project are kept; older run directories are pruned when a new run starts.
- D7 Cleanup (S7): the inner tracked operation already records its Access PID as a live `running` record, so #1991 never lists or kills it. The run state also records the runner PID.
- Open question Q1: S6 says synchronous `test_vba` is unchanged, but the acceptance asks for at most one Access per accessPath at any time. Proposed: a synchronous `test_vba` is refused with `TEST_RUN_ALREADY_ACTIVE` only while a detached run holds the lock; with no detached run active it behaves exactly as before.
- Out of scope: a `cancel_test_run` tool (a detached run is stopped through the existing cleanup tools); queueing.

## Tasks

- T0 Map the current test_vba execution path, registry, marker and process lifecycle (explore) — done
- T1 Design note (process model, lock, result file, statuses, crash detection) — done (approved, L3)
- T2 Detached runner process + result persistence + per-accessPath lock (S1, S2, S4, S7) — done (b452a286)
- T3 `test_vba` detach flag + `get_test_run` tool, contracts, registries (S1, S3, S6) — done (9026ef77; RDD review approved, 12 advisory findings)
- T4 Docs: test-runs.md, mcp-tools.md, examples, CHANGELOG (S5) — done (in 9026ef77)
- T3b Hardening batch 1: final counts from the result, HTTP refuses detach, T3 review warnings (async spawn error, two-directional guard, guard I/O, projectId error, stale view, matrix count) — done (commit after T3b)
- T3c Hardening batch 2, T2 review warnings (df58f715 review approved, 15 advisory findings): job-object survival of the detached runner, null start time pins the lock, explicit password dropped, runner forces writes, stale-takeover race, exclusive-create fallback race, prune failure blocks the accessPath, missing request leaves running, in-process start failure, runner options subset, lock key vs driven binary — pending
- T5 Verification: full pnpm test, test:ps1, mcp:context-budget, real-Access smoke (all) — pending

## Log

- L1 (2026-11-05, owner): "haz el triaje" of #1993, then "sí" to: "¿Querés que arranque con el camino (a)?" — (a) = the detached run is a process independent of the server, writing marker and result under `.dysflow/`; `get_test_run` reads disk; must manage orphans, PIDs and a per-accessPath lock.
- L2 Issue #1993 body is the source of the Specs above (author ardelperal, 2026-11-05).
- L3 (owner): "lo apruebo" — approves design D1-D7 and Q1 as proposed: synchronous `test_vba` is refused with `TEST_RUN_ALREADY_ACTIVE` only while a detached run holds the accessPath lock; otherwise unchanged.
