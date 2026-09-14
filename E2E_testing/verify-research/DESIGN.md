# `verify_code` conservative comparison design

Status: **research architecture, not approved implementation**. The scope is the existing MCP `verify_code` behavior. The historical CLI probe established only that Dysflow 4.3.2 has no top-level `dysflow verify`; this document does not propose or authorize one.

## Chosen decisions

The proposed contract is normative within this research design:

1. Compare frozen source and binary-export snapshots, not mutable live trees.
2. Use an Access-VBA lexer plus a bounded structural recognizer; do not build a compiler or claim runtime equivalence.
3. Return `incomplete` whenever evidence cannot support a verdict.
4. Treat unknown syntax and unknown attributes conservatively.
5. Require form/report layout and sibling code evidence independently.
6. Keep existing response fields and meanings, adding completeness fields; make legacy gates fail closed when evidence is incomplete.
7. Disable the current `sync_binary` verify cache initially unless its key is upgraded to frozen snapshot identities.

## Current implementation seams

The following map describes the current owners observed in source. Proposed work must extend these seams rather than create a parallel verifier.

1. **MCP input schema** — `src/adapters/mcp/schemas/vba-sync-schemas.ts`, `VBA_SYNC_SCHEMAS.verify_code`, owns `strict`, `moduleNames`, `diff`, `diagnostic`, chunk options, context fields, external-path opt-in, and timeout.
2. **Read-only route** — `src/adapters/mcp/dispatch-routes.ts`, `MCP_TOOL_ROUTES.verify_code`, declares `kind:"vba-sync"`, no binary/filesystem mutation, and `risk:"read-only"`.
3. **Dispatch** — `src/adapters/mcp/dispatch-factory.ts` strips the MCP-only `diagnostic` flag through `verifyCodeServiceInput`, calls `vbaSyncToolService.execute("verify_code", serviceInput)`, then applies `shapeVerifyCodeResponse` and `translateCoreResultToMcpContent`.
4. **Response projection** — `src/adapters/mcp/verify-code-response-shaping.ts` owns compact versus `diagnostic:true` projection. Diagnostic mode also enables core `diff:true`. `src/adapters/mcp/result-translation.ts` converts the core `OperationResult` into the MCP text/structured envelope. `src/adapters/mcp/contracts/dispatch-result-contracts.ts` owns the executable `verify-code` result schema.
5. **Target resolution** — `src/adapters/vba-sync/vba-sync-adapter.ts`, `VbaSyncAdapter.resolveExecutionTarget`, delegates to `resolveExecutionTargetInCore` and then `validateStrictContext` checks expected path fields when requested.
6. **Adapter routing** — `VbaSyncAdapter.execute` routes the tool to `VbaModulesAdapter.execute` in `src/adapters/vba-sync/vba-modules-adapter.ts`.
7. **Verification orchestration** — `VbaModulesAdapter.execute("verify_code")` calls `compareSourceAgainstBinary` and records `recordVerifyOk` only when `actionableOk===true`; otherwise it records verification failure for the human-compile reminder state.
8. **Export and warnings** — `src/core/services/vba-source-comparison.ts`, `compareSourceAgainstBinary`, runs preflight, creates `dysflow-vba-verify-*`, invokes the PowerShell `Export` action, parses `warnings`, compares, and removes the temporary export root. Phase timeouts are owned there. Chunk behavior is owned by `src/core/services/vba-source-comparison-chunking.ts`.
9. **Inventory and pairing** — `collectVbaSourceFiles` recursively recognizes `.bas`, `.cls`, `.frm`, `.form.txt`, and `.report.txt`. `moduleNameFromVbaFile` derives identity from the filename. The current `comparisonKey` is ``lowercase(moduleName) + "\0" + fileType``. `compareVbaSourceTrees` builds `Map`s from those keys, so duplicate keys currently overwrite silently.
10. **Classification** — `src/core/services/vba-semantic-classifier.ts`, `classifyVbaPair`, owns strict comparison and the current semantic normalization/classification pipeline.
11. **Core result assembly** — `compareVbaSourceTrees` owns `ok`, `actionableOk`, `hasFunctionalDifferences`, recommendations, summaries, direction arrays, and bulk lists.
12. **Cache** — direct `verify_code` is not cached. Only `sync_binary` caches a `VbaVerifyResult` in the per-`VbaSyncAdapter` in-memory `verifyCache`. `syncBinaryVerifyCacheKey` currently uses access path, ordered module-name text, strict/semantic mode, and directory path. Successful import/export/delete/form applies invalidate entries by access-path prefix.

### Current field meanings that must remain compatible

- Core result `ok` means raw comparison parity: no entries in `different`, `missingInSource`, or `missingInBinary`. Non-actionable noise can therefore make it false.
- Semantic `actionableOk` is currently `!hasFunctionalDifferences`.
- `hasFunctionalDifferences` currently covers actionable classified differences plus either missing side.
- `recommendedAction` is `no_action | import_to_binary | export_to_src | manual_merge`.
- `bulkImportable` contains `sourceNewer` plus `missingInBinary`; `bulkExportable` contains `binaryNewer` plus `missingInSource`; `bothChanged` is excluded.
- Compact MCP output retains action gates, compact counts, bulk lists, warnings, cache note, versions, and chunk-failure evidence. Full arrays, snippets, `moduleCounts`, and `summaryUnits` require `diagnostic:true`.
- Strict mode intentionally omits semantic summaries/action gates/bulk lists; `ok` remains the strict text-parity signal.
- Wire `schemaVersion` is currently `dysflow.result/v1` at the MCP envelope seam.

### Current contradictions and blockers

- Source comments and the MCP registry describe strict mode as byte-exact, but `compareVbaSourceTrees` reads UTF-8 strings and strict mode compares `sourceText===binaryText`; raw bytes are read only in the semantic branch for encoding classification. This design therefore says **strict text parity** until implementation provides a real byte contract.
- `VbaModulesAdapter` comments say warnings keep verification failed, but its current recorder branches only on `actionableOk`; `compareSourceAgainstBinary` appends export warnings without forcing `actionableOk:false`. Coverage-relevant warning precedence must be implemented explicitly.
- `collectVbaSourceFiles` logs and converts non-ENOENT directory-read failures to empty inventories, and duplicate comparison keys are overwritten by `Map` construction. Both can manufacture incomplete evidence that looks ordinary.
- Current form/report representations are independently keyed; no sibling `.cls` completeness gate exists.
- The `sync_binary` cache key is parameter-based rather than snapshot-based. It cannot prove freshness across external source/binary mutations.

None of these gaps is fixed by this documentation change.

## Evidence and non-goals

| Level | Evidence | Establishes | Does not establish |
| --- | --- | --- | --- |
| E0 | Installed help and source command registry | No top-level CLI command in 4.3.2 | A CLI requirement |
| E1 | 39 synthetic classifier probes | Current lexical characterization | Compilable VBA, p-code, runtime equivalence, or valid SaveAsText |
| E2 | Existing copied-fixture integration | Real export reached baseline/whitespace/strict checks | Scenarios after its unretained import failure |
| E3 | One approved disposable import diagnostic | Captured outer/nested `ok:true` proves one import success | Cause of the earlier failure, repeatability, or backend isolation |

The 39 cases are lexical probes. Form strings are unvalidated SaveAsText-shaped mocks. Module/class attribute placement is not Access round-trip evidence. E3 registry fields were out-of-band MCP observations manually merged into the historical JSON; the harness does not emit them. A green wrapper alone does not prove import success because it may capture a failed import. Its `passwordLogged:false` is declarative intent, not independent secret-scan proof.

Non-goals: compilation, p-code comparison, dataflow, reachability, optimizer-style equivalence, execution of application VBA, database-data verification, or automatic sync.

## Access VBA dialect and recognizer ownership

### Dialect

Target the **Microsoft Access VBA7 source-text dialect emitted by the supported Access VBE/export paths**. The recognizer accepts VBA7 conditional compilation and 32/64-bit declaration text but does not pretend to validate host APIs or types. VBScript, VB.NET, standalone VB6 project grammar, and undocumented recovery guesses are unsupported.

### Owner

Add one proposed core owner, `src/core/services/vba-lexical-canonicalizer.ts`, consumed by `classifyVbaPair`. It should reuse proven normalization primitives extracted from `vba-semantic-classifier.ts`, but own the new state machine and return:

```ts
type CanonicalizationResult =
  | { status: "supported"; logicalStatements: readonly CanonicalStatement[]; diagnostics: readonly CanonicalDiagnostic[] }
  | { status: "incomplete"; diagnostics: readonly CanonicalDiagnostic[] };
```

Do not reuse the form-layout parser as a VBA parser. Do not add a whole compiler. The structural recognizer needs only enough context to establish token and statement boundaries.

### Supported productions

- identifiers, keywords, numeric/date/string literals, escaped double quotes, operators, punctuation, named-argument `:=`;
- apostrophe and statement-leading `Rem` comments;
- labels and colon-separated statements;
- explicit `_` physical-line continuations in the selected dialect;
- module headers and `Attribute` records;
- `Option` and `#Const/#If/#ElseIf/#Else/#End If` directives;
- procedure/property/declaration boundaries;
- sufficient single-line/multiline `If`, loop, `Select`, and `With` nesting to avoid treating contextual colons/newlines as universally interchangeable.

Anything outside the supported grammar, malformed strings, ambiguous `Rem`, invalid/dangling continuations, invalid date literals, unbalanced conditional directives, token-budget exhaustion, or structural ambiguity returns `incomplete`. There is no “best effort equals green” path.

## Canonicalization order

Order is mandatory because blank-line removal or global text replacement can destroy continuation evidence.

1. Read raw bytes once from the frozen snapshot.
2. Select a codec without heuristics. Supported codecs are exactly `utf-8`, `windows-1252`, `utf-16le`, and `utf-16be`. A supported BOM selects its codec; if an explicit manifest codec is also present it must agree or the artifact is `incomplete`. Without a BOM, use the explicit manifest codec. For version-controlled source only, absence of both uses the fixed compatibility default `utf-8`. For binary exports under `verify-code/v2`, the exporter must emit a per-artifact codec in its new export manifest; a missing declaration is `incomplete` rather than guessed.
3. Decode strictly with the selected codec and record `{ codec, source:"bom"|"manifest"|"source-default" }` in the snapshot manifest. Invalid sequences, unsupported BOMs/codecs, or declaration conflicts are `incomplete`. Strip only the matching BOM at byte/file prefix. Never globally repair mojibake or neutralize lossy glyphs.
4. Normalize EOL markers, but retain every physical line, including empty lines.
5. Lex physical lines into code/string/comment tokens.
6. Validate continuations against the supported Access-VBA dialect **before** discarding any blank line. Do not assume a trailing comment after `_` is legal. Unsupported or invalid shapes are `incomplete`.
7. Join only validated continuations, inserting an explicit token boundary.
8. Recognize labels, directives, single-line `If`, and colon/newline statement boundaries contextually. Only grammar-proven equivalent boundaries may canonicalize alike; date literals and `:=` are never split as colons.
9. Remove comment tokens from functional comparison while retaining optional comment diagnostics.
10. Fold case for code identifiers/keywords only. Compare decoded string-literal codepoints exactly.
11. Normalize insignificant inter-token whitespace; never concatenate tokens.
12. Discard empty logical statements only now.
13. Compare ordered logical statements with duplicate cardinality preserved.

Current reality is weaker: `ComparisonFileSystemPort.readFile(path,"utf8")` decodes both trees as UTF-8, and the export result does not provide the proposed per-file codec manifest. `verify-code/v2` therefore requires an exporter-manifest addition before these encoding rules can produce a complete result; this document does not claim the current exporter already supplies it. The new exporter entry is exactly `{ moduleName, fileType, relativePath, codec, sha256, byteLength }`, where `codec` is one of the four tokens above and the hash/length describe the emitted bytes. Missing, duplicate, conflicting, or unrecognized entries make the affected artifact incomplete.

### Non-actionable category and reason contract

The proposed canonicalizer emits an ordered, deduplicated `normalizationReasons` array. Stable reason order is:

```text
bomPrefix, lineEnding, leadingIndentation, trailingWhitespace,
blankLogicalStatement, interTokenWhitespace, identifierCase, commentText,
lineContinuationLayout, statementBoundaryLayout, cosmeticAttribute,
formSerialization
```

Primary category selection is exact:

| Applied reason families | Category |
| --- | --- |
| only proven file-prefix BOM removal (`bomPrefix`) | existing `encodingOnly` |
| only casing | existing `caseOnly` |
| only EOL/indent/trailing/blank/inter-token spaces | existing `whitespaceOnly` |
| only comment removal, optionally plus comment-local whitespace/case | new `commentOnly` |
| only physical continuation layout, optionally plus whitespace/case within joined statements | new `continuationOnly` |
| only proven colon/newline statement-boundary layout, optionally plus whitespace/case | new `statementBoundaryOnly` |
| one cosmetic attribute family only | existing `attributeOnly` |
| one form serialization family only | existing `formSerializationOnly` |
| two or more distinct non-actionable families | new `nonActionableMixed` |

Thus comments are never called whitespace, and a comment+indentation, continuation+comment, or BOM-plus-any-other-family mixture is `nonActionableMixed`; `normalizationReasons` preserves every contributing reason. Unknown reasons/categories fail closed as `incomplete` with empty bulk lists—there is no default “non-actionable” branch.

These four new categories change the exhaustive `VbaSemanticCategory` union. They require an atomic `verify-code/v2` migration of `vba-semantic-classifier.ts`, `VbaSemanticSummary`, `SummaryStructured.nonActionable`, compact `nonActionableByCategory`, response schemas, docs, and every exhaustive consumer. Existing category meanings remain stable, but the enumeration is **not** entirely backward-compatible. Old safety gates still receive `ok:false`/`actionableOk:false` if a producer or shaper cannot represent a category.

## Proposed attribute policy

This table is a conservative policy, not a claim that Access effects have been empirically demonstrated.

| Attribute | Artifact/placement | Proposed comparison | Category/result |
| --- | --- | --- | --- |
| `VB_Name` | One module-level record in `.bas/.cls/.frm`; identity cross-check for paired form/report `.cls` | Case-fold as VBA identifier. Exact case-only drift is non-actionable. Missing, duplicate, misplaced, empty, or path conflict is `incomplete`; neither path nor attribute silently wins. | `caseOnly` for casing; otherwise `incomplete` |
| `VB_PredeclaredId` | Module-level class/document metadata | Preserve as significant until reviewed real round-trip/runtime evidence proves a narrower rule. Current probes prove only broad stripping. | Directional functional category when values differ |
| `VB_Exposed` | Module-level class metadata | Preserve as significant; effect is not assumed, only risk retained. | Directional functional category |
| `VB_Creatable` | Module-level class metadata | Preserve as significant. | Directional functional category |
| `VB_GlobalNameSpace` | Module-level class metadata | Preserve as significant. | Directional functional category |
| `VB_UserMemId` | Member-qualified attribute attached to exactly one recognized member | Preserve as significant. Current retention is a regex-shape side effect, not semantic understanding. Orphaned/duplicate/misplaced member attributes are `incomplete`. | Directional functional category or `incomplete` |
| `VB_Description` | Exactly one correctly parsed module-level `Attribute VB_Description = "..."` or member-level `Attribute <member>.VB_Description = "..."`, attached to an unambiguous owner | The **only initial cosmetic allow-list token**. Ignore for actionability but compare decoded literal codepoints for diagnostics. Empirical Access round-trip validation remains deferred. | Existing `attributeOnly` |
| `VB_HelpID`, `VB_VarHelpID`, `VB_ProcData`, `VB_Invoke_Func`, `VB_MemberFlags` | Module or member | Not on the initial cosmetic allow-list; preserve as significant until each exact token/scope has reviewed evidence. | Directional functional category; malformed placement is `incomplete` |
| Unknown `Attribute` | Any | Preserve as significant; malformed/ambiguous placement is `incomplete`. | Directional functional category or `incomplete` |

Placement is structural: module-level attributes must occur in the recognized module-header attribute region; member-level attributes must name and attach to exactly one recognized member. `VB_Name` must occur exactly once. Duplicate `(owner, attribute-token)` records—including duplicate cosmetic descriptions—are `incomplete`; the recognizer never chooses first/last. A syntactically valid non-allow-listed attribute is significant, while malformed owner/token/value syntax is `incomplete`.

Identity precedence is validation, not override: derive the path candidate, parse `VB_Name`, and require agreement after case-folding. The canonical module identity key is proposed as:

```text
artifact-family + NUL + casefold(VB_Name) + NUL + representation
```

`artifact-family` is `standard | class | form | report`; representation is `code | layout`. Every source/export manifest must reject duplicate keys before constructing a `Map`.

## Snapshot, inventory, warnings, and cache

### Frozen boundaries

1. Resolve and validate paths through the existing target-resolution seam. Materialize a declared scope manifest containing the normalized module filter and every representation required by that scope (`code`, `layout`, and required pairs).
2. Enumerate the full selected source scope as the **pre-capture manifest**. Reject duplicate identity keys before copying.
3. Copy every selected source artifact into an immutable source temp root. Record identity key, relative path, selected codec evidence, SHA-256, size, and pre/post-read stat as the **captured manifest**. Any disappearance/change while reading is `incomplete`.
4. Immediately re-enumerate and rehash the full selected live source scope as the **post-capture manifest**. Pre, captured, and post key sets and hashes must be identical; additions, removals, renames, representation changes, or content changes are `SOURCE_SNAPSHOT_RACE` and make the run `incomplete`.
5. Hash the original frontend (`binaryPre`), copy it byte-for-byte to the verify temp root, and hash the copy before opening (`binaryCopyPre`). Require equality. Export only from the copy with startup suppression and no application-data operation.
6. Export into a third empty temp root using the new codec-bearing exporter manifest. Record every scoped exported identity, hash, codec, omission, and warning; require declared-scope coverage.
7. After export/close, hash the copy (`binaryCopyPost`) and original frontend (`binaryPost`). Snapshot identity requires `binaryPre == binaryCopyPre` before Access opens the copy and `binaryPre == binaryPost` for the original; a mismatch is `BINARY_SNAPSHOT_RACE` and makes the run `incomplete`. Record `binaryCopyPost` diagnostically only: Access may legitimately change bookkeeping in its exclusively owned disposable copy during export. Post-export copy-byte inequality alone is neither proof of semantic drift nor a completeness failure. Exported artifact hashes, manifest coverage, and warnings remain the evidence gates; do not infer module equality from the copy's post-export whole-file hash.
8. Compare only immutable captured-source and exported roots, and only when declared scope counts equal accounted representation counts.
9. Remove only owned temp roots.

Copying a frontend does not prove linked backends were relinked. `verify_code` must not open forms, execute startup/application VBA, or query application tables.

### Inventory and coverage

Every requested module/representation must be accounted as compared, missing, duplicate, unreadable, unsupported, or failed. `collectVbaSourceFiles` must stop swallowing non-ENOENT directory errors into an empty inventory. Duplicate current comparison keys are fatal completeness findings, not last-write-wins.

Coverage-relevant warning classes include:

- structured export failure (`EXPORT_RESULT_FAILED` or its typed underlying code);
- export-warning parse failure (`EXPORT_WARNING_PARSE_FAILED`);
- requested per-module export failure or omission;
- chunk failure/timeout for a requested module;
- unreadable directory/file, decode failure, unsupported syntax, snapshot change, duplicate identity, or missing paired artifact.

Cleanup diagnostics and the existing `vbeCacheNote` are informational unless they show evidence loss. Arbitrary warnings do not automatically mean a functional difference, but any warning capable of hiding requested evidence makes completeness `incomplete`.

### Cache

The current cache exists only inside one `VbaSyncAdapter` instance for `sync_binary`; direct `verify_code` is fresh. Its current key lacks source hashes, binary identity, classifier-rule version, warning state, and representation coverage. The safe first implementation is to disable this cache for the redesigned verifier. Re-enable only with a key containing frozen binary SHA-256, sorted source artifact hashes, normalized filter, strict/semantic mode, canonicalizer version, and pairing policy version. Invalidation remains mandatory after every successful source/binary mutation and any uncertain write outcome.

## Form/report paired-artifact policy

Current exports use the same filename-derived module name for paired artifacts such as `Form_X.cls` plus `Form_X.form.txt`, and `Report_X.cls` plus `Report_X.report.txt`. The current key compares each file type independently and does not enforce the pair.

Proposed mapping:

- `Form_<name>.form.txt` layout pairs with `Form_<name>.cls` behavior after case-folded `VB_Name` validation.
- `Report_<name>.report.txt` layout pairs with `Report_<name>.cls` behavior.
- A layout without its expected `.cls`, or a `Form_/Report_` document `.cls` without its matching layout, is `incomplete`.
- Multiple candidate layouts/classes, path/`VB_Name` conflict, unreadable member, failed export, or unsupported code is `incomplete`.
- Embedded `CodeBehindForm/CodeBehindReport` may be excluded from layout comparison only after the sibling code artifact is present and successfully compared in the same frozen snapshot.

Each pair exposes independently:

```text
layoutStatus:   equivalent | different | incomplete
behaviorStatus: equivalent | different | incomplete
layoutStrictTextParity:   equal | different | unavailable
behaviorStrictTextParity: equal | different | unavailable
```

Pair precedence: `incomplete` dominates `different`, which dominates `equivalent` for the overall verification gate. Strict parity is evidence, not the semantic decision. Any incomplete pair suppresses that module from both bulk lists and forces the aggregate recommendation to `manual_merge`.

## Additive result and backward compatibility

### New optional fields

Keep MCP envelope `schemaVersion:"dysflow.result/v1"` because additions are optional. Add `verificationContractVersion:"verify-code/v2"` and bump `classifierRules` whenever canonicalization/pairing policy changes.

```ts
type VerificationStatus = "equivalent" | "different" | "incomplete"; // semantic mode only
type StrictStatus = "equal" | "unequal" | "incomplete"; // strict mode only
type EvidenceCompleteness = {
  status: "complete" | "incomplete";
  requestedArtifacts: number;
  comparedArtifacts: number;
  incompleteArtifacts: number;
  reasons: readonly { code: string; moduleName?: string; fileType?: string; message: string }[];
  sourceSnapshotId: string;
  binarySnapshotId: string;
};
```

Add optional semantic `verificationStatus`, strict `strictStatus`, `evidenceCompleteness`, `artifactPairs`, and `summaryStructured.incompleteTotal` to core, compact shaping, diagnostic shaping, and `dispatch-result-contracts.ts` together. Add `normalizationReasons: readonly NormalizationReason[]` to classified diagnostic entries/diffs and the new category totals to both full and compact summaries. `verificationStatus` and `strictStatus` are mutually exclusive.

### Precedence and legacy fields

| Condition | `verificationStatus` | Existing fields |
| --- | --- | --- |
| Complete, no functional differences | `equivalent` | `actionableOk:true`; `hasFunctionalDifferences:false`; recommendation may be `no_action`; raw `ok` keeps existing parity meaning |
| Complete, functional/missing-side drift | `different` | Existing direction/recommendation behavior; missing-side evidence keeps current `hasFunctionalDifferences:true` semantics |
| Incomplete because a required source/binary/pair side is missing | `incomplete` | `ok:false`; `hasFunctionalDifferences:true`; `actionableOk:false`; manual merge; both bulk lists empty |
| Incomplete with no known functional or missing-side drift (for example unsupported grammar) | `incomplete` | `ok:false`; `hasFunctionalDifferences:false`; `actionableOk:false`; manual merge; both bulk lists empty |

`hasFunctionalDifferences` retains its current factual meaning: incompleteness alone does not manufacture it, while a missing side remains a functional difference exactly as today. Consumers use `actionableOk` as the safe semantic gate.

Strict mode has a separate complete contract and emits no semantic `verificationStatus`, `actionableOk`, `hasFunctionalDifferences`, recommendation, semantic summary, or bulk lists:

| Strict evidence | `strictStatus` | Existing `ok` |
| --- | --- | --- |
| Complete and raw decoded text equal | `equal` | `true` |
| Complete and raw decoded text unequal | `unequal` | `false` |
| Any evidence incomplete | `incomplete` | `false` |

Strict `unequal` is only text inequality; it never implies semantic difference or equivalence. `evidenceCompleteness` remains present in every strict result.

Old consumers therefore cannot receive `ok:true` or semantic `actionableOk:true` for incomplete evidence, and cannot execute unsafe precomputed bulk sync. Existing field/category meanings, `recommendedAction` enum, and compact/diagnostic split remain; the versioned new category enumeration requires the migration described above.

### Proposed compact semantic incomplete envelope

This is a proposed additive payload, not current runtime output:

```json
{
  "operation": "verify_code",
  "ok": false,
  "dryRun": true,
  "willModifyAccess": false,
  "sourceRoot": "<source>",
  "verificationContractVersion": "verify-code/v2",
  "verificationStatus": "incomplete",
  "evidenceCompleteness": {
    "status": "incomplete",
    "requestedArtifacts": 14,
    "comparedArtifacts": 13,
    "incompleteArtifacts": 1,
    "reasons": [
      {
        "code": "PAIRED_CODE_MISSING",
        "moduleName": "Form_Orders",
        "fileType": "cls",
        "message": "Layout was captured but sibling code evidence is missing."
      }
    ],
    "sourceSnapshotId": "sha256:<source-manifest>",
    "binarySnapshotId": "sha256:<binary-copy>"
  },
  "summaryStructured": {
    "matched": 13,
    "actionableTotal": 0,
    "nonActionableTotal": 0,
    "incompleteTotal": 1
  },
  "summaryByCategory": {
    "sourceNewer": 0,
    "binaryNewer": 0,
    "bothChanged": 0
  },
  "nonActionableByCategory": {
    "caseOnly": 0,
    "whitespaceOnly": 0,
    "attributeOnly": 0,
    "formSerializationOnly": 0,
    "encodingOnly": 0,
    "commentOnly": 0,
    "continuationOnly": 0,
    "statementBoundaryOnly": 0,
    "nonActionableMixed": 0
  },
  "hasFunctionalDifferences": true,
  "actionableOk": false,
  "recommendedAction": "manual_merge",
  "bulkImportable": [],
  "bulkImportableCount": 0,
  "bulkExportable": [],
  "bulkExportableCount": 0,
  "warnings": []
}
```

### Proposed diagnostic pair entry

```json
{
  "identityKey": "form\u0000form_orders",
  "artifactFamily": "form",
  "moduleName": "Form_Orders",
  "layoutStatus": "equivalent",
  "behaviorStatus": "incomplete",
  "layoutStrictTextParity": "different",
  "behaviorStrictTextParity": "unavailable",
  "reasons": ["PAIRED_CODE_MISSING"],
  "bulkRecommendationSuppressed": true
}
```

## Acceptance scenarios

A separately approved implementation must produce these outcomes mechanically:

1. **Identifier/keyword case only** — complete; `verificationStatus:equivalent`, `actionableOk:true`, existing `caseOnly` count increments, bulk lists empty.
2. **String codepoint change** — complete/different; directional or `bothChanged`; `actionableOk:false`.
3. **Comments, spaces, continuations, boundaries, and mixtures** — exact primary categories and ordered `normalizationReasons` follow the table above; malformed/unsupported shapes are incomplete, never hidden equivalence.
4. **Order/cardinality/token merge** — complete/different; never normalized away.
5. **Directives** — `Option`/conditional changes remain significant without reachability proof.
6. **Attributes** — case-only `VB_Name` equivalent; missing/duplicate/path-conflicting identity incomplete; significant/unknown attribute drift different; only correctly scoped `VB_Description` is initially allow-listed as `attributeOnly`.
7. **Duplicate key** — no overwrite; incomplete counter increments; `ok:false`, `actionableOk:false`, manual merge, empty bulk lists.
8. **Export warning/parse failure/chunk timeout** — affected requested artifacts incomplete with exact counters and reason codes.
9. **Source or binary changes during capture** — additions/removals/renames/hash changes across source pre/captured/post manifests or inequality across binary pre/copy-pre/copy-post/post identities produce exact incomplete reasons and no cached/bulk recommendation.
10. **Form pair layout noise plus matching `.cls`** — layout and behavior equivalent can be green.
11. **Layout green but sibling `.cls` missing/failed/ambiguous** — behavior incomplete, aggregate incomplete, recommendation suppressed.
12. **Layout functional change with behavior equal** — complete/different with pair statuses and strict parity reported separately.
13. **Strict mode** — complete equal emits `strictStatus:equal, ok:true`; complete unequal emits `strictStatus:unequal, ok:false`; incomplete emits `strictStatus:incomplete, ok:false`. Semantic status/action/recommendation/summary/bulk fields are absent in all three.
14. **Compact versus diagnostic** — both carry mode-appropriate status and completeness; semantic mode carries its safe action gates in both projections, while strict mode omits them in both. Only diagnostic carries full artifacts/snippets/pairs and per-entry `normalizationReasons`.
15. **Cache** — disabled initially, or proves key separation by snapshot hashes and canonicalizer/pairing versions; every mutation invalidates.

For every scenario assert requested/compared/incomplete counts, applicable legacy arrays/gates, compact projection, diagnostic projection, executable result-schema acceptance, and MCP structured/text parity. Semantic scenarios assert `actionableOk`, `hasFunctionalDifferences`, `recommendedAction`, and bulk suppression; strict scenarios assert those fields are absent and use only `strictStatus`, completeness, and `ok`.

## Deferred empirical validation

Before narrowing conservative attribute or syntax policy, obtain valid Access-exported fixtures for class/document attributes, module identity casing, member attributes, and form/report pairs. Human compilation is required only when a later validation explicitly needs compilation; this design never calls it automatically. Runtime experiments must use disposable copies and cannot establish p-code equivalence without a separately designed authority.

## Key learnings

- Current `verify_code` already has one end-to-end owner chain; a redesign should extend it, not add a parallel command.
- Raw parity (`ok`) and safe actionability (`actionableOk`) are intentionally different today.
- The current filename-plus-fileType `Map` key can hide duplicate evidence.
- Direct `verify_code` is fresh; the weaker cache is confined to `sync_binary`.
- Completeness must be a first-class gate because warnings, missing pairs, races, and unsupported syntax are not ordinary diffs.
- Form layout can ignore embedded code only when sibling `.cls` evidence closes the behavior side of the pair.
