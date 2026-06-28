# Spec — delete_module TempSccObj cleanup (#556)

## Requirement: `delete_module` cleans Access temporary SCC artifacts

`delete_module` MUST remove Access-generated `TempSccObj*` objects that appear as a side effect of deleting a requested module.

### Scenario: delete removes target and new TempSccObj forms

Given a binary contains `Form_FormNCProyecto`
And it does not contain any `Form_TempSccObj*` object before deletion
When a caller executes `delete_module` for `Form_FormNCProyecto` with `force: true`
And Access creates `Form_TempSccObj1` through `Form_TempSccObj4` during the delete flow
Then the requested form MUST be deleted
And `Form_TempSccObj1` through `Form_TempSccObj4` MUST be deleted before the operation returns
And the result SHOULD report the cleaned temporary objects.

### Scenario: cleanup is safe when no temp artifacts exist

Given a binary contains the requested module
And no `TempSccObj*` objects are present or created
When a caller executes `delete_module`
Then the requested module MUST be deleted
And the cleanup step MUST succeed as a no-op.

### Scenario: cleanup does not hide target deletion failures

Given Access fails to delete the requested module
When cleanup for `TempSccObj*` artifacts also runs or is skipped
Then the operation MUST still report the original target deletion failure
And MUST NOT return a successful result solely because temp cleanup succeeded.
