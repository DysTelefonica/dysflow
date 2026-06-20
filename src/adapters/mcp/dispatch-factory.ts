import {
  buildMaintenanceRequest,
  buildQueryReadRequest,
  buildWriteFixtureRequest,
  resolveIsDryRun,
} from "../../core/mapping/access-query-request-mapper.js";

import { invalidInput, isWriteAllowed, mcpSchemaFor, writesDisabled } from "./dispatch-common.js";
import type { GeneratedDispatchToolName } from "./dispatch-routes.js";
import { MCP_TOOL_ROUTES, queryActionFor } from "./dispatch-routes.js";
import {
  type DysflowMcpServices,
  type DysflowMcpTool,
  type McpWriteAccessResolver,
  resolveInScopeSecrets,
  translateCoreResultToMcpContent,
} from "./result-translation.js";
import { getToolDefinition, isHiddenStubTool } from "./tool-parity-registry.js";
import { validateInput } from "./validator.js";

// ─── Dispatch tool factory ────────────────────────────────────────────────────

export function createDispatchTool(
  name: GeneratedDispatchToolName,
  services: DysflowMcpServices,
  writesEnabled: boolean,
  writeAccessResolver: McpWriteAccessResolver | undefined,
  env: Record<string, string | undefined>,
): DysflowMcpTool {
  const definition = getToolDefinition(name);
  const schema = mcpSchemaFor(name);
  const route = MCP_TOOL_ROUTES[name];
  // VBA tools that mutate the binary always pass the write-gate. None has a real
  // dry-run mode in the PowerShell manager (e.g. Invoke-ImportAction takes no
  // -DryRun), so the gate MUST apply regardless of any caller-supplied dryRun
  // flag — honoring resolveIsDryRun() for import_modules/import_all would let a
  // caller bypass the gate by simply omitting dryRun (which defaults to true)
  // while the import still writes to the binary. Which tools mutate the binary is
  // declared on the route (`mutatesBinary`), not duplicated here (#405).
  const isBinaryWrite = route.kind === "vba-sync" && route.mutatesBinary;

  const isWriteGated =
    route.kind === "query-write-fixture" ||
    (route.kind === "query-maintenance" && route.queryMode === "write") ||
    isBinaryWrite;

  return {
    name,
    description: definition.description,
    inputSchema: schema,
    hidden: isHiddenStubTool(name) ? true : undefined,
    handler: async (input) => {
      const validation = validateInput(input, schema);
      if (validation !== undefined) return invalidInput(validation);
      const isDryRun = isBinaryWrite ? false : resolveIsDryRun(input);
      if (
        isWriteGated &&
        !isDryRun &&
        !(await isWriteAllowed(input, writesEnabled, writeAccessResolver))
      ) {
        return writesDisabled(name);
      }
      switch (route.kind) {
        case "vba-sync":
          if (services.vbaSyncToolService !== undefined) {
            return translateCoreResultToMcpContent(
              await services.vbaSyncToolService.execute(name, input),
            );
          }
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `MCP_SERVICE_UNAVAILABLE: ${name} requires the VBA sync service to be configured.`,
              },
            ],
          };
        case "query-maintenance": {
          // route.queryMode is the single source of truth (narrowed to "read" | "write"
          // by the query-maintenance branch). No second lookup, no "write" fallback.
          const maintenanceRequest = buildMaintenanceRequest(
            queryActionFor(name),
            route.queryMode,
            input,
            (key) => env[key],
          );
          // Only backendPassword is passed as an in-scope secret here, by design —
          // this is NOT a missing-accessPassword-redaction defect. The
          // AccessPowerShellRunner owns accessPassword and already redacts it from
          // EVERY error message at the source (secrets = [accessPassword,
          // backendPassword]) before any failureResult reaches this sink, and the
          // value travels to PowerShell via env only, never argv. backendPassword is
          // re-passed here only as belt-and-suspenders / HTTP parity (#429).
          // Verified by test/core/runner/access-runner-error-redaction.test.ts.
          return translateCoreResultToMcpContent(
            await services.queryService.execute(maintenanceRequest),
            resolveInScopeSecrets(maintenanceRequest.backendPassword),
          );
        }
        case "query-read":
          return translateCoreResultToMcpContent(
            await services.queryService.execute(buildQueryReadRequest(queryActionFor(name), input)),
          );
        case "query-write-fixture":
          return translateCoreResultToMcpContent(
            await services.queryService.execute(
              buildWriteFixtureRequest(queryActionFor(name), input),
            ),
          );
      }
    },
  };
}
