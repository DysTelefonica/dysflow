# vba-semantic-diff Specification

## Purpose

Behavioral contract for `verify_code`'s semantic classification of source-vs-binary VBA text
differences (`src/core/services/vba-semantic-classifier.ts`). Governs when a difference is
reported as `isActionable: true` (a consuming agent should sync it) versus folded into a
non-actionable noise bucket (`attributeOnly`, `whitespaceOnly`, `encodingOnly`, `caseOnly`). This
spec covers `Attribute VB_Name` handling specifically; see AGENTS.md for the full noise-bucket
taxonomy.

## Requirements

### Requirement: VB_Name One-Side-Missing Actionability

`verify_code` MUST classify a difference where `Attribute VB_Name` is present on exactly one side
(source has it and the binary export omits it, or vice versa) as actionable
(`isActionable: true`), not `attributeOnly`. A one-side-missing `VB_Name` line is presumptive
evidence of import corruption (the name failed to reach the compiled binary), not of a
non-functional header omission, and MUST NOT be masked from drift audits.

Both-sides-absent and both-sides-equal-value cases are unaffected by this requirement and keep
their existing classification.

#### Scenario: Source has VB_Name, binary export is missing it entirely

- GIVEN a source `.cls` whose first line is `Attribute VB_Name = "Form_X"`
- AND the corresponding binary export text has no `Attribute VB_Name` line at all
- WHEN `verify_code` compares the two texts
- THEN the difference is reported with `isActionable: true`
- AND the classification is NOT `attributeOnly`

#### Scenario: Binary has VB_Name, source is missing it entirely

- GIVEN a binary export whose text contains `Attribute VB_Name = "Form_X"`
- AND the corresponding source `.cls` has no `Attribute VB_Name` line at all
- WHEN `verify_code` compares the two texts
- THEN the difference is reported with `isActionable: true`
- AND the classification is NOT `attributeOnly`

#### Scenario: Both sides present with the same VB_Name value — no regression

- GIVEN both the source and the binary export contain `Attribute VB_Name = "Form_X"`
- WHEN `verify_code` compares the two texts and they are otherwise identical after normalization
- THEN the difference (if any) is still classified non-actionable
- AND no new actionable finding is introduced by this requirement

#### Scenario: Both sides absent — non-functional, unchanged

- GIVEN neither the source nor the binary export contains an `Attribute VB_Name` line
- WHEN `verify_code` compares the two texts and they are otherwise identical after normalization
- THEN the difference is classified `attributeOnly` (non-actionable), same as before this change
