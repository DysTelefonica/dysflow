# Tasks: Fix MCP Tool-Call Hang

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 280-420 |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: runner timeout/failure contract; PR 2: MCP terminal response + tiny E2E probe evidence |
| Delivery strategy | force-chained |
| Chain strategy | stacked-to-main |

Decision needed before apply: No — user selected chained PRs, 400-line max, automatic SDD.

## Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Prove and bound runner timeout/failure behavior | PR 1 | Base after #361 or isolated branch; RED before code |
| 2 | Ensure MCP `tools/call` always receives terminal responses | PR 2 | Depends on runner returning bounded failures |
| 3 | Add one short E2E fixture probe/manual evidence | PR 2 | No broad smoke battery |

## Phase 1: RED Tests — Runner Boundary

- [x] 1.1 Add/extend `test/core/runner/powershell-executor.test.ts` to prove timeout paths resolve instead of leaving callers pending.
- [x] 1.2 Add/extend `test/core/runner/access-runner.test.ts` to assert runner timeout results include stable classification, timeout metadata, and operation identity.
- [x] 1.3 Add/extend config/path tests to prove `E2E_testing`-style `.dysflow/project.json` resolves local access/backend paths and timeout metadata as expected.
- [x] 1.4 Run only the focused runner/config tests and capture RED evidence.

## Phase 2: GREEN Implementation — Runner Boundary

- [x] 2.1 Fix the smallest runner/executor path that can leave `doctor`/Access operations pending or only surfacing timeout after an outer shell kill.
- [x] 2.2 Preserve safe cleanup semantics: no generic `MSACCESS.EXE` killing; use Dysflow operation ownership where applicable.
- [x] 2.3 Normalize timeout/failure metadata so callers can translate it without parsing raw stderr.
- [x] 2.4 Run focused runner/config tests and confirm GREEN evidence.

## Phase 3: RED Tests — MCP Terminal Response

- [x] 3.1 Add/extend `test/adapters/mcp/stdio.test.ts` to prove a tool handler timeout/failure still emits one terminal JSON-RPC response.
- [x] 3.2 Add/extend `test/adapters/mcp/tools.test.ts` to prove `dysflow_doctor`/`list_tables` route structured runner failures into safe MCP tool responses.
- [x] 3.3 Run only the focused MCP adapter/tool tests and capture RED evidence.

## Phase 4: GREEN Implementation — MCP Terminal Response

- [x] 4.1 Fix MCP/tool translation only as needed so bounded core failures become terminal `tools/call` responses.
- [x] 4.2 Avoid hiding runner bugs with a broad adapter-only timeout unless runner resolution remains impossible.
- [x] 4.3 Run focused MCP tests and confirm GREEN evidence.

## Phase 5: Verification and Tiny E2E Probe

- [x] 5.1 Run `pnpm test` after focused suites pass.
- [x] 5.2 Run `pnpm build`.
- [x] 5.3 From `E2E_testing`, run one short `tools/call dysflow_doctor` probe and one short process-observation probe only if needed; do not run the broad E2E smoke battery.
- [x] 5.4 Persist apply progress and verification evidence, explicitly separating #361 startup evidence from #362 tool-call execution evidence.
