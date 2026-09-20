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

## The procedure gate is default-allow

`run_vba` refuses nothing on account of the allowlist unless the targeted
project declares `capabilities.procedures.strictMode: true` in
`.dysflow/project.json`. Without that flag, `capabilities.procedures.allow` is
documentation: every compiled procedure the write gate permits will run.

The write gate is the authoritative protection: `writesProcess.enabled`,
`writesProject.allowWrites`, and `writeExecutionPolicy` decide whether a
write-class call executes at all, and `humanCompilePending` covers stale
p-code. `run_vba` was the one exception — as an alias tool it never reached
`createDispatchTool`, where that gate lives, so it ran compiled VBA with writes
disabled and its allowlist was the only backend control. That is fixed in the
same change that made the procedure gate opt-in: `run_vba` now runs the write
gate ahead of the procedure gate. Relaxing the allowlist is only safe because
of it. A second allowlist that
every project had to hand-maintain — one entry per production procedure and one
per new test — bought operational cost and no additional safety, so it became
opt-in.

| `capabilities.procedures` state | `run_vba` behavior |
|---|---|
| `allow` absent, or `[]` | Every procedure runs. |
| `allow` populated, `strictMode` absent or not `true` | Every procedure runs; the list is documentation. |
| `allow` populated, `strictMode: true` | In the list → runs. Not in the list → `MCP_PROCEDURE_NOT_ALLOWED`. |
| `allow` absent or `[]`, `strictMode: true` | `MCP_ALLOWLIST_NOT_CONFIGURED`, unless `dryRun: true`. |

A non-boolean `strictMode` resolves to `false` — a typo cannot silently re-arm
a gate a project deliberately left open.

The flag is resolved per input, so one MCP process serving several worktrees
reads each project's own posture rather than the one present at startup.

Two surfaces keep a stricter posture and are NOT governed by `strictMode`:
HTTP `POST /vba/execute` still returns `HTTP_PROCEDURE_NOT_ALLOWED` for a
procedure outside a populated allowlist, and HTTP `POST /vba/test` keeps its
missing/empty-allowlist refusal. See
[HTTP API](../api/http-api.md) and
[adapter write gates](../security/adapter-write-gates.md).

## Procedure-resolution error codes

The runtime distinguishes five mutually-exclusive conditions. A consumer
MUST branch on the exact code returned:

| Code | Where it fires | Remediation |
|---|---|---|
| `MCP_PROCEDURE_NOT_ALLOWED` | Adapter gate (`canonical-handlers.ts::ensureProcedureAllowed`) — procedure is not in `allowedProcedures`. Reachable only under `capabilities.procedures.strictMode: true`. | Surface `error.allowedProcedures` to the user; ask whether to add the procedure to the allowlist, or whether the project wants `strictMode` at all. |
| `MCP_ALLOWLIST_NOT_CONFIGURED` | Adapter gate — no allowlist AND `dryRun: true` was NOT passed. Reachable only under `capabilities.procedures.strictMode: true`; it is NOT emitted by default. | Declare `allowedProcedures` in `.dysflow/project.json`, drop `strictMode`, or pass `dryRun: true` once as opt-out. |
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
