# lint_module — dysflow MCP

## When to use

Offline parse and lint of one VBA module (`.bas`/`.cls`/`.form.txt`/`.report.txt`). Reports errors and warnings without touching the Access binary.

## Prerequisites

None. Read-only and offline.

## Call

```json
{
  "tool": "lint_module",
  "arguments": {
    "projectId": "<project-id>",
    "module": "ModA"
  }
}
```

## Anti-patterns for this call

- Don't expect `lint_module` to compile the project. Compilation is the human's job; lint is a parser check, not a runtime check.
- Don't pass `moduleNames`; the canonical parameter is singular `module`.
- Don't act on a `warnings[]` alone. Lint warnings are hints; only `errors[]` block downstream calls.

## Available rule ids

The `rules` array (when supplied) accepts any of: `option-declaration`, `identifier-safety`, `declaration-order`, `arg-type-match`, and — **v2.19.0+** — `openargs-contract-mismatch` (cross-form `DoCmd.OpenForm` producer / `Me.OpenArgs` consumer grammar drift; closes #1006). Pass the rule id literally; the runtime dispatches per the LINT_MODULE_SCHEMA enum.

## Result shape (what the agent reads back)

- `ok` — `true` if zero errors.
- `errors[]` — fatal parse errors per module. Each carries `module`, `line`, `message`.
- `warnings[]` — non-fatal lint hints. Surfaces in tooling-quality work, not blocking.
- `dysflowVersion` — runtime version. Cross-check via `get_capabilities`.

## Live verification

```bash
get_capabilities  # confirm adapterVersion matches lint_module's build
```

## Cross-reference

- Anti-patterns: `assets/anti-patterns.md#2-critical-dont-call-compile_vba` (lint is not compile)
- Error codes: `references/error-codes.md#MODULE_NOT_FOUND`
