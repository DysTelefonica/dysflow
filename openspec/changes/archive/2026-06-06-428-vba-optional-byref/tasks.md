# Tasks: fix VBA Optional ByRef argument marshaling (#428)

## Task list

- [x] Update `Get-PSReferenceArgumentIndexFromError` in `scripts/dysflow-vba-manager.ps1` to allow matching indexes up to 10 (valid argument positions 0 to 9) even if they exceed the caller-supplied `$ArgumentCount`.
- [x] Update `Invoke-AccessProcedure` in `scripts/dysflow-vba-manager.ps1` to pad optional ByRef parameters with `[System.Reflection.Missing]::Value` instead of `""`.
- [x] Add unit tests in `scripts/tests/dysflow-vba-manager.Tests.ps1` to cover `Get-PSReferenceArgumentIndexFromError` with indexes exceeding `$ArgumentCount` and padding of optional ByRef arguments with `[System.Reflection.Missing]::Value`.
- [x] Run Pester tests to verify the PowerShell changes.
- [x] Run `pnpm test` to ensure TS/Vitest suite passes.
- [x] Run `pnpm lint` and `pnpm build` to verify formatting and TypeScript compilation.
- [x] Commit directly to `main` with closing comment.

## Files changed

- `scripts/dysflow-vba-manager.ps1`
- `scripts/tests/dysflow-vba-manager.Tests.ps1`
- `openspec/changes/428-vba-optional-byref/proposal.md`
- `openspec/changes/428-vba-optional-byref/tasks.md`
