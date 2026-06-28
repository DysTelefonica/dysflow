# Archive Report — close-docs-590-593-594

## Summary

Closed MCP documentation issues #590, #593, and #594 with strict docs-gate TDD. The change makes the README MCP surface auditable against the actual adapter tool list, expands modern `dysflow_*` descriptions with safety/argument details, and adds canonical MCP workflow recipes for agents.

## Implementation commits

| Commit | Issue | Work unit | Verification |
|---|---:|---|---|
| `83beffe` | #590 | README MCP tool count and inventory now match the 53 visible tools advertised by the MCP adapter. | RED/GREEN: `pnpm vitest run test/docs/mcp-readme-tool-surface.test.ts` |
| `ee1457e` | #590 | Biome formatting follow-up for the README tool-surface docs gate after CI lint failure. | `pnpm vitest run test/docs/mcp-readme-tool-surface.test.ts`; `pnpm lint`; CI `28335656038` |
| `7d220b9` | #593 | Modern `dysflow_*` MCP tool descriptions now mention key args, write-gate behavior, dry-run/apply semantics, and cleanup footguns. | RED/GREEN: `pnpm vitest run test/adapters/mcp/mcp-tool-contracts.test.ts`; `pnpm lint`; CI `28335759252` |
| `fedc9df` | #594 | `AGENTS.md` now includes agent-facing MCP workflow recipes for bootstrap, sync, recovery, write enablement, target selection, and form/report ownership. | RED/GREEN: `pnpm vitest run test/docs/agents-mcp-workflow-recipes.test.ts`; `pnpm lint`; CI `28335879017` |

## Test summary

- `pnpm vitest run test/docs/mcp-readme-tool-surface.test.ts` — passed; RED first failed on README count `48` vs runtime `53` and missing tool names.
- `pnpm vitest run test/adapters/mcp/mcp-tool-contracts.test.ts` — passed; RED first failed on missing `procedureName` and related safety wording.
- `pnpm vitest run test/docs/agents-mcp-workflow-recipes.test.ts` — passed; RED first failed because `## MCP workflow recipes` was absent.
- `pnpm test` — passed, 137 files / 1735 tests.
- `pnpm build` — passed.
- `pnpm lint` — passed.
- `pwsh -Command "Invoke-Pester scripts/tests/"` — passed, 374 passed / 0 failed / 4 skipped.

## CI runs

| Run | Commit | Result |
|---|---|---|
| `28335541036` | `83beffe` | Failed in `pnpm lint` due to Biome formatting; fixed by `ee1457e`. |
| `28335656038` | `ee1457e` | Success. |
| `28335759252` | `7d220b9` | Success. |
| `28335879017` | `fedc9df` | Success. |

## Outstanding items

- None for this documentation closeout.
