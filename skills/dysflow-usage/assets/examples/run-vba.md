# run_vba — dysflow MCP

## When to use

Invoke a public VBA procedure in the active project and return its payload. Use for helper invocations, smoke checks, and ad-hoc reads against testable services.

## Prerequisites

- The human has compiled the project in Access (Debug > Compile) since the last persistence that touched this procedure. Verified via `get_capabilities.humanCompilePending:false`.
- The procedure gate is **default-allow**: no allowlist entry is required. A project that declared `capabilities.procedures.strictMode: true` is the exception — there `procedureName` must appear under `capabilities.procedures.allow`, or the call must use the non-executing `apply:false` plan.

## `procedureName` parsing contract (#1174)

`run_vba` parses `procedureName` into `<module>.<procedure>` once at the adapter boundary and threads the parsed `moduleName` + `procName` through both the dry-run plan and the apply-path preflight. The two paths therefore MUST agree on procedure resolution for the same input.

| Shape | Parsed result | Behavior |
|---|---|---|
| `"ModuleName.PublicSub"` | `{ moduleName: "ModuleName", procName: "PublicSub" }` | Standard form. The apply path's preflight looks up `procName` in the module's source. |
| `"PublicSub"` (no dot) | `{ moduleName: "", procName: "PublicSub" }` | Legacy `dysflow_vba_execute` shape. The apply path falls back to an all-modules scan. |
| `""` / whitespace-only | rejected with `MCP_INPUT_INVALID` (`run_vba requires a non-empty procedureName.`) | Adapter short-circuits BEFORE the runner is spawned. |
| `".Foo"` / `"Module."` / `"."` | rejected with `MCP_INPUT_INVALID` (message contains "malformed") | Adapter short-circuits BEFORE the runner is spawned. |
| `"../etc/Foo"` | rejected with `MCP_INPUT_INVALID` (path-like module) | Adapter short-circuits BEFORE the runner is spawned. |
| `"Module.Nested.Type.Proc"` | `{ moduleName: "Module", procName: "Nested.Type.Proc" }` | First dot wins. Matches the VBA canonical form `AccessApplication.Run` resolves. |

The `apply:false` plan response echoes the parsed values so plan and apply agree:

```json
{
  "dryRun": true,
  "willExecute": false,
  "willModifyAccess": false,
  "procedureName": "ModuleName.PublicSub",
  "moduleName": "ModuleName"
}
```

## Call

```json
{
  "tool": "run_vba",
  "arguments": {
    "procedureName": "ModuleName.Public_Sub",
    "argsJson": "[\"arg1\",42,false]",
    "apply": true
  }
}
```

- `procedureName` — exact symbol path; include the module name as namespace.
- `argsJson` — JSON-encoded positional array. Match the signature exactly.
- `apply` — `true` executes; `false` returns the non-executing plan.

## Call — one-off non-executing plan via `apply:false`

Under `capabilities.procedures.strictMode: true`, when the procedure is not (yet) in `capabilities.procedures.allow`, pass `apply:false` once. This is the documented escape hatch — not a habit, not a workaround. Projects on the default gate never need it for this reason.

```json
{
  "tool": "run_vba",
  "arguments": {
    "procedureName": "ModuleName.Public_Sub",
    "apply": false
  }
}
```

`apply:false` does not execute the procedure; it lets the runtime validate the call shape without raising `MCP_PROCEDURE_NOT_ALLOWED` / `MCP_ALLOWLIST_NOT_CONFIGURED`. To make the call stick across sessions under `strictMode`, declare the procedure in the `capabilities` block of `.dysflow/project.json` (the runtime re-reads both `allowedProcedures` and `strictMode` per call).

## One-shot `_Temp_*.bas` workflow (v4)

`vba_inline_execution` no longer exists. For one-shot VBA, create a source-controlled module such
as `src/modules/_Temp_Audit_ReadFlags.bas`. Under `capabilities.procedures.strictMode: true`, also
add its exact public procedure name to `capabilities.procedures.allow`; on the default gate no
config edit is needed.

1. Preview and apply `import_modules` with `moduleNames`, `transactional:true`, and explicit
   `apply:false` then `apply:true` calls.
2. Stop and wait for the human to compile with **Debug > Compile VBA Project**. This is a project
   policy checkpoint; do not describe it as automatic runtime compilation.
3. Preview and apply `run_vba` for the procedure.
4. Preview and apply `delete_module`, then delete the `.bas` source and, under `strictMode`, its temporary allowlist entry.
5. Finish with `vba_orphan_audit` plus `verify_code`; no `_Temp_` orphan or unexpected actionable
   drift may remain.

Keep useful code by renaming it to a registered `Test_*` atom or a permanent descriptive module
before cleanup. The temporary-module workflow does not relax `m_TestingMode=True` or permit
production backend writes.

## Anti-patterns for this call

- Don't invent `procedureName` strings without checking the binary — use `list_objects` or an existing capability doc to confirm.
- Under `strictMode`, don't use `apply:false` as a substitute for maintaining `capabilities.procedures.allow` when execution is intended. Either declare the procedure so the runtime can enforce the gate across every call, or decide the project does not want `strictMode` and drop the flag.
- Don't call `run_vba` without compiling first — `get_capabilities.humanCompilePending:true` ⇒ the runtime will refuse or surface stale code.
- Prefer the `<module>.<procedure>` shape — the apply path's all-modules fallback is more expensive than the targeted lookup and obscures which module actually owns the symbol. The prefix addresses dysflow's source preflight, not Access: since #1787 the runtime strips it before calling `Application.Run`, because Access resolves by procedure name and accepts only a REFERENCED database's project name as a qualifier. Both shapes therefore reach the same procedure.
- Don't conflate `PROCEDURE_NOT_FOUND` (procedure absent from source/binary) with `PROCEDURE_NOT_CALLABLE` (procedure present in binary but Access refused to invoke it). The remediation differs — the former needs an import, the latter needs a VBE recompile.
- Don't treat `VBA_RUNTIME_ERROR` as a compile problem. The procedure ran; recompiling cannot change what it raised. Read `error.details.vbaMessage` and fix the procedure or the data it depends on.

## Result shape (what the agent reads back)

- `ok` — `true` on success.
- `result` — return value serialized to JSON.
- `error.code` — typed envelope on failure. The "procedure-resolution" codes are mutually exclusive and a consumer MUST branch on the exact one returned:
  - `MCP_PROCEDURE_NOT_ALLOWED` — allowlist gate rejected the procedure. Reachable only under `capabilities.procedures.strictMode: true`. Surface `error.allowedProcedures` to the user.
  - `MCP_ALLOWLIST_NOT_CONFIGURED` — `strictMode: true` with no allowlist AND the non-executing `apply:false` plan was NOT used. Never emitted on the default gate.
  - `PROCEDURE_NOT_FOUND` — procedure not declared in the project's VBA source. Remediation: import or fix the procedure name.
  - `PROCEDURE_NOT_CALLABLE` — procedure is in the binary's `VBComponents` but Access refused to invoke it. Read `error.remediation`, which dysflow derives from the source preflight: either it stripped a verified module prefix (qualification ruled out, so the p-code is stale — recompile in Access VBE, Debug → Compile) or the qualifier could not be tied to a module of this project, in which case the remediation names it and asks whether it is a referenced database whose reference resolves. Follow it ONCE — a recompile that reports no errors and does not change the outcome means the cause is elsewhere.
  - `VBA_RUNTIME_ERROR` — the procedure WAS invoked, ran, and raised. Remediation: read `error.details.vbaMessage` for the VBA error and fix the procedure or its state. Do NOT recompile.
  - `VBA_MANAGER_TIMEOUT`, `VBA_MANAGER_FAILED` — generic runner-side failures.
- `error.details` — structured (for timeouts: `phase`, `wasApply`, `operationTimeoutMs`, `reapedProcessPids`, `cleanupWarnings`, `expectedLockFile`; for `PROCEDURE_NOT_CALLABLE`: `procedure`, `moduleName`, `invokedProcedureName` (the name that actually reached `Application.Run`), `runnerCode`, `runnerMessage`; for `VBA_RUNTIME_ERROR`: the same four plus `vbaMessage`).

## Live verification

```bash
get_capabilities  # confirm humanCompilePending before invoking
```

A recompile that does not change the outcome is diagnostic information,
not a reason to recompile again. If `apply:true` keeps failing after a
`Debug → Compile` that reported no errors, the procedure is callable and
the failure is coming from inside it: expect `VBA_RUNTIME_ERROR` and read
`error.details.vbaMessage`. Before #1681 this case was reported as
`PROCEDURE_NOT_CALLABLE`, which sent callers into an endless
recompile loop; a runtime older than that release still does.

## Cross-reference

- Anti-patterns: `assets/anti-patterns.md#2-critical-dont-call-compile_vba` (compile_vba is removed; no compile path on the agent side), `assets/anti-patterns.md#16-critical-dont-reuse-a-compiled-binary-that-had-import_modules-since-the-last-compile` (compile gate)
- Error codes: `references/error-codes.md#MCP_PROCEDURE_NOT_ALLOWED`, `references/error-codes.md#MCP_ALLOWLIST_NOT_CONFIGURED`, `references/error-codes.md#PROCEDURE_NOT_FOUND`, `references/error-codes.md#PROCEDURE_NOT_CALLABLE`, `references/error-codes.md#VBA_RUNTIME_ERROR`, `references/error-codes.md#VBA_MANAGER_TIMEOUT`, `references/error-codes.md#VBA_MANAGER_FAILED`
- Skill § Self-check: `SKILL.md#self-check-before-any-dysflow-call` (item 8 — plan/apply agreement)
