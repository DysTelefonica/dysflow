# Delta for vba-manager-actions

## MODIFIED Requirements

### Requirement: Delete Action Behavior
`Invoke-DeleteAction` MUST attempt deletion for every module in `NormalizedModules` and accumulate errors without aborting early. When deletion fails with COM error HRESULT 0x800ADEB9, it MUST catch the error, try fallback deletion commands, and return bilingual remediation instructions.
(Previously: accumulated errors and reported failure without specific 0x800ADEB9 translation, fallback execution, or bilingual remediation.)

#### Scenario: Partial delete accumulates errors
- GIVEN two modules to delete and the second raises an error
- WHEN `Invoke-DeleteAction` runs
- THEN the first module is deleted
- AND the result contains an error entry for the second module

#### Scenario: Deletion fails with COM corruption HRESULT 0x800ADEB9
- GIVEN a module deletion fails with COM error 0x800ADEB9
- WHEN `Invoke-DeleteAction` executes
- THEN the result MUST include bilingual remediation advice recommending database repair or restart

### Requirement: List-Objects and Exists Behavior
`Invoke-ListObjectsAction` MUST return the full frontend inventory in the requested output format. For JSON output, it MUST return structured metadata, including object types, paths, and categorization, instead of a flat string list. `Invoke-ExistsAction` MUST return a boolean presence result for the named module; it MUST NOT modify the project.
(Previously: returned a flat string list of inventory items instead of structured object metadata.)

#### Scenario: List-Objects JSON output
- GIVEN `-Json` is requested
- WHEN `Invoke-ListObjectsAction` runs
- THEN the result is valid JSON containing structured object metadata, paths, and categorization

#### Scenario: Exists — module absent
- GIVEN the named module is not in the VBE project
- WHEN `Invoke-ExistsAction` runs
- THEN the result indicates absence and no write to the project occurs
