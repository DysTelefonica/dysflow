# dysflow-codegraph-update — full procedure

This procedure audits and updates the release-bundled Dysflow consumer skills. The live
candidate runtime is authoritative; installed user mirrors are read-only comparison targets.

## Step 0 — Resolve only repository-local inputs

1. Resolve the repository root and bundled `skills/` directory from the current checkout.
2. Build Dysflow into repository-local `test-runtime/` and set `DYSFLOW_SHIM` to that
   candidate launcher. Never fall back to the production installation.
3. Confirm the target skill files are writable. Do not change user agent configuration or
   installed skill mirrors during development.
4. Run `codegraph status` for code intelligence. Do not install, upgrade, or uninitialize
   CodeGraph from this procedure.

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

## Step 3 — Update the bundle

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

## Step 4 — Validate examples and bytes

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

Compare installed mirrors under the active user's supported skill directories by recursive
path+hash manifests. Report drift only; the release/install workflow owns propagation.

## Step 5 — Release evidence

Record candidate version, callable/advertised counts, compact/full/describe parity,
classification counts, composition-constraint count, DRIFT count, runtime-gap count,
example verifier result, arnés/pointer hashes, archive tree hashes, tests, and rollback
boundary. Commit coherent work units and let normal repository policy own PR/release gates.
