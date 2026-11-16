# Issue #2000: [Bug]: Pi dysflow tool hides every error as 'Dysflow operation failed.' and drops the typed error envelope
Owner: direct Codex session. Branch: fix/pi-errors-2000. Delivery: single issue PR; forecast under 400 authored lines.
Tests: focused Vitest; no production runtime edits.

## Specs

- S1: "Atacalas todas poco a poco y al final cuando no quede nada pendiente sacamos release"
- S2: Issue acceptance quoted verbatim below.

### Verified symptom

In Pi (`@aroman22/dysflow-pi` 4.5.7, the `dysflow` facade tool), every Dysflow call whose MCP result has `isError: true` reaches the agent only as `Dysflow operation failed.`. The typed error (`error.code`, `message`, `remediation`, `details`) is dropped, so the agent cannot tell a failing test from a refused import or a wrong parameter, and cannot follow the remediation the runtime already returns.

Cause: `plugin/pi/native-tool.ts`, in `execute`:

```ts
if (result.isError === true) {
  throw new Error("Dysflow operation failed.");
}
```

The same `result` carries `content[0].text` and `structuredContent` with the full `dysflow.result/v1` failure envelope, but neither is passed on.

Errors that were hidden this way in one session, and that only became visible by calling `dysflow mcp` directly over stdio:

- `test_vba` with a failing test → `VBA_TESTS_FAILED` with the failing procedure and its assertion message (`... esperado [La fecha fin real no puede ser posterior a hoy.] obtenido []`). That is the expected RED of a TDD cycle and the agent needs the assertion text.
- `import_modules` on a form whose `.cls` differs from its `.form.txt` CodeBehindForm → `FORM_CODE_BEHIND_DIVERGES` with the remediation `acknowledgeCodeBehindWins:true`.
- `test_vba` without `destinationRoot` and with `detach:true` → also only `Dysflow operation failed.`, with no hint about which parameter was wrong.

### Reproduction evidence

1. In Pi with the Dysflow package installed, in a project with a `tests/*.json` manifest that has one failing test.
2. Call the facade: `dysflow({ tool: "test_vba", args: { cwd: "<worktree>", destinationRoot: "<worktree>\\src", testsPath: "tests/tests.vba.x.json", apply: true } })`.
3. Actual output: `Dysflow operation failed.`
4. The same call over stdio (`dysflow mcp`, `tools/call`) returns `structuredContent: { schemaVersion: "dysflow.result/v1", isError: true, ok: false, error: { code: "VBA_TESTS_FAILED", message: "1 VBA test(s) failed: <procedure> — <assertion>", details: { failures: [...] } } }`.

### Expected behavior

When the result is an error, the facade returns (or throws with) the error envelope: at least `error.code`, `error.message` and `error.remediation`, plus bounded `details` (for `test_vba`, the failing procedures and their assertion messages). The agent then sees the same information an MCP client gets, and can follow HR-13 of `dysflow-arnes` ("parse envelopes defensively, prefer `structuredContent`").

### RED test plan

`plugin/pi` unit test for `native-tool.ts`: with a fake `callTool` that returns `{ isError: true, content: [{ type: "text", text: "VBA_TESTS_FAILED: 1 VBA test(s) failed: Test_X — assertion" }], structuredContent: { schemaVersion: "dysflow.result/v1", isError: true, ok: false, error: { code: "VBA_TESTS_FAILED", message: "...", remediation: "..." } } }`, the tool's error output contains `VBA_TESTS_FAILED`, the message and the remediation. Fails today (only `Dysflow operation failed.`).

### Acceptance criteria

- [ ] An error result shows `error.code`, `error.message` and `error.remediation` to the agent.
- [ ] `test_vba` failures show each failing procedure with its assertion message (bounded).
- [ ] Invalid-parameter errors (`MCP_INPUT_INVALID`) show the rejected parameter.
- [ ] Successful results are unchanged.
- [ ] The Pi renderer (`renderDysflowResultText`) shows the error code on the card.

### Pre-submission checks

- [x] I searched open and closed issues for an equivalent report.
- [x] I removed secrets and private environment details from this report.


## Tasks

- T1: S1-S2, delegated, verified; reason: independent installer and Pi units launched together; parent owns git; implementation commit aac2b74e.

## Log

- L1: Explicit Bash and captured output; no coord or agent-coordination.

- L2: RED2 then GREEN11; independent verifier found four credential/path disclosure blockers; bounded correction RED4 then GREEN15, original blockers rechecked PASS. Parent spot check15/15 and diff check passed. Success/untyped baseline differential unchanged; RDD global off (not changed by agent).
- L3: pnpm --dir plugin/pi auto-install changed lockfile; parent restored only that generated diff to HEAD. Ignored plugin node_modules retained locally. Risk item2 privacy.
