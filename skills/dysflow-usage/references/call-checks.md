# Checks before a call

Facts to confirm before a dysflow call. The pre-flight rule is HR-4 in `dysflow-arnes`.

## Self-check before any dysflow call

Run these in your head before every call. One fail = stop and resolve.

1. `adapterVersion` is current (from the latest `bootstrap`, expanded through `get_capabilities` only as needed).
2. The per-tool effective dry-run default (`effectiveDryRunDefault[toolName]`) matches your intent. Default behavior depends on the active policy — see `assets/examples/get-capabilities.md` for the truth table. Read `canonicalCommitFlag` and pass explicit canonical intent when committing.
3. Writes are enabled for write-class calls (`writesProcess.enabled` and `writesProject.allowWrites` both `true`).
4. `humanCompilePending:false` before any `test_vba` / `run_vba` call.
5. `toolInventory` matches the claim you cite: `advertised` for `tools/list`, `callable` for schema/dispatch. `toolsVisible` is legacy and context-dependent (`bootstrap` = advertised; `get_capabilities` = callable).
6. For `query_execute` — `mode: "read" | "write"` is REQUIRED (issue #1164). `apply: true` alone does NOT pick a write path; it only commits. Omitting `mode` returns `MCP_INPUT_INVALID` with `error.missingParam: "mode"` and exact remediation. `missingParam` is distinct from rejected write flags: it does not include `rejectedFlag` or `toolCommitFlag`. See `assets/examples/query-execute.md`.
7. **Legacy `accessPath` in `.dysflow/project.json`** — the runtime joins `frontendFile` to the worktree that physically owns the config (contract introduced in #1092, shipped in v2.23.1). If your config still carries an absolute legacy `accessPath`, migrate it with a one-line replacement:

   ```diff
   - "accessPath": "../../Users/.../frontend.accdb",
   + "frontendFile": "frontend.accdb",
   ```

   `frontendFile` is a basename: the runtime resolves it against the active worktree root, so the same config works across every worktree without edits. Per-call override (`accessPath`) still wins when a genuinely different frontend is needed (for example, to inspect a binary that lives outside the worktree) — never bake a sibling path into `.dysflow/project.json`. When the MCP exposes it, drive the migration deterministically with the `migrate_project_config` tool (#1177) instead of editing by hand; for the structured-diagnostic path see #1176.

8. **`run_vba` plan/apply agreement (#1174)** — `run_vba` parses `procedureName` into `<module>.<procedure>` once and threads the parsed `moduleName` + `procName` through both the `apply:false` plan and the `apply:true` preflight. The two paths therefore MUST agree on procedure resolution for the same input. If you observe a divergence:
   - `apply: false` succeeds with `moduleName` / `procedureName` populated, but `apply: true` fails with `PROCEDURE_NOT_FOUND` for the same input → the adapter forwarded a stale `moduleName` OR the binary's compiled p-code is out of sync with the on-disk source. Force a re-compile in Access VBE (Debug → Compile) and retry. Do NOT chase a phantom import issue.
   - `apply: true` fails with `PROCEDURE_NOT_CALLABLE` → the procedure is present in the binary's `VBComponents` but Access refused to invoke it. Read `error.remediation`: since #1787 dysflow derives it from the source preflight, not from the shape of the name. Access resolves `Application.Run` by procedure name, and only a REFERENCED database's project name qualifies. When dysflow stripped a verified module prefix, qualification is ruled out and stale p-code is the cause; recompile in Access VBE, ONCE. When the qualifier could not be tied to a module of this project, the remediation names it and asks whether it is a referenced database whose reference resolves. If a `Debug → Compile` that reported no errors does not change the outcome, stop recompiling and report it — that loop cannot terminate.
   - `apply: true` fails with `VBA_RUNTIME_ERROR` (#1681) → the procedure was invoked, ran, and raised. Read `error.details.vbaMessage` for the VBA error it emitted. Do NOT recompile: `apply` reached the procedure, so its p-code is current. Fix the procedure or the state it depends on.
   - `apply: true` fails with `RUNNER_FAILED` whose message matches `Excepción al llamar a "Run"` → the reclassifier should have caught it. If you see the raw `RUNNER_FAILED`, file an issue against the reclassifier at `src/core/services/vba-service.ts::reclassifyRunnerFailure`.

   See `assets/examples/run-vba.md` for the canonical procedureName parsing contract and the typed error envelopes (`MCP_PROCEDURE_NOT_ALLOWED` / `PROCEDURE_NOT_FOUND` / `PROCEDURE_NOT_CALLABLE` / `VBA_RUNTIME_ERROR`).

9. **Project-config plan/apply agreement (#1324)** — for identical explicit
   project arguments, `apply:false` and `apply:true` MUST resolve the same
   `WorktreeContext` from the same cwd-aware cache. If plan succeeds but apply returns
   `PROJECT_CONFIG_NOT_WRITE_READY`, file a dysflow bug: the dispatch seam has
   diverged. Do not bypass the write gate or remove explicit selectors to make
   the call pass.

Full rationale and per-item recovery: `assets/examples/preflight-checklist.md`.
Composition recipes (TDD loop, drift + act, recovery, exploration): `assets/examples/composition-patterns.md`.

> **Error codes in this skill are verified live against the runtime.** The full
> `schema({ view: "full" })` / selective `describe_tool` error catalogs are
> authoritative; `get_capabilities` does not enumerate per-tool errors.
