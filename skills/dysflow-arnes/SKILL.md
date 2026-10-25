---
name: dysflow-arnes
description: "Trigger: MUST-LOAD for any AI agent touching dysflow artifacts (.dysflow/*, *.accdb, *.bas, *.cls, *.form.txt, tests/*.json). Load dysflow-usage FIRST for names, flags and error codes, then this harness: the rules that always apply."
license: Apache-2.0
metadata:
  author: "Andrés Román"
  version: "2.0.0"
  status: active
  last_verified: "2026-10-25"
  last_dysflow_version: "4.4.15"
  requires: "dysflow MCP >= 4.4, dysflow-usage skill"
  managed_by: "dysflow install / dysflow upgrade (shipped with the runtime)"
  scope:
    in_scope: "the rules an agent must never break when it operates dysflow"
    out_of_scope: "tool names, flags, defaults and error codes (dysflow-usage); TDD and form-UI methodology (other skills)"
  injection_format: "the markdown block delimited by the dysflow:arnés HTML comments below; copied verbatim into AGENTS.md"
---

<!-- dysflow:arnés -->
# dysflow — operating rules

Load `dysflow-usage` first for tool names, flags and error codes. Call
`bootstrap({})` before any static diagnosis or config change. The live runtime
wins over any document; if they disagree, follow the runtime and report the drift.

- **HR-1 — The human compiles, after RED.** Run the RED test without compiling; a RED that fails on a compile or syntax error does not count. Only the GREEN run needs the human to compile in Access first: ask, then wait for confirmation. Dysflow never compiles VBA. Do not trust `humanCompilePending:false` when its scope is `no-project-in-scope`.
- **HR-2 — Confirm destructive operations.** Pass `implements_check` and `confirmedRequiresConfirmation:true` only after the human approves the risk. Never kill `MSACCESS.EXE` by name; clean up through `list_access_operations` and the dysflow cleanup tools.
- **HR-3 — Never write to a production backend.** Test data goes only through `m_TestingMode=True`. If the sandbox is unreachable, report "TESTS BLOCKED" and do not touch data.
- **HR-4 — Preflight before every write.** Check `writesProcess.enabled`, `writesProject.allowWrites`, `effectiveDryRunDefault`, and `humanCompilePending`. Pass `apply` explicitly. The procedure gate is `procedureStrictMode`, never `allowedProcedures` alone. Stop and report any failed check.
- **HR-5 — The runtime is the source of truth.** Re-read `bootstrap`, `schema({view:"index"})` and the needed `describe_tool` block before a non-trivial sequence; expand `get_capabilities({view:"compact"})` only for the fields you need. Never memorize names, defaults or codes.
- **HR-6 — Tests live in `tests/*.json`.** Never add test names to `.dysflow/project.json` as a fix. The allowlist gates only when `capabilities.procedures.strictMode` is true; ask the human before changing it.
- **HR-7 — Verify liveness before asserting.** Check `list_access_operations` before claiming a process exists or blocks a write. Never invent process details.
- **HR-8 — Serialize writes.** One write call, then audit, then the next. Batch related work through list arguments in one call.
- **HR-9 — Select the worktree per call.** Pass `cwd`; never restart the MCP or edit configs to switch worktrees.
- **HR-10 — Bootstrap a missing config first.** When `projectConfig.status` is `missing`, run `setup_project` as a plan, review it, then apply with an explicit `projectId`.
- **HR-11 — Ask on ambiguity.** When `resolve_project` returns `ambiguous`, ask the human to pick one `availableProjects` entry; never guess. The recovery trio is one-shot.
- **HR-12 — Let metadata route discovery.** Use `tools/list`, `annotations` and `describe_tool`; the full schema decides parameters and errors.
- **HR-13 — Parse envelopes defensively.** Require `schemaVersion: "dysflow.result/v1"`, parse a string once, and prefer `structuredContent` first; use `content[0].text` only when it contains the complete payload. Never audit a bounded summary as the contract.
- **HR-14 — Empty `.form.txt` bindings are not a bug.** The unattended form assigns them in `Form_Open`/`Form_Load` of the `.cls`; trace it through `map_form_behavior`, never by reading the `.form.txt`.
- **HR-15 — Gate `verify_code` on `actionableOk`.** Read `recommendedAction`. The aggregate counts never identify modules: use one `diagnostic:true` call and read `actionableDifferent[]` / `nonActionableDifferent[]`. One form can produce entries for `.cls` and `.form.txt`, classified separately.
- **HR-16 — Keep the gate order.** Write gate, then procedure gate, then human compile. A lower gate's refusal is never the cause of a higher one.
- **HR-17 — Reconcile with fresh evidence.** Compare `.form.txt` with `.form.txt` and `.cls` with `.cls`, never database hashes. `manual_merge` never picks a winner.
dysflow harness v2.0.0 · requires dysflow MCP >= 4.4 · Apache-2.0
<!-- /dysflow:arnés -->
