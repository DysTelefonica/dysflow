# Pre-release checklist

This checklist must be reviewed before tagging a new dysflow release. It exists
to make manual maintenance decisions auditable and visible in CI.

## MCP protocol compatibility

Dysflow's MCP server runs on the official `@modelcontextprotocol/sdk`, which
owns the `initialize` handshake and protocol-version negotiation.
`MCP_PROTOCOL_VERSION` in `src/adapters/mcp/stdio.ts` is **derived** from the
SDK's `DEFAULT_NEGOTIATED_PROTOCOL_VERSION` (it is not hand-pinned), so it
cannot drift from what the server actually negotiates. On any release that
upgrades the SDK, revalidate:

- [ ] `MCP_PROTOCOL_VERSION` / `MCP_PROTOCOL_VERSION_LATEST_SUPPORTED` still
  reflect the SDK's negotiated/latest versions after the bump. Cross-check
  against <https://modelcontextprotocol.io/specification>.
- [ ] `MCP_PROTOCOL_VERSION_REVIEW` in `src/adapters/mcp/stdio.ts` was updated
  in the same commit as any SDK/protocol change:
  - `version` equals `MCP_PROTOCOL_VERSION`
  - `reviewedAt` reflects the date of the last cross-check
  - `specRef` cites the upstream MCP spec revision
- [ ] Any new MCP capabilities introduced by the spec revision are reflected in
  the `capabilities` object exposed during `initialize`.
- [ ] The runtime still satisfies the JSON-RPC guards listed in
  `docs/testing/mcp-protocol-maintenance.md` (numeric/string ids, notifications
  with no `id`, explicit `id: null`, `-32601` for unsupported methods).

Reference: `docs/testing/mcp-protocol-maintenance.md`.

## Tests

- [ ] `pnpm test` passes locally.
- [ ] Integration/E2E (`vitest.integration.config.ts`) passes locally where the
  host platform supports it.
- [ ] Real MCP E2E (`node E2E_testing/mcp-e2e.mjs`) passes against the safe
  `test-runtime/` build, with `DYSFLOW_E2E_COMMAND` pointing at it. Never run
  E2E against `%LOCALAPPDATA%\dysflow` or `~/.config/opencode/opencode.json`.
- [ ] The optional-presence guard passes:
  `node scripts/check-optional-presence-guards.mjs`.
- [ ] `biome check src/ test/` passes.

## Release hygiene

- [ ] GitHub release **title equals the tag name exactly** (e.g. tag `v1.2.23`
  → title `v1.2.23`).
- [ ] Release notes mention the MCP adapter cleanup work and any
  compatibility/deprecation decisions made since the previous release.
- [ ] No secrets, raw passwords, or environment-specific paths are included in
  the tarball or release notes.
