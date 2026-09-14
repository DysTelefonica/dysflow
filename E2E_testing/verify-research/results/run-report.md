# Verify research run — 2026-09-13

## Environment

| Item | Observed |
| --- | --- |
| Repository | `C:\00repos\codigo\dysflow` |
| Source package version | `4.3.2` (`package.json`) |
| Installed entrypoint | `C:\Users\adm1\AppData\Local\dysflow\bin\dysflow.ps1` |
| Installed version | `4.3.2` |
| Node | `v26.4.0` |
| pnpm | `10.17.1` |
| Access password variable | present; value not read or printed |
| Golden frontend/backend | present; never modified |

## CLI availability

`probe-installed-cli.ps1` observed:

- `dysflow --version`: exit 0, `4.3.2`.
- `dysflow --help`: exit 0; no `verify` command advertised.
- `dysflow verify`: exit 1, `Unsupported command: verify`.

The source command map at `src/cli/index.ts` agrees with the installed runtime. There is no real top-level CLI command or flag set to exercise. The current implementation is the MCP `verify_code` route; no new CLI command was designed or added.

Full captured channels: [`installed-cli.json`](./installed-cli.json).

## Focused no-Access baseline

The requested wrapper form

```text
pnpm test -- <paths>
```

passed a literal `--` into Vitest, ignored the file filter, began the broad unit suite, and was stopped at the 300-second harness timeout. No conclusion is drawn from that interrupted broad run.

The equivalent truly focused command was:

```text
pnpm exec vitest run test/cli/help.test.ts test/core/services/vba-semantic-classifier.test.ts test/core/services/vba-semantic-classifier-whitespace-honesty-1669.test.ts test/core/services/vba-source-comparison.test.ts test/adapters/mcp/verify-code-response-shaping-1535.test.ts
```

Observed: **5 files passed, 170 tests passed, 0 failed**, duration 6.13 seconds.

## Lexical classifier probe matrix

Command:

```text
pnpm exec vitest run -c E2E_testing/verify-research/vitest.config.ts
```

Observed command result: **exit 1; 157 tests; 149 passed; 8 failed**. The matrix evaluated 39 independent lexical source pairs. Its ordinary goal assertions compare only `observedActionable` with `expectedFunctional`; known mismatches are not skipped, inverted, or marked as expected failures. The snippets are not compiled or imported and do not prove VBA or p-code/runtime equivalence. Form text is an unvalidated SaveAsText-shaped mock.

Functional-goal totals:

- 31 aligned with the goal.
- 8 failed normally:
  - apostrophe-comment case drift: expected non-functional; observed `bothChanged`, actionable;
  - combined identifier case, indentation, and comment case: expected non-functional; observed `bothChanged`, actionable;
  - changed `Rem` comment content: expected non-functional; observed `bothChanged`, actionable;
  - operator spacing: expected non-functional; observed `bothChanged`, actionable;
  - equivalent continuation reflow: expected non-functional; observed `bothChanged`, actionable;
  - equivalent colon-separated versus newline-separated statements: expected non-functional; observed `bothChanged`, actionable;
  - case-only `VB_Name`: expected non-functional; observed `bothChanged`, actionable;
  - synthetic `VB_PredeclaredId` change: expected functional; observed `attributeOnly`, non-actionable.

The category characterization contract passed **39/39**, and recommendation-to-category consistency passed **39/39**. These describe the current classifier; they are not independent semantic proof and do not participate in functional equality.

Expanded probes that aligned include escaped quotes and apostrophes inside strings, `Rem` case-only comments, swapped statement order, duplicate statement count, `Option Base`, conditional constants, missing `VB_Name`, member-level `VB_UserMemId`, dangerous merged tokens, and prior form/code/layout cases. Directive bodies now expose the policy-relevant construct, but the verifier is not an optimizer and the probes remain lexical. `VB_PredeclaredId` demonstrates broad attribute stripping only; `VB_UserMemId` retention follows the current pattern shape rather than semantic understanding.

These are research failures, not implementation-change authorization. Full data, counts, directionality, recommendations, and notes: [`mutation-matrix.json`](./mutation-matrix.json). The complete Vitest output is in [`mutation-matrix-vitest.txt`](./mutation-matrix-vitest.txt).

## Bounded real-Access integration

Preflight `list_access_operations` returned an empty operation list. The command was corrected to preserve the single-file filter:

```text
pnpm exec vitest run -c vitest.integration.config.ts test/integration/vba-source-comparison-real-fixture.test.ts
```

The existing test copied both Access fixtures into a unique `%TEMP%/dysflow-verify-integration-*` workspace. It does not compile VBA or call `run_vba`. It failed after 85.14 seconds at:

```text
test/integration/vba-source-comparison-real-fixture.test.ts:226
expect(importClass.ok).toBe(true)
```

Evidence boundary:

- Baseline source/binary equality assertions completed before the failure.
- CRLF/trailing-whitespace semantic classification completed before the failure.
- Strict-mode contrast completed before the failure.
- The disposable `TempVerifyClass` import returned `ok: false`.
- The current assertion does not print the failure envelope, so its typed cause is unknown and is not guessed.
- Attribute, form-serialization, and final functional-difference checks after line 226 did not execute.
- The integration `finally` removed its temp workspace; the post-run Access operation registry was empty.

## Single disposable import diagnostic

After explicit approval, a standalone no-retry harness ran exactly once:

- command exit 0; one diagnostic wrapper test passed in 28.10 seconds;
- `list_objects` succeeded, followed by exactly one `TempVerifyClass` import;
- the captured import envelope contains outer and nested `ok: true`, which establishes the one-run import success;
- the wrapper's green status alone does not establish import success: it checks capture stage/result presence, hashes, and cleanup, and may be green when it captures a failed import;
- the prior line-226 failure was not reproduced; no cause is inferred and no retry or follow-on mutation occurred;
- frontend/backend golden SHA-256 values were identical before and after;
- temp cleanup succeeded;
- no query, table, form opening, startup execution, `run_vba`, Access test, or compilation was requested.

The empty before/after operation arrays and health fields came from separate out-of-band MCP checks and were manually merged into the historical result JSON; the harness does not regenerate those fields. `passwordLogged: false` is declarative intent, not mechanical proof. Sanitization and the persisted artifact were reviewed for exposed credentials and paths, but no independent automated secret scan is claimed.

The copied backend was not proven relinked from original absolute linked-table targets. No topology-isolation claim is made. Complete captured envelope: [`import-class-diagnostic.json`](./import-class-diagnostic.json). Plan and static startup-suppression evidence: [`../ACCESS-DIAGNOSTIC-PLAN.md`](../ACCESS-DIAGNOSTIC-PLAN.md).

## Unexecuted real-runtime cases

The following remain explicitly unexecuted against Access:

- missing/extra module directionality,
- duplicate module identity,
- incomplete export fail-closed behavior,
- whole-project repeats and cache freshness,
- paired form `.cls` versus `.form.txt` evidence,
- mutation cases after the disposable class-import failure.

The approved diagnostic produced a complete success envelope rather than reproducing the failure. No further Access run is authorized. Conservative lexical, completeness/freshness, paired-artifact, and acceptance design boundaries are in [`../DESIGN.md`](../DESIGN.md).

No production implementation, fixture, or runtime install was changed in this run.
