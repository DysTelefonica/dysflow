import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  type AccessQueryRequest,
  type AccessVbaRequest,
  createDysflowError,
  failureResult,
} from "../../core/contracts/index.js";
import { resolveIsDryRun } from "../../core/mapping/access-query-request-mapper.js";
import type { AccessDiagnosticsRequest } from "../../core/runner/access-runner.js";
import { getVbaProcedure, listVbaProcedures } from "../../core/services/vba-procedure-service.js";
import { buildCleanupRequest } from "./alias-tools.js";
import { resolveAllowedProceduresFor } from "./allowed-procedures-resolver.js";
import {
  handleMcpAccessCleanup,
  handleMcpAccessOperationsList,
  handleMcpAccessOrphanCleanup,
  handleMcpQueryExecute,
  handleMcpVbaExecute,
} from "./canonical-handlers.js";
import { registerMcpTools } from "./dispatch.js";
import { createGetCapabilitiesTool } from "./get-capabilities-tool.js";
import { MCP_TOOL_CONTRACTS } from "./mcp-tool-contracts.js";

export {
  ALIAS_TOOL_NAMES,
  MCP_TOOL_QUERY_ACTIONS,
  MCP_TOOL_ROUTES,
  registerMcpToolList,
} from "./dispatch.js";
export {
  type DysflowMcpServices,
  type DysflowMcpTool,
  type McpTextContent,
  type McpToolResult,
  type McpWriteAccessResolver,
  sanitizeMcpErrorMessage,
  translateCoreResultToMcpContent,
} from "./result-translation.js";
export { type JsonObjectSchema, MCP_TOOL_SCHEMAS } from "./schemas.js";

import { invalidInput } from "./dispatch-common.js";
import type {
  DysflowMcpServices,
  DysflowMcpTool,
  McpAccessContextResolver,
  McpWriteAccessResolver,
} from "./result-translation.js";
import { translateCoreResultToMcpContent } from "./result-translation.js";
import {
  CLEANUP_SCHEMA,
  DOCTOR_SCHEMA,
  GET_PROCEDURE_SCHEMA,
  LIST_PROCEDURES_SCHEMA,
  NO_INPUT_SCHEMA,
  ORPHAN_CLEANUP_SCHEMA,
  QUERY_EXECUTE_SCHEMA,
  VBA_EXECUTE_SCHEMA,
} from "./schemas.js";
import { validateInput } from "./validator.js";

// ─── Module source resolution ──────────────────────────────────────────────────

/**
 * Standard source-file search paths for a named VBA module.
 * Used when `source` is omitted from the input and the adapter must resolve
 * the module from the project's on-disk source tree.
 *
 * Convention (mirrors vba-modules-adapter.ts managedFolders):
 *   modules/<name>.bas   – standard .bas modules
 *   classes/<name>.cls   – class modules
 *   forms/<name>.cls     – form code-behind
 *   reports/<name>.cls   – report code-behind
 *
 * Returns undefined when destinationRoot is absent or no candidate exists on disk.
 * This function stays in the adapter layer so the core parser remains pure.
 */
async function resolveModuleSource(
  destinationRoot: string | undefined,
  moduleName: string,
): Promise<string | undefined> {
  if (destinationRoot === undefined) return undefined;
  if (isPathLikeModuleName(moduleName)) return undefined;

  // Candidates in priority order — first file found is used.
  const candidates = [
    resolve(destinationRoot, "modules", `${moduleName}.bas`),
    resolve(destinationRoot, "classes", `${moduleName}.cls`),
    resolve(destinationRoot, "forms", `${moduleName}.cls`),
    resolve(destinationRoot, "reports", `${moduleName}.cls`),
  ];

  for (const candidate of candidates) {
    try {
      //lint:ignore -- node:fs promises are adapter-layer I/O; core stays pure
      return await readFile(candidate, "utf-8");
    } catch {
      // Not found at this path — try the next candidate.
    }
  }
  return undefined;
}

function isPathLikeModuleName(moduleName: string): boolean {
  return (
    moduleName === "." ||
    moduleName === ".." ||
    moduleName.includes("/") ||
    moduleName.includes("\\") ||
    moduleName.includes("\0")
  );
}

/**
 * Strict equality check between two filesystem paths. Normalises each path
 * through `path.resolve` (which collapses `.`/`..` and trailing separators
 * and produces an absolute path) and compares them in a way that matches the
 * underlying filesystem's case sensitivity:
 *   - Windows / macOS default (HFS+/APFS case-insensitive): case-folded
 *   - POSIX Linux: byte-exact
 *
 * The two paths are equivalent only when they would resolve to the same file
 * on the host's filesystem. This is the predicate that backs the
 * "explicit `destinationRoot` must match the configured root" containment
 * check for the procedure read tools.
 */
function pathsAreEquivalent(a: string, b: string): boolean {
  const left = resolve(a);
  const right = resolve(b);
  if (process.platform === "win32" || process.platform === "darwin") {
    return left.toLowerCase() === right.toLowerCase();
  }
  return left === right;
}

/**
 * Resolve the source text for a procedure lookup, with strict source-root
 * containment.
 *
 * Security posture (#701 review):
 *   - Inline `source` (caller-controlled text) is honored verbatim — the
 *     caller already provided the bytes, so there is nothing to contain.
 *   - When the source must come from disk, the resolved destination root is
 *     ALWAYS the MCP access context's `destinationRoot` (the project's
 *     configured source root). A caller-supplied `destinationRoot` is only
 *     accepted if it is byte-equivalent to that configured root. Any other
 *     explicit value — including an empty string, a sibling project, or an
 *     arbitrary filesystem path — is rejected: the function returns
 *     `undefined`, which the handler translates to `MODULE_NOT_FOUND`.
 *
 * This keeps the core parser pure (it only sees text), and it keeps the
 * filesystem read contained to the project the MCP adapter was launched
 * for. A consumer cannot trick the tool into reading a `.bas`/`.cls` from
 * a different worktree, another user's home, or a sensitive directory.
 */
async function resolveProcedureSource(
  input: unknown,
  moduleName: string,
  source: string | undefined,
  destinationRoot: string | undefined,
  accessContextResolver: McpAccessContextResolver,
): Promise<string | undefined> {
  // Inline source is always honored — the caller provided the bytes, there
  // is nothing on disk to validate.
  if (source !== undefined) return source;

  // Always resolve the MCP access context to learn the configured source
  // root. This is the authoritative value; the caller's explicit
  // `destinationRoot` can only override it when it agrees with it.
  const context = await accessContextResolver(input);
  if (!context.ok) return undefined;
  const configuredRoot = context.data.destinationRoot;
  if (configuredRoot === undefined || configuredRoot.length === 0) {
    return undefined;
  }

  // Caller explicitly provided a destinationRoot — it must match the
  // configured root. Otherwise refuse to read from disk and let the handler
  // surface MODULE_NOT_FOUND. This is the security boundary that prevents
  // a caller from reading arbitrary local source roots via this tool.
  if (destinationRoot !== undefined) {
    if (!pathsAreEquivalent(destinationRoot, configuredRoot)) {
      return undefined;
    }
  }

  return await resolveModuleSource(configuredRoot, moduleName);
}

// ─── Modern tool names ─────────────────────────────────────────────────────────

/**
 * Canonical modern Dysflow MCP tool names.
 * These names use underscore separators and are the authoritative source of truth
 * for the six modern tool identifiers advertised via tools/list.
 * Exported for contract testing and regression guards.
 */
export const MODERN_TOOL_NAMES = [
  "dysflow_vba_execute",
  "dysflow_query_execute",
  "dysflow_doctor",
  "dysflow_access_operations_list",
  "dysflow_access_cleanup",
  "dysflow_access_force_cleanup_orphaned",
  "dysflow_get_capabilities",
  // issue #701 — read-only VBA procedure introspection
  "dysflow_list_procedures",
  "dysflow_get_procedure",
] as const;

export type ModernDysflowMcpToolName = (typeof MODERN_TOOL_NAMES)[number];

// ─── Main factory ─────────────────────────────────────────────────────────────

export function createDysflowMcpTools(
  services: DysflowMcpServices,
  writesEnabled = false,
  writeAccessResolver?: McpWriteAccessResolver,
  env: Record<string, string | undefined> = process.env,
  allowedProcedures?:
    | readonly string[]
    | import("./allowed-procedures-resolver.js").AllowedProcedures,
  accessContextResolver: McpAccessContextResolver = async () =>
    failureResult(
      createDysflowError(
        "ORPHAN_CLEANUP_PATH_UNRESOLVED",
        "accessPath must be provided or .dysflow/project.json must declare one.",
      ),
    ),
  // PR-1 (issue #656) — capabilities snapshot needs the project-level
  // allowWrites flag and the resolved projectId. Both default to
  // `writesEnabled` / `undefined` so existing callers (no .dysflow/project.json
  // resolved at this layer) keep working unchanged.
  allowWrites: boolean = writesEnabled,
  projectId: string | undefined = undefined,
): DysflowMcpTool[] {
  const currentTools: DysflowMcpTool[] = [
    {
      name: "dysflow_vba_execute",
      description: `Execute one public VBA procedure by procedureName with optional moduleName and arguments. Requires an already compiled project. PR1a (#621 F1): the adapter now defaults to deny — a call without an 'allowedProcedures' allowlist (project config) AND without dryRun:true is refused with MCP_INPUT_INVALID. PR-4 (#659): when the allowlist IS configured but the procedure is not in it, the refusal emits MCP_PROCEDURE_NOT_ALLOWED (distinct structured code) with error.allowedProcedures and error.remediation; the legacy MCP_INPUT_INVALID body prefix is preserved for backward compat. Pass dryRun:true in the request body to use the explicit escape hatch. ${MCP_TOOL_CONTRACTS.dysflow_vba_execute.summary}`,
      inputSchema: VBA_EXECUTE_SCHEMA,
      handler: async (input, context) => {
        // #674 — resolve the allowlist per input so the gate sees the
        // allowlist of the project the input targets, not the startup one.
        const resolvedAllowed = await resolveAllowedProceduresFor(allowedProcedures, input);
        return handleMcpVbaExecute(
          input,
          VBA_EXECUTE_SCHEMA,
          services,
          resolvedAllowed,
          (validatedInput) => validatedInput as AccessVbaRequest,
          context,
        );
      },
    },
    {
      name: "dysflow_query_execute",
      description: `Execute Access SQL with explicit mode: "read" or mode: "write". Write mode honors dryRun/apply, is blocked by the MCP write gate when writes are disabled, and returns MCP_WRITES_DISABLED instead of mutating data. ${MCP_TOOL_CONTRACTS.dysflow_query_execute.summary}`,
      inputSchema: QUERY_EXECUTE_SCHEMA,
      handler: async (input, context) =>
        handleMcpQueryExecute(
          input,
          QUERY_EXECUTE_SCHEMA,
          services,
          writesEnabled,
          writeAccessResolver,
          (validatedInput) => {
            const request = validatedInput as AccessQueryRequest;
            if (request.mode !== "write") return request;
            return { ...request, dryRun: resolveIsDryRun(validatedInput) };
          },
          context,
        ),
    },
    {
      name: "dysflow_doctor",
      description: `Run core diagnostic checks for projectId or explicit accessPath/backendPath overrides; includeEnvironment adds environment diagnostics when supported. ${MCP_TOOL_CONTRACTS.dysflow_doctor.summary}`,
      inputSchema: DOCTOR_SCHEMA,
      handler: async (input) => {
        const validation = validateInput(input, DOCTOR_SCHEMA);
        if (validation !== undefined) return invalidInput(validation);
        const request = input as AccessDiagnosticsRequest;
        return translateCoreResultToMcpContent(await services.diagnosticsService.run(request));
      },
    },
    {
      name: "dysflow_access_operations_list",
      description: `List recent Dysflow Access operation records, including operationId, PID/process metadata when known, status, and target path. This is read-only and kills nothing. ${MCP_TOOL_CONTRACTS.dysflow_access_operations_list.summary}`,
      inputSchema: NO_INPUT_SCHEMA,
      handler: async () => handleMcpAccessOperationsList(services),
    },
    {
      name: "dysflow_access_cleanup",
      description: `Reconcile or clean a tracked Access operation by operationId and accessPath. Without force it only inspects/reconciles eligible terminal records and kills nothing; force: true may kill a Dysflow-owned process and is write-gated with MCP_WRITES_DISABLED when writes are off. ${MCP_TOOL_CONTRACTS.dysflow_access_cleanup.summary}`,
      inputSchema: CLEANUP_SCHEMA,
      handler: async (input) =>
        handleMcpAccessCleanup(
          input,
          CLEANUP_SCHEMA,
          services,
          writesEnabled,
          writeAccessResolver,
          // PR2 (#621 F2 / #6b) — modern/legacy alias parity. The previous
          // bare cast dropped every field except operationId/accessPath/force.
          // The legacy `cleanup_access_operation` already uses
          // `buildCleanupRequest`, which projects the full optional surface
          // (projectId, contextId, backendPath, destinationRoot, projectRoot,
          // timeoutMs, strictContext, expectedAccessPath, expectedProjectRoot,
          // expectedDestinationRoot). Use the same builder here so both
          // surfaces carry the same field set forward to the cleanup service.
          // The core service does not yet enforce strictContext
          // (`AccessOperationCleanupService.cleanup` signature accepts only
          // `{operationId, accessPath, force?}`); that ripples through to a
          // follow-up PR. For now the modern surface at least preserves the
          // param instead of silently dropping it.
          (validatedInput) => buildCleanupRequest(validatedInput),
        ),
    },
    {
      name: "dysflow_access_force_cleanup_orphaned",
      description: `List orphaned headless MSACCESS processes holding the project's accessPath, or kill exactly one only when confirmPid is explicitly provided. Listing is read-only; confirmPid is write-gated, returns MCP_WRITES_DISABLED when writes are off, and still refuses non-headless, wrong-path, or Dysflow-owned processes. ${MCP_TOOL_CONTRACTS.dysflow_access_force_cleanup_orphaned.summary}`,
      inputSchema: ORPHAN_CLEANUP_SCHEMA,
      handler: async (input) =>
        handleMcpAccessOrphanCleanup(
          input,
          ORPHAN_CLEANUP_SCHEMA,
          services,
          writesEnabled,
          writeAccessResolver,
          async (validatedInput) => {
            const request = validatedInput as { confirmPid?: number };
            const context = await accessContextResolver(validatedInput);
            if (!context.ok) return translateCoreResultToMcpContent(context);
            if (request.confirmPid === undefined) return context.data;
            return {
              ...context.data,
              confirmPid: request.confirmPid,
            };
          },
        ),
    },
    // PR-1 (issue #656) — gate-introspection read-only tool. Returns the
    // aggregated `McpCapabilitySnapshot` for the live MCP adapter. The tool
    // is registered in `MODERN_TOOL_NAMES` above and surfaces its contract
    // summary through `MCP_TOOL_CONTRACTS.dysflow_get_capabilities` (added in
    // `mcp-tool-contracts.ts`). It is intentionally read-only — it never
    // touches Access, never spawns PowerShell, and is never write-gated.
    createGetCapabilitiesTool({
      writesEnabled,
      writeAccessResolver,
      allowedProcedures,
      projectId,
      allowWrites,
    }),
    // issue #701 — read-only VBA procedure introspection
    {
      name: "dysflow_list_procedures",
      description: `List VBA procedures in a module with optional name filter. Pass source directly or omit to resolve via the project's source root (source root resolution requires Access context). Returns procedure catalog entries with name, kind, visibility, and declaration line. Read-only. ${MCP_TOOL_CONTRACTS.dysflow_list_procedures.summary}`,
      inputSchema: LIST_PROCEDURES_SCHEMA,
      handler: async (input) => {
        const validation = validateInput(input, LIST_PROCEDURES_SCHEMA);
        if (validation !== undefined) return invalidInput(validation);
        const { module, filter, kind, source, destinationRoot } = input as {
          module: string;
          filter?: string;
          kind?: "Sub" | "Function" | "Property" | "both";
          source?: string;
          destinationRoot?: string;
        };
        const resolvedSource = await resolveProcedureSource(
          input,
          module,
          source,
          destinationRoot,
          accessContextResolver,
        );
        if (resolvedSource === undefined) {
          return {
            content: [
              {
                type: "text",
                text: `MODULE_NOT_FOUND: Module '${module}' could not be resolved. Provide source directly or ensure the module file exists under the project's source root (modules/, classes/, forms/, or reports/).`,
              },
            ],
            isError: true,
            ok: false,
          };
        }
        const all = listVbaProcedures(resolvedSource, kind ?? "both");
        const filtered = filter ? all.filter((p) => p.name.includes(filter)) : all;
        return {
          content: [{ type: "text", text: JSON.stringify({ module, procedures: filtered }) }],
          isError: false,
          ok: true,
        };
      },
    },
    {
      name: "dysflow_get_procedure",
      description: `Retrieve a single VBA procedure's declaration line, end line, and body text. Pass source directly or omit to resolve via the project's source root (source root resolution requires Access context). Returns module, procedure name, startLine, endLine, and verbatim body. Read-only. ${MCP_TOOL_CONTRACTS.dysflow_get_procedure.summary}`,
      inputSchema: GET_PROCEDURE_SCHEMA,
      handler: async (input) => {
        const validation = validateInput(input, GET_PROCEDURE_SCHEMA);
        if (validation !== undefined) return invalidInput(validation);
        const { module, procedure, source, destinationRoot } = input as {
          module: string;
          procedure: string;
          source?: string;
          destinationRoot?: string;
        };
        const resolvedSource = await resolveProcedureSource(
          input,
          module,
          source,
          destinationRoot,
          accessContextResolver,
        );
        if (resolvedSource === undefined) {
          return {
            content: [
              {
                type: "text",
                text: `MODULE_NOT_FOUND: Module '${module}' could not be resolved. Provide source directly or ensure the module file exists under the project's source root (modules/, classes/, forms/, or reports/).`,
              },
            ],
            isError: true,
            ok: false,
          };
        }
        const detail = getVbaProcedure(resolvedSource, procedure);
        if (detail === undefined) {
          return {
            content: [
              {
                type: "text",
                text: `PROCEDURE_NOT_FOUND: Procedure '${procedure}' not found in module '${module}'.`,
              },
            ],
            isError: true,
            ok: false,
          };
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                module,
                procedure: detail.name,
                startLine: detail.startLine,
                endLine: detail.endLine,
                body: detail.body,
              }),
            },
          ],
          isError: false,
          ok: true,
        };
      },
    },
  ];

  return registerMcpTools(
    currentTools,
    services,
    writesEnabled,
    writeAccessResolver,
    env,
    allowedProcedures,
  );
}
