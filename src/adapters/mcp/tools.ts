import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  type AccessQueryRequest,
  type AccessVbaRequest,
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
} from "../../core/contracts/index.js";
import { resolveIsDryRun } from "../../core/mapping/access-query-request-mapper.js";
import type { AccessDiagnosticsRequest } from "../../core/runner/access-runner.js";
import {
  lintVbaModule,
  type VbaModuleLintRule,
} from "../../core/services/vba-module-lint-service.js";
import {
  detectDeadCode,
  findVbaReferences,
  getVbaProcedure,
  listVbaProcedures,
} from "../../core/services/vba-procedure-service.js";
import { validateVbaTestManifest } from "../../core/services/vba-test-manifest-service.js";
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
  DETECT_DEAD_CODE_SCHEMA,
  DOCTOR_SCHEMA,
  FIND_REFERENCES_SCHEMA,
  GET_PROCEDURE_SCHEMA,
  LINT_MODULE_SCHEMA,
  LIST_PROCEDURES_SCHEMA,
  NO_INPUT_SCHEMA,
  ORPHAN_CLEANUP_SCHEMA,
  QUERY_EXECUTE_SCHEMA,
  VALIDATE_MANIFEST_SCHEMA,
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
 * Resolve the source text for a VBA module, with strict source-root
 * containment.
 *
 * Security posture (#701 review / #704 fix):
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
 *   - When `projectId` is absent from the caller's input, the caller's
 *     `destinationRoot` is stripped before context resolution. This prevents
 *     a caller from using `destinationRoot` to redirect the project config
 *     lookup to an attacker-controlled directory (the `destinationRoot` value
 *     influences both the project search path AND the configured root in
 *     `buildProjectConfig`). After resolution, any caller-supplied
 *     `destinationRoot` must still match the resolved configured root — if
 *     it differs, the caller was trying to widen the read scope and the
 *     read is rejected.
 *
 * This keeps the core parser pure (it only sees text), and it keeps the
 * filesystem read contained to the project the MCP adapter was launched
 * for. A consumer cannot trick the tool into reading a `.bas`/`.cls` from
 * a different worktree, another user's home, or a sensitive directory.
 */
async function resolveVbaSourceFile(
  input: unknown,
  moduleName: string,
  source: string | undefined,
  destinationRoot: string | undefined,
  accessContextResolver: McpAccessContextResolver,
): Promise<string | undefined> {
  // Inline source is always honored — the caller provided the bytes, there
  // is nothing on disk to validate.
  if (source !== undefined) return source;

  // Pull projectId out of input if present — when absent, we must strip
  // destinationRoot before context resolution to prevent a caller from
  // using it to redirect the project config lookup (#704).
  const params =
    typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const callerProjectId = typeof params.projectId === "string" ? params.projectId : undefined;

  // When projectId is absent, strip destinationRoot before context
  // resolution so the resolver falls back to cwd and does NOT use the
  // caller's destinationRoot to locate the project config. This prevents
  // the attack where caller passes destinationRoot pointing to a
  // directory with a malicious .dysflow/project.json.
  const inputToResolve: unknown =
    callerProjectId === undefined && destinationRoot !== undefined
      ? { ...params, destinationRoot: undefined }
      : params;

  // Always resolve the MCP access context to learn the configured source
  // root. This is the authoritative value; the caller's explicit
  // `destinationRoot` can only override it when it agrees with it.
  const context = await accessContextResolver(inputToResolve);
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

async function resolveAllProjectModules(
  input: unknown,
  destinationRoot: string | undefined,
  accessContextResolver: McpAccessContextResolver,
): Promise<Record<string, string> | undefined> {
  // Pull projectId out of input if present — when absent, we must strip
  // destinationRoot before context resolution to prevent a caller from
  // using it to redirect the project config lookup (#704).
  const params =
    typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const callerProjectId = typeof params.projectId === "string" ? params.projectId : undefined;

  const inputToResolve: unknown =
    callerProjectId === undefined && destinationRoot !== undefined
      ? { ...params, destinationRoot: undefined }
      : params;

  const context = await accessContextResolver(inputToResolve);
  if (!context.ok) return undefined;
  const configuredRoot = context.data.destinationRoot;
  if (configuredRoot === undefined || configuredRoot.length === 0) {
    return undefined;
  }

  if (destinationRoot !== undefined) {
    if (!pathsAreEquivalent(destinationRoot, configuredRoot)) {
      return undefined;
    }
  }

  const { readdir, readFile } = await import("node:fs/promises");
  const { resolve } = await import("node:path");

  const modules: Record<string, string> = {};
  const subfolders = ["modules", "classes", "forms", "reports"];
  let folderReadCount = 0;

  for (const folder of subfolders) {
    const folderPath = resolve(configuredRoot, folder);
    try {
      const files = await readdir(folderPath);
      for (const file of files) {
        if (file.endsWith(".bas") || file.endsWith(".cls")) {
          const name = file.slice(0, -4);
          const content = await readFile(resolve(folderPath, file), "utf-8");
          modules[name] = content;
          folderReadCount++;
        }
      }
    } catch {
      // Ignore missing or unreadable folders
    }
  }

  if (folderReadCount === 0) return undefined;
  return modules;
}

async function resolveManifest(
  params: Record<string, unknown>,
  accessContextResolver: McpAccessContextResolver,
): Promise<OperationResult<unknown>> {
  if (params.manifest !== undefined) return successResult(params.manifest);

  const testsPath = stringParam(params.testsPath) ?? stringParam(params.path);
  if (testsPath === undefined) {
    return failureResult(
      createDysflowError(
        "VBA_INVALID_TEST_PLAN",
        "Provide testsPath/path or an inline manifest to validate.",
      ),
    );
  }

  let manifestPath = testsPath;
  if (!isAbsoluteInputPath(testsPath)) {
    const context = await accessContextResolver(params);
    if (!context.ok) return context;
    const root = context.data.projectRoot;
    if (root === undefined || root.length === 0) {
      return failureResult(
        createDysflowError(
          "VBA_INVALID_TEST_PLAN",
          "Relative testsPath requires a resolved project root.",
        ),
      );
    }
    manifestPath = resolve(root, testsPath);
  }

  try {
    const raw = await readFile(manifestPath, "utf8");
    return successResult(JSON.parse(raw));
  } catch (err) {
    return failureResult(
      createDysflowError(
        "VBA_INVALID_TEST_PLAN",
        `${err instanceof Error ? err.message : String(err)} (at ${manifestPath})`,
      ),
    );
  }
}

function stringParam(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isAbsoluteInputPath(path: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("/") || path.startsWith("\\\\");
}

const NO_AUTO_ALLOW_MARKER = ".dysflow-no-auto-allow";

/**
 * #731 — synchronous one-shot detection: returns `true` when the project
 * qualifies as a legacy Spanish-style codebase AND the operator has not
 * explicitly opted out of the auto-detection via
 * `<projectRoot>/.dysflow-no-auto-allow`. Combines the legacy-signal walk
 * with the marker check so the core layer never touches `node:fs`.
 */
function projectHasLegacyNonAsciiIdentifier(projectRoot: string): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    // Operator-level opt-out wins everything.
    if (fs.existsSync(join(projectRoot, NO_AUTO_ALLOW_MARKER))) return false;
    const srcRoot = join(projectRoot, "src");
    if (!fs.existsSync(srcRoot) || !fs.statSync(srcRoot).isDirectory()) return false;
    return walkForNonAsciiIdentifier(fs, srcRoot);
  } catch {
    return false;
  }
}

function walkForNonAsciiIdentifier(fs: typeof import("node:fs"), dir: string): boolean {
  let entries: import("node:fs").Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    try {
      if (entry.isDirectory()) {
        if (walkForNonAsciiIdentifier(fs, full)) return true;
      } else if (/\.(bas|cls|form\.txt)$/i.test(entry.name)) {
        if (fileHasNonAsciiIdentifier(fs, full)) return true;
      }
    } catch {
      // Skip unreadable entries — the legacy detector must never throw.
    }
  }
  return false;
}

function fileHasNonAsciiIdentifier(fs: typeof import("node:fs"), path: string): boolean {
  let content: string;
  try {
    content = fs.readFileSync(path, "utf8");
  } catch {
    return false;
  }
  // Restrict the regex to declaration lines so a Spanish-language string
  // literal or a comment doesn't trigger a false positive. Mirrors the
  // VBA_IDENTIFIER_RE used by the lint rule itself.
  const declarationRe =
    /^(?:Attribute\s+VB_Name\s*=\s*"(?<a>[^"]+)"|(?:Public|Private|Friend|Global|Static)\s+(?<b>[A-Za-z_\u00C0-\uFFFF][A-Za-z0-9_\u00C0-\uFFFF]*)|(?:Dim|Const|Private\s+Const)\s+(?<c>[A-Za-z_\u00C0-\uFFFF][A-Za-z0-9_\u00C0-\uFFFF]*)|Sub\s+(?<d>[A-Za-z_\u00C0-\uFFFF][A-Za-z0-9_\u00C0-\uFFFF]*)|Function\s+(?<e>[A-Za-z_\u00C0-\uFFFF][A-Za-z0-9_\u00C0-\uFFFF]*)|Property\s+(?:Get|Let|Set)\s+(?<f>[A-Za-z_\u00C0-\uFFFF][A-Za-z0-9_\u00C0-\uFFFF]*))/gmu;
  const nonAsciiRe = /[\u0080-\uFFFF]/;
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    declarationRe.lastIndex = 0;
    let match: RegExpExecArray | null = declarationRe.exec(line);
    while (match !== null) {
      const groups = match.slice(1);
      for (const group of groups) {
        if (group !== undefined && nonAsciiRe.test(group)) return true;
      }
      match = declarationRe.exec(line);
    }
  }
  return false;
}

// ─── Modern tool names ─────────────────────────────────────────────────────────

/**
 * Canonical modern Dysflow MCP tool names.
 * These names use underscore separators and are the authoritative source of truth
 * for the modern tool identifiers advertised via tools/list.
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
  "dysflow_find_references",
  // issue #705 — read-only dead-code detection
  "dysflow_detect_dead_code",
  // issue #703 — read-only VBA test manifest validation
  "dysflow_validate_manifest",
  // issue #704 — read-only VBA module pre-import linting
  "dysflow_lint_module",
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
  // #731 — per-rule lint overrides from `.dysflow/project.json`
  // `capabilities.lint.rules`. When omitted, the lint service keeps its
  // strict greenfield behavior (no per-rule opt-outs, no legacy
  // auto-detection).
  lintRulesOverride: Readonly<
    Partial<Record<VbaModuleLintRule, { enabled: boolean; reason?: string }>>
  > = {},
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
        const resolvedSource = await resolveVbaSourceFile(
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
        const resolvedSource = await resolveVbaSourceFile(
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
    {
      name: "dysflow_find_references",
      description: `Find all references to a given symbol. Scope: module, binary, source, or all (default). Returns symbol, scope, references array, and totalCount. ${MCP_TOOL_CONTRACTS.dysflow_find_references.summary}`,
      inputSchema: FIND_REFERENCES_SCHEMA,
      handler: async (input) => {
        const validation = validateInput(input, FIND_REFERENCES_SCHEMA);
        if (validation !== undefined) return invalidInput(validation);

        const params = input as Record<string, unknown>;
        const symbol = params.symbol as string;
        const scope = (params.scope ?? "all") as "module" | "binary" | "source" | "all";
        const moduleConstraint = params.module as string | undefined;

        if (params.modules !== undefined) {
          const result = findVbaReferences(
            params.modules as Record<string, string>,
            symbol,
            scope,
            moduleConstraint,
          );
          if (result === undefined) {
            return {
              content: [{ type: "text", text: `SYMBOL_NOT_FOUND: Symbol '${symbol}' not found.` }],
              isError: true,
              ok: false,
            };
          }
          return {
            content: [{ type: "text", text: JSON.stringify(result) }],
            isError: false,
            ok: true,
          };
        }

        let sourceModules: Record<string, string> = {};
        if (scope === "source" || scope === "all" || scope === "module") {
          const resolved = await resolveAllProjectModules(
            input,
            params.destinationRoot as string | undefined,
            accessContextResolver,
          );
          if (resolved !== undefined) {
            sourceModules = resolved;
          }
        }

        const binaryModules: Record<string, string> = {};
        if (scope === "binary" || scope === "all") {
          const context = await accessContextResolver(input);
          if (context.ok) {
            const configuredRoot = context.data.destinationRoot;
            if (configuredRoot !== undefined && configuredRoot.length > 0) {
              if (
                params.destinationRoot === undefined ||
                pathsAreEquivalent(params.destinationRoot as string, configuredRoot)
              ) {
                const { mkdtemp, readdir, readFile, rm } = await import("node:fs/promises");
                const { tmpdir } = await import("node:os");
                const { resolve } = await import("node:path");
                const tempRoot = await mkdtemp(resolve(tmpdir(), "dysflow-vba-findrefs-"));

                try {
                  if (services.vbaSyncToolService === undefined) {
                    return {
                      content: [
                        {
                          type: "text",
                          text: `SERVICE_UNAVAILABLE: vbaSyncToolService is not configured.`,
                        },
                      ],
                      isError: true,
                      ok: false,
                    };
                  }
                  const exportResult = await services.vbaSyncToolService.execute("export_all", {
                    ...params,
                    exportPath: tempRoot,
                    prune: false,
                  });

                  if (exportResult.ok) {
                    const subfolders = ["modules", "classes", "forms", "reports"];
                    for (const folder of subfolders) {
                      const folderPath = resolve(tempRoot, folder);
                      try {
                        const files = await readdir(folderPath);
                        for (const file of files) {
                          if (file.endsWith(".bas") || file.endsWith(".cls")) {
                            const name = file.slice(0, -4);
                            const content = await readFile(resolve(folderPath, file), "utf-8");
                            binaryModules[name] = content;
                          }
                        }
                      } catch {
                        // Ignore missing subfolders
                      }
                    }
                  }
                } finally {
                  await rm(tempRoot, { recursive: true, force: true });
                }
              }
            }
          }
        }

        // Search in the resolved modules
        const searchModules = scope === "binary" ? binaryModules : sourceModules;
        const result = findVbaReferences(searchModules, symbol, scope, moduleConstraint);
        if (result === undefined) {
          return {
            content: [{ type: "text", text: `SYMBOL_NOT_FOUND: Symbol '${symbol}' not found.` }],
            isError: true,
            ok: false,
          };
        }

        if (scope === "all") {
          const binaryResult = findVbaReferences(binaryModules, symbol, "binary", moduleConstraint);
          const binaryRefs = binaryResult ? binaryResult.references : [];
          const onlyInSource = result.references.filter(
            (sr) => !binaryRefs.some((br) => br.module === sr.module && br.context === sr.context),
          );
          const onlyInBinary = binaryRefs.filter(
            (br) =>
              !result.references.some((sr) => sr.module === br.module && sr.context === br.context),
          );
          const hasDifferences = onlyInSource.length > 0 || onlyInBinary.length > 0;

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  ...result,
                  sourceReferences: result.references,
                  binaryReferences: binaryRefs,
                  hasDifferences,
                  differences: { onlyInSource, onlyInBinary },
                }),
              },
            ],
            isError: false,
            ok: true,
          };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          isError: false,
          ok: true,
        };
      },
    },
    // issue #705 — read-only dead-code analysis. The handler runs the
    // pure `detectDeadCode` core function over the caller-supplied
    // `modules` map (or, when omitted, the project source tree resolved
    // via the Access context). It never opens Access, never spawns
    // PowerShell, and never consults the write gate.
    {
      name: "dysflow_detect_dead_code",
      description: `Find VBA procedures and module-level declarations defined but never referenced. Pure string-in / string-out analysis over the supplied \`modules\` map; never opens Access, never spawns PowerShell, never mutates the filesystem. Sibling of \`dysflow_find_references\` (#701). ${MCP_TOOL_CONTRACTS.dysflow_detect_dead_code.summary}`,
      inputSchema: DETECT_DEAD_CODE_SCHEMA,
      handler: async (input) => {
        const validation = validateInput(input, DETECT_DEAD_CODE_SCHEMA);
        if (validation !== undefined) return invalidInput(validation);

        const params = input as Record<string, unknown>;
        const scope = (params.scope ?? "binary") as "binary" | "source" | "module";
        const moduleConstraint = (params.module as string | undefined) ?? undefined;

        // Inline `modules` short-circuits any disk read — the caller
        // already provided every byte of source the analyser needs.
        let modules: Record<string, string> | undefined;
        if (
          params.modules !== undefined &&
          typeof params.modules === "object" &&
          params.modules !== null
        ) {
          modules = params.modules as Record<string, string>;
        }

        if (modules === undefined) {
          // Fall back to the project source tree via the Access context.
          // When no `destinationRoot` is configured (or the caller's
          // destinationRoot disagrees with the configured root), the
          // resolver returns `undefined` — same security posture as the
          // other read-only procedure tools (#701).
          const resolved = await resolveAllProjectModules(
            input,
            params.destinationRoot as string | undefined,
            accessContextResolver,
          );
          if (resolved === undefined) {
            return {
              content: [
                {
                  type: "text",
                  text: `MODULE_NOT_FOUND: No modules could be resolved. Pass an inline \`modules\` map or ensure the project's source root is configured.`,
                },
              ],
              isError: true,
              ok: false,
            };
          }
          modules = resolved;
        }

        const report = detectDeadCode(modules, { scope, module: moduleConstraint });

        if (report === undefined) {
          // The caller narrowed to a module that does not exist in the
          // resolved modules map. Treat this as a typed MODULE_NOT_FOUND
          // envelope so the consumer can distinguish "no dead code" from
          // "module was not resolved" — see #705 review blocker #3.
          return {
            content: [
              {
                type: "text",
                text: `MODULE_NOT_FOUND: Module '${moduleConstraint}' was not found in the supplied modules map.`,
              },
            ],
            isError: true,
            ok: false,
          };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(report) }],
          isError: false,
          ok: true,
        };
      },
    },
    {
      name: "dysflow_validate_manifest",
      description: `Validate a VBA test manifest before running test_vba. Checks manifest parseability, procedure existence in the resolved source modules, argument count/type compatibility, and tag shape. Read-only. ${MCP_TOOL_CONTRACTS.dysflow_validate_manifest.summary}`,
      inputSchema: VALIDATE_MANIFEST_SCHEMA,
      handler: async (input) => {
        const validation = validateInput(input, VALIDATE_MANIFEST_SCHEMA);
        if (validation !== undefined) return invalidInput(validation);

        const params = input as Record<string, unknown>;
        const manifestResult = await resolveManifest(params, accessContextResolver);
        if (!manifestResult.ok) return translateCoreResultToMcpContent(manifestResult);

        const inlineModules = params.modules as Record<string, string> | undefined;
        const modules =
          inlineModules ??
          (await resolveAllProjectModules(input, undefined, accessContextResolver));
        if (modules === undefined) {
          return {
            content: [
              {
                type: "text",
                text: "MODULES_NOT_FOUND: No VBA source modules could be resolved for manifest validation.",
              },
            ],
            isError: true,
            ok: false,
          };
        }

        const report = validateVbaTestManifest(manifestResult.data, modules);
        return {
          content: [{ type: "text", text: JSON.stringify(report) }],
          isError: !report.valid,
          ok: report.valid,
        };
      },
    },
    {
      name: "dysflow_lint_module",
      description: `Lint one VBA .bas/.cls module before import. Pass inline source or omit it to resolve the module from the configured project source root. Rules cover Access Option declarations, identifier safety, declaration ordering, and conservative literal argument type checks. Read-only. ${MCP_TOOL_CONTRACTS.dysflow_lint_module.summary}`,
      inputSchema: LINT_MODULE_SCHEMA,
      handler: async (input) => {
        const validation = validateInput(input, LINT_MODULE_SCHEMA);
        if (validation !== undefined) return invalidInput(validation);

        const params = input as Record<string, unknown>;
        const module = params.module as string;
        const resolvedSource = await resolveVbaSourceFile(
          input,
          module,
          params.source as string | undefined,
          params.destinationRoot as string | undefined,
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

        const rules = Array.isArray(params.rules)
          ? (params.rules as VbaModuleLintRule[])
          : undefined;
        // #731 — wire projectRoot + lint override + legacy auto-detection.
        // The detector walks the project's `src/` tree once per call and
        // returns `true` when any non-ASCII identifier is present; that
        // legacy signal downgrades `identifier-safety` to `warning`. The
        // marker file `.dysflow-no-auto-allow` opts out of the downgrade.
        const projectContext = await accessContextResolver(input);
        const projectRoot = projectContext.ok ? projectContext.data.projectRoot : undefined;
        const detection = projectRoot
          ? (): boolean => projectHasLegacyNonAsciiIdentifier(projectRoot)
          : undefined;
        const report = await lintVbaModule({
          module,
          source: resolvedSource,
          rules,
          projectRoot,
          lintRulesOverride,
          hasNonAsciiIdentifierInProject: detection,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(report) }],
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
