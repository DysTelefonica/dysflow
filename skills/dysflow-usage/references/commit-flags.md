# Commit flags and rejected flags

Which flag commits a tool, the compatibility aliases, and the envelope fields for a rejected flag. Read `get_capabilities.tools[toolName]` before writing a call.

## When a tool rejects your flag (#757 C4)

`get_capabilities` + `get_capabilities.tools` is the AUTHORITATIVE source for
which flag commits a tool. As of [issue #1167](https://github.com/DysTelefonica/dysflow/issues/1167)
**every advertised MCP tool reports `canonicalCommitFlag: "apply"`** — the
single canonical commit signal across the toolset. There is no longer a
per-tool polarity to memorize; the same lookup pattern works for every
write-class tool.

- `canonicalCommitFlag: "apply"` — pass `apply: true` to commit. This is
  the canonical contract for every advertised MCP tool, including
  `test_vba` (unified in #1167).
- `legacyAliases[]` — compatibility flags still accepted by the runtime.
  Never treat an alias as preferred. The live runtime reports only `diff`
  for `export_modules` and `export_all`; all other tools report an empty list.
- `noWriteAlias: "diff"` (`export_all`, `export_modules` only) — pass
  `diff: true` to plan. **Prefer `apply: false` for new code.**
- `noWriteAlias: null` — no compatibility alias; use the canonical `apply`
  field for write intent.
- `defaultBehavior: "plan"` — every write-class tool. No flag = plan.
- `defaultBehavior: "noop"` — read-only tools and conditional operations
  that require a separate explicit confirmation. No flag, no mutation.

When conflicting write intent is rejected, the
`MCP_INPUT_INVALID` envelope now carries `rejectedFlag`,
`rejectedFlags[]` (the full list of conflicting flags raised by the
truth table), `toolCommitFlag`, and `remediation` so an AI consumer
can switch without parsing the legacy text body. Since v2.23.0,
contradictory flag combinations (for example `apply:true` together
with legacy `diff:true` on an export tool) fail loud with `MCP_INPUT_INVALID` rather than
silently picking one intent — always read
`get_capabilities.tools[toolName]` first and pass the registry's
`commitFlag` / `noWriteAlias`. Contradictory combinations are modeled in two layers: full schema / `describe_tool` expose `compositionConstraints` and matching schema `anyOf` required groups; individual `parameters[*].conflictsWith` entries describe direct parameter conflicts. Do not attribute either layer to `get_capabilities.tools`.
