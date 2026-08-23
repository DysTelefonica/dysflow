# dysflow-examples-sync — procedure

## Step 0 — Candidate discovery

1. Resolve `dysflow-usage` and `dysflow-codegraph-update` relative to this release bundle.
2. Set `DYSFLOW_SHIM` to the repository-local candidate runtime; never use production as
   the verifier target.
3. Run the semantic audit to capture `bootstrap`, compact/full capabilities, schema
   index/compact/full, and one description per callable schema-index entry.
4. Require `schemaVersion:"dysflow.result/v1"` from the helper's structured `payload`.

`toolsVisible` is a numeric advertised-surface count, not a registry. The complete expected
example inventory comes from `schema({view:"index"})`; each entry says whether it is
advertised. Non-advertised entries remain callable by name.

## Step 1 — Compute the gap

Convert each callable schema-index name from snake_case to kebab-case and compare it with
`dysflow-usage/assets/examples/*.md`. Classify:

- missing example: callable tool has no file;
- orphan example: file name is absent from the callable index;
- runtime contract gap: index/compact/full/describe sets or inventory counts disagree.

Never derive names from prose sections or `toolsVisible`.

## Step 2 — Create or repair examples

Use the target tool's full `inputSchema`, annotations, access class, composition constraints,
and result contract:

- provide a fenced, parseable JSON invocation wrapper or an adjacent
  `<!-- dysflow-example tool="..." -->` marker;
- include every required and `runtimeRequired` parameter;
- use only schema properties with compatible shallow JSON types;
- declare `apply:false` for safe previews of write-capable tools and never add `apply` to a
  read-only tool;
- honor `anyOf` and composition constraints;
- use placeholders rather than machine-specific paths or project IDs;
- keep narrative/result JSON distinct from invocation JSON.

Bootstrap is a required operating example even though it is also part of progressive
introspection.

## Step 3 — Verify against captured schema

```powershell
pwsh -NoProfile -File skills/dysflow-usage/assets/scripts/verify-examples-vs-runtime.ps1 `
  -Path (Resolve-Path skills/dysflow-usage).Path `
  -CapturesDir (Resolve-Path .tmp/dysflow-skill-audit).Path -SkipLive `
  -OutputJson .tmp/dysflow-example-audit.json
```

The verifier must report zero DRIFT findings. The semantic audit must independently report
zero DRIFT and zero RUNTIME CONTRACT GAP findings.

## Step 4 — Hash and changelog

Regenerate `dysflow-usage/assets/example-hashes.json` from exact UTF-8 bytes. It contains one
entry per example with repository-relative path, lowercase SHA-256, and
`needs_human_content:false` after completion. Append a concise `dysflow-usage/CHANGELOG.md`
entry naming the candidate runtime version and repaired examples.

## Step 5 — Output

Return candidate adapter version; callable and advertised counts; added, repaired, and orphan
examples; hash tracker path/count; verifier result; semantic DRIFT/runtime-gap counts; and any
blocking evidence. Do not mutate installed user mirrors.
