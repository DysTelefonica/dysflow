# get_capabilities

`get_capabilities` returns the live adapter snapshot: `adapterVersion`,
`writeExecutionPolicy`, `effectiveDryRunDefault`, `humanCompilePending`,
`toolsVisible`, `projectIdResolution`, `projectConfig`, and the per-tool
`tools` map. See `dysflow-usage` SKILL.md for the full schema and the
write-flag matrix.

## Response contract — `schemaVersion` discriminator (issue #1168)

Every dysflow MCP tool response — `get_capabilities` included — carries a
top-level `schemaVersion: "dysflow.result/v1"` discriminator so consumers
(notably OpenCode Code Mode, which sometimes flattens structured results to
`[object Object]`) can branch on a single stable field instead of
regex-parsing legacy text bodies.

The discriminator is injected by `withSchemaVersion()` at the stdio central
seam (`src/adapters/mcp/stdio.ts`) and re-applied by every helper envelope
builder in `src/adapters/mcp/result-translation.ts` and
`src/adapters/mcp/dispatch-common.ts`. The literal
`dysflow.result/v1` is exported as the `RESULT_SCHEMA_VERSION` constant;
treat that constant as the single source of truth — never inline the string
in a consumer.

### Consumer-side parse (the "Code Mode JSON-wrapping workaround")

```js
// Issue #1168 — universal MCP response contract.
const raw = await tools.dysflow.someTool(args);
const env = typeof raw === "string" ? JSON.parse(raw) : raw;
if (env?.schemaVersion !== "dysflow.result/v1") {
  throw new Error("not a dysflow MCP envelope — possibly flattened by the transport wrapper");
}
// env.content[0].text is the JSON-encoded tool payload (parse as needed).
// env.error.code (when isError === true) is the typed error code.
```

The discriminator is the SINGLE branch signal. Hosts that parse JSON
correctly (Claude/Cursor/Cline, the `dysflow` CLI, REST adapters) see the
parsed object directly; the `typeof raw === "string"` branch is dead code
for them but still useful as a defensive sanity gate. The break is
specifically in the OpenCode Code Mode `execute` tool — `dysflow-usage`
SKILL.md § "Code Mode JSON-wrapping workaround" documents the full
workaround and the bug-class.

### Invariants

- **Universal** — every tool, every outcome (success, error, contract
  violation, tool-not-found fallback) carries `schemaVersion`. Verified by
  `test/adapters/mcp/result-schema-version-discriminator-1168.test.ts`.
- **JSON-encodable** — every response is `JSON.stringify`-clean so the
  defensive parse cannot fail mid-flight.
- **Idempotent** — `withSchemaVersion` is a no-op on an already-stamped
  envelope; the literal never appears as a duplicated field.
- **Stable until bumped** — additive envelope changes do NOT bump the
  literal. A bump (e.g. to `v2`) is a breaking change for consumers and
  ships with a `CHANGELOG.md` migration note.

## `projectIdResolution` and `projectConfig`

`projectIdResolution` is derived from the resolved `projectConfig` when that
diagnosis is available:

- `projectConfig.status: "valid"` and `writeReady: true` produce `outcome: "resolved"` and the same non-null `projectId`.
- `projectConfig.status: "ambiguous"` produces `outcome: "ambiguous"` with a null resolution project ID.
- Other non-valid statuses produce `outcome: "unresolved"` with a null resolution project ID.

Consumers can therefore use `projectIdResolution.outcome === "resolved"` as the single project-identity gate before a dysflow call, and use `projectConfig` for detailed diagnostics and target paths. The two fields must never be interpreted as independent project resolvers.

### Structured config-migration remediation (issue #1176)

Migration diagnostics expose a discriminated object in
`projectConfig.diagnostics[].remediation`. For example,
`FRONTEND_PATH_NOT_BASENAME` returns:

```json
{
  "projectConfig": {
    "diagnostics": [
      {
        "code": "FRONTEND_PATH_NOT_BASENAME",
        "severity": "error",
        "message": "Legacy accessPath '../shared/f16.accdb' is not a basename.",
        "remediation": {
          "kind": "config-migration",
          "field": "accessPath",
          "replaceWith": "frontendFile",
          "suggestedValue": "f16.accdb",
          "rationale": "absolute and separator-containing frontend paths cannot authorize cross-worktree access"
        }
      }
    ],
    "remediation": "Replace it with frontendFile: 'f16.accdb'."
  }
}
```

Branch on `remediation.kind === "config-migration"` only after confirming the
entry remediation is an object. `suggestedValue` is omitted when no value can
be inferred. The top-level `projectConfig.remediation` string remains populated
from the structured fields for backward-compatible consumers.
