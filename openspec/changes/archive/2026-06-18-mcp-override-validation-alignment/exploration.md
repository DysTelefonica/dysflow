## Exploration: mcp-override-validation-alignment

### Current State
Currently, VBA sync tools (like `export_modules`, `import_modules`, etc.) dynamically resolve configuration/database overrides per-call because they invoke `resolveExecutionTarget` inside their sub-adapters. However, `run_vba` (`dysflow_vba_execute`), `dysflow_doctor`, `relink_directory`, and `cleanup_access_operation` do not call `resolveExecutionTarget` or resolve config dynamically. Instead:
1. When the MCP server successfully resolves a project configuration at startup, it instantiates static service instances (`vbaService`, `queryService`, etc.) bound to the startup config. Thus, any parameters overridden per-call are completely ignored.
2. The override parameters are currently stripped from the request objects by their mapping functions (like `buildRequest` or `buildMaintenanceRequest`) before reaching the services.
3. The MCP schemas for these four tools omit the override property schemas (`ACCESS_OVERRIDE`, `STRICT_CTX`, `timeoutMs`) and declare `additionalProperties: false`, which causes schema validation to reject any overrides.

### Affected Areas
- `src/adapters/mcp/schemas/vba-sync-schemas.ts` — `run_vba` and `cleanup_access_operation` schemas need to include context, override, and strict context properties.
- `src/adapters/mcp/schemas/dysflow-schemas.ts` — `VBA_EXECUTE_SCHEMA` (`dysflow_vba_execute`) and `DOCTOR_SCHEMA` (`dysflow_doctor`) need override and strict context properties.
- `src/adapters/mcp/schemas/query-schemas.ts` — `relink_directory` schema needs override and strict context properties.
- `src/core/contracts/index.ts` — `AccessVbaRequest` and `AccessQueryRequest` envelopes need optional override fields so they are not stripped during mapping.
- `src/core/operations/access-operation-cleanup.ts` — The cleanup request type needs optional override fields.
- `src/core/runner/access-runner.ts` — `AccessDiagnosticsRequest` needs optional override fields.
- `src/core/mapping/access-query-request-mapper.ts` — `buildQueryReadRequest`, `buildWriteFixtureRequest`, and `buildMaintenanceRequest` need to copy override fields.
- `src/adapters/mcp/alias-tools.ts` — Mappers for `run_vba` and `cleanup_access_operation` need to copy overrides into the request envelopes.
- `src/adapters/mcp/stdio.ts` — Refactor `createUnavailableServices` to `createDynamicServices` which is *always* used. It will immediately serve cached startup services if no overrides are present, but dynamically resolve, instantiate, and cache services if overrides are passed. It should also wrap `cleanupService` and `orphanCleanupService` dynamically.
- `src/core/config/execution-target.ts` and `stdio.ts` (`resolveConfigForInput`) — Add `timeoutMs` to the options passed to `loadDysflowConfigAsync` so timeout overrides are correctly applied.

### Approaches
1. **Always Use Dynamic Service Wrapping** — Introduce a `createDynamicServices` wrapper in `stdio.ts` that is always used. It checks for overrides on every incoming request. If no overrides are present, it yields the cached startup services. If overrides are present, it resolves and instantiates the service dynamically.
   - Pros: Unified path for both configured/degraded modes; clean segregation of adapters and core; automatically supports all override types (roots, paths, IDs, registry paths) without touching core service logic.
   - Cons: Requires extending request envelopes to carry overrides.
   - Effort: Medium

2. **Core Service Target Resolution** — Pass `resolveExecutionTarget` or dynamic config resolution directly inside the core services (`AccessVbaService`, `AccessQueryService`, `AccessDiagnosticsService`).
   - Pros: Keeps the MCP stdio server wrapper simple.
   - Cons: Leaks adapter/configuration concern into core services; breaks the design pattern where core services are instantiated with a fixed config.
   - Effort: High

### Recommendation
Approach 1 is recommended. Wrapping services dynamically in `stdio.ts` preserves Clean Architecture boundaries, reuses the existing caching mechanism, and cleanly supports per-call registry database path changes (since `cleanupService` will be instantiated dynamically with the correct project registry root).

### Risks
- Stripping or omitting override properties during request mapping would break the dynamic resolution.
- Forgetting to support `timeoutMs` override in config loading will cause timeout overrides to be ignored.
- Incorrectly caching dynamic services can leak operations between different project contexts.

### Ready for Proposal
Yes — the next step is to create a proposal and specification details for alignment.
