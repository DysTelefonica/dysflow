# close-docs-590-593-594 Proposal

## Intent

Close MCP documentation issues #590, #593, and #594 by making the advertised tool surface, modern tool descriptions, and agent workflow recipes auditable instead of manually inferred.

## Scope

- Validate the README MCP tool count and inventory against the tools actually advertised by the MCP adapter.
- Expand modern `dysflow_*` tool descriptions with key arguments, write-gate behavior, dry-run/apply semantics, and cleanup footguns.
- Add concise agent-oriented MCP recipes for setup, sync, recovery, write enablement, target selection, and form/report source ownership.
- Add strict docs gates that fail if the documentation becomes stale or incomplete.

## Non-goals

- No runtime behavior changes beyond MCP tool description text.
- No production runtime installation or changes under `%LOCALAPPDATA%\dysflow`.
- No changes to prior OpenSpec archives except the new archive created during closeout.
- No PR flow; this change is direct-to-`main` per maintainer instruction.

## Approach

Use strict docs TDD per issue: write the failing documentation/contract gate first, apply the minimal documentation or description change, run the focused gate, then commit one work unit per issue with SDD/test traceability.

## Affected docs and capabilities

- `README.md` MCP inventory, current visible count, and workflow recipe links.
- `AGENTS.md` agent-facing MCP workflow recipes.
- `src/adapters/mcp/tools.ts` modern tool descriptions returned by `tools/list`.
- `test/docs/*` and `test/adapters/mcp/*` quality gates.
