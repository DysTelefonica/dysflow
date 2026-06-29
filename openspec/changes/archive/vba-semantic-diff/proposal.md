# Proposal: vba-semantic-diff — semantic classification of VBA/Form differences

Replace the flat byte-exact `different` bucket in `verify_binary` / `verify_code` / `reconcile_binary`
with a **semantic classification engine** so an AI or human consumer can tell, without manually
exporting and diffing, which modules actually need action (import, export, or merge) and which are
pure serialization/whitespace/attribute/encoding noise.

## Why

### Problem

`compareVbaSourceTrees` (`src/core/services/vba-source-comparison.ts:244`) does a byte-exact string
comparison (`if (sourceText === binaryText)`) of VBA/Form source exported from the Access binary
against `src/`. Anything that is not byte-identical lands in one flat `different[]` bucket.

In a real case **173 modules were reported `different`, but only 7 were actionable** (3 source-newer,
4 needing manual merge). The remaining **159 were false positives**: CRLF/whitespace differences,
VBA `Attribute VB_*` header noise, `.form.txt` printer/checksum serialization noise, and encoding
mojibake. The consumer cannot distinguish signal from noise without exporting every module by hand
and diffing it — exactly the toil this runtime exists to remove.

### Impact

- AI sync workflows over-report drift and either spam the user with non-actionable diffs or risk
  re-importing noise back into the binary.
- Humans lose trust in `verify_binary` because "different" almost never means "you must act."
- `reconcile_binary` recommendations are unreliable because they are built on the same flat bucket.

### Why now

The byte-exact path was acceptable when the source tree was small, but at 100+ modules the
false-positive rate (159/173 ≈ 92%) makes the tools effectively unusable for their stated purpose.

## What changes

A new **pure domain classifier** that, for each differing module pair, assigns a semantic category,
derives the change direction from the symmetric diff of functional lines, and emits a recommendation.
The verify/reconcile tools default to this semantic mode; a `strict` flag preserves the old
byte-exact behavior. A new `compare_module` MCP tool exposes single-module classification.

### In scope (first slice)

1. **New pure domain service** `src/core/services/vba-semantic-classifier.ts` — zero adapter
   dependencies. Takes `(sourceText, binaryText, fileType)` and returns a classification result.
2. **Classification taxonomy** (8 categories) and **decision rules** (below).
3. **Directionality derived from the symmetric diff of functional lines** — no base snapshot, no mtime.
4. **`.form.txt` serialization-noise stripping** (strip-known-noise approach; `NameMap` stays functional).
5. **Encoding normalize-and-recompare** (best-effort; must never hide a real change).
6. **Additive result contract** on `VbaVerifyResult` (backward-compatible).
7. **Semantic mode as default** for `verify_binary` / `verify_code` / `reconcile_binary`, with an
   opt-in **`strict` mode** that flips back to byte/text-exact comparison.
8. **New MCP-only tool `compare_module`** (`--moduleName X --semantic`) — registered in the 5
   required files (mcp-tool-registry, tool-parity-registry, dispatch-routes, vba-sync-schemas,
   VbaModulesAdapter). No HTTP/CLI parity.
9. **Unit tests** at the `ComparisonFileSystemPort` / pure-function seam (strict TDD).
10. **New E2E coverage** for the semantic classification path via `node E2E_testing/mcp-e2e.mjs`
    against an isolated `test-runtime/` build.

### Out of scope (non-goals)

- **Deep form-property parsing (v2)**: v1 strips known noise sections and compares the remainder as
  functional. No structural form-AST diffing.
- **Base-snapshot / mtime-based directionality**: directionality comes ONLY from the symmetric
  functional-line diff. No 3-way merge base, no file mtimes.
- **`NameMap` stripping**: `NameMap` is treated as FUNCTIONAL (conservative). Not stripped.
- **HTTP and CLI exposure of `compare_module`**: MCP-only. The HTTP server does not expose VBA sync
  tools, and the CLI is management-focused.
- **Changing the PowerShell export path** or the `fix_encoding` PS1 action.

## Classification taxonomy and decision rules

The classifier compares the two texts after splitting each into **functional lines** (the lines that
remain after removing whitespace-only, attribute-header, and serialization-noise lines) and a
**non-functional residue**. It assigns exactly one category per differing pair:

| Category | Meaning | Detection rule |
|----------|---------|----------------|
| `matched` | Identical functional content | functional lines equal AND no residue difference |
| `whitespaceOnly` | Only CRLF/trailing-space/blank-line differences | texts equal after whitespace normalization |
| `attributeOnly` | Only VBA `Attribute VB_*` / `VERSION CLASS` / `BEGIN…END` boilerplate differs | functional lines equal once attribute-header lines removed; `VB_Name` change is NOT attributeOnly (it is a rename → functional) |
| `formSerializationOnly` | Only `.form.txt` printer/checksum noise differs | functional lines equal once noise sections stripped: `Checksum`, `PrtDevMode`, `PrtDevModeW`, `PrtDevNames`, `PrtDevNamesW`, `PrtMip`, `RecSrcDt`. `NameMap` is NOT stripped. |
| `encodingOnly` | Only mojibake / encoding differs | texts equal after mojibake normalization (Latin-1 ↔ UTF-8 double-encoding); if still different after normalization → treated as functional |
| `sourceNewer` | Functional change present only on the source side | `srcUniqueFunctionalLines > 0` AND `binaryUniqueFunctionalLines === 0` |
| `binaryNewer` | Functional change present only on the binary side | `binaryUniqueFunctionalLines > 0` AND `srcUniqueFunctionalLines === 0` |
| `bothChanged` | Functional change on both sides | `srcUniqueFunctionalLines > 0` AND `binaryUniqueFunctionalLines > 0` |

### Directionality (derived, no base/mtime)

From the symmetric diff of functional lines:

- `srcUniqueFunctionalLines` = functional lines present in source but not in binary.
- `binaryUniqueFunctionalLines` = functional lines present in binary but not in source.

| Condition | Category | `recommendation` |
|-----------|----------|------------------|
| src-only unique | `sourceNewer` | `import_to_binary` |
| binary-only unique | `binaryNewer` | `export_to_src` |
| both unique | `bothChanged` | `manual_merge` |
| none unique (only noise) | non-functional category | `no_action` |

The non-functional categories (`whitespaceOnly`, `attributeOnly`, `formSerializationOnly`,
`encodingOnly`) and `matched` all map to `recommendation: no_action`.

### Encoding tradeoff (explicit)

Encoding handling is **normalize-and-recompare**: normalize known mojibake patterns before comparing.
If the texts match after normalization → `encodingOnly` (non-actionable). If they STILL differ →
the difference is treated as functional and classified accordingly. **Encoding normalization must
NEVER hide a real content change.** Because `readFile('utf8')` may already have lossily decoded the
bytes upstream, `encodingOnly` detection is documented as **best-effort**: the safe failure mode is
to over-report (classify as functional), never to under-report.

## Result contract (additive, backward-compatible)

`VbaVerifyResult` keeps every existing field: `operation`, `ok`, `dryRun`, `willModifyAccess`,
`sourceRoot`, `matched[]`, `different[]`, `missingInSource[]`, `missingInBinary[]`, `diffs[]`.
`different[]` stays populated with ALL differing modules so existing consumers keep working.

**New additive fields:**

| Field | Type | Meaning |
|-------|------|---------|
| `summary` | `Record<Category, number>` | count of modules per category |
| `actionableDifferent[]` | module names | modules whose category is `sourceNewer` / `binaryNewer` / `bothChanged` |
| `nonActionableDifferent[]` | module names | modules whose category is whitespace/attribute/formSerialization/encoding only |
| `hasFunctionalDifferences` | `boolean` | `actionableDifferent.length > 0` |
| `actionableOk` | `boolean` | `actionableDifferent.length === 0 && missingInSource.length === 0 && missingInBinary.length === 0` |

**Per-diff enrichment** (each `diffs[]` entry, additive fields):

| Field | Type |
|-------|------|
| `classification` | one of the 8 categories |
| `reason` | short human string explaining the category |
| `srcUniqueFunctionalLines` | number |
| `binaryUniqueFunctionalLines` | number |
| `recommendation` | `import_to_binary \| export_to_src \| manual_merge \| no_action` |

### `ok` semantics

`ok` MAY remain `false` whenever any difference exists (including non-functional). The NEW
`actionableOk` / `hasFunctionalDifferences` fields are the contract a consumer MUST use to decide
whether real action is needed. This keeps `ok` backward-compatible while giving consumers an
unambiguous actionability signal. The exact `ok` recalculation choice (keep byte-exact `ok` vs.
recompute from actionable) is finalized in the spec; the proposal requires only that a consumer can
distinguish actionable from non-actionable via `actionableOk` / `hasFunctionalDifferences`.

## Strict vs. semantic mode

- **Semantic (default)** for `verify_binary`, `verify_code`, `reconcile_binary`: runs the classifier,
  populates the additive fields, and bases recommendations on actionable categories.
- **`strict` (opt-in flag)**: reverts to the current byte/text-exact comparison. `different[]` is the
  flat bucket and the additive semantic fields are omitted or empty. This preserves an escape hatch
  for callers that genuinely need byte fidelity (e.g., release verification).

`reconcile_binary` recommendations in semantic mode derive from the same per-module `recommendation`
values.

## `compare_module` tool surface (MCP-only)

```
compare_module --moduleName <Name> [--semantic] [--strict]
```

Classifies a single module without a manual temp export. Mirrors the verify surface (semantic by
default; `strict` flips to byte-exact). Returns the same per-module classification shape
(`classification`, `reason`, line counts, `recommendation`). Registration spans exactly 5 files:
`mcp-tool-registry`, `tool-parity-registry`, `dispatch-routes`, `vba-sync-schemas`,
`VbaModulesAdapter`. No HTTP/CLI parity. A missed registration causes silent failure
(`MCP_SERVICE_UNAVAILABLE` / `TOOL_NOT_IMPLEMENTED`), so registration completeness is a spec/test
checkpoint.

## Backward compatibility

- All existing `VbaVerifyResult` fields remain and keep their meaning; `different[]` stays populated.
- All new fields are additive; `translateCoreResultToMcpContent` JSON-serializes the result and MCP
  consumers ignore unknown fields.
- `strict` mode reproduces today's exact behavior for any caller that needs it.
- The only observable semantic shift is that consumers SHOULD migrate from `ok`/`different[]` to
  `actionableOk`/`actionableDifferent[]` to get the noise-filtered view. This is documented, not
  silently breaking.

## Acceptance criteria

The change is accepted only when ALL of the following hold:

1. The 173-module real case does NOT return 173 flat `different` entries as the actionable signal.
2. The ~159 non-functional false positives are separated from the ~7 actionable modules via
   `actionableDifferent[]` / `nonActionableDifferent[]`.
3. `.form.txt` serialization diffs (Checksum/PrtDevMode*/PrtDevNames*/PrtMip/RecSrcDt) are classified
   as `formSerializationOnly` (non-actionable).
4. `Attribute VB_*` header diffs are classified as `attributeOnly` (non-actionable).
5. Optional `strict` mode reproduces byte/text-exact comparison.
6. Semantic mode is the default for verify/reconcile sync workflows.
7. `compare_module --moduleName X --semantic` classifies a single module and is fully registered.

### Hard verification gates

- `pnpm test` (unit/spec) green, including new classifier unit tests at the
  `ComparisonFileSystemPort` / pure-function seam (strict TDD: tests first).
- `pnpm build` green.
- `pnpm lint` green.
- **Final acceptance (hard gate):** E2E passes in a NON-PRODUCTION environment on THIS machine —
  `node E2E_testing/mcp-e2e.mjs` with `DYSFLOW_E2E_COMMAND` pointed at an isolated `test-runtime/`
  build (requires `ACCESS_VBA_PASSWORD`). **NEVER touch the production runtime at
  `%LOCALAPPDATA%\dysflow`.** New E2E coverage for the semantic classification path MUST be added.

## Risks

1. **Form.txt noise-pattern drift**: noise sections are matched by line-prefix rules; if Access
   renames a serialization property the classifier could misclassify. Mitigation: validate rules
   against real `E2E_testing/src/forms/*.form.txt` fixtures and bias toward treating unknown sections
   as functional.
2. **Encoding best-effort limitation**: `readFile('utf8')` may already have lossily decoded mojibake,
   so `encodingOnly` cannot always be detected at the TS layer. Mitigation: safe failure mode is to
   over-report as functional; never hide a real change. Documented explicitly.
3. **`ok` semantic shift**: consumers using `ok === false` to trigger imports would now act on noise
   unless they migrate to `actionableOk`. Mitigation: keep `ok` semantics conservative and document
   the `actionableOk` migration path in the spec.
4. **`compare_module` 5-file registration**: a missed registration fails silently. Mitigation: a spec
   checklist + a parity test that asserts the tool is registered in all required surfaces.
5. **Review budget**: full implementation (classifier + result contract + verify wiring +
   `compare_module` + tests + E2E) likely exceeds a ~400-line single PR. Mitigation: chain PRs — e.g.
   PR1 pure classifier + unit tests; PR2 wire into verify/reconcile + result contract; PR3
   `compare_module` registration + E2E. Final slicing is decided at the tasks phase.

## Proposal assumptions (review before spec)

The product decisions below were provided as LOCKED by the user and are baked into this proposal. If
any is wrong, correct it before the spec phase:

- 8-category taxonomy exactly as listed; `NameMap` stays functional; only the 7 named sections are
  serialization noise.
- Directionality derives solely from the symmetric functional-line diff (no base, no mtime).
- Encoding is normalize-and-recompare, best-effort, never hides a real change.
- Forms v1 = strip-known-noise + compare remainder (no deep parse).
- Result contract is additive; `different[]` stays populated; `actionableOk` /
  `hasFunctionalDifferences` are the new actionability signal.
- Semantic is default; `strict` is opt-in.
- `compare_module` is MCP-only.
- Final acceptance requires the isolated `test-runtime/` E2E gate.
