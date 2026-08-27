---
name: dysflow-examples-sync
description: >
  Trigger: dysflow-usage/SKILL.md per-tool section lists tool names for which assets/examples/<tool>.md is missing, user says faltan ejemplos / hay tools sin ejemplo / examples drift, ARN-3 of dysflow-codegraph-update chains after ARN-1, `dysflow doctor` reports an example gap. Detects missing per-tool JSON-example files, scaffolds the missing files from create-form-from-template.md structure (with TODO placeholders so a human fills runtime values), runs verify-examples-vs-runtime.ps1 against each scaffolded file to catch schema drift early. Pure scaffolding + gap reporter — never invents content. Companion to the bundled per-tool examples shipped by `dysflow install`; this skill is the manual fallback when the installer could not refresh a given tool's example.
license: Apache-2.0
metadata:
  author: "Andrés Román"
  version: "1.0.0"
  status: active
  last_verified: "2026-08-26"
  last_dysflow_version: "4.1.0"
  parent: "dysflow-codegraph-update"
  requires: "dysflow-usage skill, dysflow-codegraph-update (ARN-1 upstream), `dysflow install` for routine example refresh, `dysflow doctor` for the gap audit"
  managed_by: "`dysflow install` ships bundled per-tool examples; `dysflow doctor` audits the gap; this skill is the manual scaffolding fallback when the installer path is unavailable or a user wants a per-tool example added offline."
  in_scope: "dysflow-usage/assets/examples/<tool>.md scaffolding + gap reporting + hash tracking of each example file vs runtime schema"
  out_of_scope: "writing example *content* (that is a human + dysflow-usage session), modifying dysflow-usage/SKILL.md itself (ARN-1 of dysflow-codegraph-update), dysflow-pointer-rollout scope, gentle-ai-owned skills"
  trigger_patterns:
    - "ARN-3 — dysflow-usage/SKILL.md lists a tool in any per-tool section but assets/examples/<tool>.md is missing"
    - "ARN-3 chain from dysflow-codegraph-update ARN-1 (post-arnés + post-usage regeneration)"
    - "user says faltan ejemplos / tools sin ejemplo / examples drift"
    - "`dysflow doctor` reports a per-tool example gap that the installer could not refresh"
    - "session-start verification: enumerate tools named in dysflow-usage/SKILL.md vs files in dysflow-usage/assets/examples/"
---

## Philosophy

The dysflow consumer needs a canonical JSON example per tool. Without it, the consumer guesses argument names and hits `MCP_INPUT_INVALID` errors (formName is not allowed, accessPath is not allowed, etc.). The template is well-known (`create-form-from-template.md` + the existing examples). The SCRIPT for keeping every tool covered should not be human burden.

Drift direction = the canonical surface grows (new tools ship, get listed in SKILL.md) faster than the example corpus. The skill detects the gap and SCAFFOLDS, but does NOT write example content. Content is a human+dysflow-usage session with the live runtime.

1. **Scaffold ≠ content.** A scaffolded file is `create-form-from-template.md`'s structure with TODO placeholders where real values belong. It exists so the file is present in `git log`, in the canonical-corpus, and in any `verify-examples-vs-runtime` test.
2. **Single source of truth = `dysflow-usage/SKILL.md`.** Sections like "Form UI tools", "Cleanup tools", etc. enumerate the tools. The set of expected example files is `kebab-case(tool).md` for each tool name mentioned in any per-tool section.
3. **Hash before write, never auto-fill.** If an example file already exists with content, it stays. Drift is reported, never overwritten.
4. **Fail closed on tool not in schema index.** If a tool name is mentioned in `dysflow-usage/SKILL.md` but absent from live `schema({view:"index"})`, that is upstream drift. The index is the callable set and its `advertised` field is a separate tools/list state.

## Activation

Use when:
- `dysflow-codegraph-update` ARN-1 just regenerated `dysflow-usage` (chain trigger ARN-1 → ARN-3).
- The user says "faltan ejemplos" / "tools sin ejemplo" / "examples drift".
- Session-start enumeration: any tool name mentioned in `dysflow-usage/SKILL.md` lacks its corresponding `../dysflow-usage/assets/examples/<tool>.md`.

Do NOT use for:
- Authoring example content (scaffolds only; content is human).
- Modifying `dysflow-usage/SKILL.md` itself (`dysflow-codegraph-update` ARN-1).
- Pointer roll-out maintenance (`dysflow-pointer-rollout`).

## Hard Rules

1. **Source of truth is the released `skills/dysflow-usage/SKILL.md`.** Installed
   agent copies and deprecated external mirrors are downstream, never upstream
   runtime-contract input. Scripts and examples ship recursively in the release.
2. **Scaffold only — never invent content.** A scaffolded file has TODO placeholders for: real `projectId`, real `accessPath`, real `formName` or whatever the tool's live signature is. NEVER fabricate values.
3. **Fail closed on missing callable tool.** If a tool name in `dysflow-usage/SKILL.md` does not appear in `schema({view:"index"})`, surface upstream drift; do not scaffold a phantom. Do not enumerate core `tools/list` or legacy `toolsVisible`.
4. **Verify `dysflow-usage/assets/scripts/verify-examples-vs-runtime.ps1` runs cleanly** on each scaffolded file (HR-10 of `dysflow-codegraph-update` carries over; this is the dysflow-usage verify script).
5. **Run the semantic audit** (`../dysflow-codegraph-update/assets/scripts/Invoke-DysflowSemanticAudit.ps1` from
   `dysflow-codegraph-update`) on the captured runtime. Scaffolds must reference real
   canonical parameters; the audit enforces that. Scaffold presence alone is not enough.
6. **Hash tracking.** Maintain `../dysflow-usage/assets/example-hashes.json`
   (created on first run if absent) mapping `tool-name -> SHA256` of the example file's content.
   The example verifier consumes this authoritative tracker for drift detection.
7. **Append a CHANGELOG entry to `dysflow-usage`** on each scaffold batch: `docs(consumer-skills): scaffold N example files for tools <list>`. (One entry per run, not one per file.) Convention: edit `dysflow-usage/CHANGELOG.md` if it exists; otherwise create with a minimal header.
8. **Never edit gentle-ai-owned skills.** `dysflow-usage` is user-owned (`author: "Andrés Román"`); the verify script lives there. Do not touch anything else.

## Procedure

Full pre-flight + per-section enumeration logic + scaffolding recipe + verification: `references/procedure.md`. In short:

1. Step 0 — Pre-flight: load `skills/dysflow-usage/SKILL.md` from the release
   checkout; call `bootstrap({})`, then enumerate callable tool names from
   `schema({view:"index"})` and preserve each entry's `advertised` state.
2. Step 1 — Parse `dysflow-usage/SKILL.md` for per-tool sections. For each section, the referenced tool names become the "expected" set.
3. Step 2 — Compare to existing `../dysflow-usage/assets/examples/*.md` filenames (kebab-cased). Compute the gap.
4. Step 3 — For each missing file: scaffold from `create-form-from-template.md` structure with TODO placeholders. Write to disk. Update `dysflow-usage/assets/example-hashes.json`. Append CHANGELOG entry in `dysflow-usage`.
5. Step 4 — Run `dysflow-usage/assets/scripts/verify-examples-vs-runtime.ps1`; on failure, halt and surface which scaffolded file is rejected.
6. Step 5 — Run the semantic audit (`../dysflow-codegraph-update/assets/scripts/Invoke-DysflowSemanticAudit.ps1`) on the captured candidate runtime. Halt on DRIFT; report RUNTIME CONTRACT GAP findings distinctly.

## Output Contract

Return, in order: (1) expected-tool set size (from `get_capabilities.tools` keys); (2) existing-example set size; (3) gap list (`tool-name | expected-path | status: scaffolded|upstream-defect|skipped`); (4) example-hashes.json snapshot path; (5) verify-examples-vs-runtime.ps1 exit code + first failing test name (if any); (6) semantic audit DRIFT/RUNTIME GAP counts; (7) CHANGELOG entry appended; (8) open decisions needing the user.

## References

- `references/procedure.md` — tooling-only procedure + per-tool section parser.
- `skills/dysflow-usage/SKILL.md` — source of truth for expected tools.
- `../dysflow-usage/assets/examples/create-form-from-template.md` — template scaffold source.
- `../dysflow-usage/assets/scripts/verify-examples-vs-runtime.ps1` — schema-derived example verifier.
- `../dysflow-codegraph-update/assets/scripts/Invoke-DysflowSemanticAudit.ps1` — semantic audit (mandatory second pass).
