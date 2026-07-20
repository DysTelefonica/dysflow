import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  type AccessQueryRequest,
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
} from "../../core/contracts/index.js";
import { resolveIsDryRun } from "../../core/mapping/access-query-request-mapper.js";
import { resolveAccessOperationRegistry } from "../../core/operations/access-operation-registry.js";
import type { AccessDiagnosticsRequest } from "../../core/runner/access-runner.js";
import type { WriteExecutionPolicy } from "../../core/runtime/write-execution-policy.js";
import {
  lintVbaModule,
  type VbaModuleLintDiagnostic,
  type VbaModuleLintReport,
  type VbaModuleLintRule,
} from "../../core/services/vba-module-lint-service.js";
import {
  detectDeadCode,
  findVbaReferences,
  getVbaProcedure,
  listVbaProcedures,
} from "../../core/services/vba-procedure-service.js";
import {
  lintVbaProjectOpenArgs,
  type OpenArgsContractMismatchDiagnostic,
} from "../../core/services/vba-project-openargs-lint-service.js";
import { validateVbaTestManifest } from "../../core/services/vba-test-manifest-service.js";
import {
  handleMcpAccessOrphanCleanup,
  handleMcpCleanStaleMarkers,
  handleMcpQueryExecute,
} from "./canonical-handlers.js";
import { createDiagnoseTool } from "./diagnose-tool.js";
import { registerMcpTools } from "./dispatch.js";
import { MCP_TOOL_ROUTES } from "./dispatch-routes.js";
import { createGetCapabilitiesTool, readAdapterVersion } from "./get-capabilities-tool.js";
import { createLogsTool } from "./logs-tool.js";
import { MCP_TOOL_CONTRACTS } from "./mcp-tool-contracts.js";
import { createResolveProjectTool } from "./resolve-project-tool.js";
import { createSchemaTool } from "./schema-tool.js";
import { createStateTool } from "./state-tool.js";

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

import type { ProjectConfigDiagnostic } from "../config/project-config-diagnostic.js";
import {
  invalidInput,
  projectConfigNotWriteReady,
  requestRequiresWriteReady,
} from "./dispatch-common.js";
import type {
  DysflowMcpServices,
  DysflowMcpTool,
  McpAccessContextResolver,
  McpWriteAccessResolver,
} from "./result-translation.js";
import { translateCoreResultToMcpContent } from "./result-translation.js";
import {
  CLEAN_STALE_MARKERS_SCHEMA,
  DETECT_DEAD_CODE_SCHEMA,
  DOCTOR_SCHEMA,
  FIND_REFERENCES_SCHEMA,
  GET_PROCEDURE_SCHEMA,
  LINT_MODULE_SCHEMA,
  LIST_PROCEDURES_SCHEMA,
  ORPHAN_CLEANUP_SCHEMA,
  QUERY_EXECUTE_SCHEMA,
  VALIDATE_MANIFEST_SCHEMA,
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

function getProjectClassModules(destinationRoot: string): string[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("node:path") as typeof import("node:path");

    const classNames: string[] = [];
    const dirs = ["classes", "forms", "reports"];
    for (const dirName of dirs) {
      const dirPath = path.join(destinationRoot, dirName);
      if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
          if (file.toLowerCase().endsWith(".cls")) {
            const className = file.slice(0, -4);
            const fullPath = path.join(dirPath, file);
            try {
              const content = fs.readFileSync(fullPath, "utf-8");
              if (/Attribute\s+VB_PredeclaredId\s*=\s*True/i.test(content)) {
                continue;
              }
            } catch {
              // Ignore read errors
            }
            classNames.push(className);
          }
        }
      }
    }
    return classNames;
  } catch {
    return [];
  }
}

// #1006 slice 2 — gather every `.cls` source file under the configured
// destinationRoot so the project-lint engine can scan them. Mirrors the
// folder conventions used by the vba-sync adapter (`managedFolders`):
//   classes/<Name>.cls
//   forms/<Name>.cls
//   reports/<Name>.cls
// Files with `Attribute VB_PredeclaredId = True` are excluded — they're
// predeclared class identity records that never carry `DoCmd.OpenForm` or
// `Me.OpenArgs` and would only inflate the engine's source array without
// producing any signal. Returns an empty array when the project tree is
// missing or unreadable; the engine treats that as a clean (no-op) scan.
async function collectProjectClassSources(
  destinationRoot: string,
): Promise<Array<{ readonly path: string; readonly text: string }>> {
  const { readdir, readFile } = await import("node:fs/promises");
  const path = await import("node:path");

  const sources: Array<{ readonly path: string; readonly text: string }> = [];
  const dirs = ["classes", "forms", "reports"];
  for (const dirName of dirs) {
    const dirPath = path.resolve(destinationRoot, dirName);
    let entries: string[];
    try {
      entries = await readdir(dirPath);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.toLowerCase().endsWith(".cls")) continue;
      const fullPath = path.join(dirPath, entry);
      try {
        const text = await readFile(fullPath, "utf-8");
        if (/Attribute\s+VB_PredeclaredId\s*=\s*True/i.test(text)) continue;
        sources.push({ path: fullPath, text });
      } catch {
        // Skip unreadable files — partial visibility is still better than
        // failing the whole lint call on a transient read error.
      }
    }
  }
  return sources;
}

// #1006 slice 2 — translate the project-lint engine's
// `OpenArgsContractMismatchDiagnostic` into the existing
// `VbaModuleLintDiagnostic` shape so the merged report's per-rule key
// (`diagnostics["openargs-contract-mismatch"]`) and `flatDiagnostics`
// array stay homogeneous with the module-lint output. The full
// producer/consumer context (paths, both line numbers, grammars,
// fallback risk) is preserved in the message so consumers that parse
// `parsed.diagnostics["openargs-contract-mismatch"][i].message` keep
// the data they need without expanding the public shape.
function translateOpenArgsDiagnostic(
  diag: OpenArgsContractMismatchDiagnostic,
): VbaModuleLintDiagnostic {
  const consumerName = diag.consumerPath.split(/[\\/]/).pop() ?? diag.consumerPath;
  const producerName = diag.producerPath.split(/[\\/]/).pop() ?? diag.producerPath;
  const fallbackSuffix = diag.fallbackRiskReachable
    ? " (silent fallback reachable in consumer)"
    : "";
  // The strict `VbaModuleLintRule` union in the core does not include
  // the project-lint rule (that is the deliberate contract split between
  // the two engines — see the comment on `mergeLintReports`). The MCP
  // boundary is the single place that widens the rule string to slot the
  // project-lint diagnostics into the existing `VbaModuleLintReport`
  // envelope. The JSON shape is identical.
  return {
    rule: "openargs-contract-mismatch" as unknown as VbaModuleLintRule,
    line: diag.producerLine,
    severity: diag.severity,
    code: diag.code,
    message:
      `Producer ${producerName}:${diag.producerLine} emits OpenArgs grammar ` +
      `"${diag.producerGrammar}" but consumer ${consumerName}:${diag.consumerLine} ` +
      `parses "${diag.consumerGrammar}"${fallbackSuffix}.`,
  };
}

// #1006 slice 2 — merge the module-lint report with the project-lint
// diagnostics into a single envelope. The shape mirrors
// `VbaModuleLintReport` so existing consumers (the
// `parsed.diagnostics[<rule>]` / `parsed.flatDiagnostics` access pattern)
// keep working; the only widening is the project-lint rule key. `rules`
// lists the module-lint rules that actually ran first, then the
// project-lint rule last when it was requested — this matches the
// "project-lint first, then module-lint" dispatch order called out in
// the slice 2 spec while keeping the public array in the order the
// caller asked for.
function mergeLintReports(
  moduleReport: VbaModuleLintReport,
  projectDiagnostics: readonly VbaModuleLintDiagnostic[],
  projectLintRequested: boolean,
): VbaModuleLintReport {
  // The `VbaModuleLintReport.diagnostics` key type is the strict
  // `VbaModuleLintRule` union; the project-lint rule key widens the
  // shape one slot. We accept the structural widening at the MCP
  // boundary (the JSON shape is identical) instead of polluting the
  // core `VBA_MODULE_LINT_RULES` array, which is the module-lint
  // engine's contract.
  const diagnostics = projectLintRequested
    ? ({
        ...moduleReport.diagnostics,
        "openargs-contract-mismatch": [...projectDiagnostics],
      } as VbaModuleLintReport["diagnostics"])
    : moduleReport.diagnostics;

  const flatDiagnostics = projectLintRequested
    ? [...moduleReport.flatDiagnostics, ...projectDiagnostics]
    : [...moduleReport.flatDiagnostics];

  const projectErrors = projectLintRequested
    ? projectDiagnostics.filter((d) => d.severity === "error").length
    : 0;
  const projectWarnings = projectLintRequested
    ? projectDiagnostics.filter((d) => d.severity === "warning").length
    : 0;

  const rules = projectLintRequested
    ? [...moduleReport.rules, "openargs-contract-mismatch" as VbaModuleLintRule]
    : [...moduleReport.rules];

  return {
    module: moduleReport.module,
    rules,
    isClean: moduleReport.isClean && projectDiagnostics.length === 0,
    diagnostics,
    flatDiagnostics,
    summary: {
      errors: moduleReport.summary.errors + projectErrors,
      warnings: moduleReport.summary.warnings + projectWarnings,
    },
  };
}

// ─── Modern tool names ─────────────────────────────────────────────────────────

/**
 * Canonical modern Dysflow MCP tool names.
 * These names use underscore separators and are the authoritative source of truth
 * for the modern tool identifiers advertised via tools/list.
 * Exported for contract testing and regression guards.
 */
export const MODERN_TOOL_NAMES = [
  "query_execute",
  "doctor",
  // #777 (Opción A cont.) — `list_access_operations` and
  // `cleanup_access_operation` were REMOVED from MODERN_TOOL_NAMES;
  // the canonical aliases (with bespoke handlers in alias-tools.ts)
  // are owned by `aliasContracts`, not `modernContracts`.
  "access_force_cleanup_orphaned",
  "get_capabilities",
  // issue #701 — read-only VBA procedure introspection
  "list_procedures",
  "get_procedure",
  "find_references",
  // #705 — read-only dead-code analysis over the supplied modules map.
  "detect_dead_code",
  // #703 — read-only VBA test manifest validation before `test_vba`.
  "validate_manifest",
  // #704 — read-only VBA module pre-import linting.
  "lint_module",
  // Round-3 Item 1 — project config re-resolution companion tool
  "resolve_project",
  // Issue #971 — runtime contract discovery. Read-only catalog that
  // surfaces the documented schema for every MCP tool in the consumer's
  // dysflow installation (parameters, returns, errorCodes,
  // crossReferences, requiredCapabilities, safeByDefault). Pairs with
  // get_capabilities (live state) and resolve_project (project
  // resolution).
  "schema",
  // Issue #965 — `dysflow.diagnose(projectId?, accessPath?, contextId?,
  // verbose?)` is the single-call aggregated project health surface
  // (projectConfig + filesystem + runtime). Read-only — never opens
  // Access, never spawns PowerShell, never writes to disk. Pairs with
  // get_capabilities (live state), resolve_project (config), and schema
  // (static contract).
  "diagnose",
  // Round-12 (#976) — explicit user-callable cleanup of stale `running`
  // markers under `.dysflow/runtime/markers/`. Safe-by-default (dryRun:true);
  // apply requires `confirm: true`. Pairs with the #967 auto-cleanup.
  "clean_stale_markers",
  // Round-12 (#978) — `state` runtime operational state. Read-only
  // snapshot that surfaces `{ operations, markers, locks, counters }`
  // for monitoring and post-mortem. Pairs with `diagnose` (current
  // health), `logs` (event timeline), and `resolve_project` (config).
  "state",
  // Issue #973 — AI-aware log access. Read-only structured view of
  // `.dysflow/runtime/` (operations.json + markers/*.json). Surfaces the
  // recorded operation log with filters (since/until/level/operationId/
  // tool), pagination (limit, default 100, max 1000), and ordering
  // (orderBy, default desc). Never opens Access, never spawns
  // PowerShell, never mutates state. Pairs with get_capabilities (live
  // state) and schema (static contract catalog).
  "logs",
] as const;

export type ModernDysflowMcpToolName = (typeof MODERN_TOOL_NAMES)[number];

// ─── Main factory ─────────────────────────────────────────────────────────────

/**
 * Options bag for {@link createDysflowMcpTools}.
 *
 * Replaces the legacy positional-argument signature (#781 P3). All fields are
 * optional except `services`; defaults mirror the previous positional defaults
 * so behavior is unchanged for callers that omit a field. Naming tweaks:
 *   - `writesEnabled` -> `writes`
 *   - `lintRulesOverride` -> `lintOverrides`
 *
 * `accessDbPath` is kept on the options bag (not in the issue's example list)
 * because the stdio entry point forwards it to the capabilities snapshot so
 * the per-project `humanCompilePending` flag surfaces from the process-local
 * cache.
 */
export type CreateDysflowMcpToolsOptions = {
  services: DysflowMcpServices;
  writes?: boolean;
  writeAccessResolver?: McpWriteAccessResolver;
  env?: Record<string, string | undefined>;
  allowedProcedures?:
    | readonly string[]
    | import("./allowed-procedures-resolver.js").AllowedProcedures;
  accessContextResolver?: McpAccessContextResolver;
  // PR-1 (issue #656) — capabilities snapshot needs the project-level
  // allowWrites flag and the resolved projectId. Both default to
  // `options.writes` / `undefined` so existing callers (no
  // .dysflow/project.json resolved at this layer) keep working unchanged.
  allowWrites?: boolean;
  projectId?: string;
  // #731 — per-rule lint overrides from `.dysflow/project.json`
  // `capabilities.lint.rules`. When omitted, the lint service keeps its
  // strict greenfield behavior (no per-rule opt-outs, no legacy
  // auto-detection).
  lintOverrides?: Readonly<
    Partial<Record<VbaModuleLintRule, { enabled: boolean; reason?: string }>>
  >;
  // PR-1 (issue #762, v1.20.0) — front-end `.accdb` path used to surface
  // the per-project `humanCompilePending` flag in the capabilities snapshot.
  // When omitted, the snapshot reports `humanCompilePending: false` (no
  // project in scope at startup).
  accessDbPath?: string;
  // Issue #779 (v2.1.0) — risk-based write execution policy. Resolved from
  // `.dysflow/project.json` `capabilities.writeExecutionPolicy` by the
  // caller (stdio entry point). When omitted, the snapshot and the dispatch
  // layer default to `"safe-by-default"` so legacy call sites keep their
  // existing behavior.
  writeExecutionPolicy?: WriteExecutionPolicy;
  // Issue #789 — opt-in to the historical strict (error) severity for the
  // `identifier-safety` non-ASCII check. Resolved from
  // `.dysflow/project.json` `capabilities.lint.identifierSafety.strictNonAscii`
  // by the caller. Default `false` (warning for non-ASCII). When `true`,
  // the MCP `lint_module` tool passes `strictNonAscii: true` to the linter
  // service, restoring the legacy strict (error) severity.
  lintIdentifierSafetyStrict?: boolean;
  projectConfigResolver?: (
    input: unknown,
  ) => ProjectConfigDiagnostic | Promise<ProjectConfigDiagnostic>;
  // Issue #940 — optional resolver for the runtime documentation bundle
  // status. When omitted, the snapshot reports fail-closed defaults. The
  // stdio entry point wires a resolver that probes the live install dir
  // for `references/error-codes.md` and `docs/diagnostics/hresult-guide.md`.
  documentationBundleResolver?: () => import("../../shared/install-docs.js").DocumentationBundleStatus;
  cwd?: string;
};

export function createDysflowMcpTools(options: CreateDysflowMcpToolsOptions): DysflowMcpTool[] {
  const {
    services,
    writes: writesEnabled = false,
    writeAccessResolver,
    env = process.env,
    allowedProcedures,
    accessContextResolver: accessContextResolverInput,
    allowWrites,
    projectId,
    lintOverrides: lintRulesOverride = {},
    accessDbPath,
    writeExecutionPolicy,
    lintIdentifierSafetyStrict = false,
    projectConfigResolver,
    documentationBundleResolver,
    cwd = process.cwd(),
  } = options;
  const accessContextResolver: McpAccessContextResolver =
    accessContextResolverInput ??
    (async () =>
      failureResult(
        createDysflowError(
          "ORPHAN_CLEANUP_PATH_UNRESOLVED",
          "accessPath must be provided or .dysflow/project.json must declare one.",
        ),
      ));
  const writesAllowedForCapabilities = allowWrites ?? writesEnabled;
  const currentTools: DysflowMcpTool[] = [
    {
      name: "query_execute",
      description: `Execute Access SQL with explicit mode: "read" or mode: "write". Write mode honors dryRun/apply, is blocked by the MCP write gate when writes are disabled, and returns MCP_WRITES_DISABLED instead of mutating data. ${MCP_TOOL_CONTRACTS.query_execute.summary}`,
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
      name: "doctor",
      description: `Run core diagnostic checks for projectId or explicit accessPath/backendPath overrides; includeEnvironment adds environment diagnostics when supported. ${MCP_TOOL_CONTRACTS.doctor.summary}`,
      inputSchema: DOCTOR_SCHEMA,
      handler: async (input) => {
        const validation = validateInput(input, DOCTOR_SCHEMA);
        if (validation !== undefined) return invalidInput(validation);
        const request = input as AccessDiagnosticsRequest;
        return translateCoreResultToMcpContent(await services.diagnosticsService.run(request));
      },
    },
    {
      // #777 (Opción A cont.) — the canonical `list_access_operations`
      // and `cleanup_access_operation` registrations live exclusively
      // in `alias-tools.ts` (`buildAliasTools`). Both aliases have
      // bespoke handlers that were in place before this rename. The
      // former bespoke registrations in this file (under their legacy
      // `dysflow_access_operations_list` / `dysflow_access_cleanup`
      // names) are REMOVED entirely; the alias is the sole source.
      name: "access_force_cleanup_orphaned",
      description: `List orphaned headless MSACCESS processes and pwsh.exe worker processes holding the project's accessPath, or kill exactly one only when confirmPid is explicitly provided. Listing is read-only; confirmPid is write-gated, returns MCP_WRITES_DISABLED when writes are off, and still refuses non-headless, wrong-path, or Dysflow-owned processes. ${MCP_TOOL_CONTRACTS.access_force_cleanup_orphaned.summary}`,
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
    // Round-12 (#976) — `clean_stale_markers`. User-callable companion
    // to the #967 auto-cleanup. Same write-class as `access_force_cleanup_orphaned`
    // (conditional-write, dry-run safe by default, apply requires
    // `confirm: true`). Does NOT participate in `MCP_TOOL_ROUTES` /
    // dispatch-factory because the cleanup itself is filesystem-local
    // and the access context is resolved directly via the resolver.
    {
      name: "clean_stale_markers",
      description: `Sweep <projectRoot>/.dysflow/runtime/markers/ and either plan or apply transitions of stale \`status: "running"\` markers (and, when keepFailed is false, stale \`status: "failed"\` markers) to \`status: "abandoned"\`. Dry-run is the default; any apply call requires \`options.confirm: true\` and is write-gated (returns MCP_WRITES_DISABLED when writes are off). ${MCP_TOOL_CONTRACTS.clean_stale_markers.summary}`,
      inputSchema: CLEAN_STALE_MARKERS_SCHEMA,
      handler: async (input) =>
        handleMcpCleanStaleMarkers(
          input,
          CLEAN_STALE_MARKERS_SCHEMA,
          services,
          writesEnabled,
          writeAccessResolver,
          accessContextResolver,
        ),
    },
    // PR-1 (issue #656) — gate-introspection read-only tool. Returns the
    // aggregated `McpCapabilitySnapshot` for the live MCP adapter. The tool
    // is registered in `MODERN_TOOL_NAMES` above and surfaces its contract
    // summary through `MCP_TOOL_CONTRACTS.get_capabilities` (added in
    // `mcp-tool-contracts.ts`). It is intentionally read-only — it never
    // touches Access, never spawns PowerShell, and is never write-gated.
    createGetCapabilitiesTool({
      writesEnabled,
      writeAccessResolver,
      allowedProcedures,
      projectId,
      allowWrites: writesAllowedForCapabilities,
      accessDbPath,
      writeExecutionPolicy,
      projectConfigResolver:
        projectConfigResolver === undefined ? undefined : () => projectConfigResolver({}),
      // Issue #940 — forward the documentation bundle resolver so the
      // snapshot reports the live on-disk verdict for the runtime docs.
      documentationBundleResolver,
    }),
    // issue #701 — read-only VBA procedure introspection
    {
      name: "list_procedures",
      description: `List VBA procedures in a module with optional name filter. Pass source directly or omit to resolve via the project's source root (source root resolution requires Access context). Returns procedure catalog entries with name, kind, visibility, and declaration line. Read-only. ${MCP_TOOL_CONTRACTS.list_procedures.summary}`,
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
      name: "get_procedure",
      description: `Retrieve a single VBA procedure's declaration line, end line, and body text. Pass source directly or omit to resolve via the project's source root (source root resolution requires Access context). Returns module, procedure name, startLine, endLine, and verbatim body. Read-only. ${MCP_TOOL_CONTRACTS.get_procedure.summary}`,
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
      name: "find_references",
      description: `Find all references to a given symbol. Scope: module, binary, source, or all (default). Returns symbol, scope, references array, totalCount, truncated (boolean), and nextOffset (number | null). Issue #1019 — supports pagination via \`limit\` (default 500, max 1000) and \`offset\` (default 0) to avoid MCP -32001 timeouts on popular symbols. ${MCP_TOOL_CONTRACTS.find_references.summary}`,
      inputSchema: FIND_REFERENCES_SCHEMA,
      handler: async (input) => {
        const validation = validateInput(input, FIND_REFERENCES_SCHEMA);
        if (validation !== undefined) return invalidInput(validation);

        const params = input as Record<string, unknown>;
        const symbol = params.symbol as string;
        const scope = (params.scope ?? "all") as "module" | "binary" | "source" | "all";
        const moduleConstraint = params.module as string | undefined;
        // Issue #1019 — caller-supplied pagination. Both are optional in the
        // schema; the walker applies sane defaults (limit=500, offset=0).
        const pagination = {
          limit: typeof params.limit === "number" ? params.limit : undefined,
          offset: typeof params.offset === "number" ? params.offset : undefined,
        };

        if (params.modules !== undefined) {
          const result = findVbaReferences(
            params.modules as Record<string, string>,
            symbol,
            scope,
            moduleConstraint,
            pagination,
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
                    // The export targets a disposable directory and must materialize files for
                    // the binary walker; a plan-only export yields phantom source-only drift.
                    apply: true,
                  });

                  if (!exportResult.ok) {
                    const message = `Binary reference export failed: ${exportResult.error.message}`;
                    return {
                      content: [
                        {
                          type: "text",
                          text: `BINARY_INSPECTION_UNAVAILABLE: ${message}`,
                        },
                      ],
                      isError: true,
                      ok: false,
                      error: {
                        code: "BINARY_INSPECTION_UNAVAILABLE",
                        message,
                        errorCode: "BINARY_INSPECTION_UNAVAILABLE",
                        errorMessage: message,
                      },
                    };
                  }

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
                } finally {
                  await rm(tempRoot, { recursive: true, force: true });
                }
              }
            }
          }
        }

        // Search in the resolved modules
        const searchModules = scope === "binary" ? binaryModules : sourceModules;
        const result = findVbaReferences(
          searchModules,
          symbol,
          scope,
          moduleConstraint,
          pagination,
        );
        if (result === undefined) {
          return {
            content: [{ type: "text", text: `SYMBOL_NOT_FOUND: Symbol '${symbol}' not found.` }],
            isError: true,
            ok: false,
          };
        }

        if (scope === "all") {
          // Issue #1019 — apply the same pagination to the binary walker so
          // the diff computation stays within the same page. The diff is
          // approximate for popular symbols past page 1; the consumer
          // paginates to drain the rest.
          const binaryResult = findVbaReferences(
            binaryModules,
            symbol,
            "binary",
            moduleConstraint,
            pagination,
          );
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
      name: "detect_dead_code",
      description: `Find VBA procedures and module-level declarations defined but never referenced. Pure string-in / string-out analysis over the supplied \`modules\` map; never opens Access, never spawns PowerShell, never mutates the filesystem. Sibling of \`find_references\` (#701). ${MCP_TOOL_CONTRACTS.detect_dead_code.summary}`,
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
      name: "validate_manifest",
      description: `Validate a VBA test manifest before running test_vba. Checks manifest parseability, procedure existence in the resolved source modules, argument count/type compatibility, and tag shape. Read-only. ${MCP_TOOL_CONTRACTS.validate_manifest.summary}`,
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
      name: "lint_module",
      description: `Lint one VBA .bas/.cls module before import. Pass inline source or omit it to resolve the module from the configured project source root. Rules cover Access Option declarations, identifier safety, declaration ordering, conservative literal argument type checks, and the F22 forbidden-name rule (flags identifiers that shadow VBA / Access / DAO globals such as Err, Date, Name, Form, DoCmd — case-insensitive — on Dim/Const/Type/Enum/Sub/Function/Property/parameter declarations, with a project-convention recommendation). The cross-form openargs-contract-mismatch rule (#1006) is a project-lint that pairs DoCmd.OpenForm producer sites against Me.OpenArgs consumers across the configured project's .cls tree and is dispatched when its rule id appears in the input rules list. Read-only. ${MCP_TOOL_CONTRACTS.lint_module.summary}`,
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

        // #1006 slice 2 — the rule list mixes module-lint rules with the
        // project-lint rule `openargs-contract-mismatch`. The two engines
        // have disjoint scopes (per-module vs cross-form project walk), so
        // we split the input into the two sublists before dispatching.
        const rulesArray = Array.isArray(params.rules) ? (params.rules as string[]) : undefined;
        const projectLintRequested = rulesArray?.includes("openargs-contract-mismatch") ?? false;
        const moduleLintRules = rulesArray
          ? rulesArray.filter((r): r is VbaModuleLintRule => r !== "openargs-contract-mismatch")
          : undefined;
        // #731 — wire projectRoot + lint override + legacy auto-detection.
        // The detector walks the project's `src/` tree once per call and
        // returns `true` when any non-ASCII identifier is present; that
        // legacy signal downgrades `identifier-safety` to `warning`. The
        // marker file `.dysflow-no-auto-allow` opts out of the downgrade.
        const projectContext = await accessContextResolver(input);
        const projectRoot = projectContext.ok ? projectContext.data.projectRoot : undefined;
        const destinationRoot = projectContext.ok ? projectContext.data.destinationRoot : undefined;
        const detection = projectRoot
          ? (): boolean => projectHasLegacyNonAsciiIdentifier(projectRoot)
          : undefined;
        // Issue #789 — read the project-level `lintIdentifierSafetyStrict`
        // opt-in from the resolved DysflowConfig. The startup wiring in
        // `stdio.ts` plumbs it through `CreateDysflowMcpToolsOptions`
        // and the closure captures it here. Default is `false` (warning
        // for non-ASCII); projects that need the strict (error) check
        // set `capabilities.lint.identifierSafety.strictNonAscii: true`
        // in `.dysflow/project.json`.
        const classModules = destinationRoot ? getProjectClassModules(destinationRoot) : undefined;
        const report = await lintVbaModule({
          module,
          source: resolvedSource,
          rules: moduleLintRules,
          projectRoot,
          lintRulesOverride,
          hasNonAsciiIdentifierInProject: detection,
          strictNonAscii: lintIdentifierSafetyStrict,
          classModules,
        });

        // #1006 slice 2 — when the caller asked for the project-lint rule,
        // gather every .cls file under the resolved destinationRoot and run
        // `lintVbaProjectOpenArgs`. The diagnostics are translated into the
        // existing `VbaModuleLintDiagnostic` shape so they slot into the
        // report's per-rule key and `flatDiagnostics` array without breaking
        // the existing envelope contract. The dispatch is best-effort: when
        // no `.cls` files are enumerable (no destinationRoot, no source
        // tree on disk), the project-lint engine returns a clean report and
        // the merged response reflects that.
        let projectDiagnostics: VbaModuleLintDiagnostic[] = [];
        if (projectLintRequested && destinationRoot !== undefined) {
          const projectSources = await collectProjectClassSources(destinationRoot);
          const projectResult = lintVbaProjectOpenArgs(projectSources);
          projectDiagnostics = projectResult.diagnostics.map(translateOpenArgsDiagnostic);
        }

        const reportEnvelope = mergeLintReports(report, projectDiagnostics, projectLintRequested);
        return {
          content: [{ type: "text", text: JSON.stringify(reportEnvelope) }],
          isError: false,
          ok: true,
        };
      },
    },
    // Round-3 Item 1 — project config re-resolution companion tool
    createResolveProjectTool({ cwd }),
    // Issue #971 — runtime contract discovery. Read-only tool that
    // surfaces the documented schema for every advertised MCP tool. Pure
    // catalog: never opens Access, never spawns PowerShell, never mutates
    // state. Pairs with get_capabilities (live state) and resolve_project
    // (project resolution).
    createSchemaTool(),
    // Issue #965 — `dysflow.diagnose` aggregates projectConfig + filesystem
    // + runtime health in a single call, replacing the 4-5 round-trip
    // pattern AI consumers hit today. Read-only by construction: never
    // opens Access, never spawns PowerShell, never writes to disk. The
    // snapshot is captured from the same options the `get_capabilities`
    // tool consults, so `runtime.dysflowVersion` and
    // `runtime.writeExecutionPolicy` agree by construction.
    createDiagnoseTool({
      cwd,
      snapshot: {
        adapterVersion: readAdapterVersion(),
        writeExecutionPolicy: writeExecutionPolicy ?? "safe-by-default",
      },
    }),
    // Issue #978 — runtime operational state. Read-only tool that
    // surfaces `{ operations, markers, locks, counters }` aggregated
    // over the access operation registry + `.dysflow/runtime/markers/`.
    // Never opens Access, never spawns PowerShell, never mutates state.
    // Pairs with `diagnose` (health), `logs` (event timeline),
    // `resolve_project` (config).
    createStateTool({
      cwd,
      registry: resolveAccessOperationRegistry(services.operationRegistry),
    }),
    // Issue #973 — AI-aware log access. Pure read-only surface over
    // <cwd>/.dysflow/runtime/. Reads operations.json + markers/*.json,
    // maps to LogEntry[], applies filters/ordering/pagination, and
    // returns { entries, totalCount, truncated }. Never opens Access,
    // never spawns PowerShell, never mutates state. Pairs with
    // get_capabilities (live state) and schema (static contract catalog).
    createLogsTool({ cwd }),
  ];

  const registered = registerMcpTools(
    currentTools,
    services,
    writesEnabled,
    writeAccessResolver,
    env,
    allowedProcedures,
    // Issue #785 (v2.1.1) — forward the resolved write-execution policy
    // through to the dispatch factory. `writeExecutionPolicy` was already
    // destructured at the top of this function (line 505) for the
    // capabilities snapshot; this just widens the seam so the dispatch
    // tools also consult the same resolved value.
    writeExecutionPolicy,
    // Issue #785 (v2.1.1, capa 4) — forward the MCP access-context resolver
    // (already constructed above) so the export-source guard can read the
    // project's active source root before forwarding to vbaSyncToolService.
    accessContextResolver,
  );
  if (projectConfigResolver === undefined) return registered;
  return registered.map((tool) => {
    const contract = MCP_TOOL_CONTRACTS[tool.name as keyof typeof MCP_TOOL_CONTRACTS];
    if (contract === undefined || contract.access === "read-only") return tool;
    // Issue #968 — read `mutatesBinary` from the dispatch route table once
    // per tool so `projectConfigResolver → diagnoseProjectConfig` can decide
    // whether the caller's `allowExternalAccessPath` opt-in should bypass
    // the `OUTSIDE_PROJECT_ROOT` verdict for read-only-side tools. The route
    // table remains the single source of truth — adding a new tool is a
    // single entry.
    const route = MCP_TOOL_ROUTES[tool.name as keyof typeof MCP_TOOL_ROUTES];
    const routeMutatesBinary = route?.kind === "vba-sync" ? route.mutatesBinary : undefined;
    return {
      ...tool,
      handler: async (input, context) => {
        // Issue #977 — dryRunWithPreflight intercept. Mutually exclusive
        // with `dryRun` (set when both flags present → MCP_INPUT_INVALID)
        // and applied BEFORE the standard requestRequiresWriteReady path.
        // When preflight is requested, we run the same pre-flight gates as
        // apply:true WITHOUT performing the write, regardless of whether
        // the caller also passed `apply:true`. The preflight return shape:
        //   - failed: projectConfigNotWriteReady (same errorCode path as
        //     apply:true would have).
        //   - succeeded: {ok:true, preflight:{passed:true, checks:[...]},
        //     dryRun:true} WITHOUT invoking the underlying handler.
        const inputRecord =
          typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
        const dryRunWithPreflightRequested = inputRecord.dryRunWithPreflight === true;
        if (dryRunWithPreflightRequested) {
          // Mutual exclusivity: dryRunWithPreflight + dryRun → MCP_INPUT_INVALID.
          // dryRunWithPreflight + apply is also mutually exclusive, BUT in
          // that case apply wins on the existing dispatch seam (per
          // #977 acceptance criterion "apply takes precedence on the
          // existing path" — keep that legacy behavior).
          if (inputRecord.dryRun === true) {
            return invalidInput(
              "dryRunWithPreflight is mutually exclusive with dryRun. Pass only one of the two.",
              "Pass dryRunWithPreflight:true to validate the project's readiness without writing, or dryRun:true to plan the write without preflight. They cannot be combined.",
              { rejectedFlag: "dryRunWithPreflight", toolName: tool.name },
            );
          }
          // apply:true + dryRunWithPreflight:true — apply wins, legacy behavior.
          // Forward to the underlying handler unchanged; the preflight
          // effectively becomes a no-op when apply is set.
          if (inputRecord.apply === true) return tool.handler(input, context);
          // Pure preflight — run the standard projectConfigResolver gate
          // even when this is normally a "dryRun-able" tool path. We must
          // NOT consult requestRequiresWriteReady with the original input
          // (it would resolve to false for a payload without apply/dryRun
          // and bypass the gate). Force the gate by appending
          // apply:true behind the scenes for the gate check, but never
          // forward that synthetic apply to the handler.
          const diagnostic = await projectConfigResolver({
            ...inputRecord,
            operation: tool.name,
            ...(routeMutatesBinary !== undefined ? { mutatesBinary: routeMutatesBinary } : {}),
          });
          if (!diagnostic.writeReady) return projectConfigNotWriteReady(tool.name, diagnostic);
          // Preflight passed — return the typed envelope WITHOUT
          // invoking the underlying handler. Preserve the standard
          // JSON-stringified `{ok:true, dryRun:true, preflight:{...}}`
          // shape so a regex / JSON consumer can branch on the prefix.
          const summary = {
            passed: true,
            tool: tool.name,
            operation: tool.name,
            projectId: typeof inputRecord.projectId === "string" ? inputRecord.projectId : null,
            checks: [
              {
                code: "WRITE_READY",
                severity: "info",
                message: `Project config is write-ready for ${tool.name}; apply:true is expected to succeed (modulo races).`,
                passed: true,
              },
              {
                code: "ACCESS_PATH_RESOLVED",
                severity: "info",
                message: `accessPath ${diagnostic.accessPath ?? "<unset>"} is resolved.`,
                passed: diagnostic.accessPath !== null,
                value: diagnostic.accessPath,
              },
              {
                code: "DESTINATION_ROOT_RESOLVED",
                severity: "info",
                message: `destinationRoot ${diagnostic.destinationRoot ?? "<unset>"} is resolved.`,
                passed: diagnostic.destinationRoot !== null,
                value: diagnostic.destinationRoot,
              },
              {
                code: "CAPABILITIES_ALLOW_WRITE",
                severity: "info",
                message: `Capabilities allow writes.`,
                passed: writesAllowedForCapabilities === true,
                value: { allowWrites: writesAllowedForCapabilities === true },
              },
              {
                code: "WRITE_EXECUTION_POLICY",
                severity: "info",
                message: `Effective write execution policy: ${writeExecutionPolicy ?? "safe-by-default"}.`,
                passed: true,
                value: { policy: writeExecutionPolicy ?? "safe-by-default" },
              },
            ],
          };
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  ok: true,
                  dryRun: true,
                  dryRunWithPreflight: true,
                  preflight: summary,
                }),
              },
            ],
            isError: false,
            ok: true,
          };
        }
        if (
          !(await requestRequiresWriteReady(
            tool.name,
            contract.access,
            input,
            writeExecutionPolicy,
          ))
        )
          return tool.handler(input, context);
        const diagnostic = await projectConfigResolver({
          ...inputRecord,
          operation: tool.name,
          // Issue #968 — forward `mutatesBinary` from the dispatch route so
          // the diagnostic honors `allowExternalAccessPath` for read-only-side
          // tools and ignores it for binary writers. See
          // `src/adapters/mcp/dispatch-routes.ts` for the source-of-truth.
          ...(routeMutatesBinary !== undefined ? { mutatesBinary: routeMutatesBinary } : {}),
        });
        if (!diagnostic.writeReady) return projectConfigNotWriteReady(tool.name, diagnostic);
        return tool.handler(input, context);
      },
    };
  });
}
