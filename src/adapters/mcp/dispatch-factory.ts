import {
  buildMaintenanceRequest,
  buildQueryReadRequest,
  resolveIsDryRun,
} from "../../core/mapping/access-query-request-mapper.js";
import type { WriteExecutionPolicy } from "../../core/runtime/write-execution-policy.js";
import { isRecord } from "../../core/utils/index.js";

import {
  exportSourceGuardRefused,
  internalError,
  invalidInput,
  isWriteAllowed,
  mcpSchemaFor,
  normalizeLegacyReadToolDetails,
  remapLegacyReadToolCode,
  writesDisabled,
} from "./dispatch-common.js";
import type { GeneratedDispatchToolName } from "./dispatch-routes.js";
import { MCP_TOOL_ROUTES, queryActionFor } from "./dispatch-routes.js";
import {
  type DysflowMcpServices,
  type DysflowMcpTool,
  extractAccessPathFromInput,
  type McpAccessContextResolver,
  type McpWriteAccessResolver,
  resolveInScopeSecrets,
  translateCoreResultToMcpContent,
  withHumanCompileReminder,
} from "./result-translation.js";
import { getToolDefinition, isHiddenStubTool } from "./tool-parity-registry.js";
import { validateInput } from "./validator.js";
import {
  requiresExportSourceConfirmation,
  resolveEffectiveDryRunInput,
} from "./write-execution-dispatch.js";

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

function normalizeFormSetPropertyInput(name: GeneratedDispatchToolName, input: unknown): unknown {
  if (name !== "form_set_property" || !isRecord(input)) return input;

  const hasPropertyName = hasOwn(input, "propertyName");
  const hasProperty = hasOwn(input, "property");
  if (!hasPropertyName && !hasProperty) return input;

  const { property: propertyAlias, ...rest } = input;
  return {
    ...rest,
    propertyName: hasPropertyName ? input.propertyName : propertyAlias,
  };
}

// ─── Dispatch tool factory ────────────────────────────────────────────────────

export function createDispatchTool(
  name: GeneratedDispatchToolName,
  services: DysflowMcpServices,
  writesEnabled: boolean,
  writeAccessResolver: McpWriteAccessResolver | undefined,
  env: Record<string, string | undefined>,
  // Issue #785 (v2.1.1) — resolved write-execution policy. Defaults to
  // `safe-by-default` so legacy call sites (no `writeExecutionPolicy`
  // option) keep byte-for-byte identical behavior. In `developer` mode the
  // policy helper injects `dryRun: false` on `routine-dev-write` tools when
  // the caller omitted both `dryRun` and `apply`; everywhere else
  // (other modes, other risks) the helper returns the input verbatim.
  writeExecutionPolicy: WriteExecutionPolicy = "safe-by-default",
  // Issue #785 (v2.1.1) — per-call MCP access-context resolver used by
  // the export-source guard to read the project's active source root.
  // Optional; when omitted the guard is best-effort (no refusal for
  // would-be source-overlap cases that depend on the project root) but
  // keeps every existing contract intact. Production wiring
  // (`createDysflowMcpTools` in tools.ts) forwards the same resolver
  // already wired for the canonical tool handlers.
  accessContextResolver?: McpAccessContextResolver,
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
    name === "create_form_from_template" ||
    // Issue #813 phase 6 — the apply_form_design_plan family (plan-form +
    // 2 net-new standalone tools) shares the applyGuardedFormWrite seam.
    // The dispatch must consult resolveIsDryRun on these names so a
    // legitimate dryRun:true preview is NOT collapsed to isDryRun===false
    // by the hardcoded branch reserved for raw binary writers (import_*,
    // vba_inline_execution, delete_module, fix_encoding).
    name === "apply_form_design_plan" ||
    name === "form_set_property" ||
    name === "form_delete_control" ||
    // Issue #872 F1 + F2 — form_set_properties (atomic batch property
    // updates) + form_duplicate_control (clone a control under a new
    // name) join the same applyGuardedFormWrite seam. Without this
    // entry a legitimate dryRun:true preview collapses to
    // isDryRun===false (the hardcoded branch reserved for raw binary
    // writers) and is refused by MCP_WRITES_DISABLED — the same
    // regression the form mutation family had before it joined this
    // list.
    name === "form_set_properties" ||
    name === "form_duplicate_control" ||
    // Issue #816 phase 3 — batch align/distribute. Same seam as
    // form_set_property / form_delete_control. Without this entry a
    // legitimate dryRun:true preview collapses to isDryRun===false (the
    // hardcoded branch reserved for raw binary writers) and is refused
    // by MCP_WRITES_DISABLED — a distinct regression from the write-gate
    // bypass below, equally serious.
    name === "form_align_controls" ||
    name === "form_distribute_controls" ||
    // Issue #809 — sync_binary is the workflow tool that composes
    // verify_code + import_modules + export_modules. Its plan-only
    // (dryRun:true) path is the safe-by-default behavior; its
    // apply:true path performs the chunked execute. Without this entry
    // a legitimate dryRun:true preview collapses to isDryRun===false
    // and is refused by MCP_WRITES_DISABLED — the same regression the
    // form mutation family had before it joined this list.
    name === "sync_binary";

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
      let normalizedInput = stripDeprecatedCompileParams(name, input);
      normalizedInput = normalizeFormSetPropertyInput(name, normalizedInput);
      if (
        name === "form_set_property" &&
        isRecord(normalizedInput) &&
        !hasOwn(normalizedInput, "propertyName")
      ) {
        return invalidInput(
          "propertyName (alias: property) is required. Provide the FormIR property name to mutate (for example: 'Caption', 'BackColor', or 'Enabled').",
        );
      }
      const validation = validateInput(normalizedInput, schema);
      if (validation !== undefined) {
        // #757 (C4) — when the validation message is the legacy
        // `"<flag> is not allowed."` shape, enrich the rejection
        // envelope with the rejected flag and the tool's actual
        // commit flag. The legacy text body is preserved so regex
        // consumers keep working; the structured `error` block is
        // additive.
        const flagMatch =
          /"([^"]+)"\s+is not allowed\.|^([a-zA-Z][a-zA-Z0-9_]*)\s+is not allowed\./.exec(
            validation,
          );
        const rejectedFlag = flagMatch?.[1] ?? flagMatch?.[2];
        if (rejectedFlag !== undefined) {
          return invalidInput(validation, undefined, {
            rejectedFlag,
            toolName: name,
          });
        }
        return invalidInput(validation, undefined, { toolName: name });
      }
      // Issue #785 (v2.1.1) — inject the policy-driven dry-run default
      // AFTER `stripDeprecatedCompileParams` (so the strip runs on the
      // caller-supplied payload, untouched by the policy injection) and
      // AFTER `validateInput` (so the helper only sees shape-valid input;
      // an invalid payload is rejected with `MCP_INPUT_INVALID` before
      // any policy application). `resolveEffectiveDryRunInput` returns
      // the input verbatim when the caller expressed explicit intent
      // (`dryRun` or `apply` key present) or when the tool is in the
      // form mutation / catalog exempt family. Only
      // `routine-dev-write` tools in `developer` mode without explicit
      // flags receive `dryRun: false`.
      normalizedInput = resolveEffectiveDryRunInput(name, writeExecutionPolicy, normalizedInput);
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
              // apply_form_design_plan + form_set_property + form_delete_control
              // (#813 phase 6) share the same seam: apply:true is a binary
              // mutation gated by MCP_WRITES_DISABLED; dryRun:true is a
              // preview that returns the plan without writing.
              // form_align_controls + form_distribute_controls (#816 phase 3)
              // join the same seam with the same apply/dryRun semantics.
              // sync_binary (#809) joins the same seam: dryRun:true is the
              // plan-only path; apply:true performs the chunked execute.
              // form_set_properties + form_duplicate_control (#872 F1, F2)
              // join the same seam with the same apply/dryRun semantics.
              name === "catalog_add_control" ||
              name === "form_add_control" ||
              name === "form_move_control" ||
              name === "form_rename_control" ||
              name === "form_deserialize" ||
              name === "create_form_from_template" ||
              name === "apply_form_design_plan" ||
              name === "form_set_property" ||
              name === "form_delete_control" ||
              name === "form_align_controls" ||
              name === "form_distribute_controls" ||
              name === "sync_binary" ||
              name === "form_set_properties" ||
              name === "form_duplicate_control"
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
        case "vba-sync": {
          // Issue #785 (v2.1.1) — export-source guard fires here, before
          // forwarding to `vbaSyncToolService.execute`. The guard is
          // policy-driven (developer mode only), execute-mode-only (plan
          // calls bypass via the dispatch-seam `dryRun` injection), and
          // bypassed by `confirmOverwriteSource: true`.
          //
          // Source-root resolution priority:
          //   1. The MCP access-context resolver (when provided) — the
          //      authoritative project-level source root from the loaded
          //      project config.
          //   2. Fallback: the caller's `params.destinationRoot` — what
          //      THEY declared as their source/exec root. This is not
          //      authoritative (the resolver is) but lets the guard fire
          //      in tests and in single-project servers without the
          //      resolver, AND catches the common mistake of
          //      `exportPath: <caller-declared-root>`.
          //
          // Project-resolution failures must NOT escalate into a refusal:
          // the export-source guard is best-effort; the write-gate and
          // the adapter-level guards remain authoritative.
          let sourceRootForGuard: string | undefined;
          if (accessContextResolver !== undefined) {
            try {
              const contextResult = await accessContextResolver(normalizedInput);
              if (contextResult.ok) {
                sourceRootForGuard = contextResult.data.destinationRoot;
              }
            } catch {
              // Fall through to the input-derived fallback.
            }
          }
          if (sourceRootForGuard === undefined && isRecord(normalizedInput)) {
            const fallbackDestinationRoot = normalizedInput.destinationRoot;
            if (typeof fallbackDestinationRoot === "string") {
              sourceRootForGuard = fallbackDestinationRoot;
            }
          }
          if (sourceRootForGuard !== undefined) {
            const destinationForGuard = isRecord(normalizedInput)
              ? typeof normalizedInput.exportPath === "string"
                ? normalizedInput.exportPath
                : typeof normalizedInput.destinationRoot === "string"
                  ? normalizedInput.destinationRoot
                  : undefined
              : undefined;
            const refusal = requiresExportSourceConfirmation(
              name,
              writeExecutionPolicy,
              normalizedInput,
              {
                destination: destinationForGuard,
                sourceRoot: sourceRootForGuard,
              },
            );
            if (refusal !== undefined) {
              return exportSourceGuardRefused({
                toolName: refusal.toolName,
                destination: refusal.destination,
                sourceRoot: refusal.sourceRoot,
              });
            }
          }
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
            //
            // #980 — wrap unexpected throws from `vbaSyncToolService.execute`
            // (synchronous OR async-rejected promise) with an INTERNAL_ERROR
            // envelope. The wire response carries the JS error class name in
            // `details.errorClass` and a sanitized message; raw stacks NEVER
            // reach the MCP wire. This applies to BOTH read and write tools so
            // any unexpected throw from a vba-sync service is observable from
            // the same envelope shape across the whole taxonomy.
            //
            // #980 — when the service returns a legacy runner-layer code
            // (`CONFIG_TARGET_NOT_FOUND`, `BINARY_ALREADY_LOCKED`,
            // `ACCESS_PASSWORD_INVALID`, `ACCDB_FORMAT_UNSUPPORTED`) the
            // dispatch boundary remaps it to the canonical #980 taxonomy
            // (`BINARY_NOT_FOUND`, `BINARY_LOCKED`, `BINARY_PASSWORD_INVALID`,
            // `BINARY_FORMAT_UNSUPPORTED`) BEFORE the envelope reaches the
            // translator. The original message + remediation + details survive
            // the translation so consumers see the canonical code with the
            // runner's diagnostics intact.
            let coreResult: Awaited<
              ReturnType<NonNullable<typeof services.vbaSyncToolService>["execute"]>
            >;
            try {
              coreResult = await services.vbaSyncToolService.execute(name, normalizedInput);
            } catch (caught) {
              const err = caught instanceof Error ? caught : new Error(String(caught));
              return internalError({ error: err });
            }
            if (!coreResult.ok) {
              const remappedCode = remapLegacyReadToolCode(coreResult.error.code);
              if (remappedCode !== coreResult.error.code) {
                coreResult = {
                  ...coreResult,
                  error: {
                    ...coreResult.error,
                    code: remappedCode,
                    ...(coreResult.error.details !== undefined
                      ? {
                          details: normalizeLegacyReadToolDetails(
                            coreResult.error.code,
                            coreResult.error.details,
                          ),
                        }
                      : {}),
                  },
                };
              }
            }
            const mcpResult = translateCoreResultToMcpContent(coreResult);
            // #850 — inline syntax validation returns caller-relative details and
            // remediation from the adapter. Preserve those fields at the public
            // MCP boundary instead of forcing consumers to parse the text body.
            // Scope this enrichment to vba_inline_execution so the generic
            // translator's established envelope remains backward compatible.
            if (
              name === "vba_inline_execution" &&
              !coreResult.ok &&
              coreResult.error.code === "INVALID_INPUT"
            ) {
              const prefix = `${coreResult.error.code}: `;
              const text = mcpResult.content[0]?.text ?? prefix;
              const line = coreResult.error.details?.line;
              mcpResult.error = {
                code: coreResult.error.code,
                message: text.startsWith(prefix) ? text.slice(prefix.length) : text,
                ...(typeof line === "number" ? { details: { line } } : {}),
                ...(coreResult.error.remediation
                  ? { remediation: coreResult.error.remediation }
                  : {}),
              };
            }
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
        }
        case "query-maintenance": {
          // route.queryMode is the single source of truth (narrowed to "read" | "write"
          // by the query-maintenance branch). No second lookup, no "write" fallback.
          const maintenanceRequest = buildMaintenanceRequest(
            queryActionFor(name),
            route.queryMode,
            // #847 — forward `normalizedInput` (post-strip, post-#785 policy
            // injection), NOT the raw `input`. The write-gate and `isDryRun`
            // above are computed from `normalizedInput`; building the request
            // from `input` dropped the policy-injected `dryRun: false`, so a
            // developer-mode routine-dev-write (link_tables, relink_tables,
            // unlink_table, localize_backend_links) passed the gate as a real
            // write yet silently planned. Mirrors the `vba-sync` branch (F13).
            normalizedInput,
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
