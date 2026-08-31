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

## Procedure-resolution error codes

The runtime distinguishes five mutually-exclusive conditions. A consumer
MUST branch on the exact code returned:

| Code | Where it fires | Remediation |
|---|---|---|
| `MCP_PROCEDURE_NOT_ALLOWED` | Adapter gate (`canonical-handlers.ts::ensureProcedureAllowed`) — procedure is not in `allowedProcedures`. | Surface `error.allowedProcedures` to the user; ask whether to add the procedure to the allowlist. |
| `MCP_ALLOWLIST_NOT_CONFIGURED` | Adapter gate — no allowlist AND `dryRun: true` was NOT passed. | Declare `allowedProcedures` in `.dysflow/project.json` for permanent fixes; pass `dryRun: true` once as opt-out. |
| `PROCEDURE_NOT_FOUND` | Service preflight (`vba-service.ts::checkProcedureExists`) — procedure is NOT declared in the project's VBA source. | Read `error.details.{procedure, moduleName, scannedModules}`. Verify the spelling, run `import_modules({ moduleNames: [...] })` to seed the source tree, recompile in Access VBE. |
| `PROCEDURE_NOT_CALLABLE` | Service reclassifier (`vba-service.ts::reclassifyRunnerFailure`) — procedure IS in the binary's `VBComponents` but Access refused to invoke it. Typical cause: stale p-code after source edits without a VBE recompile. | `error.remediation` says "Recompile in Access VBE (Debug → Compile) so the binary's compiled p-code matches the on-disk source, then retry." Follow it. NOT the same fix as `PROCEDURE_NOT_FOUND` (which needs an import). |
| `VBA_RUNTIME_ERROR` | Service reclassifier — the procedure WAS invoked, it ran, and it raised. | Read `error.details.vbaMessage` for the error VBA emitted and fix the procedure or the state it depends on. Recompiling does not apply: the procedure is callable and running. |

### Reclassifier patterns

The reclassifier discriminates on the INNER Access message, never on the
PowerShell wrapper around it. The VBA dispatch in
`scripts/dysflow-access-runner.ps1` calls `$access.Run.Invoke(...)`
without a `try`/`catch`, so a VBA `Err.Raise` inside the invoked
procedure escapes to the script's global catch and reaches the service
wrapped as:

```text
Excepción al llamar a "Run" con "1" argumento(s): "<the real VBA error>"
```

That wrapper is present on EVERY exception the procedure can throw, so it
carries no information about which of the two conditions occurred. Only
the inner message does.

`PROCEDURE_NOT_CALLABLE` fires when the inner message is one of Access's
own "cannot invoke this" errors, in either localization:

| Pattern | Origin |
|---|---|
| `Cannot run (?:the )?macro` / `No se puede ejecutar la macro` | Access refused the callback invocation. |
| `object that is closed or doesn't exist` / `se refiere a un objeto que est[áa] cerrado o que no existe` | Access COM state error when the VBE is in a non-compiled state. |
| `can'?t find the procedure` / `no encuentra el procedimiento` | Access cannot resolve the procedure name against the compiled project. |

`VBA_RUNTIME_ERROR` fires when the failure carries the Access invocation
wrapper (`Excepción al llamar a "Run"` / `Exception calling "Run"`) but
the inner message is NOT one of the patterns above — meaning the
procedure was reached and raised on its own. The service unwraps the
inner message into `error.details.vbaMessage` and puts it in
`error.message`, so the caller reads the VBA error the procedure emitted
instead of a recompile instruction that cannot help (#1681).

Both codes carry `error.details` with
`{ procedure, moduleName, runnerCode, runnerMessage }` for traceability.
Genuine runner failures (e.g. `VBA_MANAGER_TIMEOUT`,
`VBA_MANAGER_FAILED`, an unrelated `RUNNER_FAILED`) propagate verbatim.

## apply/dryRun consistency contract

When you observe a divergence between `dryRun: true` and `apply: true`
for the same procedureName in the same binary:

1. `dryRun: true` succeeds but `apply: true` fails with
   `PROCEDURE_NOT_FOUND` → the binary's p-code is out of sync with the
   on-disk source. Recompile in Access VBE and retry.

2. `apply: true` fails with `PROCEDURE_NOT_CALLABLE` → the procedure is
   in `VBComponents` but Access refused to invoke it (stale p-code).
   Follow `error.remediation` and recompile.

3. `apply: true` fails with `VBA_RUNTIME_ERROR` → the procedure ran and
   raised. Read `error.details.vbaMessage`. Do NOT recompile: `apply`
   reached the procedure, so its p-code is current.

4. `apply: true` fails with `RUNNER_FAILED` whose message carries the
   Access invocation wrapper → the reclassifier missed it. File an issue
   against `vba-service.ts::reclassifyRunnerFailure`.

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
