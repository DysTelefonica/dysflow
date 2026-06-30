## Exploration: fix-codebehind-duplication

### Current State
During the import pipeline, `Normalize-AccessDocumentTextForLoadFromText` prepares `.form.txt` and `.report.txt` files for Access `LoadFromText`. When a file is missing the `CodeBehindForm` or `CodeBehindReport` marker (an orphan code-behind section), `Normalize-AccessDocumentOrphanCodeBehindSection` is invoked to insert it.

Currently, this function scans forward line-by-line and matches the first line that is exactly `End` (trimmed). However, in Access documents, nested controls and binary property blocks (such as `RecSrcDt = Begin ... End`) also terminate with `End`. As a result, the function inserts the marker prematurely inside the layout properties block.

During `Merge-AccessDocumentWithCanonicalHeader`, this misplaced marker causes the remainder of the form properties to be treated as VBA code body. Because the first line of this block is a property and not a VBA header, `Split-VbaHeaderAndBody` treats the entire section as the body, leaving the header empty. The merge then prepends the canonical headers (including `Attribute VB_Name` etc.) before the body which still contains the original `Attribute VB_*` headers, resulting in duplicate headers and a corrupted document format.

### Affected Areas
- `scripts/dysflow-vba-manager.ps1` — `Normalize-AccessDocumentOrphanCodeBehindSection` requires a nesting-aware scanner to locate the true root `End`.
- `scripts/tests/dysflow-vba-manager.Tests.ps1` — Needs new Pester tests to verify normalization of orphan code-behind sections containing nested control blocks.

### Approaches
1. **Approach A** — Warn and do not re-insert the CodeBehind marker.
   - Pros: Simple, zero risk of inserting a marker incorrectly.
   - Cons: Breaks compatibility with layout files missing the marker; Access `LoadFromText` will fail.
   - Effort: Low

2. **Approach B** — Insert CodeBehind marker AFTER existing Attribute VB_* lines.
   - Pros: None.
   - Cons: Syntactically invalid. `Attribute VB_*` lines must reside within the VBA module scope (after the marker). Placing them before the marker causes Access to treat them as layout properties, causing import failure.
   - Effort: Low

3. **Approach C** — Do not normalize if Split-CodeBehindSection fails.
   - Pros: Avoids modifying files.
   - Cons: Same as Approach A; results in `LoadFromText` failing when the marker is missing.
   - Effort: Low

4. **Approach D (Recommended)** — Implement nesting-aware (stack-based) root `End` detection.
   - Pros: Correctly identifies the true root `End` of the form/report layout block, placing the marker exactly before the VBA section. Restores full compatibility and robust round-trip imports.
   - Cons: Slightly more logic than simple skipping.
   - Effort: Low

### Recommendation
Adopt Approach D. Tracking the nesting level of `Begin` and `End` blocks ensures that the marker is inserted immediately after the true outer-level `End` of the document, which matches Access's canonical layout structure perfectly and prevents any corruption or header duplication.

### Risks
- Incorrect nesting counts if a malformed layout file has mismatched `Begin`/`End` tokens. We can mitigate this by falling back to the original behavior or warning if a root `End` cannot be resolved.

### Ready for Proposal
Yes
