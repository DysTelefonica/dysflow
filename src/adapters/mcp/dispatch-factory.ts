import {
  buildMaintenanceRequest,
  buildQueryReadRequest,
  resolveIsDryRun,
} from "../../core/mapping/access-query-request-mapper.js";
import { isRecord } from "../../core/utils/index.js";

import { invalidInput, isWriteAllowed, mcpSchemaFor, writesDisabled } from "./dispatch-common.js";
import type { GeneratedDispatchToolName } from "./dispatch-routes.js";
import { MCP_TOOL_ROUTES, queryActionFor } from "./dispatch-routes.js";
import {
  type DysflowMcpServices,
  type DysflowMcpTool,
  type McpWriteAccessResolver,
  extractAccessPathFromInput,
  resolveInScopeSecrets,
  translateCoreResultToMcpContent,
  withHumanCompileReminder,
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
  const isFilesystemWrite = route.kind === "vba-sync" && route.mutatesFilesystem;
  const isDryRunCapableBinaryWrite =
    name === "dysflow_form_add_control" ||
    name === "dysflow_form_move_control" ||
    name === "dysflow_form_rename_control" ||
    name === "dysflow_form_deserialize" ||
    name === "dysflow_create_form_from_template";

  const isWriteGated =
    (route.kind === "query-maintenance" && route.queryMode === "write") ||
    isBinaryWrite ||
    isFilesystemWrite;

  return {
    name,
    description: definition.description,
    inputSchema: schema,
    hidden: isHiddenStubTool(name) ? true : undefined,
    handler: async (input) => {
      const validation = validateInput(input, schema);
      if (validation !== undefined) return invalidInput(validation);
      // #694 — relink_directory rejects inline raw passwords before any write-gate
      // response, so callers always receive the security-specific remediation.
      // passwordEnv is resolved via the env callback and never appears in transcripts.
      if (name === "relink_directory") {
        const inputRecord = isRecord(input) ? input : {};
        const hasInlinePassword =
          hasOwn(inputRecord, "backendPassword") || hasOwn(inputRecord, "password");
        if (hasInlinePassword) {
          return invalidInput(
            "relink_directory does not accept raw inline 'backendPassword' or 'password'. " +
              "Use 'passwordEnv' to name an environment variable containing the password " +
              "instead. " +
              'Example: { "passwordEnv": "DYSFLOW_BACKEND_PASSWORD" }',
            "Use 'passwordEnv' instead of inline 'backendPassword' or 'password'. " +
              'Example: { "passwordEnv": "DYSFLOW_BACKEND_PASSWORD" }',
          );
        }
      }
      // DELTA-003 — filesystem-mutating dispatch tools reject arguments:{} with
      // MCP_INPUT_INVALID. Empty input does NOT silently target the startup
      // config (inputTargetsConfig returns false for {}), so a filesystem write
      // like catalog_add_control/generate_form would otherwise bypass
      // identification and either short-circuit to startup.allowWrites or fail
      // ambiguously. Binary-mutating tools (compile_vba, delete_module, ...)
      // are gated by MCP_WRITES_DISABLED instead — the binary IS the startup
      // binary, so empty input is still meaningful there.
      if (isWriteGated && isFilesystemWrite) {
        const inputRecord = isRecord(input) ? input : {};
        if (Object.keys(inputRecord).length === 0) {
          return invalidInput(
            `${name} requires explicit projectId, accessPath, projectRoot, or another identifying field — empty input does not target the startup config.`,
          );
        }
      }
      const isDryRun =
        isBinaryWrite && !isDryRunCapableBinaryWrite
          ? false
          : isDryRunCapableBinaryWrite || isFilesystemWrite
            ? // DELTA-007 — catalog_add_control defaults to dry-run at the service
              // level (same as generateForm), so the dispatch must always evaluate
              // resolveIsDryRun for catalog_add_control (regardless of `hasOwn`
              // — service defaults dryRun to true when both flags are absent).
              // generate_form preserves the legacy `hasOwn` gate because the
              // service-level default there is different.
              // dysflow_form_deserialize joins the slice-4 mutation family with
              // the same apply/dryRun semantics (#616 slice 3).
              // dysflow_create_form_from_template (slice 5, #618) extends that
              // family: default dry-run at the service level; apply:true is a
              // binary mutation gated by MCP_WRITES_DISABLED.
              name === "catalog_add_control" ||
              name === "dysflow_form_add_control" ||
              name === "dysflow_form_move_control" ||
              name === "dysflow_form_rename_control" ||
              name === "dysflow_form_deserialize" ||
              name === "dysflow_create_form_from_template"
              ? resolveIsDryRun(input)
              : name === "generate_form" && hasOwn(input, "dryRun")
                ? resolveIsDryRun(input)
                : false
            : resolveIsDryRun(input);
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
            // PR-1 (issue #762, v1.20.0) — wrap the vba-sync result with the
            // human-compile reminder surface when the per-project pending flag
            // is set. The flag is keyed by `accessPath`, sourced from the
            // caller's input (explicit override) or the project config.
            const coreResult = await services.vbaSyncToolService.execute(name, input);
            const mcpResult = translateCoreResultToMcpContent(coreResult);
            const accessPath = extractAccessPathFromInput(input);
            if (accessPath === undefined) return mcpResult;
            return withHumanCompileReminder(mcpResult, { toolName: name, accessPath });
          }
          return {
            isError: true,
            ok: false,
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
      }
    },
  };
}

function hasOwn(value: unknown, key: string): boolean {
  return typeof value === "object" && value !== null && Object.hasOwn(value, key);
}
