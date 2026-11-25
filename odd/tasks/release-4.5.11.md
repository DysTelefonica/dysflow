# Release 4.5.11: resolve every open issue (#2017, #2018, #2019, #2020, #1918)
Branch: fix/release-4.5.11-issues. Delivery: ask-on-risk; forecast ~600 authored lines, one PR per repo policy (branch protection requires CI), then tag release.
Tests: `pnpm test` (Vitest), Pester for PowerShell scripts; heavy Access E2E only at the release tag.

## Specs

- S1 (user): "pues ponle el label de aprovadas y ponle la label que quieras pero las has de abordar todas para sacar release"
- S2 (#2020): "When the payload is too large to inline, return a bounded useful projection: `actionableOk`, `summaryStructured`, `actionableDifferent` (names and classification only) and `recommendedAction`. Or name a follow-up call or paging parameter to get it." Comment: for `get_test_run` "The minimum to show inline: `status`, `progress`, and `result.passed`/`result.failed` with the names of the failing tests."
- S3 (#2019): "Classify `GUID`, `NameMap` (and similar opaque identity blobs) as `formSerializationOnly`, like `Checksum`, `PrtDevMode` and `RecSrcDt`." User decision (2026-11-25): "GUID ruido si solo él cambia" — a GUID block whose only change is its hex rows is `formSerializationOnly`; invariant docs updated. NameMap is already stripped.
- S4 (#2018): "The dry-run reports a blocking item, e.g. `wouldRefuse: ["FORM_CODE_BEHIND_DIVERGES"]` with `requiredFlags: ["acknowledgeCodeBehindWins"]`, apart from the lint warnings." and "The import recipe in `dysflow-usage` names `acknowledgeCodeBehindWins` for form code edits." The third, optional point ("Possibly no refusal at all ...") is evaluated, not assumed.
- S5 (#2017): a frontend whose startup blocks on a modal dialog must not hang `query_execute` frontend writes until `RUNNER_TIMEOUT`; the table that fixes startup must be repairable through dysflow. Also `cleanup_access_operation force:true` failed with `MCP_TOOL_ERROR` (probe command failed).
- S6 (#1918): investigation of MSACCESS combase crashes; address with the prepared minimal COM-activation experiment when the machine is quiet, record evidence on the issue.

## Tasks

- T1 S2 inline — bounded projection in the large-result text fallback. Status: done, commit cc59eb9b (RED 3 failing → GREEN 9/9; budget wire ceilings raised by measured delta).
- T2 S3 inline — GUID-only block changes fold to formSerializationOnly. Status: done, commit 77e74ff0 (RED 1 failing → GREEN; anchor tests rewritten for the new rule).
- T3 S4 inline — import dry-run `wouldRefuse` + docs. Status: done (RED 2 failing → GREEN 6/6); third optional point not implemented, see L4.
- T4 S5 delegated (writer trigger a: parallel, disjoint surface scripts/**, needs live Access) — repro + fix. Status: done, commit 92e079d2. RED observed (Pester 2/3, Vitest 4/5) → GREEN; independent verifier (Risk item 2): no blockers, 2 concerns fixed in one batch (strict -Embedding match + no-target pin).
- T5 S6 inline after T4 (needs a quiet machine) — experiment + issue update. Status: experiment run; collector bug fixed, commit d844a2b1 (RED 1 → GREEN 6/6). Root cause still open, see L7-L8.
- T6 S1 inline — release prep (versions, CHANGELOG, skills dates), PR, tag. Status: pending.

## Log

- L1 (2026-11-25, user): "quiero que hagas un triage de las issues del repo" then "pues ponle el label de aprovadas y ponle la label que quieras pero las has de abordar todas para sacar release"
- L2: labels applied (status:approved + type/priority) to all five issues.
- L3: #2019 decision recorded in S3 (AskUserQuestion answer).
- L4: #2018 optional point 3 ("no refusal when the CodeBehindForm equals the last-synced base") not implemented. The verify base stores the canonical `.form.txt` hash, and canonicalization strips everything from `CodeBehindForm` on (`applyStructuralStrips`), so no stored evidence proves the copy is unedited. Guessing would weaken the #1865 guard; `wouldRefuse` + the documented flag covers the workflow.
- L5: `pnpm mcp:context-budget` measures `dist/` (build first). `getCapabilities.logicalBytes` +2 is path-dependent on this checkout (same on clean HEAD); not caused by this change.
- L6: `test/docs/bundled-skill-references-1964.test.ts` fails locally only, on git-ignored `skills/*/.atl/skill-registry.md` files; not present on CI.
- L7 (#2017): the hang trigger itself was not reproduced. Proven defects: frontend direct write started Access.Application and used the backend password; cleanup discarded the probe's `/Date(ms)/` start time, rejected `-Embedding` command lines, and let a probe throw surface as MCP_TOOL_ERROR. Startup-form hypothesis refuted (DAO never runs it).
- L8 (#1918): 2026-11-25 11:50:45–11:54:35Z, quiet machine (0 MSACCESS at start), 20 bare COM activations + 20 canonical open/close on a scratch .accdb: 0 errors, 40/40 exited on their own, 0 crash events in the window. 7 combase c0000005 events at 11:15–11:19Z fell in the #2017 live-repro window. The collector opened its window one UTC offset early (Get-WinEvent StartTime is local), so earlier per-run series on the UTC+1 runner may include up to an hour of prior events.
- L9: Engram mirror `odd/release-4.5.11/tasks` pending: mem_save failed with a host session confirmation timeout (2026-11-25).
