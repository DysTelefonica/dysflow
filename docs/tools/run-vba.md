# `run_vba` procedureName parsing + error taxonomy (#1174)

`run_vba` parses `procedureName` into `<module>.<procedure>` once at the
adapter boundary (`src/adapters/mcp/alias-tools.ts::buildRunVbaRequest`)
and threads the parsed `moduleName` + `procName` through both the dry-run
plan and the apply-path preflight
(`src/core/services/vba-service.ts::AccessVbaService.execute`). The two
paths therefore MUST agree on procedure resolution for the same input —
the bug #1174 reports is exactly the asymmetry that broke that contract.

## procedureName parsing contract

The pure parser lives at
`src/core/services/vba-procedure-name-parser.ts`. It has no `node:*`
imports and is unit-tested at
`test/core/services/vba-procedure-name-parser.test.ts`.

| Input shape | Parsed result | Behavior |
|---|---|---|
| `"ModuleName.PublicSub"` | `{ moduleName: "ModuleName", procName: "PublicSub" }` | Standard form. The apply path's preflight looks up `procName` in the module's source. |
| `"PublicSub"` (no dot) | `{ moduleName: "", procName: "PublicSub" }` | Legacy `dysflow_vba_execute` shape. The apply path falls back to an all-modules scan. |
| `""` / whitespace-only | rejected with `PROCEDURE_NAME_EMPTY` | Adapter short-circuits BEFORE the runner is spawned with `MCP_INPUT_INVALID`. |
| `".Foo"` / `"Module."` / `"."` | rejected with `PROCEDURE_NAME_INVALID` | Adapter short-circuits BEFORE the runner is spawned with `MCP_INPUT_INVALID`. |
| `"../etc/Foo"` | rejected with `PROCEDURE_NAME_INVALID` | Path-like module name rejected; adapter short-circuits with `MCP_INPUT_INVALID`. |
| `"Module.Nested.Type.Proc"` | `{ moduleName: "Module", procName: "Nested.Type.Proc" }` | First dot wins. Matches the VBA canonical form `AccessApplication.Run` resolves. |

The dry-run plan echoes the parsed values:

```json
{
  "dryRun": true,
  "willExecute": false,
  "willModifyAccess": false,
  "procedureName": "ModuleName.PublicSub",
  "moduleName": "ModuleName"
}
```

## Three procedure-resolution error codes

The runtime distinguishes three mutually-exclusive procedure-resolution
conditions. A consumer MUST branch on the exact code returned:

| Code | Where it fires | Remediation |
|---|---|---|
| `MCP_PROCEDURE_NOT_ALLOWED` | Adapter gate (`canonical-handlers.ts::ensureProcedureAllowed`) — procedure is not in `allowedProcedures`. | Surface `error.allowedProcedures` to the user; ask whether to add the procedure to the allowlist. |
| `MCP_ALLOWLIST_NOT_CONFIGURED` | Adapter gate — no allowlist AND `dryRun: true` was NOT passed. | Declare `allowedProcedures` in `.dysflow/project.json` for permanent fixes; pass `dryRun: true` once as opt-out. |
| `PROCEDURE_NOT_FOUND` | Service preflight (`vba-service.ts::checkProcedureExists`) — procedure is NOT declared in the project's VBA source. | Read `error.details.{procedure, moduleName, scannedModules}`. Verify the spelling, run `import_modules({ moduleNames: [...] })` to seed the source tree, recompile in Access VBE. |
| `PROCEDURE_NOT_CALLABLE` | Service reclassifier (`vba-service.ts::reclassifyRunnerFailure`) — procedure IS in the binary's `VBComponents` but Access COM cannot invoke it. Typical cause: stale p-code after source edits without a VBE recompile. | `error.remediation` says "Recompile in Access VBE (Debug → Compile) so the binary's compiled p-code matches the on-disk source, then retry." Follow it. NOT the same fix as `PROCEDURE_NOT_FOUND` (which needs an import). |

### Reclassifier patterns

The `PROCEDURE_NOT_CALLABLE` reclassifier detects three COM error shapes
and reclassifies them from the generic `RUNNER_FAILED` envelope:

| Pattern | Origin |
|---|---|
| `Excepci[oó]n al llamar a\s+["']Run["']` | Spanish-localized Access COM error from `$AccessApplication.Run($ProcedureName)` failing. |
| `Cannot run (?:the )?macro` | English fallback for the same root cause. |
| `object that is closed or doesn't exist` | Access COM state error when the VBE is in a non-compiled state. |

When the runner returns `RUNNER_FAILED` (or any other runner-side code)
with a message that matches one of these patterns, the reclassifier
rewrites the envelope to `PROCEDURE_NOT_CALLABLE` with `error.details`
carrying `{ procedure, moduleName, runnerCode, runnerMessage }` for
traceability. Genuine runner failures (e.g. `VBA_MANAGER_TIMEOUT`,
`VBA_MANAGER_FAILED`, an unrelated `RUNNER_FAILED`) propagate verbatim.

## apply/dryRun consistency contract

When you observe a divergence between `dryRun: true` and `apply: true`
for the same procedureName in the same binary:

1. `dryRun: true` succeeds with `moduleName` / `procedureName` populated,
   `apply: true` fails with `PROCEDURE_NOT_FOUND` for the same input →
   the binary's compiled p-code is out of sync with the on-disk source.
   Force a re-compile in Access VBE (Debug → Compile) and retry. Do NOT
   chase a phantom import issue.
2. `apply: true` fails with `PROCEDURE_NOT_CALLABLE` → the procedure is
   in the binary's `VBComponents` but Access COM cannot invoke it (stale
   p-code). The typed envelope's `error.remediation` says "Recompile in
   Access VBE then retry"; follow it.
3. `apply: true` fails with `RUNNER_FAILED` whose message matches
   `Excepción al llamar a "Run"` → the reclassifier should have caught
   it. If you see the raw `RUNNER_FAILED`, file an issue against the
   reclassifier at `src/core/services/vba-service.ts::reclassifyRunnerFailure`.

The contract is pinned in:

- `test/core/services/vba-procedure-name-parser.test.ts` — parser unit matrix (13 cases).
- `test/adapters/mcp/run-vba-apply-dryrun-consistency-1174.test.ts` — adapter + service integration.
- `test/core/services/vba-procedure-not-callable-1174.test.ts` — reclassifier matrix (5 cases).
- `test/adapters/mcp/alias-tools.test.ts` — adapter-level envelope shapes.

## Cross-reference

- Parser source: `src/core/services/vba-procedure-name-parser.ts`
- Wiring: `src/adapters/mcp/alias-tools.ts::buildRunVbaRequest`, `src/core/services/vba-service.ts::AccessVbaService.execute`
- Allowlist gate: `src/adapters/mcp/canonical-handlers.ts::ensureProcedureAllowed`
- Reclassifier: `src/core/services/vba-service.ts::reclassifyRunnerFailure`
- Skill § Self-check: `~/.config/opencode/skills/dysflow-usage/SKILL.md` item 8 (apply/dryRun agreement)
- Skill example: `~/.config/opencode/skills/dysflow-usage/assets/examples/run-vba.md`
- Skill error codes: `~/.config/opencode/skills/dysflow-usage/references/error-codes.md` (`PROCEDURE_NOT_FOUND`, `PROCEDURE_NOT_CALLABLE`)
