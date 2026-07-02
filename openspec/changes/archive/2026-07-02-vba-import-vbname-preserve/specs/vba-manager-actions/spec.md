# Delta for vba-manager-actions

## MODIFIED Requirements

### Requirement: Import Action Behavior

`Invoke-ImportAction` MUST retry each module according to the configured retry policy. When any
module is created new (did not previously exist) the action MUST signal `createdNewComponents`
in its return value so the caller can trigger `Save-VbaProjectModules`. This signal MUST NOT be
communicated via a script-scope variable.

`Invoke-ImportAction`'s text normalization step (`Normalize-VbaImportText`) MUST preserve the
`Attribute VB_Name` line verbatim so its value reaches the compiled binary via `AddFromFile`.
Normalization MUST still strip every other `Attribute VB_*` line (e.g. `VB_GlobalNameSpace`,
`VB_Creatable`, `VB_PredeclaredId`, `VB_Exposed`) exactly as before; recognizing and keeping
`VB_Name` MUST NOT prevent later droppable attribute lines in the same directive block from being
stripped.
(Previously: `Normalize-VbaImportText` stripped every `Attribute VB_*` line including
`Attribute VB_Name`, silently dropping the module's identity before every `AddFromFile` write.)

#### Scenario: Retry on transient failure

- GIVEN `Import-VbaModule` fails on the first attempt for a module
- WHEN the retry count has not been exhausted
- THEN `Invoke-ImportAction` retries the import for that module

#### Scenario: New-component signal returned

- GIVEN an import creates at least one new VBA component
- WHEN `Invoke-ImportAction` returns
- THEN its return object carries `createdNewComponents = $true`
- AND no script-scope variable is set to communicate this

#### Scenario: All-failure result

- GIVEN all module imports fail
- WHEN `Invoke-ImportAction` returns
- THEN the result indicates failure with per-module error detail

#### Scenario: VB_Name reaches the compiled binary unchanged

- GIVEN a `.cls` source file whose first line is `Attribute VB_Name = "Form_X"`
- WHEN `Invoke-ImportAction` imports it via `Normalize-VbaImportText` and `AddFromFile`
- THEN the compiled binary's `Attribute VB_Name` value is `"Form_X"`, unchanged from the source

#### Scenario: VB_Name preserved while sibling VB_* attributes are still stripped

- GIVEN a `.cls` source file with `Attribute VB_Name = "Form_X"` followed by
  `Attribute VB_GlobalNameSpace = False`, `Attribute VB_Creatable = True`, and
  `Attribute VB_PredeclaredId = True`
- WHEN `Normalize-VbaImportText` processes the directive block
- THEN the `Attribute VB_Name` line is kept verbatim
- AND `Attribute VB_GlobalNameSpace`, `Attribute VB_Creatable`, and `Attribute VB_PredeclaredId`
  are all stripped
- AND processing continues correctly for any directive lines after `Attribute VB_Name` (no
  loop-control regression that skips or mis-handles later lines)

---

### Requirement: Header Merge Path VB_Name Handling Is Unaffected

`Split-VbaHeaderAndBody` and `Merge-AccessDocumentWithCanonicalHeader` MUST continue to treat
`Attribute VB_Name` as droppable header noise, exactly as before this change. The new
`Attribute VB_Name`-preserving behavior is scoped exclusively to `Normalize-VbaImportText`'s
import-normalization call sites; it MUST NOT be applied to the header/body split-and-merge path,
because the merge path re-injects a canonical header that already carries its own `VB_Name` line
— preserving the body's original line as well would produce a duplicate `Attribute VB_Name`
declaration and a compile error in `LoadFromText`.

#### Scenario: Merging a canonical header with local code does not duplicate VB_Name

- GIVEN a canonical header text containing `Attribute VB_Name = "Form_X"`
- AND a local document body whose original text (pre-split) also contained
  `Attribute VB_Name = "Form_X"`
- WHEN `Split-VbaHeaderAndBody` splits the body and `Merge-AccessDocumentWithCanonicalHeader`
  recombines it with the canonical header
- THEN the merged output contains exactly one `Attribute VB_Name` line
- AND no duplicate-declaration error condition is introduced
