# create_form_from_template — dysflow MCP

## When to use

Clone an existing Access form into a new form name. The runtime writes the cloned layout (`.form.txt`) and code-behind (`.cls`) through the guarded form pipeline.

## Prerequisites

- A source form available under the resolved project `destinationRoot`.
- The runtime version advertises `create_form_from_template` in the live schema.
- Prefer `projectId` + `sourceForm` + `targetForm` over composing `.form.txt` paths manually.

## Call

```json
{
  "tool": "create_form_from_template",
  "arguments": {
    "sourceForm": "TemplateForm",
    "targetForm": "NewForm",
    "destinationRoot": "<repo>/src",
    "tokenMap": {},
    "outputMode": "summary",
    "apply": false
  }
}
```

`outputMode` (`summary` | `file` | `full`) controla la verbosidad del envelope. Para generación de forms por IA, `summary` es el default razonable: devuelve el `created[]` resumido; `file` agrega paths completos; `full` incluye el contenido inline. Mismo parámetro aplica a las form tools de lectura (`inspect_form`, `form_serialize`, `compare_form`, `lint_form_code`, `harvest_form_catalog`).

## Anti-patterns for this call

- Don't pass source or target paths outside `destinationRoot`.
- Don't generate `.form.txt` and `.cls` separately and re-import; the tool owns the guarded clone transaction.
- Don't forget the human-compile step. New code → run Debug > Compile before `test_vba`.
- Don't hand-edit the `CodeBehindForm` section in the generated `.form.txt` — code lives in `.cls`, period (the global AGENTS.md encode this; the runtime overwrites the section on every import).

## Result shape (what the agent reads back)

- `created[]` — files written: `.cls`, `.form.txt`, plus any generated assets (queries, macros).
- `warnings[]` — non-fatal issues.
- `pathViolations[]` — if the spec tried to lay files outside the configured roots. Surface verbatim.

## Live verification

```bash
get_capabilities  # confirm create_form_from_template is in writeClassToolsPermitted
```

## Cross-reference

- Anti-patterns: `assets/anti-patterns.md#13-critical-dont-hand-edit-codebehindform-in-a-form-txt` (form-IR boundaries)
- Error codes: `references/error-codes.md#MCP_INPUT_INVALID`, `references/error-codes.md#ACCESS_DATABASE_LOCKED`
