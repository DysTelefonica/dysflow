# One-shot VBA execution

`vba_inline_execution` was removed in v4.0.0.

While it existed it capped `code` at 1024 characters and rejected a longer snippet with
`INVALID_INPUT`. That cap went out with the tool: nothing in the current runtime rejects VBA on
length, and a consumer still seeing `Inline VBA code exceeds the 1024-character cap` is talking to a
pre-v4.0.0 build. Check `bootstrap({}).adapterVersion` and update. The `_Temp_*.bas` workflow below
has no character cap — it is the replacement for exactly the snippets that used to hit it.

Put one-shot code in a reviewable `_Temp_*.bas` module. Import it, compile it manually in Access,
run its allowlisted public procedure, and remove both the binary module and source file.

`run_vba` remains default-deny: an execute call requires a non-empty
`allowedProcedures` list containing the target.

This differs intentionally from stdio `test_vba`, where a missing or empty list imposes no
restriction and a non-empty list enables an opt-in whitelist.

HTTP `/vba/test` keeps its stricter default-deny network boundary.

## Migration path

1. Add the exact procedure name (for example, `_Temp_Audit_ReadFlags`) to
   `capabilities.allowedProcedures` in `.dysflow/project.json`.
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
7. Delete `src/modules/_Temp_Audit_ReadFlags.bas` from source control. Remove its temporary
   `allowedProcedures` entry unless the procedure became permanent.
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
