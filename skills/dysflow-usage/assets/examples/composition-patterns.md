# Composition patterns — dysflow agent recipes

A dysflow session is almost always a chain of tool calls, not one. The
recipes below cover the four loops that account for ~90% of agent
traffic. Each assumes the **pre-flight checklist** has already passed
(`assets/examples/preflight-checklist.md`).

The point of these recipes is to compress the decision space: when you
recognise which loop you're in, you stop re-deriving the call order from
first principles and just execute the canonical steps. If a recipe
fails, do not improvise inside it — follow the linked references.

## 1 — TDD loop: edit a module, prove it works

```text
(1) Edit disk source on .bas / .cls / .form.txt.
(2) import_modules({moduleNames:["<module>"], apply:true})
(3) ASK the user to compile in Access (Debug > Compile).
(4) User confirms with "ya está".
(5) test_vba(proceduresJson:"[{\"procedure\":\"Test_<module>_Foo\"}]")
(6) If RED, read error.details.failures[] — don't paraphrase the summary.
```

Failure modes and recovery:

- `humanCompilePending:true` after (5) → return to (3). Do not re-run
  `test_vba` without a fresh compile; the runtime will trap it.
- `ACCESS_DATABASE_LOCKED` → follow Recipe 3 to clear the lock, then
  resume at (2).
- `MCP_PROCEDURE_NOT_ALLOWED` → declare the procedure in the `capabilities` block of
  `.dysflow/project.json` under `allowedProcedures`, or pass
  `apply:false` once as a non-executing plan.

Anchor examples: `assets/examples/import-modules.md`,
`assets/examples/test-vba.md`.

## 2 — Drift-and-act: keep source and binary in sync

```text
(1) verify_code() → recommendedAction + bulk lists:
       no_action         — already in sync; stop here.
       import_to_binary  — disk is newer; read bulkImportable[].
       export_to_src     — binary is newer; read bulkExportable[].
       manual_merge      — both sides changed; conflict.
(2) Act on the recommendation:
       import_to_binary   → import_modules({moduleNames:bulkImportable, apply:true})
       export_to_src      → export_modules({moduleNames:bulkExportable, apply:true, mutateBinary:false})
       manual_merge       → reconcile by hand; reserve bothChanged entries for conflicts
(3) Re-run verify_code; require actionableOk:true before stopping.
```

Pass `diagnostic:true` only when the compact decision fields are insufficient
and you need classified entries or inline snippets. Raw `ok` describes textual
parity and can remain false for non-actionable serialization noise.

Do NOT iterate step (2) more than twice. Persistent drift means real
divergence — escalate instead of re-running.

Anchor example: `assets/examples/verify-code.md`. Error reference:
`references/error-codes.md` for `MODULE_NOT_FOUND`.

## 3 — Recover stuck Access processes (no generic killers)

```text
(1) list_access_operations          # dysflow-tracked PIDs + status
(2) access_force_cleanup_orphaned(accessPath:<your .accdb>)
                                   # pid:null LISTS ONLY
(3) IF a stuck PID is in the orphan list AND headless AND the same path:
      access_force_cleanup_orphaned(... pid:<pid>, implements_check:"orphans_msaccess", confirmedRequiresConfirmation:true)
(4) cleanup_access_operation(operationId:<id>, force:false)
                                   # reconciles stale records, no kill
```

NEVER use `Stop-Process -Name MSACCESS`, `taskkill /F /IM MSACCESS.EXE`,
or `kill -9 <pid>` from a `Get-Process` lookup. The host machine is
multi-tenant — dysflow's tools are the only path that distinguishes
"ours" from "theirs". The cross-project rule in the global `AGENTS.md`
under `<!-- gentle-ai:dysflow-msaccess-cleanup-only -->` enforces this.

For the failure that typically triggers this loop (`ACCESS_DATABASE_LOCKED`),
see `references/error-codes.md` and `assets/examples/access-force-cleanup-orphaned.md`.

## 4 — Read-only exploration (no writes)

Use this when investigating before deciding what to change. Reads never
need write-intent flags and never trigger `humanCompilePending`:

```text
(1) Inventory the binary: list_objects + get_procedure.
(2) Read the source files you need.
(3) Run a source-vs-binary check (verify_code family, read-only).
(4) DO NOT write.
```

When the investigation is done, return to Recipe 1 or 2.

> **Form tools accept `projectId + formName`** (`inspect_form`, `compare_form`,
> `form_serialize`, `lint_form_code`, `harvest_form_catalog`). When a project
> config is available (`resolve_project` succeeds), prefer the project-anchored
> shape over raw `sourcePath` — the runtime resolves the path through the
> pure `form-source-resolver`, which handles split-project layouts
> (`destinationRoot: "src"`) without the caller having to assemble the path.
> `inspect_form` / `compare_form` also accept `name` / `targetName` /
> `targetForm` as aliases for `formName`.

Anchor examples: `assets/examples/list-objects.md`,
`assets/examples/get-capabilities.md`.

## Cross-recipe discipline

- **Always write through dysflow**, never through `Stop-Process`,
  `taskkill`, or `kill`. See Recipe 3.
- **Always build through the canonical call**, never through a cached
  `dysflow_*`-prefixed alias. Re-state the tool name from the live
  `get_capabilities` snapshot every time you cite one.
- **Always verify after you act.** A loop that ends with no verify
  call is a loop that ships silent regressions.
