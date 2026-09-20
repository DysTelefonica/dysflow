# One-shot VBA execution

`vba_inline_execution` was removed in v4.0.0.

While it existed it capped `code` at 1024 characters and rejected a longer snippet with
`INVALID_INPUT`. That cap went out with the tool.

Nothing in the current runtime rejects VBA on length.

A consumer still seeing `Inline VBA code exceeds the 1024-character cap` is on a pre-v4.0.0
build — check `bootstrap({}).adapterVersion` and update.

The `_Temp_*.bas` workflow below has no character cap. It is the replacement for exactly the
snippets that used to hit the removed one.

Put one-shot code in a reviewable `_Temp_*.bas` module. Import it, compile it manually in Access,
run its public procedure, and remove both the binary module and source file.

## Configuring the allowlist

`run_vba` and stdio `test_vba` are **default-allow**. Neither refuses on
account of `capabilities.procedures.allow` unless the same project declares
`capabilities.procedures.strictMode: true`. Without that flag a populated
`allow` list is documentation, and a one-shot `_Temp_*` procedure needs no
config edit before it runs.

Under `strictMode: true` the stricter contract returns: `run_vba` requires a
non-empty `allow` list containing the target, while `test_vba` treats a missing
or empty list as unrestricted and a non-empty one as an atomic whitelist.

HTTP keeps its stricter network boundary either way and ignores `strictMode`:
`/vba/execute` rejects a procedure outside a populated list, and `/vba/test`
keeps its missing/empty default-deny.

## Migration path

1. If — and only if — the project has opted into
   `capabilities.procedures.strictMode: true`, add the exact procedure name
   (for example, `_Temp_Audit_ReadFlags`) to `capabilities.procedures.allow` in
   `.dysflow/project.json`. Projects on the default need no config change.
2. Create `src/modules/_Temp_Audit_ReadFlags.bas` with
   `Attribute VB_Name = "_Temp_Audit_ReadFlags"` and one public procedure.
3. Preview the import with `import_modules({ moduleNames: ["_Temp_Audit_ReadFlags"],
   transactional: true, apply: false })`; review the plan, then repeat with `apply: true`.
4. Ask the human to compile the project in Access with **Debug > Compile VBA Project** and wait
   for explicit confirmation. This is project policy; Dysflow records compile-pending state and
   reminders, but the human owns the compile checkpoint.
5. Preview `run_vba({ procedureName: "_Temp_Audit_ReadFlags", apply: false })`, then execute the
   same call with `apply: true` and the required `argsJson` when present.
6. Preview `delete_module({ moduleName: "_Temp_Audit_ReadFlags", apply: false })`, review the
   destructive target, then repeat with `apply: true`.
7. Delete `src/modules/_Temp_Audit_ReadFlags.bas` from source control. Under `strictMode`, remove
   its temporary `capabilities.procedures.allow` entry unless the procedure became permanent.
8. Run `vba_orphan_audit` and `verify_code`. Finish only when no `_Temp_` orphan remains and the
   source/binary report contains no unexpected actionable drift.

## Keep useful code

If the procedure is useful after the one-shot run, rename it before cleanup. Use a `Test_*` module
for a registered test atom or a descriptive permanent module without the `_Temp_` prefix.

## Safety boundary

The temporary-module workflow makes executed code visible in the repository and restores the
human compile checkpoint.

It does not make arbitrary VBA safe or replace the testing sandbox policy. Tests must still use
`m_TestingMode=True`, and production backend writes remain forbidden by project policy.
