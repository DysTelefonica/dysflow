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
  extractAccessPathFromInput,
  type McpWriteAccessResolver,
  resolveInScopeSecrets,
  translateCoreResultToMcpContent,
  withHumanCompileReminder,
} from "./result-translation.js";
import { getToolDefinition, isHiddenStubTool } from "./tool-parity-registry.js";
import { validateInput } from "./validator.js";

// ─── F13 — deprecated-parameter strip ─────────────────────────────────────────

/**
 * F13 (round-3 brief): the `compile` and `rollbackOnCompileFail` parameters
 * on `import_modules` / `import_all` were removed in v1.19.0 (#759, hard
 * break). The runtime no longer compiles; the human compiles in Access
 * (Debug > Compile) before re-running tests.
 *
 * Existing orchestrator briefs from before v1.19.0 still pass these
 * parameters. We honor the round-3 user direction by silently STRIPPING
 * the deprecated keys at the dispatch boundary (BEFORE `validateInput`),
 * so:
 *   - The schema layer (`validateInput`) keeps rejecting `compile` via
 *     `additionalProperties: false`. That preserves the v1.19.0 contract
 *     pinned by `test/adapters/mcp/schemas/vba-sync-schemas.test.ts`
 *     for direct-schema callers.
 *   - A consumer calling the dispatch handler with `compile: false` or
 *     `compile: true` (a legacy orchestrator brief) does NOT receive
 *     `MCP_INPUT_INVALID: compile is not allowed`. The call succeeds.
 *   - The forwarded payload to `vbaSyncToolService.execute` does NOT
 *     carry `compile` / `rollbackOnCompileFail` — the strip is real,
 *     not a bypass that leaves the deprecated keys in the downstream
 *     contract.
 *
 * A `console.warn` is emitted when `compile === true` (truthy) lands here:
 * before v1.19.0 that flag triggered `compile_vba`, which is the human's
 * job now. The silent no-op is intentional — the schema, the schema
 * rejection tests, and the dispatch strip are three independent pins so
 * any future re-introduction of the compile path is a deliberate PR.
 *
 * Returns the (possibly shallow-copied) input. The original object is
 * preserved when no strip is needed so consumers that pass a frozen
 * object don't see a clone they didn't ask for.
 */
function stripDeprecatedCompileParams(name: GeneratedDispatchToolName, input: unknown): unknown {
  const isImportTool = name === "import_modules" || name === "import_all";
  if (!isImportTool) return input;
  if (!isRecord(input)) return input;
  const hasCompile = hasOwn(input, "compile");
  const hasRollback = hasOwn(input, "rollbackOnCompileFail");
  if (!hasCompile && !hasRollback) return input;

  if (input.compile === true) {
    // compile:true used to invoke the (now-removed) compile_vba path. The
    // runtime no longer compiles; the human compiles in Access. Surface
    // the deprecation as a one-line warning so a consumer tailing stderr
    // sees the contract change without a hard error.
    console.warn(
      "[dysflow] import_modules/import_all 'compile:true' is a no-op since v1.19.0 (F13). " +
        "The runtime no longer compiles; the human compiles in Access (Debug > Compile) " +
        "before re-running tests.",
    );
  }

  // Shallow-copy excluding the deprecated keys. Preserve insertion order
  // for everything else so downstream consumers that read field order
  // (e.g. JSON.stringify snapshots in tests) see the same layout as the
  // no-strip call.
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === "compile" || key === "rollbackOnCompileFail") continue;
    next[key] = value;
  }
  return next;
}

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
    name === "form_add_control" ||
    name === "form_move_control" ||
    name === "form_rename_control" ||
    name === "form_deserialize" ||
    name === "create_form_from_template";

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
      // F13 — strip the v1.18-and-earlier `compile` / `rollbackOnCompileFail`
      // params from import_modules/import_all inputs BEFORE schema
      // validation. See the `stripDeprecatedCompileParams` doc comment for
      // the rationale; tests pin the contract at
      // `test/adapters/mcp/import-modules-compile-flag.test.ts`.
      const normalizedInput = stripDeprecatedCompileParams(name, input);
      const validation = validateInput(normalizedInput, schema);
      if (validation !== undefined) return invalidInput(validation);
      // #694 — relink_directory rejects inline raw passwords before any write-gate
      // response, so callers always receive the security-specific remediation.
      // passwordEnv is resolved via the env callback and never appears in transcripts.
      if (name === "relink_directory") {
        const inputRecord = isRecord(normalizedInput) ? normalizedInput : {};
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
        const inputRecord = isRecord(normalizedInput) ? normalizedInput : {};
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
              // form_deserialize joins the slice-4 mutation family with
              // the same apply/dryRun semantics (#616 slice 3).
              // create_form_from_template (slice 5, #618) extends that
              // family: default dry-run at the service level; apply:true is a
              // binary mutation gated by MCP_WRITES_DISABLED.
              name === "catalog_add_control" ||
              name === "form_add_control" ||
              name === "form_move_control" ||
              name === "form_rename_control" ||
              name === "form_deserialize" ||
              name === "create_form_from_template"
              ? resolveIsDryRun(normalizedInput)
              : name === "generate_form" && hasOwn(normalizedInput, "dryRun")
                ? resolveIsDryRun(normalizedInput)
                : false
            : resolveIsDryRun(normalizedInput);
      if (
        isWriteGated &&
        !isDryRun &&
        !(await isWriteAllowed(normalizedInput, writesEnabled, writeAccessResolver))
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
            //
            // F13 — forward `normalizedInput` (the post-strip payload) so the
            // vbaSyncToolService never sees `compile` / `rollbackOnCompileFail`,
            // even if the caller passed them. The strip happens at the dispatch
            // boundary; downstream contracts (the VBA-sync port, the vba-modules
            // adapter) only see the cleaned payload.
            const coreResult = await services.vbaSyncToolService.execute(name, normalizedInput);
            const mcpResult = translateCoreResultToMcpContent(coreResult);
            const accessPath = extractAccessPathFromInput(normalizedInput);
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
