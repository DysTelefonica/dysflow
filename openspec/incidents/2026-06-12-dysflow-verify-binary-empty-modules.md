# Incident 2026-06-12 — `dysflow_verify_binary` returns VBA_MANAGER_FAILED

**Status:** Open (bug is on the Dysflow MCP side, not in this project).
**Discovered during:** SDD `indicator-issues-cleanup` closure on staging.
**Reporter:** `no_conformidades` project.

## Symptom

`dysflow_verify_binary` (and very likely `reconcile_binary`) fails with a Spanish-localized VBA binding error before it can produce a source↔binary comparison report.

## Reproduction

```jsonc
// Tool call
{
  "tool": "dysflow_verify_binary",
  "params": {
    "projectId": "00-no-conformidades-staging-clean",
    "diff": true
  }
}
```

## Response

```json
{
  "ok": false,
  "error": "VBA_MANAGER_FAILED",
  "message": "verify export failed with exit code 1",
  "details": "DYSFLOW_RESULT {\"ok\":false,\"error\":{\"code\":\"VBA_MANAGER_FAILED\",\"message\":\"No se puede enlazar el argumento con el parámetro 'NormalizedModules' porque es una matriz vacía.\"}}"
}
```

Translation: *"Cannot bind the argument with parameter 'NormalizedModules' because it is an empty array."*

## Evidence the binary is not the problem

- `dysflow_dysflow_doctor` returns `access-db-path: configured` and `access-open: opened` (both ok).
- `dysflow_list_objects` returns 49 forms, 48 modules, 54 classes, 49 documentModules.
- The on-disk source tree has 181 files under `src/{modules,classes,forms}/` and matches `destinationRoot: "src"` from `.dysflow/project.json`.
- The same Access binary has been successfully imported and compiled against in recent sessions (Phase 3.1-3.5 of the SDD).

The error originates inside the Dysflow `verify` export step, not in Access.

## Hypothesized root cause

The export routine builds a `NormalizedModules` array and passes it to an Access VBA call (likely `Application.VBE.ActiveVBProject.VBComponents.Export` or a wrapper). When the array is empty, the parameter-binding raises the Spanish DAO/VBA error. Most likely culprits:

- An over-narrow module filter that drops every module on this project.
- A source-root scan that doesn't match the project layout, leaving `NormalizedModules` empty before the export call.
- A stage that normalizes the module list and silently returns `()` when the input is unexpected.

## Suggested fix surface (for the Dysflow maintainer)

- The `verify` and `reconcile` paths in the MCP adapter (around `vba-manager.ts` or equivalent) that build `NormalizedModules` before the VBA call.
- Add a structured early-return: if the normalized list is empty, return `VERIFY_NO_MODULES` instead of letting `()` reach the VBA parameter.
- Default the filter to "all modules in the binary" when the source-root scan yields nothing, so the verify still runs on a clean export.

## Workaround used

- `git merge-base --is-ancestor <sha> <branch>` for reachability checks.
- Manual `Debug → Compile` in Access VBE for compile-time drift detection.
- The Dysflow `import_modules` / `compile_vba` / `test_vba` / `run_vba` family is unaffected; only the read-only verify/reconcile path is broken.

## Impact

- **Severity:** medium. Read-only diagnostic is broken; compile-via-import workflow still works.
- **Blast radius:** any project using `verify_binary` or `reconcile_binary` against a populated `.accdb` may hit the same empty-array path.
- **Workaround:** users fall back to git-traceability + manual compile, which is exactly the workflow Dysflow was supposed to replace.

## Environment at time of failure

- Dysflow runtime: v1.2.32 installed under `C:\Users\adm1\AppData\Local\dysflow`.
- OS: Windows 11.
- Project: `00-no-conformidades-staging-clean` in `C:\00repos\codigo\00_NO_CONFORMIDADES_staging`.
- Git branch: `staging` at `0c4a5fe`.

## Related

- Full maintainer-facing prompt in this session's chat history (2026-06-12).
- AGENTS.md → `<!-- gentle-ai:dysflow-reference -->` documents the intended contract for `verify_binary` and `reconcile_binary`.
