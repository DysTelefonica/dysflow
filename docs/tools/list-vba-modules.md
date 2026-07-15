# `list_vba_modules` dispatch surface

Round-9 (#869) added a small but important seam-level change: `list_vba_modules`
is the only raw-executor caller of `spawnVbaManager` that passes `password`
without `env`. Before v2.11.2 the password never reached
`$env:ACCESS_VBA_PASSWORD` inside the child PowerShell process, so
`Open-AccessDatabase` at `scripts/dysflow-vba-manager.ps1:5017` rejected
password-protected `.accdb` projects with
`VBA_MANAGER_FAILED: No es una contraseña válida`. This note documents the
ownership chain, the password-resolution contract, and the broader dispatch
surface so the symmetry target stays visible to future maintainers.

## Ownership

The call chain runs from the MCP layer through the vba-sync adapter into the
core service and finally into the PowerShell executor:

1. **Adapter dispatch** — `VbaModulesAdapter.execute`
   (`src/adapters/vba-sync/vba-modules-adapter.ts:228-259`) recognises
   `toolName === "list_vba_modules"` and short-circuits the runner dispatch
   table to the dedicated service. It builds a `ListVbaModulesContext` whose
   `runVbaManager` is bound to the orchestrator executor (i.e.
   `spawnVbaManager`).
2. **Service** — `runListVbaModules`
   (`src/core/services/list-vba-modules-service.ts:186-201`) calls
   `ctx.runVbaManager({ ..., password: ctx.accessPassword })` WITHOUT
   attaching an `env`. The service merges the runner's binary enumeration
   with a filesystem walk of the source tree and emits the cross-reference
   payload `{ modules, summary, appliedFilters }`.
3. **Executor** — `spawnVbaManager`
   (`src/adapters/vba-sync/vba-sync-adapter.ts:1355-1427`) assembles the
   PowerShell `args` vector and delegates to
   `spawnPowerShellProcess` (`src/adapters/powershell/default-executor.ts`).
   This is the seam where the round-9 env-derivation rule lives.

## Password resolution

**Pre-v2.11.2 behaviour.** `ctx.accessPassword` (resolved upstream by
`VbaOperationsAdapter` from `.dysflow/project.json`) flowed into the request
as `request.password`. For mapped tools,
`executeMappedTool` (`src/adapters/vba-sync/vba-sync-adapter.ts:580-596`)
attached `{ DYSFLOW_ACCESS_PASSWORD, ACCESS_VBA_PASSWORD }` to `request.env`
explicitly. For raw-executor callers (`list_vba_modules`), no env was
attached — `buildChildEnv(undefined)` (`src/adapters/powershell/default-executor.ts:81-92`)
returned only the `POWERSHELL_SYSTEM_ENV_KEYS` whitelist
(`default-executor.ts:63-91`), so `$env:ACCESS_VBA_PASSWORD` was empty in
the child process. The fallback at `scripts/dysflow-vba-manager.ps1:259`
(`if (-not $Password) { $Password = $env:ACCESS_VBA_PASSWORD }`) then
resolved to `$null`, and `Open-AccessDatabase` at line 5017 rejected the
protected binary.

**v2.11.2+ behaviour.** `spawnVbaManager` now derives the child PowerShell
env whenever `request.password !== undefined && request.env === undefined`:

```ts
const childEnv =
  request.password !== undefined && request.env === undefined
    ? { ACCESS_VBA_PASSWORD: request.password, DYSFLOW_ACCESS_PASSWORD: request.password }
    : request.env;
```

The derivation mirrors `executeMappedTool`
(`src/adapters/vba-sync/vba-sync-adapter.ts:592-595`) exactly, so the
contract is symmetric across all dispatch paths. When an explicit caller
`env` is supplied (any value, including `{}`), it is forwarded verbatim —
the derivation must NOT merge on top and must NOT add a synthetic
`ACCESS_VBA_PASSWORD` key. This is pinned by
`test/adapters/vba-sync/spawn-vba-manager-command-line.test.ts` Case B and
the E2E `E2E_testing/mcp-e2e-issue-869-list-vba-modules-password-env.mjs`
Round 1.

## Shared dispatch surface

`spawnVbaManager` is the executor for EVERY vba-sync tool. The
password-env handling therefore matters for the whole surface, not just
`list_vba_modules`:

| Tool | Dispatch path | Env attachment |
|---|---|---|
| `list_objects`, `export_modules`, `import_modules`, `exists`, `delete_module`, `export_all`, `import_all`, `fix_encoding` | `executeMappedTool` (`vba-sync-adapter.ts:580-596`) | Explicit `env: { DYSFLOW_ACCESS_PASSWORD, ACCESS_VBA_PASSWORD }` when `password !== undefined` |
| `verify_code` | `vba-source-comparison.ts:328-331` (separate code path) | Explicit `env: { DYSFLOW_ACCESS_PASSWORD, ACCESS_VBA_PASSWORD }` when `password !== undefined` |
| `list_vba_modules` | `runListVbaModules` (`list-vba-modules-service.ts:186-201`) → raw `spawnVbaManager` | **No explicit `env`; relies on the round-9 derivation rule** |

The round-9 derivation rule is the symmetry target that closes the
`list_vba_modules` gap. Any future tool that takes the raw-executor path
without attaching an `env` will pick up the same derivation for free — that
is the point of putting the rule at the executor seam rather than at the
service seam.

## Known limitations

- The password is **never** passed as a `-Password <value>` script arg to
  PowerShell. It reaches the child script exclusively through the derived
  environment variables. Adding a CLI flag was explicitly rejected in
  `openspec/changes/r9-list-vba-modules-password-env/proposal.md` (variant
  2): it would put the password on the process command line (visible via
  `ps` / Process Monitor), require per-cmdlet `PSAvoidUsingPlainTextForPassword`
  suppression, and offer no marginal benefit over the env-fallback path.
  If a future threat model demands command-line isolation, the rejected
  variant 2 in the proposal is the hardening reference.
- The round-9 fix does not change which keys are forwarded to the child
  process. The two derived keys (`ACCESS_VBA_PASSWORD`,
  `DYSFLOW_ACCESS_PASSWORD`) match the fallback at
  `scripts/dysflow-vba-manager.ps1:259` and the PS variable
  `$DYSFLOW_ACCESS_PASSWORD` used by sibling tools.
- This fix does not change the executor's behaviour for callers that pass
  `request.env` explicitly — the `=== undefined` guard in the derivation
  ternary preserves the existing mapped-tool and verify_code contracts.
  The pinned unit-test Case C
  (`test/adapters/vba-sync/spawn-vba-manager-command-line.test.ts`)
  guards against a future "synthesize env anyway" regression.
