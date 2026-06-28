# Spec — import_all replace semantics (#555)

## Requirement: Explicit replace semantics for `import_all`

`import_all` MUST be able to remove binary modules that are absent from the source tree when the caller explicitly requests replacement/pruning semantics.

### Scenario: `import_all` prunes a binary-only standard module

Given the binary contains a standard module named `ModuloDebug`
And the source tree passed as `destinationRoot` contains no `ModuloDebug.bas`
When a caller executes `import_all` with replacement/prune semantics enabled
Then the binary MUST no longer contain `ModuloDebug`
And the result MUST report `ModuloDebug` as deleted or pruned.

### Scenario: default `import_all` remains compatible

Given the binary contains a module that is absent from source
When a caller executes `import_all` without the replacement/prune flag
Then the operation MUST keep the historical merge behavior
And MUST NOT delete the binary-only module.

### Scenario: managed source scope is constrained

Given the source tree contains managed VBA source files
When replacement/prune semantics compare source to binary
Then only managed VBA object types (`.bas`, `.cls`, `.form.txt`, `.report.txt`, and equivalent imported objects) MAY be considered for deletion
And saved query definitions MUST NOT be pruned by this import operation.
