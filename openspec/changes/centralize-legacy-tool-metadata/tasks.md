# Tasks: centralize-legacy-tool-metadata

- [x] RED: added registry metadata assertions for maintenance query modes; `pnpm test` failed because `queryMode` was absent.
- [x] GREEN: added `queryMode` metadata to the parity registry and used it in `toLegacyMaintenanceRequest`.
- [x] GREEN: documented the optional operation registry fallback in `DysflowMcpServices`.
- [x] VERIFY: `pnpm test` passed — 20 files / 124 tests.
- [x] VERIFY: `pnpm build` passed — `tsc -p tsconfig.json`.
