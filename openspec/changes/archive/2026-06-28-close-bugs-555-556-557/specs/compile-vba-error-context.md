# Spec — compile_vba error context (#557)

## Requirement: `compile_vba` returns actionable compile error context when available

`compile_vba` MUST preserve the existing `VBA_COMPILE_ERROR` contract and SHOULD add structured first-error context when Access/VBE exposes it safely.

### Scenario: compile failure includes first module and line

Given the VBA project contains a module with a compile error
And Access exposes the active VBE compile selection or diagnostic context after compilation fails
When a caller executes `compile_vba`
Then the failure MUST use error code `VBA_COMPILE_ERROR`
And the error details MUST include a `firstError` object with at least `module` and `line` when those values are available
And the top-level error SHOULD populate compatible `component`, `line`, and `sourceLine` fields when available.

### Scenario: compile failure falls back safely when context is unavailable

Given the VBA project fails to compile
And Access does not expose module or line context headlessly
When a caller executes `compile_vba`
Then the operation MUST still fail with `VBA_COMPILE_ERROR`
And the message MUST explain that one or more modules contain compile errors
And the absence of module/line context MUST be represented as `null` or omitted fields, not as fabricated data.

### Scenario: compile success is unchanged

Given the VBA project compiles successfully
When a caller executes `compile_vba`
Then the operation MUST return a successful compile result
And MUST NOT include stale error context from earlier failures.
