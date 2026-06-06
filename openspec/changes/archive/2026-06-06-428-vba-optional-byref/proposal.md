# Proposal: fix VBA Optional ByRef argument marshaling (#428)

## Problem

When executing a VBA procedure through `dysflow_vba_execute` where the procedure has a trailing optional ByRef parameter (e.g. `Optional ByRef Arg As String` or `Optional ByRef Arg As String = "default"`), and the caller does not supply that argument:
1. If metadata is available, the runner currently pads the parameter with `""` (empty string). This violates VBA optional semantics because the parameter inside VBA receives `""` instead of its default value or being identified as missing (causing `IsMissing(Arg)` to be false).
2. If metadata is not available (or is partially incomplete), PowerShell/COM binding attempts to execute the procedure but fails with:
   `Cannot convert the "System.Reflection.Missing" value of type "System.Reflection.Missing" to type "System.Management.Automation.PSReference"`.
   This happens because PowerShell COM binder pads trailing arguments with `[System.Reflection.Missing]::Value`, but the runner's ByRef retry block (`Get-PSReferenceArgumentIndexFromError`) ignores errors on indexes larger than or equal to `$ArgumentCount`, thus throwing the exception instead of wrapping the missing value with a `[ref]` pointer.

## Options

1. **Pad with [System.Reflection.Missing]::Value and allow larger indexes in retry** - Change the default padding from `""` to `[System.Reflection.Missing]::Value` for optional ByRef parameters. Also update `Get-PSReferenceArgumentIndexFromError` to allow retry indexes up to 10 (the maximum arguments supported by the runner) even if they exceed the caller-supplied `$ArgumentCount`.

## Decision

**Option 1** — Pad optional ByRef parameters with `[System.Reflection.Missing]::Value` and allow larger retry indexes.
This will:
- Correctly preserve VBA optional/default semantics (using `System.Reflection.Missing` tells VBA the argument was omitted, so it resolves to its default value).
- Allow the runner to dynamically catch and wrap missing ByRef arguments up to 10 parameters when executing without metadata or when metadata is incomplete.
