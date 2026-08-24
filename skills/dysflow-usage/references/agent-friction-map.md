# Dysflow agent contract map

Current-state map for AI consumers. Runtime wins whenever this file and `get_capabilities` differ.

| Functionality | Canonical agent behavior | Evidence to read | Never do |
|---|---|---|---|
| Bootstrap | Call `get_capabilities({})` and stop if the target is not write-ready. | `adapterVersion`, write gates, `effectiveDryRunDefault`, `projectConfig`, tools | Cache tool counts/defaults across sessions. |
| One-tool schema | Call `describe_tool({name:"<tool>"})`. | `params`, `errorCodes`, `useCases` | Guess `module`/`moduleName`/`moduleNames`. |
| Contract failure | Separate an unknown tool from missing input and conflicting flags. | `MCP_TOOL_NOT_FOUND`; `missingParam`; `rejectedFlag(s)` | Treat all `MCP_INPUT_INVALID` envelopes as the same failure. |
| Invocation telemetry | Use `logs` with exact `tool` or `groupBy:"tool"`. | `aggregate.tools`, `rejectedParams`, `missingParams` | Read or persist argument values; telemetry is names-only and locally opt-outable. |
| Write intent | Prefer `apply:false` preview and `apply:true` commit when `canonicalCommitFlag:"apply"`. | `canonicalCommitFlag`, `legacyAliases`, `defaultBehavior` | Use a legacy alias as the primary contract or pass contradictory `apply` + legacy `diff`. |
| Export preview | Use `apply:false`; expect a read-only plan. | `planned[]`, `readOnly:true` when returned | Assume preview creates files/directories. |
| Export apply | Use explicit `apply:true`. With `export_modules`, keep `mutateBinary:false`. | `exported[]`, `binaryMutated:false` | Mutate the original binary unless explicitly required. |
| Drift | Use compact `verify_code`; plan from `actionableOk`, `recommendedAction`, and bulk lists. Opt into `diagnostic:true` only for classified entries or snippets. | `summaryStructured`, `summaryByCategory`, `bulkImportable[]`, `bulkExportable[]`; diagnostic `moduleCounts`/`summaryUnits` when needed | Parse raw `different[]`, treat raw `ok` as the sync decision, or mix line/module units. |
| Conflict resolution | Default `bothChanged` to manual merge; after explicit human direction, use one-way `acceptBothChanged:true`. | `direction`, plan, `execution`, post-sync verify | Use `direction:"both"` to overwrite conflicts. |
| Multi-worktree reads | Use `cwd` on `resolve_project`, diagnose, state, or `logs`. | `outcome:"resolved"`, returned config paths | Restart MCP merely to inspect another worktree. |
| Multi-worktree writes | Select an auto-discovered sibling by unique `projectId` or registered `accessPath`. | target project id/root/path in response/preflight | Invent `cwd` on write tools or weaken `OUTSIDE_PROJECT_ROOT`. |
| Doctor | Run category `A`, `B`, `C`, `D`, or all; treat only critical findings as exit blockers. | per-check `severity` and message | Treat warnings as a failed process by default. |
| Read-tool bookkeeping | Treat an `.accdb` timestamp/LSN change as unverified noise until semantic evidence exists. | `git diff --stat`, `verify_code` | Stage the binary only because a read opened it. |
| Runtime refresh | Use the supported installer refresh path and verify the launcher afterward. | `dysflow --version`, launcher start | Hand-repair pnpm transitive packages such as `fast-uri`. |
| Test fixtures | Tests must depend on virtual/relative fixture structure, not checkout directory substrings. | behavior assertions | Branch on absolute paths containing words such as binary. |

## Reinforcing examples

- `../assets/examples/describe-tool.md`
- `../assets/examples/resolve-project.md`
- `../assets/examples/doctor.md`
- `../assets/examples/export-modules.md`
- `../assets/examples/sync-binary.md`
- `../assets/examples/verify-code.md`
