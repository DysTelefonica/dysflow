# Design: Preserve Attribute VB_Name during VBA import

## Technical Approach

Two conceptually-aligned edits that mirror the TS classifier's existing "strip all
`Attribute VB_*` EXCEPT `VB_Name`" semantic into the PS1 import path, then unmask the
regression in the classifier itself. Part 1 (PS1) is the mandatory root-cause fix; Part 2
(classifier) removes the drift-audit blind spot. Pester (COM-free) is the primary TDD loop.

## Part 1 — PS1 import fix (`scripts/dysflow-vba-manager.ps1`)

### Decision: New predicate, NOT a modified `Test-IsVbaImportMetadataLine`

**Choice**: Add `Test-IsVbaImportDroppableMetadataLine` — a copy of
`Test-IsVbaImportMetadataLine`'s body with ONLY the final attribute clause changed from
`'^Attribute\s+VB_'` to `'^Attribute\s+VB_(?!Name\b)'`. Every other clause (VERSION CLASS,
BEGIN, END, MultiUse/Persistable/… family) is identical.

**Name rationale**: The proposal/explore named it `Test-IsVbaImportDroppableAttributeLine`.
That name is inaccurate — the predicate also matches VERSION/BEGIN/END/MultiUse, not only
`Attribute` lines. `…DroppableMetadataLine` mirrors the existing `…MetadataLine` suffix and
tells the reader "all import metadata that is safe to drop, i.e. everything except VB_Name."
**sdd-apply MUST use the design's name `Test-IsVbaImportDroppableMetadataLine`.**

**Alternatives rejected**: (a) parameterizing the existing predicate with a switch — error-prone
at call sites; (b) negative-lookahead swapped in place on the shared function — breaks
`Split-VbaHeaderAndBody` (see below); (c) enumerated allow-list
`^Attribute\s+VB_(GlobalNameSpace|Creatable|PredeclaredId|Exposed)\b` — misses rare attrs
(`VB_Description`, `VB_Ext_KEY`, …) which would leak into the `AddFromFile` payload.

Exact signature + placement (immediately AFTER `Test-IsVbaImportMetadataLine`, before
`Test-IsVbaOptionDirectiveLine`):

```powershell
function Test-IsVbaImportDroppableMetadataLine {
    [CmdletBinding()]
    Param(
        [Parameter(Mandatory = $true)][string]$Line
    )

    $trim = $Line.Trim()
    if ([string]::IsNullOrWhiteSpace($trim)) { return $false }

    return (
        $trim -match '^VERSION\s+\d+(\.\d+)?\s+CLASS$' -or
        $trim -match '^BEGIN\b' -or
        $trim -match '^END$' -or
        $trim -match '^(MultiUse|Persistable|DataBindingBehavior|DataSourceBehavior|MTSTransactionMode)\s*=' -or
        $trim -match '^Attribute\s+VB_(?!Name\b)'
    )
}
```

### Decision: BOTH `Normalize-VbaImportText` call sites switch (799 AND 820)

**Leading-skip loop (~792-804)** MUST switch to the new predicate. Reasoning by that loop's
actual purpose: it advances `$start` past every leading droppable line. If it kept the OLD
broad predicate it would treat `VB_Name` as skippable and land `$start` AFTER it — so the main
loop never sees VB_Name and it is dropped again. With the new predicate the loop BREAKS at
VB_Name (first non-droppable line), handing `$start` = the VB_Name line to the main loop.

```powershell
        if (Test-IsVbaImportDroppableMetadataLine -Line $lines[$start]) {   # was Test-IsVbaImportMetadataLine
            $start++
            continue
        }
```

**Directive-block loop (~810-835)** — add an explicit VB_Name-keep-and-continue branch BEFORE
the droppable check, so VB_Name is preserved while later droppable attrs (VB_GlobalNameSpace,
VB_Creatable, …) still strip and the block-mode scan continues:

```powershell
        if ($inDirectiveBlock) {
            if ($trim -eq "") {
                $result.Add($line)
                continue
            }

            # issue #646: VB_Name carries module/form identity and MUST reach the
            # binary via AddFromFile. Keep it, but STAY in directive-block mode so
            # the droppable metadata after it is still stripped.
            if ($trim -match '^Attribute\s+VB_Name\b') {
                $result.Add($line)
                continue
            }

            if (Test-IsVbaImportDroppableMetadataLine -Line $line) {   # was Test-IsVbaImportMetadataLine
                continue
            }

            if (Test-IsVbaOptionDirectiveLine -Line $line) {
                if ($seenOptions.Add($trim)) { $result.Add($line) }
                continue
            }

            $inDirectiveBlock = $false
        }
        $result.Add($line)
```

The keep-branch uses the inline `^Attribute\s+VB_Name\b` (the exact complement of the negative
lookahead) rather than another predicate — one call site, no test surface of its own.

### Decision: `Split-VbaHeaderAndBody` (919) and `Merge-AccessDocumentWithCanonicalHeader` do NOT change

`Split-VbaHeaderAndBody` scans forward while `blank OR Test-IsVbaImportMetadataLine OR option`,
collecting a **header bucket** and breaking at the first code line. `Merge-…` calls it on both
local and canonical `CodeBehindForm` bodies, then picks `$effectiveHeader = canonicalCode.Header`
(the live `SaveAsText` export, already carrying the correct VB_Name) and emits
`Join(effectiveHeader, localCode.Body)`. Because VB_Name currently lands in the HEADER bucket,
VB_Name is contributed by exactly ONE bucket and the header-wins rule sources it from the live
canonical export; `localCode.Body` stays pure code.

If 919 switched to the VB_Name-excluding predicate, VB_Name would fall out of the header bucket
into `localCode.Body`, so (a) the canonical/live VB_Name would be discarded, (b) local's stale
attributes would leak into the body, and (c) depending on line order a VB_Name could be emitted
from both header and body → duplicate `Attribute VB_Name` → VBA duplicate-declaration compile
error. **Keep 919 on the broad `Test-IsVbaImportMetadataLine`. Do not unify the two predicates.**

### Pester tests (`scripts/tests/dysflow-vba-manager.Tests.ps1`)

- **Register** `Test-IsVbaImportDroppableMetadataLine` in BOTH `$pureFunctions` (~333-359) and
  `$pureNames` (~370-393). **Add** `Merge-AccessDocumentWithCanonicalHeader` to `$pureNames`
  (it is only in the scaffolding list at 342 today; its deps are already extracted).
- **DO NOT flip 431-432.** This is the critical constraint. That `It` asserts
  `Test-IsVbaImportMetadataLine -Line "Attribute VB_Name = …" | Should -Be $true`, and the OLD
  predicate is intentionally UNCHANGED (Split at 919 needs it broad). The proposal's "flip to
  $false" was written against a since-rejected "modify the same predicate" model. Keep it `$true`;
  optionally reword the title to note VB_Name is intentionally matched here for the Split path.
- **New Context `Test-IsVbaImportDroppableMetadataLine`**: `Attribute VB_Name = "X"` → `$false`;
  `Attribute VB_GlobalNameSpace = False` / `VB_Creatable` / `VB_PredeclaredId` / `VB_Exposed`
  → `$true`; `VERSION 1.0 CLASS` / `BEGIN` / `END` / `MultiUse = -1` → `$true`; regular code
  → `$false`; empty string → `Should -Throw` (mandatory param).
- **New Context (round-trip)** on `Normalize-VbaImportText`: input with `Attribute VB_Name`
  first, then VB_GlobalNameSpace/Creatable/…, duplicated Option lines, and body → assert output
  first non-blank line is the VB_Name line, no VB_GlobalNameSpace line survives, Option lines are
  de-duplicated, body verbatim.
- **New Context** on `Merge-AccessDocumentWithCanonicalHeader`: local + canonical docs each with a
  (different) `Attribute VB_Name` → merged output contains EXACTLY ONE `Attribute VB_Name` line
  and it holds the canonical value.

### Stale comment fix (`dysflow-vba-manager-unicode-roundtrip.Tests.ps1:73-74`)

Current comment says "Attribute VB_Name + Option Explicit are stripped". After the fix VB_Name
is preserved. Correct to: "Attribute VB_Name is PRESERVED (issue #646); duplicate Option lines are
de-duplicated and the executable body is preserved verbatim." Optionally strengthen the test with
`$outText.Contains('Attribute VB_Name = "Demo"') | Should -BeTrue`.

## Part 2 — TS classifier fix (`src/core/services/vba-semantic-classifier.ts:875`)

### Decision: `keepVbName = srcVbName !== binVbName`

`extractVbName` returns `string | null` (line 168). The bare `!==` is type-safe and needs no
`??`. Truth table (both operands `string | null`):

| src | bin | expr | keepVbName | correct? |
|-----|-----|------|-----------|----------|
| "A" | "A" | equal | false | yes — same name, strip |
| "A" | "B" | differ | true | yes — real rename, actionable |
| "A" | null | differ | **true** | yes — the fix: one-side-missing now actionable |
| null | null | equal | false | yes — both genuinely omit, non-actionable |

Also update the comment at 870-872 to: "VB_Name is functional whenever the two sides disagree —
a real rename (both name it, values differ) OR one side omitting it entirely (a dropped-identity
import defect, #646). Non-functional only when both carry the same name or both omit it."

### Vitest fixtures (`test/core/services/vba-semantic-classifier.test.ts`)

- **380-394** ("does NOT classify VB_Name difference as attributeOnly", ModA vs ModB, both
  present): `keepVbName` old=true/new=true → **stays green, no change.**
- **1311-1320** ("keeps a real VB_Name VALUE change actionable", both present, different):
  old=true/new=true → **stays green, no change.**
- **362-378** (VB_GlobalNameSpace diff, both VB_Name present+equal): old=false/new=false →
  **stays green.**
- No existing test pins the one-side-missing masking behavior, so nothing flips. **ADD** one
  fixture: `fileType:"cls"`, src has `Attribute VB_Name = "Form_X"` + code, bin starts at
  `Option Compare Database` + same code (VB_Name entirely absent) → assert
  `classification` is NOT `attributeOnly` and `actionable === true`.

### Docs

- **AGENTS.md:58-59** — replace "`VB_Name` is the exception: kept functional ONLY when both sides
  name the module and the names differ (a real rename)." with: "`VB_Name` is the exception: it is
  functional whenever the two sides disagree — a real rename (both name it, values differ) OR one
  side omitting it entirely (a dropped-identity import defect, #646); non-functional only when both
  carry the same name or both omit it."
- **README.md:619** — apply the identical correction to the `attributeOnly` row's VB_Name clause.
- **CHANGELOG** — prominent bugfix entry (#646): VB_Name preserved through import; verify_code no
  longer masks one-side-missing VB_Name.
- **`test/e2e/form-codebehind-stale-import.e2e.test.ts`** — add a VB_Name assertion to the
  importMode "Auto" case: after export, `exportedCls` contains `Attribute VB_Name = "frmBusy"`
  (secondary confirmation; Pester is the primary pinning seam).

## Non-goals (do NOT touch)

- `Test-IsVbaImportMetadataLine` body and its `Split-VbaHeaderAndBody` (919) call — stay broad.
- `Test-LooksLikeVbaCodeLine` (~1041) — presence-detection, correct as-is.
- `dispatch-common.ts`, `dysflow-config.ts`, HTTP/serve surfaces — unrelated in-flight change.
- No version bump / release cut — post-archive orchestrator step.

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Pester (unit) | new predicate; Normalize round-trip; Merge no-duplicate | AST-extracted pure fns, COM-free — primary TDD loop |
| Vitest (unit) | classifier one-side-missing → actionable | pure `classifyVbaPair`, RED-first |
| E2E (Access) | VB_Name reaches binary after Auto import | `hasAccessCom()`-guarded, secondary |

## Migration / Rollout

No migration. Pure-function + text-normalization logic; single-commit revert restores prior
behavior. Classifier change is independently revertible.

## Open Questions

None — the two easy-to-get-wrong constraints (leading-skip loop must switch to the new predicate;
431-432 must NOT flip) are resolved above.
