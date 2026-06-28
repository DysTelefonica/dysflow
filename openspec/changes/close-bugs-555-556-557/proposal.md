# Proposal — close-bugs-555-556-557

## Intent

Close three reliability bugs in the Access/VBA sync path while preserving the existing MCP/CLI contracts and keeping the implementation auditable through strict TDD.

## Scope

- #555: make `import_all` able to replace the binary module set by deleting binary modules that are no longer present in source.
- #556: make `delete_module` clean Access-generated `TempSccObj*` artifacts created during delete flows.
- #557: improve `compile_vba` failures with best-effort module/line context when Access exposes enough information, while retaining the existing generic fallback when it does not.
- Add behavior tests at the public ports used by these operations.
- Record implementation commits and verification evidence in `tasks.md` before archiving.

## Non-goals

- No changes to production runtime installation paths or `%LOCALAPPDATA%\dysflow`.
- No PR or staging workflow for this change; work lands directly on `main` per the session instruction.
- No destructive Access binary migration outside the existing Dysflow tool contracts.
- No promise that Access can report every compile error. The accepted contract is actionable best-effort context plus a safe fallback.

## Approach

- Treat each issue as an independent work unit: RED test, minimal GREEN implementation, focused verification, then one conventional commit.
- Prefer port/runner-level tests over brittle source text assertions.
- Keep protocol-neutral result data stable and additive.
- Preserve compatibility by making destructive replacement explicit through a `prune`/replace-style flag rather than silently changing all historical `import_all` callers.

## Affected capabilities

- VBA manager import/delete/compile actions.
- MCP `import_all`, `delete_module`, and `compile_vba` behavior.
- PowerShell runner result envelopes and error details.
- OpenSpec traceability and GitHub issue closure evidence.
