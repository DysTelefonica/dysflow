# Exploration: vba-semantic-diff

> Materialized from Engram topic `sdd/vba-semantic-diff/explore` (the explore phase ran read-only).

## Current State

`verify_binary` / `reconcile_binary` / `verify_code` all converge on a single comparison function. The call chain is:

```
MCP tool call (verify_binary / reconcile_binary)
  → dispatch-factory.ts createDispatchTool (vba-sync route)
    → VbaSyncAdapter.execute (vba-sync-adapter.ts:192)
      → VbaModulesAdapter.handles + execute (vba-modules-adapter.ts:104–133)
        → compareSourceAgainstBinary (vba-source-comparison.ts:107)
          → VbaManager PS1 Export to tmpdir
          → compareVbaSourceTrees (vba-source-comparison.ts:214)
            → collectVbaSourceFiles × 2
            → for each file pair: readFile utf8 + if (sourceText === binaryText) → matched | different
```

The `ok` field at line 263 is: `different.length === 0 && missingInSource.length === 0 && missingInBinary.length === 0`. Every file that doesn't byte-match ends up in `different[]`. There is no sub-classification.

**Result shape consumed by callers:**
- `VbaVerifyResult`: `{ operation, ok, dryRun, willModifyAccess, sourceRoot, matched[], different[], missingInSource[], missingInBinary[], diffs? }`
- `VbaReconcilePlanResult`: same + `recommendation` string
- `translateCoreResultToMcpContent` at result-translation.ts:99 serializes `result.data` directly as JSON → MCP consumers see the full shape
- HTTP adapter at server.ts:429 sends `result` as-is to JSON
- There are NO further consumers in TypeScript that decompose `different[]` or check `ok` on the domain result (the `.ok` checks in the codebase are all on `OperationResult<T>.ok`, not `VbaVerifyResult.ok`)

**Critical distinction**: `OperationResult<VbaVerifyResult>.ok` (operation succeeded) vs `VbaVerifyResult.ok` (no differences found). Only `OperationResult.ok` is checked in adapters.

## Affected Areas

- `src/core/services/vba-source-comparison.ts` — core comparison logic; the only file that must change for classification
- `src/adapters/vba-sync/vba-modules-adapter.ts` — connects `verify_code`/`verify_binary`/`reconcile_binary` to the core
- `src/adapters/mcp/schemas/vba-sync-schemas.ts` — schemas for verify/reconcile tools; `compare_module` needs a new entry
- `src/adapters/mcp/mcp-tool-registry.ts` — VBA_SYNC_TOOL_NAMES array; `compare_module` must be added
- `src/adapters/mcp/dispatch-routes.ts` — MCP_TOOL_ROUTES; `compare_module: { kind: "vba-sync" }`
- `src/adapters/mcp/tool-parity-registry.ts` — implementedToolNames set
- `src/core/contracts/index.ts` — if new types are exported from core
- `test/core/services/vba-source-comparison.test.ts` — existing test file; seam is ComparisonFileSystemPort + VbaComparisonContext

## Form.txt Serialization Format — Evidence from Real Files

From `E2E_testing/src/forms/Form_frmSplash.form.txt` and others:

**Top-level header (always present, always non-semantic):**
```
Version =21
VersionRequired =20
PublishOption =1
Checksum =-868279142       ← CRC32 of form binary — changes on ANY property edit, even nonfunctional
Begin Form
    ...
    RecSrcDt = Begin
        0x881c5c679a6ee640  ← record-source datetime binary
    End
    GUID = Begin
        0x465afc03be643a4db648ef9d8cf66a5e  ← form GUID
    End
    NameMap = Begin
        0x0acc0e5500000000...  ← control name→GUID mapping; changes when controls added/removed
    End
    PrtMip = Begin ... End     ← print margin info — binary, changes with printer setup
    PrtDevMode = Begin ... End ← printer DEVMODE blob — 600+ hex lines; changes with printer state
    PrtDevNames = Begin ... End ← printer name string
    PrtDevModeW = Begin ... End ← wide DEVMODE blob
    PrtDevNamesW = Begin ... End← wide printer name
```

**Functional content (matters for behavior):**
- Named properties: `Caption`, `Width`, `Height`, `OnOpen`, `RecordSource`, etc.
- `Begin <ControlType>` ... `End` blocks with named properties
- `GUID` per control — stable identifier
- `ImageData = Begin ... End` — embedded PNG as hex; large, binary

**`CodeBehindForm` section (always at end of .form.txt):**
```
CodeBehindForm
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = True
...
Option Compare Database
[VBA code]
```

**Classification rules for `.form.txt`:**
- Non-semantic: `Checksum`, `PrtDevMode`, `PrtDevModeW`, `PrtDevNames`, `PrtDevNamesW`, `PrtMip`, `RecSrcDt` value changes
- Semantic (LOCKED for this change): `NameMap` is treated as FUNCTIONAL (conservative — do not strip); any `Begin <ControlType>` block added/removed, named property changes inside controls, `Caption`, `RecordSource`, `RowSource`, event handler assignments (`OnClick ="[Event Procedure]"`), `CodeBehindForm` section

## VBA Attribute Headers — Evidence from Real Files

`.bas` files: only `Attribute VB_Name = "ModuleName"` on line 1. No other attributes typical.

`.cls` files: up to 5 attributes at top:
```
VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ClassName"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
```

`.form.txt` CodeBehind section: same VB_ attributes as .cls.

**For classification:** `Attribute VB_*` header lines plus the `VERSION 1.0 CLASS` / `BEGIN` / `END` block are boilerplate — changes here are `attributeOnly` unless the VB_Name actually changes (which is a rename, not a false positive).

## Encoding / Mojibake

Files are read with `readFile(path, "utf8")` in both `nodeComparisonFileSystem` (vba-modules-adapter.ts:25) and `testFileSystem` in tests. There is no encoding normalization, no BOM stripping, no fallback. The `fix_encoding` tool exists but is a separate VbaManager PowerShell action — it doesn't feed into the comparison path. Mojibake produces byte-level differences when the binary exports in a different encoding than what's stored on disk.

## Existing Test Seams

`test/core/services/vba-source-comparison.test.ts` (544 lines):
- Uses real OS filesystem (mkdtemp, writeFile) for most tests
- Uses pure in-memory `mockFs: ComparisonFileSystemPort` for one test (line 519)
- Tests `compareVbaSourceTrees` directly — this is the right seam for semantic classification
- Tests `compareSourceAgainstBinary` with an injected `VbaComparisonContext` (mocked runVbaManager writing real files to tmpdir)
- No tests for semantic classification yet (doesn't exist)

**The `ComparisonFileSystemPort` interface is the I/O seam.** New classification logic must be pure (take two strings, return classification), so it can be tested with the in-memory mockFs pattern. The `VbaComparisonContext` seam covers the PowerShell execution boundary.

## MCP Tool Registration Pattern for `compare_module`

1. Add `"compare_module"` to `VBA_SYNC_TOOL_NAMES` in `src/adapters/mcp/mcp-tool-registry.ts`
2. Add to `implementedToolNames` in `src/adapters/mcp/tool-parity-registry.ts`
3. Add `compare_module: { kind: "vba-sync" }` to `MCP_TOOL_ROUTES` in `src/adapters/mcp/dispatch-routes.ts`
4. Add schema in `src/adapters/mcp/schemas/vba-sync-schemas.ts`
5. Handle `compare_module` in `VbaModulesAdapter.handles()` and `execute()`

**HTTP server note:** The HTTP server only handles `query_sql`, `exec_sql`, `run_vba`, list-ops, and cleanup. It does NOT expose VBA sync tools. So `compare_module` is MCP-only — no HTTP parity.

**CLI note:** dysflow's CLI is TUI/management-focused. VBA sync tools are invoked exclusively through MCP. There is no `dysflow verify_binary` CLI command today. `compare_module` is MCP-only.

## Backward Compatibility Constraints

Current `VbaVerifyResult` shape callers observe:
```typescript
{ operation, ok, dryRun, willModifyAccess, sourceRoot,
  matched[], different[], missingInSource[], missingInBinary[], diffs? }
```

- `ok: boolean` must remain.
- `different[]` must remain populated (backward compat). New `actionableDifferent[]` and `nonActionableDifferent[]` are additive.
- `matched[]`, `missingInSource[]`, `missingInBinary[]` are unchanged.
- `diffs[]` can be extended or a new array added alongside.

`translateCoreResultToMcpContent` simply JSON-serializes `result.data`. Adding new fields is non-breaking for MCP consumers — they ignore unknown fields.

## Recommendation

Implement the classifier as a focused pure domain service `src/core/services/vba-semantic-classifier.ts`, wired into `compareVbaSourceTrees` as the default semantic path, with an opt-in `strict` mode reverting to byte/text-exact. `verify_binary`/`reconcile_binary`/`verify_code` default to semantic; `compare_module` adds a single-module surface.

## Risks

1. Form.txt parser correctness — non-semantic block patterns matched by line prefix; regress against real fixtures.
2. Encoding detection — `readFile('utf8')` may already corrupt mojibake; `encodingOnly` is best-effort, must NEVER hide a real change.
3. `ok` field semantic change for `verify_binary` — consumers checking `ok === false` to trigger import now get `ok=true` for non-actionable-only diffs.
4. Result extension — prefer additive new array over mutating `diffs[]`.
5. `compare_module` registration spans 5 files — a missed entry causes silent failure.
6. HTTP server does NOT expose VBA sync tools — confirmed, no HTTP parity needed.

## Ready for Proposal

Yes. Seam is clean (`classifyModuleDiff` pure function, `ComparisonFileSystemPort` for I/O mocking). Backward-compat story is additive fields.
