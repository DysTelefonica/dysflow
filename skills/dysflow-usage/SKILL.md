---
name: dysflow-usage
description: "Trigger: MUST-LOAD consult before any dysflow MCP call, error reading or flag choice when the cwd contains .dysflow/project.json, *.accdb, *.bas, *.cls, *.form.txt or tests/*.json. Tool names, flags, error codes, context rules and response shapes for dysflow 4.4.x. Rules live in dysflow-arnes."
license: Apache-2.0
metadata:
  author: "Andrés Román"
  version: "3.0.0"
  status: active
  last_verified: "2026-10-25"
  last_dysflow_version: "4.4.15"
  requires: "dysflow MCP >= 4.4"
  managed_by: "`dysflow install` / `dysflow update` ship this skill with the runtime; this user-owned mirror is the read-side surface and stays here for offline reference."
  scope:
    in_scope: "tool names, parameters, flags, defaults, error codes, context resolution, response envelope facts"
    out_of_scope: "the rules an agent must follow (dysflow-arnes); workflow loops (vba-binary-sync, vba-run-tests, access-vba-tdd-*); CodeGraph (codegraph-usage)"
  changelog: "CHANGELOG.md (in this skill directory)"
---

# dysflow — consultation source

**Load this skill before a dysflow call** when the cwd holds `.dysflow/project.json`
or Access, VBA, form or test artifacts. It answers *what the runtime accepts*.
It does not say *what you must do*: the rules are in `dysflow-arnes`, which
loads after this skill.

The runtime is authoritative. Route with `bootstrap({})`, then
`schema({ view: "index" })`, then `describe_tool({ name, sections: ["parameters"] })`
for the one tool you will call. Expand `get_capabilities` only for the fields the
next step needs.

## First calls

`get_capabilities` is never the first call: start with `bootstrap({})`, then the schema index.

| Step | Call | Use it for |
|---|---|---|
| 1 | `bootstrap({})` | identity, write gates, advertised surface, workflow routing, `humanCompilePending` |
| 2 | `schema({ view: "index", phase, toolName })` | every callable tool, `advertised` flag, phases |
| 3 | `describe_tool({ name, sections })` | parameters and result contract of one tool |
| 4 | `get_capabilities({ view: "compact" \| "full", include })` | per-tool commit flags, `effectiveDryRunDefault`, `projectConfig` |

Details and every field: `references/bootstrap-and-capabilities.md`.

## Where each question is answered

| Question | Read |
|---|---|
| Which flag commits a write, and what a rejected flag means | `references/commit-flags.md`, `assets/write-flags-matrix.md` |
| Which project a call uses (cwd, session, startup) | `references/context-resolution.md` |
| Which parameters each tool needs from the caller | `references/context-resolution.md` (matrix), `describe_tool` |
| Multi-worktree targets, `destinationRoot`, legacy config | `references/worktrees-and-destinations.md` |
| Write policy `developer` vs `safe-by-default` | `references/write-policy.md` |
| Response envelope and `structuredContent` | `references/transport-and-envelopes.md` |
| `verify_code` fields and the committed ERD | `references/schema-and-verify.md` |
| Form UI tools and `sync_binary` | `references/form-ui-and-sync.md` |
| Facts to confirm before a call | `references/call-checks.md` |
| A typed error code | `references/error-codes.md` |
| Functionality-by-functionality friction | `references/agent-friction-map.md` |
| Footguns with a canonical example | `assets/anti-patterns.md` |

## Form UI tools

Form tools read and write `.form.txt` through FormIR. Perceive: `analyze_form_ui`, `analyze_form_layout`, `render_form_preview`, `map_form_behavior`. Plan: `generate_form_design_plan`, `copy_form_ui_pattern`. Act: `apply_form_design_plan`, `form_align_controls`, `form_distribute_controls`. Verify: `verify_form_ui`, `verify_form_bindings`, `diff_form_preview`. The phase table and write behavior are in `references/form-ui-and-sync.md`.

## Examples

`assets/examples/` is the canonical per-tool index: one Markdown file per advertised tool with the JSON call, the result fields worth reading, and the typed errors it can return.
`assets/example-hashes.json` tracks the bytes of every example. Verify a file
against the live runtime with `assets/scripts/verify-examples-vs-runtime.ps1`.

## Response envelope in one line

Every response carries `schemaVersion: "dysflow.result/v1"`. A failure carries
`isError: true` and `error.code`. `structuredContent` holds the complete payload;
`content[0].text` may hold a bounded summary. The full contract is in
`references/transport-and-envelopes.md`.

## Context in one line

A call resolves its project from an explicit `cwd`, then from the project that
`resolve_project` fixed for the session, then from the MCP startup cwd.
`references/context-resolution.md` lists the order and the parameters each tool
still requires.

## Cross-reference

- **Rules:** `dysflow-arnes` (loaded after this skill).
- **Anti-patterns with examples:** `assets/anti-patterns.md`
- **Write-flag matrix:** `assets/write-flags-matrix.md`
- **Error codes:** `references/error-codes.md`
- **Verification script:** `assets/scripts/verify-examples-vs-runtime.ps1`
- **Retired:** `dysflow-protocol` (its rules are in `dysflow-arnes`, its facts here).
