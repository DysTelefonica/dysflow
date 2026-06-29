# Technical Design: vba-semantic-diff

Status: design
Artifact store: hybrid (file + Engram `sdd/vba-semantic-diff/design`)
Reads: `sdd/vba-semantic-diff/proposal` (Engram + `openspec/changes/vba-semantic-diff/proposal.md`)

---

## 1. Executive summary

Introduce a **pure domain classifier** (`src/core/services/vba-semantic-classifier.ts`, zero
adapter deps) that takes `(sourceText, binaryText, fileType, mode)` and returns a
`SemanticClassification`. `compareVbaSourceTrees` calls the classifier instead of the byte-exact
`sourceText === binaryText` check at line 244. The result contract grows **additively** (no field
removed, no consumer broken) so the JSON-serialized payload keeps `matched/different/...` and gains
`summary`, `actionableDifferent[]`, `nonActionableDifferent[]`, `hasFunctionalDifferences`,
`actionableOk`, plus per-diff `classification/reason/srcUniqueFunctionalLines/
binaryUniqueFunctionalLines/recommendation`. A new MCP-only `compare_module` tool wires the same
classifier through the existing 5-file registration path, guarded by a parity test.

The architecture keeps the hexagonal boundary intact: **all classification logic is pure and
synchronous**; the only I/O concession is an optional byte-returning port method
(`readFileBytes`) used solely to make `encodingOnly` reliable, with a string fallback that preserves
backward compatibility for every existing caller.

---

## 2. Architecture approach

### 2.1 Pattern and layering

- **Pattern**: a pure *strategy/pipeline* domain service. The classifier is a composition of
  small, individually testable **normalizers** plus a **functional-line differ**.
- **Layering** (unchanged hexagonal boundaries):
  - `src/core/services/vba-semantic-classifier.ts` — NEW. Pure. No `node:fs`, no adapters.
  - `src/core/services/vba-source-comparison.ts` — calls the classifier; owns the result contract.
  - `src/adapters/vba-sync/vba-modules-adapter.ts` — mode plumbing + `compare_module` handling.
  - `src/adapters/mcp/*` — `compare_module` registration (5 files).
- **Boundary rule**: the classifier never reads files, never knows about MCP, never throws on
  malformed input. Its only inputs are strings (+ optional bytes) and a discriminated `mode`.

### 2.2 Why a separate pure service (not inline in `compareVbaSourceTrees`)

The proposal already mandates `vba-semantic-classifier.ts`. Justification preserved here:

- **Testability under strict TDD**: a pure `(sourceText, binaryText, fileType, mode) =>
  SemanticClassification` function is exhaustively unit-testable with in-memory string fixtures,
  with no `ComparisonFileSystemPort`, no temp dirs, no PowerShell. This is the single most important
  design driver.
- **Reuse**: `compare_module` (single module) and `compareVbaSourceTrees` (whole tree) call the
  exact same classifier — one source of truth for the 8 categories.
- **Behavior-vs-implementation testing** (per `docs/testing/testing-philosophy.md`): tests assert on
  `classification`/`reason`/`*UniqueFunctionalLines`, which are observable outputs of the port, not
  internal normalizer call order.

---

## 3. Component map and data flow

```
MCP call (verify_code | verify_binary | reconcile_binary | compare_module)
  -> VbaModulesAdapter.execute(toolName, params)
       reads params.strict (default => semantic)  [mode plumbing]
  -> compareSourceAgainstBinary / planReconcileBinary / compareSingleModule
       -> Export to temp dir via runVbaManager   [unchanged I/O]
       -> compareVbaSourceTrees(..., mode, fileSystem)
            for each (source,binary) pair:
              read text (+ bytes if available)   [port]
              -> classifyVbaPair({ sourceText, binaryText,
                                   sourceBytes?, binaryBytes?,
                                   fileType, mode })   [PURE]
                   -> normalizers pipeline
                   -> functional-line differ
                   -> SemanticClassification
            -> aggregate into VbaVerifyResult (additive fields)
  -> translateCoreResultToMcpContent JSON.stringify(result.data)  [unchanged]
```

### 3.1 The pure classifier API

```ts
// src/core/services/vba-semantic-classifier.ts  (PURE — no imports from node:* or adapters)

export type VbaComparisonMode = "semantic" | "strict";

export type VbaSemanticCategory =
  | "matched"               // identical after no/normalization
  | "whitespaceOnly"        // differ only by CRLF/LF/trailing-ws/blank lines
  | "attributeOnly"         // differ only by Attribute VB_* header lines
  | "formSerializationOnly" // differ only by stripped form/report noise sections
  | "encodingOnly"          // differ only by encoding mojibake (normalize-and-recompare)
  | "sourceNewer"           // functional change, only source has unique functional lines
  | "binaryNewer"           // functional change, only binary has unique functional lines
  | "bothChanged";          // functional change on both sides

export type VbaRecommendation =
  | "no_action"
  | "import_to_binary"   // source -> Access
  | "export_to_src"      // Access -> disk
  | "manual_merge";

export interface SemanticClassification {
  classification: VbaSemanticCategory;
  reason: string;                       // stable, human/grep-friendly, no paths/timestamps
  srcUniqueFunctionalLines: number;
  binaryUniqueFunctionalLines: number;
  recommendation: VbaRecommendation;
  actionable: boolean;                  // true only for sourceNewer/binaryNewer/bothChanged
}

export interface ClassifyVbaPairInput {
  sourceText: string;
  binaryText: string;
  sourceBytes?: Uint8Array;             // optional — enables reliable encodingOnly
  binaryBytes?: Uint8Array;
  fileType: string;                     // "bas" | "cls" | "frm" | "form.txt" | "report.txt"
  mode: VbaComparisonMode;
}

export function classifyVbaPair(input: ClassifyVbaPairInput): SemanticClassification;
```

`classifyVbaPair` is the only exported entry point the comparison service calls. Internal
normalizers and the differ are also exported (named) so they can be unit-tested in isolation, but
the public contract — what tests assert on — is `SemanticClassification`.

### 3.2 Normalizers (composable, pure)

Each normalizer is `(text: string, fileType: string) => string`. They are pure and order-defined.
The classifier applies them progressively to detect the *narrowest* category that explains the diff.

| Normalizer                | Responsibility                                                        |
| ------------------------- | --------------------------------------------------------------------- |
| `normalizeLineEndings`    | CRLF/CR -> LF                                                         |
| `normalizeTrailingWhitespace` | strip trailing spaces/tabs per line; collapse trailing blank lines |
| `stripAttributeLines`     | remove `Attribute VB_*` header lines (`.bas`/`.cls`/`.frm`)          |
| `stripFormSerializationNoise` | remove known form/report noise sections (see §6)                  |
| `repairMojibake`          | best-effort Latin-1<->UTF-8 double-encoding repair (see §5)          |

Normalizers are intentionally *additive filters*: `stripAttributeLines` only fires for code file
types, `stripFormSerializationNoise` only for `form.txt`/`report.txt`. For `bas`/`cls`/`frm` the
form normalizer is a no-op; for `form.txt`/`report.txt` the attribute normalizer is a no-op.

### 3.3 Classification algorithm (category resolution order)

The classifier resolves to the **narrowest** category that fully explains the difference, in this
fixed precedence. At each step it compares the two texts *under the cumulative normalization so far*
and, critically, checks whether the **delta removed by the just-applied normalizer was the ONLY
difference**.

```
0. strict mode: if sourceText === binaryText -> matched; else fall straight to functional diff
   (no normalization, no noise buckets). Strict = byte/text-exact, directionality still derived.

1. raw equal?                                  -> matched
2. equal after normalizeLineEndings(+trailingWs)? -> whitespaceOnly
3. equal after (2)+stripAttributeLines?        -> attributeOnly        (code types only)
4. equal after (2)+stripFormSerializationNoise?-> formSerializationOnly (form/report only)
5. equal after (2..4)+repairMojibake?          -> encodingOnly         (see §5 safety)
6. else -> FUNCTIONAL: run functional-line differ on the fully-normalized texts
           (2..5 applied, so noise never counts as functional)
           srcUnique>0 & binUnique==0 -> sourceNewer   / import_to_binary
           srcUnique==0 & binUnique>0 -> binaryNewer   / export_to_src
           srcUnique>0 & binUnique>0  -> bothChanged   / manual_merge
           srcUnique==0 & binUnique==0-> matched (defensive; normalization equalized them)
```

Buckets 2–5 set `recommendation = no_action`, `actionable = false`. They are *non-actionable noise*.
Buckets sourceNewer/binaryNewer/bothChanged set `actionable = true`.

**Safety bias (LOCKED proposal decision #4/#5)**: when a normalizer cannot be applied confidently
(e.g. mojibake repair is ambiguous, or an unknown form section is encountered), the classifier does
NOT collapse the diff into a noise bucket — it falls through to the functional differ. Over-reporting
as functional is the safe failure; hiding a real change is forbidden.

---

## 4. Functional-line diff (Decision: LCS-based symmetric diff)

### 4.1 Decision

Compute `srcUniqueFunctionalLines` / `binaryUniqueFunctionalLines` via an **LCS (longest common
subsequence) line diff** over the fully-normalized line arrays, then count the lines NOT in the LCS
on each side.

```
lcs = lcsLength(srcLines, binLines)         // classic DP, O(n*m) on functional lines
srcUnique = srcLines.length - lcs
binUnique = binLines.length - lcs
```

### 4.2 Why LCS over set-with-multiplicity

| Aspect            | LCS line diff (CHOSEN)                          | Set/multiset diff (rejected)            |
| ----------------- | ----------------------------------------------- | --------------------------------------- |
| Line moves        | A pure reorder yields small src/bin unique > 0 but symmetric — flagged `bothChanged` (manual_merge), which is the safe signal for a genuine reorder. | A reorder yields 0 unique on both sides -> falsely `matched`. **Hides real intent.** |
| Duplicated lines  | Respects multiplicity and position.             | Multiset respects multiplicity but not position; loses move info. |
| Directionality    | Asymmetric add/remove cleanly drives sourceNewer/binaryNewer. | Works for asymmetric too, but conflates moves. |
| Cost              | O(n*m); VBA modules are small (hundreds–low thousands of lines). Acceptable. | O(n) but at the cost of correctness on moves. |

**Move handling**: the proposal says "handle line moves sensibly". A reorder that preserves content
is genuinely ambiguous — it *is* a change to the file. LCS surfaces it as a small symmetric unique
count -> `bothChanged` -> `manual_merge`. This is the conservative, never-hide-a-change behavior the
proposal demands. We do NOT add a special "moveOnly" category in v1 (out of scope; would risk
hiding real reorders that matter in form serialization).

### 4.3 Bounding cost

VBA source files are small. To stay safe on pathological inputs, the LCS DP is capped: if either
side exceeds a line budget (e.g. 20000 functional lines), fall back to a multiset-difference count
(still correct for add/remove magnitude) and append `reason` note `lcs-capped`. This keeps the pure
function bounded without an adapter dependency. The cap is a constant in the module.

---

## 5. Encoding (CRITICAL decision)

### 5.1 The problem confirmed in code

`compareVbaSourceTrees` reads both files with `fileSystem.readFile(path, "utf8")` (line 240–242).
If a file on disk is actually Windows-1252/Latin-1 but contains UTF-8-interpreted mojibake (the
classic `Edición` -> `EdiciÃ³n` double-encoding), reading as UTF-8 can **lossily** decode invalid
byte sequences into U+FFFD (replacement char). Once that happens, the original bytes are gone and a
string-level repair can no longer distinguish "pure encoding noise" from "a real content change that
also happened to involve a replacement char". That makes `encodingOnly` unreliable.

### 5.2 Decision: add a byte-returning port variant; string repair is the fallback, never the source of truth for safety

We do BOTH, layered:

1. **Port change (additive, backward-compatible)**: extend `ComparisonFileSystemPort` with an
   OPTIONAL method:

   ```ts
   export interface ComparisonFileSystemPort {
     // ...existing...
     readFile(path: string, encoding: "utf8"): Promise<string>;
     readFileBytes?(path: string): Promise<Uint8Array>;   // NEW, optional
   }
   ```

   - Existing callers (the in-memory test mock, any other implementor) that do NOT provide
     `readFileBytes` keep working unchanged — the comparison service feature-detects it.
   - The node adapter (`nodeComparisonFileSystem` in `vba-modules-adapter.ts` and the test mirror in
     `vba-source-comparison.test.ts`) implements `readFileBytes` via `readFile(path)` (no encoding)
     returning a `Buffer`.

2. **Comparison service**: when `readFileBytes` is present, read raw bytes for the pair and pass
   `sourceBytes`/`binaryBytes` into `classifyVbaPair`. When absent, pass only the utf8 strings
   (string-only path).

3. **Classifier encoding logic** (`repairMojibake` + `encodingOnly` resolution):
   - **Byte path (preferred, reliable)**: decode each side under both UTF-8 and Windows-1252. If the
     two sides decode to the SAME logical string under a consistent interpretation (i.e. one side is
     the UTF-8-as-Latin-1 mis-decoding of the other and repairing yields byte-for-byte logical
     equality of the *non-encoding* content), classify `encodingOnly`. If repair does NOT fully
     reconcile them, fall through to functional diff. The decision is made on bytes, so no lossy
     UTF-8 pre-decode can hide a change.
   - **String fallback path (best-effort)**: attempt the Latin-1<->UTF-8 double-encoding repair on
     the strings. This is offered ONLY as a convenience for callers without `readFileBytes`. If the
     string already contains U+FFFD replacement chars (evidence of prior lossy decode), the
     classifier MUST NOT claim `encodingOnly` — it falls through to functional. This enforces
     "never hide a real change" even on the degraded path.

4. **Safety invariant (LOCKED #4)**: `encodingOnly` is only ever assigned when the normalized,
   encoding-repaired content is provably equal. Any ambiguity, any replacement char, any failed
   repair -> functional bucket. Over-report, never under-report.

### 5.3 Backward compatibility

- `readFileBytes` is optional, so no existing `ComparisonFileSystemPort` implementor breaks.
- The two production/test node implementations add the method (one-line each).
- The result contract is unchanged by this decision except that `encodingOnly` becomes trustworthy.

---

## 6. Form/report serialization noise stripping (`stripFormSerializationNoise`)

### 6.1 Exact rules (LOCKED proposal #3/#5)

Applies to `fileType` of `form.txt` and `report.txt` only.

**Scalar prefix lines to strip** (`^\s*<Key>\s*=`): single-line assignments whose key is one of:

- `Checksum`

**Block sections to strip** (`<Key> = Begin` ... `End` multi-line blocks, including the `Begin`/`End`
delimiters and all hex payload lines between them):

- `PrtDevMode`
- `PrtDevModeW`
- `PrtDevNames`
- `PrtDevNamesW`
- `PrtMip`
- `RecSrcDt`

These keys can appear either as scalar `Key =value` or as `Key = Begin … End` blocks depending on
Access version; the stripper handles BOTH forms for each printer/checksum/recsrc key (match by key,
then consume either the single line or the full `Begin…End` block).

**Explicitly RETAINED as functional (do NOT strip)**:

- `NameMap = Begin … End` — LOCKED decision #3, NameMap is functional.
- `GUID = Begin … End` — identity, functional.
- Everything else (controls, properties, captions, `CodeBehind`, event bindings).

### 6.2 Unknown-section bias

If the stripper encounters a `Key = Begin … End` block whose key is NOT in the strip allow-list, it
is **retained as functional** (LOCKED #5: "bias unknown sections to functional"). The strip list is a
closed allow-list of known-noise keys; anything unknown counts.

### 6.3 v1 scope boundary

v1 = strip-known-noise + compare remainder. No deep form-property parsing, no control-tree
diffing (that is v2, non-goal). After stripping, the remainder is compared via the same
whitespace-normalized functional-line differ.

---

## 7. Mode plumbing (`strict` flag)

### 7.1 Flow

```
MCP param `strict: boolean`  (schema STRICT_CTX already exposes `strict`; reuse it)
  -> VbaModulesAdapter.execute reads truthy(params.strict)
  -> mode: VbaComparisonMode = params.strict ? "strict" : "semantic"   (DEFAULT semantic)
  -> compareSourceAgainstBinary(toolName, params, ctx, fs)  passes mode
  -> compareVbaSourceTrees(sourceRoot, binaryRoot, moduleNames, includeDiffs, fs, mode)
  -> classifyVbaPair({ ..., mode })
```

### 7.2 Signature changes

- `compareVbaSourceTrees(... , includeDiffs, fileSystem)` gains a trailing
  `mode: VbaComparisonMode = "semantic"` parameter (default keeps existing callers/tests compiling).
- `compareSourceAgainstBinary` derives `mode` from `truthy(params.strict)` and forwards it.
- `planReconcileBinary` forwards `mode` the same way (it already delegates to
  `compareSourceAgainstBinary`).

**Default = semantic** for `verify_code`/`verify_binary`/`reconcile_binary`/`compare_module`.
`strict: true` restores byte/text-exact bucketing (the legacy behavior) while STILL deriving
directionality on functional diffs.

### 7.3 Schema

`verify_code`/`verify_binary`/`reconcile_binary` already spread `...STRICT_CTX`, but that only
provides `strictContext`. Add `strict: SCHEMA_PROPS.strict` to those three schemas' properties (the
prop already exists at `schema-props.ts:152`). `compare_module` schema (new) includes it too.

---

## 8. `ok` / `hasFunctionalDifferences` / `actionableOk` recomputation

### 8.1 Definitions

Given the classified `different[]` partitioned into `actionableDifferent[]` (category in
{sourceNewer, binaryNewer, bothChanged}) and `nonActionableDifferent[]` (category in
{whitespaceOnly, attributeOnly, formSerializationOnly, encodingOnly}):

```ts
// PRESERVED legacy semantics — any structural divergence keeps ok=false
ok = different.length === 0
  && missingInSource.length === 0
  && missingInBinary.length === 0;

// NEW actionability signal — the field consumers should act on
hasFunctionalDifferences =
  actionableDifferent.length > 0
  || missingInSource.length > 0
  || missingInBinary.length > 0;

actionableOk = !hasFunctionalDifferences;
```

### 8.2 Rationale

- `ok` is intentionally **unchanged in spirit**: it stays `false` whenever there is ANY diff
  (including pure noise) or any missing module. This preserves every existing test and consumer that
  reads `VbaVerifyResult.ok` semantics (the proposal confirms no TS consumer checks
  `VbaVerifyResult.ok`, only `OperationResult.ok`, but we keep it stable anyway).
- `actionableOk`/`hasFunctionalDifferences` is the NEW, distinct signal: "is there real work to
  do?". `missingInSource`/`missingInBinary` count as functional (a module present on one side only
  is a real reconciliation action), so they flip `hasFunctionalDifferences` true.
- In **strict** mode, every `different` entry is actionable by construction (no noise buckets), so
  `actionableOk === ok` for the diff dimension — strict callers see the legacy-equivalent signal.

---

## 9. Result contract (additive shape)

```ts
export type VbaSourceDiffEntry = VbaSourceComparisonEntry & {
  sourceSnippet: string;
  binarySnippet: string;
  // NEW (additive):
  classification: VbaSemanticCategory;
  reason: string;
  srcUniqueFunctionalLines: number;
  binaryUniqueFunctionalLines: number;
  recommendation: VbaRecommendation;
};

export type VbaSemanticSummary = {
  total: number;
  byCategory: Record<VbaSemanticCategory, number>;
  actionable: number;
  nonActionable: number;
};

export type VbaVerifyResult = {
  operation: "verify_code" | "verify_binary";
  ok: boolean;
  dryRun: true;
  willModifyAccess: false;
  sourceRoot: string;
  matched: readonly VbaSourceComparisonEntry[];
  different: readonly VbaSourceComparisonEntry[];       // KEPT — all diffs (noise + actionable)
  missingInSource: readonly VbaSourceComparisonEntry[]; // KEPT
  missingInBinary: readonly VbaSourceComparisonEntry[]; // KEPT
  diffs?: readonly VbaSourceDiffEntry[];                // KEPT (now carries classification)
  // NEW (additive):
  summary: VbaSemanticSummary;
  actionableDifferent: readonly VbaSourceComparisonEntry[];
  nonActionableDifferent: readonly VbaSourceComparisonEntry[];
  hasFunctionalDifferences: boolean;
  actionableOk: boolean;
};
```

`VbaReconcilePlanResult` (Omit<VbaVerifyResult, "operation"> & reconcile fields) inherits all new
fields automatically. Its `recommendation` string should additionally reflect actionability: when
`actionableOk` is true but `ok` is false (pure noise), recommend "differences are non-actionable
noise; no reconciliation needed".

**Why additive is safe**: `translateCoreResultToMcpContent` does `JSON.stringify(result.data)`
(confirmed in proposal "Learned"); no TS consumer decomposes `different[]` or branches on
`VbaVerifyResult.ok`. New fields ride along in the serialized payload without breaking anyone. The
classifier populates `different[]` exactly as before (every non-matched pair), so existing
assertions on `different`/`matched` lengths still hold for genuinely-different files; only files that
were byte-different but normalize-equal move from `different` to `matched` under semantic mode — that
is the intended behavior change and is covered by new tests, while `strict` mode preserves the old
bucketing for any test that needs byte-exactness.

---

## 10. `compare_module` wiring (5-file registration + parity test)

New MCP-only tool: `compare_module` — compares ONE module by name, semantic by default. No HTTP/CLI
parity (LOCKED non-goal).

### 10.1 The 5 touch points

| # | File | Change |
| - | ---- | ------ |
| 1 | `src/adapters/mcp/mcp-tool-registry.ts` | Add `"compare_module"` to `VBA_SYNC_TOOL_NAMES`. |
| 2 | `src/adapters/mcp/tool-parity-registry.ts` | Add `"compare_module"` to `implementedToolNames`. |
| 3 | `src/adapters/mcp/dispatch-routes.ts` | Add `compare_module: { kind: "vba-sync" }` to `MCP_TOOL_ROUTES`. (NOT an alias tool.) |
| 4 | `src/adapters/mcp/schemas/vba-sync-schemas.ts` | Add `compare_module` schema: `{ CTX_PROPS, ACCESS_OVERRIDE, moduleName: SCHEMA_PROPS.moduleName, strict: SCHEMA_PROPS.strict, diff: SCHEMA_PROPS.diff, timeoutMs }`. `moduleName` required. |
| 5 | `src/adapters/vba-sync/vba-modules-adapter.ts` | Add `compare_module` to `VbaModulesAdapter.handles()` and to `execute()`: route to a new `compareSingleModule` flow (reuses `compareSourceAgainstBinary` with the module filter = `[moduleName]`, then returns the single entry's classification). |

`compare_module` is a generated dispatch tool (`kind: "vba-sync"`), NOT an alias — so it does NOT go
in `ALIAS_TOOL_NAME_LIST`. It is handled by the same vba-sync routing that already covers
`verify_code`/`verify_binary`.

### 10.2 Implementation note for `compareSingleModule`

Simplest correct approach: call `compareSourceAgainstBinary("verify_code", { ...params,
moduleNames: [moduleName] }, ctx, fs)` (semantic/strict via `params.strict`), then shape the result
into a single-module response (the one matched/different/diff entry + its classification, summary
with total<=1). This reuses the export+compare+classify pipeline verbatim — zero duplicated
comparison logic.

### 10.3 Parity test (prevents silent mis-registration)

The proposal's "Learned" warns the 5-file registration fails silently if any file is missed. Add a
contract test (e.g. `test/adapters/mcp/compare-module-registration.test.ts`) asserting:

- `"compare_module"` ∈ `VBA_SYNC_TOOL_NAMES`.
- `getToolDefinition("compare_module").status === "implemented"` and `.slice === "vba-sync"`.
- `MCP_TOOL_ROUTES.compare_module.kind === "vba-sync"`.
- `VBA_SYNC_TOOL_SCHEMAS.compare_module` exists, requires `moduleName`, and exposes `strict`.
- `VbaModulesAdapter.handles("compare_module") === true`.

If any existing parity/coverage test already iterates `DYSFLOW_MCP_TOOL_NAMES` and asserts every
name has a schema/route/status, those will ALSO catch a missed file — confirm and lean on them.

---

## 11. Test strategy (strict TDD ACTIVE)

Runner: `pnpm test` (vitest). Write failing tests first, then implement. Tests assert on observable
classifier outputs and aggregated result fields — never on normalizer call order or private shape
(per `docs/testing/testing-philosophy.md`).

### 11.1 Classifier unit tests (`test/core/services/vba-semantic-classifier.test.ts`, NEW)

Pure, in-memory strings; one group per category + directionality + mode + safety:

1. **matched** — identical text -> `matched`, `actionable:false`.
2. **whitespaceOnly** — CRLF vs LF, trailing spaces, extra trailing blank line.
3. **attributeOnly** — differ only by `Attribute VB_Name`/`VB_GlobalNameSpace` lines (`.cls`).
4. **formSerializationOnly** — `.form.txt` differing only in `Checksum`, `PrtDevMode` block,
   `RecSrcDt` block; assert `NameMap`/`GUID` differences are NOT swallowed (stay functional).
5. **encodingOnly (byte path)** — UTF-8 vs Windows-1252 bytes of `"Edición"`; assert `encodingOnly`.
6. **encodingOnly safety** — string contains U+FFFD or repair fails -> NOT `encodingOnly`, falls to
   functional. (never-hide-a-change guard.)
7. **sourceNewer** — source has extra functional line -> `import_to_binary`, srcUnique>0/binUnique=0.
8. **binaryNewer** — binary has extra functional line -> `export_to_src`.
9. **bothChanged** — both sides add distinct functional lines -> `manual_merge`, both unique>0.
10. **line-move** — reorder -> symmetric unique -> `bothChanged` (documents the conservative choice).
11. **mode=strict** — whitespace-only diff under strict -> still functional/`different`, NOT
    `whitespaceOnly` (strict bypasses noise buckets).
12. **unknown form section bias** — unknown `Foo = Begin…End` -> retained -> functional.

Fixtures reuse real-shaped snippets harvested from `E2E_testing/src` (`.cls` headers, a real
`form.txt` header with `Checksum`/`PrtDevMode`/`RecSrcDt`/`NameMap`/`GUID` as seen in
`Form_FormCPV.form.txt`), trimmed to minimal in-memory string constants.

### 11.2 Comparison-service tests (extend `test/core/services/vba-source-comparison.test.ts`)

Using the existing in-memory `ComparisonFileSystemPort` mock + a `readFileBytes` mock:

1. **ok-recalc** — tree with one whitespace-only diff: `ok:false` (legacy preserved) but
   `actionableOk:true`, `hasFunctionalDifferences:false`, entry in `nonActionableDifferent`.
2. **actionable diff** — one sourceNewer module: `hasFunctionalDifferences:true`,
   `actionableDifferent` has it, `summary.byCategory.sourceNewer === 1`.
3. **missing module flips actionable** — `missingInBinary` non-empty -> `hasFunctionalDifferences:true`.
4. **strict mode** — whitespace-only diff with `mode:"strict"` -> entry stays in `actionableDifferent`
   / `different` and `actionableOk===ok`.
5. **bytes-port present vs absent** — same encoding-noise pair classifies `encodingOnly` when
   `readFileBytes` is provided, and falls through to functional (safe) when it is absent and the
   utf8 strings already lost information.
6. **diffs carry classification** — `includeDiffs:true` populates `diffs[].classification/reason/
   srcUniqueFunctionalLines/recommendation`.

Existing tests that assert `comparison.different` for genuinely different content (`"source content"`
vs `"binary content"`) still pass — those are functional diffs. Any test relying on byte-exact
bucketing of normalize-equal content gets a `mode:"strict"` variant.

### 11.3 Registration parity test

`test/adapters/mcp/compare-module-registration.test.ts` per §10.3.

### 11.4 E2E addition (`E2E_testing/mcp-e2e.mjs`)

- Add a `compare_module` record alongside the existing `verify_code` record (line 227), against the
  isolated `test-runtime/` (E2E already forces `DYSFLOW_HOME = repoRoot/test-runtime` at line 25 and
  reads `DYSFLOW_E2E_COMMAND`). No production runtime is touched.
- Exercise the semantic path: call `verify_code` (now semantic by default) for `existingModuleName`
  and assert the serialized payload includes `summary`, `hasFunctionalDifferences`, `actionableOk`.
- Add a `compare_module` call: `{ ...ctx, moduleName: existingModuleName, diff: true }` and assert it
  returns a single-module classification.
- Optionally a `verify_code` with `strict: true` to confirm strict bucketing still works end to end.
- Hard gate stays: `node E2E_testing/mcp-e2e.mjs` with `ACCESS_VBA_PASSWORD`, never
  `%LOCALAPPDATA%\dysflow`.

---

## 12. PR slicing (≤400-line review budget, chained PRs)

Chained PRs, each independently green (`pnpm test && pnpm build && pnpm lint`). The classifier and
wiring are deliberately decoupled so PR1 ships pure value with zero adapter risk.

| PR | Scope | Files | Approx. review |
| -- | ----- | ----- | -------------- |
| **PR1** | Pure classifier + unit tests | `src/core/services/vba-semantic-classifier.ts` (NEW), `test/core/services/vba-semantic-classifier.test.ts` (NEW) | ~300–380 |
| **PR2** | Wire classifier into comparison + result contract + `readFileBytes` port + mode plumbing | `vba-source-comparison.ts`, `vba-modules-adapter.ts` (`nodeComparisonFileSystem.readFileBytes`, mode), `schemas/vba-sync-schemas.ts` (add `strict` to 3 schemas), extend `vba-source-comparison.test.ts` | ~300–400 |
| **PR3** | `compare_module` tool (5-file registration) + parity test + E2E semantic coverage | `mcp-tool-registry.ts`, `tool-parity-registry.ts`, `dispatch-routes.ts`, `schemas/vba-sync-schemas.ts` (compare_module schema), `vba-modules-adapter.ts` (`compareSingleModule`), `compare-module-registration.test.ts` (NEW), `E2E_testing/mcp-e2e.mjs` | ~250–350 |

Chain order is strict: PR2 depends on PR1's exported `classifyVbaPair`; PR3 depends on PR2's mode
plumbing and result contract. Recommend `feature-branch-chain` if rollback control matters, else
`stacked-to-main`. Each PR is a behavior-complete, independently reviewable slice.

If PR2 exceeds 400 lines in practice, split the `readFileBytes`/encoding sub-slice into its own PR
between PR1 and the rest of PR2 (encoding is the riskiest, most-isolated change).

---

## 13. ADR-style decisions

### ADR-1: Pure classifier as a separate domain service
- **Decision**: `classifyVbaPair` is a pure synchronous function in `src/core/services`, no I/O.
- **Rationale**: strict-TDD testability, reuse across `compareVbaSourceTrees` and `compare_module`,
  hexagonal purity, behavior-focused tests.
- **Rejected**: inlining the logic in `compareVbaSourceTrees` (untestable without temp dirs, couples
  classification to filesystem traversal, no reuse for `compare_module`).

### ADR-2: LCS line diff for directionality
- **Decision**: LCS-based symmetric functional-line diff -> srcUnique/binUnique counts.
- **Rationale**: correctly surfaces reorders/moves as `bothChanged` instead of hiding them; clean
  asymmetric add/remove -> sourceNewer/binaryNewer.
- **Rejected**: set/multiset diff (hides moves -> false `matched`, violates never-hide-a-change).
- **Mitigation**: O(n*m) capped with multiset fallback + `lcs-capped` reason note for huge files.

### ADR-3: Byte-returning optional port method for reliable `encodingOnly`
- **Decision**: add optional `readFileBytes?(path): Promise<Uint8Array>`; classifier prefers bytes,
  falls back to string repair; `encodingOnly` only when repair proves equality; U+FFFD or failed
  repair -> functional.
- **Rationale**: `readFile(...,'utf8')` can lossily decode mojibake, making string-only
  `encodingOnly` unsafe. Bytes preserve ground truth.
- **Rejected**: byte-only mandatory port change (breaks existing `ComparisonFileSystemPort`
  implementors / test mocks). Optional method preserves backward compat.
- **Rejected**: string-only repair as source of truth (can hide a real change behind U+FFFD).

### ADR-4: Additive result contract, `ok` preserved, new `actionableOk`/`hasFunctionalDifferences`
- **Decision**: keep `ok` legacy semantics (false on any diff/missing); add distinct actionability
  signals; keep `different[]` as the full set, add `actionable/nonActionableDifferent[]`.
- **Rationale**: zero consumer breakage (`JSON.stringify` of `data`, no field decomposers); clear
  separation of "any diff" vs "real work to do".
- **Rejected**: redefining `ok` to mean actionable-only (would silently change behavior for any
  caller/test relying on `ok` going false on noise).

### ADR-5: Closed allow-list for form noise, unknown -> functional
- **Decision**: strip only `Checksum, PrtDevMode(W), PrtDevNames(W), PrtMip, RecSrcDt`; retain
  `NameMap`, `GUID`, everything else; unknown `Begin…End` sections retained.
- **Rationale**: bias to over-report (LOCKED #3/#5); never silently drop a section that could carry
  semantic intent.
- **Rejected**: deep form parsing / control-tree diff (v2 non-goal; high risk of hiding changes).

### ADR-6: `compare_module` as generated vba-sync tool, MCP-only
- **Decision**: register through the 5-file generated dispatch path (not alias), guard with a parity
  test; no HTTP/CLI exposure.
- **Rationale**: reuses existing vba-sync routing; parity test prevents the documented silent
  mis-registration failure mode.
- **Rejected**: alias-tool handler (unnecessary bespoke handler; the generic vba-sync route already
  covers verify-style tools).

---

## 14. Risks and assumptions

- **Mojibake repair heuristic**: the Latin-1<->UTF-8 double-encoding repair must be conservative;
  an over-eager repair could mask a genuine accented-character content change. Mitigated by the
  byte-path equality proof and the U+FFFD guard, but the exact repair predicate needs careful unit
  coverage (test group 5/6). Assumption: the dominant real-world case is Windows-1252 vs UTF-8.
- **LCS cost on pathological files**: bounded by the cap + multiset fallback; assumes VBA files stay
  small. Low risk.
- **Form noise key variants across Access versions**: the strip list assumes the documented key set;
  if Access emits an unlisted printer/checksum key, it will (safely) be reported as functional
  rather than silently stripped. Acceptable per bias-to-functional, but may produce occasional
  false-actionable on exotic Access versions — tune the allow-list in v2 if observed.
- **`compareSingleModule` reuse**: assumes `compareSourceAgainstBinary` with a single-element
  `moduleNames` filter is sufficient; verified against `collectVbaSourceFiles` filter logic
  (lowercased moduleName match). Low risk.
- **E2E requires Access COM + `ACCESS_VBA_PASSWORD` on Windows**: unchanged constraint; the semantic
  path assertion runs only in that gated environment.
- **PR2 size**: encoding + contract + mode in one PR may push past 400 lines; documented split path
  in §12.
```
