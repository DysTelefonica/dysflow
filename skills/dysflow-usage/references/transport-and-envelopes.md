# Transport and envelopes

Facts about the response envelope and the OpenCode Code Mode wrapper. The rule that governs them is HR-13 in `dysflow-arnes`.

## ⚠️ Code Mode JSON-wrapping workaround (OpenCode Code Mode bug)

The `dysflow` MCP declares `get_capabilities: Promise<unknown>` (and every other tool: `Promise<unknown>`), but the **OpenCode Code Mode wrapper can deliver these as JSON-encoded `string` literals instead of parsed objects**. Accessing `.adapterVersion` on a `string` returns `undefined`, which the JSON-RPC bridge surfaces as `null` — making every `caps.adapterVersion` / `caps.toolsVisible` / etc. read appear empty even though the underlying MCP responded correctly.

Every dysflow MCP response is JSON-encodable and carries a top-level
`schemaVersion: "dysflow.result/v1"` discriminator, so consumers can branch on
a single field. This is a guaranteed response contract, not an in-flight
caveat. The defensive parse collapses to:

```js
// Issue #1168 — universal MCP response contract. Branch on the
// schemaVersion discriminator instead of trusting `typeof === "object"`,
// because the OpenCode Code Mode wrapper may stringify the whole envelope.
const raw = await tools.dysflow.someTool(args);
const env = typeof raw === "string" ? JSON.parse(raw) : raw;
if (env?.schemaVersion !== "dysflow.result/v1") {
  throw new Error("not a dysflow MCP envelope — possibly flattened by the transport wrapper");
}
// Prefer `structuredContent` first; it carries the complete result when present.
// Use `content[0].text` only when it contains the complete payload, not a bounded summary.
// env.error.code (when isError === true) is the typed error code.
```

The discriminator is defined once by `RESULT_SCHEMA_VERSION` in
`src/adapters/mcp/response-envelope.ts`; the stdio central seam and every
success/error envelope builder stamp it. Use
`env.schemaVersion === "dysflow.result/v1"` as the branch signal — never invent
your own literal.

If you call the dysflow MCP from a host that DOES parse JSON correctly (Claude/Cursor/Cline with a real MCP bridge, the `dysflow` CLI directly, `gh`-style REST adapters), the response is the parsed object and the `typeof raw === "string"` branch is dead code. The discriminator check is still useful as a defensive sanity gate. The break is specifically in the OpenCode Code Mode `execute` tool.

**Detecting the bug at runtime** (use in tools that expect object results):

```js
const snap = await tools.dysflow.bootstrap({});
if (typeof snap === 'string') {
  // OpenCode Code Mode wrapper is delivering a JSON string instead of the parsed object.
  // File an issue against OpenCode (or hard-restart the MCP client). Skill contract says
  // Promise<object>; the wrapper currently returns Promise<string>.
}
```

Do NOT use when:

- The question is workflow-level ("how do I sync binaries", "what's the test loop"). Use the workflow skill (`vba-workflow`, `vba-run-tests`, etc.) — they point here for tool/flag/error tables.
- The question is about `codegraph-vba`. Use `codegraph-vba` skill if installed, or the meta-skill `dysflow-codegraph-update`.
- The question is only about CLI installation or shell setup. For pure-MCP project bootstrap, use `setup_project`; for config migration, use `migrate_project_config`.
