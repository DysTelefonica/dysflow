---
name: dysflow-codegraph-update
description: >
  Trigger: dysflow release ships, codegraph-vba release ships, user says actualiza dysflow / alineá skills / la skill y AGENTS.md no coinciden con dysflow, runtime drift, the `dysflow install` / `dysflow update` flow could not write back the pointer block. Keeps the dysflow consumer toolchain (skills + global AGENTS.md / CLAUDE.md sections + rules/*.md) aligned with the live runtime after `dysflow install` / `dysflow update` change the canonical source. Start with `bootstrap`, then bounded `get_capabilities` and `schema({view:"index"})` discovery. Stays lean and index-first; relies on the runtime, the release pipeline, and the install/update flow for routine alignment.
license: Apache-2.0
metadata:
  author: "Andrés Román"
  version: "3.1.0"
  status: active
  last_verified: "2026-08-31"
  last_dysflow_version: "4.2.5"
  last_codegraph_vba_version: "1.15.0"
  requires: "dysflow MCP >= 3.0, codegraph-vba MCP, `dysflow` CLI on PATH (install / update / doctor)"
  managed_by: "The Dysflow release bundle owns this skill; `dysflow install` and `dysflow update` propagate it, while `dysflow doctor` audits installed runtime copies. The skill also audits user-owned consumer skills at their separate canonical source."
  trigger_patterns:
    - "dysflow release ships and the canonical mirror needs review"
    - "codegraph-vba release ships"
    - "user says actualiza dysflow / alineá skills / la skill no coincide con dysflow"
    - "get_capabilities disagrees with a claim in a skill / AGENTS.md / rules/*.md"
    - "skill's requires: floor is older than live adapterVersion"
    - "`dysflow install` / `dysflow update` did not refresh the inlined pointer block on an agent's AGENTS.md / CLAUDE.md"
  scope:
    in_scope: "release-owned skills under this bundle + dysflow-arnes regeneration + dysflow-pointer-rollout invocation (when the install pipeline can't reach an agent) + dysflow-examples-sync invocation (when the example gap detector flags a drift) + user-owned Dysflow/codegraph consumer skills under the resolved personal-skills canonical source + AGENTS.md core / rules/*.md dysflow/codegraph sections + Access/VBA skills index table"
    out_of_scope: "internal VBA module changes (sdd-apply), single-skill doc fixes unrelated to runtime (skill-improver), gentle-ai-owned skills (sdd-*, issue-creation, branch-pr, chained-pr, comment-writer, cognitive-doc-design, work-unit-commits, go-testing, hermes-ephemeral-delegation, judgment-day, skill-creator, skill-improver, skill-registry, _shared), routine install/update work owned by `dysflow install` / `dysflow update` / `dysflow doctor`"
  changelog: "CHANGELOG.md (in this skill directory)"
  pointer_marker: "<!-- user-supplement:dysflow:pointer --><!-- /user-supplement:dysflow:pointer --> is the canonical injection seam for the AGENTS.md / CLAUDE.md block rewritten by `dysflow install` / `dysflow update`."
---

## Philosophy

Eliminate friction between how dysflow/codegraph is described (skills + AGENTS.md) and how it
behaves RIGHT NOW.

1. **Describe the current state only, never history.** A line like "as of v1.16 the MCP exposes
   68 tools" is a changelog entry — delete it; replace with a runtime-verifiable claim.
2. **The live runtime is the source of truth.** `bootstrap`, explicit capability/schema views, selective `describe_tool`, and `codegraph upgrade --check` are
   queried before any edit; their answers go straight into the docs. Memory of past releases is
   irrelevant.
3. **No bitácoras.** A section that only records "vX added W, vY removed Q" is changelog, not
   operating doc — delete it. The dysflow CHANGELOG is the bitácora.
4. **Every runtime claim must be verifiable today** through the candidate runtime's structured introspection surface; if not, remove it.
5. **Drift is the enemy.** Run whenever any signal says the docs disagree with the runtime —
   don't wait for a version bump.
6. **The global AGENTS.md stays lean and index-first:** a short always-loaded core of
   imperatives that points to `~/.config/opencode/rules/*.md` and to skills for depth. Keep it
   short (optimal for retention) and every line useful now; grow `rules/*.md`, not the core. The
   Access/VBA skills index table and the dysflow/codegraph sections are the friction-reducers —
   keep them current, runtime-accurate, and history-free. Same standard applies to every
   **user-owned** `SKILL.md`: a lean contract, detail in its canonical `assets/` / `references/` directories (never to
   gentle-ai-owned skills — see Hard Rule 13).

## Activation

Use when: a dysflow or codegraph-vba release ships; the user says "actualiza dysflow / alineá
skills / la skill no coincide"; a `get_capabilities` value disagrees with a claim in a skill,
the AGENTS.md core, or a `rules/*.md`; a skill's `requires:` floor is older than the live
`adapterVersion`; a user reports a tool "doesn't exist" or "behaves differently".

Do NOT use for: a change internal to one VBA module/form (`sdd-apply` / `vba-binary-sync`), or a
doc fix in one skill unrelated to runtime behavior (`skill-improver` or a direct edit).

## Hard Rules

1. **Resolve ownership before editing.** The Dysflow release bundle is canonical for exactly six Dysflow-owned runtime skills:
   `access-form-ui-builder`, `dysflow-arnes`, `dysflow-usage`,
   `dysflow-codegraph-update`, `dysflow-examples-sync`, and `dysflow-pointer-rollout`. Personal
   consumer skills are a separate lane whose canonical source is
   `$PERSONAL_SKILLS_DIR/skills` when that variable is set, otherwise
   `~/personal-skills/skills`. Never copy the six release-owned skills into the personal catalog.
   Installed mirrors are read-only evidence and never upstream input; only each owner's installer
   or reconciler may propagate canonical bytes to them.
2. **Trust the candidate runtime, not memory.** The authoritative chain is
   `bootstrap({})`, explicit compact/full capabilities,
   `schema({view:"index"})`, compact/full schema, and `describe_tool` for every
   callable index entry. Tool names come from schema index; advertisement is
   its boolean state, not callability. Prefer MCP `structuredContent` over a
   bounded text summary. An unverifiable claim is deleted, not approximated.
3. **No bitácoras in skills.** Delete changelog-only sections; do not duplicate the CHANGELOG.
4. **Literal tool-name replacement** via Edit with exact `oldString` — never a free rewrite.
5. **Never introduce a tool name absent from live schema index.** Use
   `advertised` only for claims about `tools/list`; callable dispatch is wider.
6. **No mechanical version-floor bump.** Raise a `requires:` floor only if the changelog confirms
   the new version did not reintroduce the original bug.
7. **`apply:false` is the valid non-executing plan** for `run_vba` / `test_vba` when `allowedProcedures`
   is empty — a documented opt-out, not a bug workaround.
8. **AGENTS.md core + `rules/*.md` dysflow/codegraph sections are in scope.** Keep the core lean;
   detail grows in `rules/*.md`, not the core. Resolve the owning repository before editing and
   document cross-repository edits in the corresponding commit body.
9. **One authoritative place per runtime rule:** `dysflow-usage` skill for names/flags/errors,
   `rules/dysflow-codegraph.md` for operation, the AGENTS.md core as the short pointer — never
   duplicated with drift.
10. **When runtime drift forces a `dysflow-usage` change**, run its
    `../dysflow-usage/assets/scripts/verify-examples-vs-runtime.ps1` and confirm it exits 0 before finishing.
11. **After editing skills, use ownership-aware verification.** Verify release-owned destinations
    after `dysflow install` / `dysflow update`; verify personal consumers through the
    personal-skills repository's reconciler and hook. Compare recursive paths and hashes, never
    hand-edit an installed destination. If a client still shows old text after owner-controlled
    propagation, restart that client.
12. **Deprecate, don't rewrite live surface** — for a skill whose surface moved to dysflow,
    follow `references/deprecated-skills.md` (banner + migration table; git keeps the old body).
13. **Never edit, compact, or restructure a skill you do not own.** Establish Dysflow ownership
    from release-bundle provenance and personal ownership from the resolved personal-skills
    source, then apply the explicit gentle-ai denylist below and verify against the gentle-ai
    registry. `metadata.author` is supporting evidence only; its absence never transfers
    ownership. The authoritative gentle-ai set (NEVER touch) is: the **SDD
    family (`sdd-*`)**, `issue-creation`, `branch-pr`, `chained-pr`, `comment-writer`,
    `cognitive-doc-design`, `work-unit-commits`, `go-testing`, `hermes-ephemeral-delegation`,
    `judgment-day`, `skill-creator`, `skill-improver`, `skill-registry`, `_shared` — verify
    against the gentle-ai repo's `internal/assets/skills/` when in doubt. When ownership is
    still unclear, ASK the user. All compaction/leanness work applies ONLY to user-owned skills.
14. **Use progressive candidate introspection, not `get_capabilities` alone.** A
    semantic consumer must capture bootstrap, compact/full capabilities,
    schema index/compact/full, and one `describe_tool` per callable index entry.
    The verifier at `assets/scripts/Invoke-DysflowSemanticAudit.ps1` is the
    canonical way to drive this chain (it uses
    `assets/scripts/Invoke-DysflowJsonRpc.ps1` for read-only MCP introspection
    without ever invoking Access). Manual tool/error lists are demoted to a secondary check
    — the runtime is the source of truth, not a hand-maintained registry.
15. **Fail closed on semantic drift.** The semantic audit distinguishes DRIFT (docs/consumer
    disagrees with runtime — fix the docs) from RUNTIME CONTRACT GAP (the runtime's own
    metadata smell — surface to the runtime team). A skill update that fixes a DRIFT
    finding must NOT silently pass a RUNTIME GAP. The verifier always surfaces both.

## Arnés regeneration (ARN)

- **ARN-1 — If `dysflow-arnes/SKILL.md` content disagrees with the source
  rules in `rules/dysflow-codegraph.md` or `dysflow-usage`, regenerate the
  arnés from the canonical sources.** The arnés is the system-prompt
  injection for ANY agent operating dysflow; it must stay current. Procedure
  in `references/procedure.md` §"Arnés regeneration (ARN-1)".

- **ARN-2 — If `dysflow-arnes/SKILL.md` content drifted from inlined pointer
  blocks across the 8 user-global instruction files (or `dysflow/AGENTS.md`
  lost its embedded harness block), regenerate the pointers.** Chain trigger
  after ARN-1 succeeds. The sub-skill `dysflow-pointer-rollout` handles the
  per-file marker-bounded edits. Procedure in
  `references/procedure.md` §"Pointer roll-out (ARN-2)".

- **ARN-3 — If `dysflow-usage/SKILL.md` per-tool sections list a tool name
  for which `../dysflow-usage/assets/examples/<tool>.md` is missing (chain from ARN-1),
  scaffold the missing example files.** The sub-skill `dysflow-examples-sync`
  scaffolds (with TODO placeholders; never invents content) and runs
  `verify-examples-vs-runtime.ps1` against each scaffolded file. Procedure
  in `references/procedure.md` §"Examples sync (ARN-3)".

The child sub-skills invoked by ARN-2 and ARN-3 live in the release bundle.
Their complete directories, including helper assets, are release-owned and
must be present in the release archive and recursive installer:

- `skills/dysflow-pointer-rollout/SKILL.md` — owns the pointer roll-out contract.
- `skills/dysflow-examples-sync/SKILL.md` — owns the per-tool example scaffold contract.

## Procedure

Full pre-flight, execution steps, and agent limitations: **`references/procedure.md`**. In short:
resolve the release-bundle and personal-consumer ownership lanes → capture candidate
`bootstrap`/introspection evidence → update only canonical sources → run each owner's validation
and propagation workflow → compare installed mirrors as evidence → smoke-test → save the runtime
snapshot. Stop rather than guessing when an owning source cannot be resolved.

Deprecating a skill: **`references/deprecated-skills.md`**.

## Output Contract

Return, in order: (1) live runtime state — literal `adapterVersion`, `dryRunDefault`,
`writesProcess.enabled`, `writesProject.allowWrites`, `toolInventory` counts, codegraph-vba
version; (2) ownership lanes resolved, including canonical roots and unavailable lanes; (3) files
modified in the Dysflow bundle and personal consumer source, each with SHA256 before/after and
line delta; (4) diff summary per changed line (deleted-bitácora / rewrote / renamed); (5)
owner-controlled propagation and recursive hash
verification for each touched skill; (6) AGENTS.md sections / `rules/*.md` touched, with the
AGENTS.md core line count (must stay lean); (7) semantic audit result —
`Invoke-DysflowSemanticAudit.ps1` must report 0 DRIFT findings; report RUNTIME GAP findings
distinctly without failing the run; (8) open decisions needing the user; (9) smoke-test result;
(10) runtime snapshot saved to engram.

## References

- `references/procedure.md` — bundled pre-flight and ARN procedures; runtime claims still come from the live candidate introspection.
- `references/deprecated-skills.md` — bundled deprecation protocol.
- `../dysflow-pointer-rollout/SKILL.md` — pointer rollout contract.
- `../dysflow-examples-sync/SKILL.md` — example synchronization contract.
- Repository `AGENTS.md` — the byte-equal arnés embed and project rules.
- The resolved personal-skills repository — canonical source for user-owned consumer skills; its
  own hook and reconciler own propagation.
- Installed user mirrors — read-only recursive hash evidence after owner-controlled propagation;
  never edit them directly.
- `dysflow-usage` skill — canonical tool names/flags/defaults/error codes (runtime-verified).
- `skill-improver` skill — audit a skill's compaction after multiple updates.
- Engram topics: `orchestrator/discipline/dysflow-runtime-snapshot`,
  `orchestrator/discipline/codegraph-runtime-snapshot`.
