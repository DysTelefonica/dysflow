# dysflow-codegraph-update — full procedure

This procedure audits two independent ownership lanes against the live candidate runtime:

1. The Dysflow release bundle owns exactly six runtime skills.
2. The resolved personal-skills repository owns user-authored consumer skills that may describe
   Dysflow or codegraph behavior.

Installed mirrors are read-only evidence. Edit canonical sources only; propagation belongs to
the owner-specific workflow described below.

## Step 0 — Resolve both canonical sources

1. Resolve the Dysflow repository root and bundled `skills/` directory from the current checkout.
2. Resolve the personal repository from `$PERSONAL_SKILLS_DIR` when set, otherwise
   `~/personal-skills`; its canonical consumer source is `<personal-root>/skills`. Do not infer a
   different checkout from installed links. If the repository is unavailable, report that lane as
   unavailable and do not edit personal consumer skills.
3. Build Dysflow into repository-local `test-runtime/` and set `DYSFLOW_SHIM` to that
   candidate launcher. Never fall back to the production installation.
4. Confirm canonical target files are writable and record each repository's initial Git status.
   Preserve unrelated changes. Do not change user agent configuration or edit installed mirrors.
5. Run `codegraph status` for code intelligence. Do not install, upgrade, or uninitialize
   CodeGraph from this procedure.

The six release-owned runtime skills are `access-form-ui-builder`, `dysflow-arnes`,
`dysflow-usage`, `dysflow-codegraph-update`, `dysflow-examples-sync`, and
`dysflow-pointer-rollout`. `dysflow install` and `dysflow update` write real recursive copies to
exactly five runtime adapter SkillsDirs when those adapters are discovered or explicitly selected:

- OpenCode: `~/.config/opencode/skills/`
- Claude: `~/.claude/skills/`
- Codex: `~/.codex/skills/`
- Cursor: `~/.cursor/skills/`
- Pi: `~/.pi/agent/skills/`

The following are not Dysflow targets: `~/.agents/skills/` and `~/.opencode/skills/`. They may be
managed by another repository, but Dysflow must neither claim nor mutate them.

## Step 1 — Capture progressive runtime discovery

Use `assets/scripts/Invoke-DysflowSemanticAudit.ps1 -Refresh`. Its read-only bridge starts
`dysflow mcp --disable-writes` and permits only `bootstrap`, `get_capabilities`, `schema`,
and `describe_tool`.

The capture order is mandatory:

1. `bootstrap({})`.
2. `get_capabilities({view:"compact"})`, then `{view:"full"}` only for the audit.
3. `schema({view:"index"})` for the complete callable inventory.
4. `schema({view:"compact"})` and `{view:"full"}` for semantic comparison.
5. `describe_tool({name:T})` once for every name in the schema index.

Parse the helper wrapper's `payload`, which prefers MCP `structuredContent`. Require
`schemaVersion:"dysflow.result/v1"`. `toolsVisible` is only the count advertised on the
active surface. Use `toolInventory.callable`, `toolInventory.advertised`, and each schema
index entry's `advertised` boolean; a non-advertised tool remains callable by name.

```powershell
$env:DYSFLOW_SHIM = (Resolve-Path 'test-runtime/bin/dysflow.cmd').Path
pwsh -NoProfile -File skills/dysflow-codegraph-update/assets/scripts/Invoke-DysflowSemanticAudit.ps1 `
  -Refresh -CapturesDir .tmp/dysflow-skill-audit `
  -SkillRoot (Resolve-Path skills/dysflow-usage).Path `
  -OutputJson .tmp/dysflow-semantic-audit.json -FailOnRuntimeGap
```

## Step 2 — Classify evidence

- **DRIFT**: bundled skill, example, pointer, or documentation disagrees with internally
  consistent candidate-runtime evidence.
- **RUNTIME CONTRACT GAP**: the candidate contradicts itself, such as inventory counts or
  index/compact/full/describe parity disagreeing.

Do not hide one class inside the other. The release gate requires both arrays to be empty.

### Consumer-skill semantic audit

Run this audit on the canonical personal-skills source whenever that lane is available. It uses
the candidate captures from Step 1; installed mirrors and production-runtime output are forbidden
as evidence.

1. Enumerate every `skills/**/*.md` file containing a Dysflow or CodeGraph runtime reference.
   Record the discovered file set; do not hardcode a skill count.
2. Extract active tool invocations and compare each tool name with the `schema index`. Report an
   unknown tool before interpreting any arguments.
3. Compare top-level invocation keys and literal enum values with each tool's `inputSchema` from
   full schema or `describe_tool`. Emit separate `unknown parameter` and `invalid enum` findings.
4. Compare claimed response fields with the tool's `resultContract`. A permissive
   `additionalProperties` does not prove an undocumented field exists; require candidate output or
   an explicit result-contract property before teaching consumers to branch on it.
5. Validate cross-tool semantic claims against the correct owner block: bootstrap fields against
   the bootstrap contract, capability blocks such as `projectConfig` against `get_capabilities`,
   write aliases against `migrationNotes`, and persistent config guidance against `setup_project`
   / `migrate_project_config`. In particular, reject invented schema views and fields moved from
   bootstrap into an explicit capability view.
6. Search obsolete write and recovery aliases (`dryRun`, `confirmPid`, automated compile flags)
   only as candidates. Confirm removal or compatibility from the current parameter metadata before
   classifying DRIFT.
7. Audit historical examples separately from active instructions. Historical prose may describe
   an old incident, but any copy-pasteable call must be visibly historical or accompanied by its
   current canonical equivalent so an agent cannot execute a removed contract.
8. Capture the personal repository status before auditing. If it is dirty, do not edit, stage,
   commit, reconcile, or push that lane. Return the exact dirty paths beside the findings so the
   owner can separate prior work from the alignment change.

The consumer report must keep these arrays distinct: `activeDrift`, `historicalOnly`,
`runtimeGaps`, `dirtyLaneBlockers`, and `filesScanned`. A successful release alignment has zero
active DRIFT and zero runtime gaps; historical-only findings remain non-blocking only when they
cannot be mistaken for current executable guidance.

## Step 3 — Update canonical sources

### Lane A — Dysflow release bundle

1. Update `dysflow-usage`, its write matrix, error reference, and affected examples.
2. Keep all call examples machine-readable and schema-derived. Every write-capable example
   states `apply:true|false`; read-only examples do not invent `apply`.
3. Add or update the bootstrap example and progressive discovery guidance.
4. Update `dysflow-arnes`, then replace the exact marker-delimited block in repository
   `AGENTS.md` byte-for-byte.
5. Update `dysflow-pointer-rollout/assets/pointer.md` and its procedure when the lean pointer
   changes.
6. Keep every referenced helper and asset inside the release bundle with relative paths.
7. Never edit gentle-ai-owned skills.

### Lane B — Personal consumer skills

1. Run the consumer-skill semantic audit above across the resolved `<personal-root>/skills` tree.
   Do not hardcode or assert a personal-skill count; the catalog changes independently.
2. Establish personal ownership from that canonical tree. Ignore installed copies and never copy
   the six release-owned runtime skills into the personal catalog.
3. Update only consumer claims contradicted by candidate runtime evidence. Preserve each skill's
   activation contract, language, bundled references, and unrelated dirty changes.
4. Validate the personal repository's post-commit hook delegates to
   `testing/suites/refresh-personal-symlinks/refresh-personal-symlinks.sh sync`. Do not rewrite a
   valid hook or duplicate its reconciliation logic.
5. Run the repository-owned checks from `<personal-root>`:

   ```bash
   bash -n testing/suites/refresh-personal-symlinks/refresh-personal-symlinks.sh
   bash testing/suites/refresh-personal-symlinks/test-refresh-personal-symlinks.sh
   ```

6. Preview the supplementary destination reconciliation without mutation:

   ```powershell
   pwsh -File bin/link-personal-skills.ps1 -DryRun
   ```

7. Let the personal repository's normal delivery policy create any commit. Its post-commit hook
   runs `sync`; when delivery is not part of the task, leave canonical changes uncommitted and
   report that propagation is pending. Never bypass this boundary by editing a mirror.

## Step 4 — Validate examples, ownership, and bytes

```powershell
pwsh -NoProfile -File skills/dysflow-usage/assets/scripts/verify-examples-vs-runtime.ps1 `
  -Path (Resolve-Path skills/dysflow-usage).Path `
  -CapturesDir (Resolve-Path .tmp/dysflow-skill-audit).Path -SkipLive
```

Then validate:

- every fenced JSON block parses;
- `assets/example-hashes.json` covers every example and hashes exact bytes;
- UTF-8 decoding is strict and mojibake sentinels are absent;
- relative references resolve;
- the arnés block and repository `AGENTS.md` embed are byte-equal;
- the release archive contains the complete recursive skill trees;
- the recursive installer copies, diagnoses, prunes, and rolls back nested assets.

After `dysflow install` or `dysflow update`, compare the six release-owned trees in the five
runtime adapter SkillsDirs by recursive path+hash manifests. A discovered or explicitly selected
target must contain real copied directories, not links into the personal repository. Report drift
only; the release installer owns repair.

For personal consumer skills, compare canonical files with destinations only after the personal
repository's reconciler or post-commit hook runs. Treat destination bytes as read-only evidence;
the personal workflow owns repair. Keep Dysflow target evidence separate from personal-catalog
evidence so `.agents` or OpenCode-alt state cannot be mistaken for Dysflow installation state.

## Step 5 — Release evidence

Record candidate version, callable/advertised counts, compact/full/describe parity,
classification counts, composition-constraint count, DRIFT count, runtime-gap count, both
canonical roots, unavailable lanes, files changed per owner, example verifier result,
arnés/pointer hashes, archive tree hashes, owner-controlled propagation evidence, tests, and
rollback boundary. Commit coherent work units in their owning repositories and let each
repository's normal policy own PR/release gates.
