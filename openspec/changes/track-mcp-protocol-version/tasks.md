# Tasks: track-mcp-protocol-version

- [x] RED: added tests for exported protocol constant and `id: null`; tests failed because constant was missing.
- [x] GREEN: exported `MCP_PROTOCOL_VERSION` and used it in initialize response.
- [x] GREEN: documented hand-written runtime maintenance in `docs/testing/mcp-protocol-maintenance.md`.
- [x] VERIFY: `pnpm test` passed — 20 files / 125 tests.
- [x] VERIFY: `pnpm build` passed — `tsc -p tsconfig.json`.
