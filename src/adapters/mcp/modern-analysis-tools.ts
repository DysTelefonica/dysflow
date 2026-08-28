import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
} from "../../core/contracts/index.js";
import {
  lintVbaModule,
  type VbaModuleLintDiagnostic,
  type VbaModuleLintReport,
  type VbaModuleLintRule,
} from "../../core/services/vba-module-lint-service.js";
import { parseProcedureName } from "../../core/services/vba-procedure-name-parser.js";
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
import { extractVbName } from "../../core/services/vba-semantic-classifier.js";
import { validateVbaTestManifest } from "../../core/services/vba-test-manifest-service.js";
import {
  type AllowedProcedures,
  resolveAllowedProceduresFor,
} from "./allowed-procedures-resolver.js";
import {
  detectDeadCodeResultContract,
  findReferencesResultContract,
  getProcedureResultContract,
  lintModuleResultContract,
  listProceduresResultContract,
  validateManifestResultContract,
} from "./contracts/remaining-result-contracts.js";
import { enrichmentForValidationMessage, invalidInput } from "./dispatch-common.js";
import { MCP_TOOL_CONTRACTS } from "./mcp-tool-contracts.js";
import {
  type DysflowMcpServices,
  type DysflowMcpTool,
  type McpAccessContextResolver,
  type McpToolResult,
  translateCoreResultToMcpContent,
} from "./result-translation.js";
import {
  DETECT_DEAD_CODE_SCHEMA,
  FIND_REFERENCES_SCHEMA,
  GET_PROCEDURE_SCHEMA,
  type JsonObjectSchema,
  LINT_MODULE_SCHEMA,
  LIST_PROCEDURES_SCHEMA,
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

type ProcedureSourceResolution =
  | { ok: true; source: string | undefined }
  | { ok: false; response: McpToolResult };

type BinaryModulesResolution =
  | { ok: true; modules: readonly Record<string, unknown>[] }
  | { ok: false; response: McpToolResult };

/** Inspect an explicitly opted-in Access binary through the existing read-only port. */
async function inspectBinaryModules(
  input: unknown,
  services: DysflowMcpServices,
  namePattern?: string,
): Promise<BinaryModulesResolution> {
  const params =
    typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const accessPath = typeof params.accessPath === "string" ? params.accessPath.trim() : "";
  if (params.allowExternalAccessPath !== true) {
    return {
      ok: false,
      response: invalidInput(
        "Binary inspection requires allowExternalAccessPath:true. The opt-in is scoped to this read-only inspection.",
      ),
    };
  }
  if (accessPath.length === 0) {
    return {
      ok: false,
      response: invalidInput("Binary inspection requires an explicit accessPath."),
    };
  }
  if (!/\.(?:accdb|mdb)$/i.test(accessPath)) {
    return {
      ok: false,
      response: invalidInput("Binary inspection accessPath must end in .accdb or .mdb."),
    };
  }
  if (services.vbaSyncToolService === undefined) {
    return {
      ok: false,
      response: {
        content: [
          { type: "text", text: "SERVICE_UNAVAILABLE: vbaSyncToolService is not configured." },
        ],
        isError: true,
        ok: false,
      },
    };
  }

  const inspectionInput: Record<string, unknown> = {
    accessPath,
    allowExternalAccessPath: true,
    includeSource: true,
    ...(namePattern === undefined ? {} : { namePattern }),
  };
  for (const key of [
    "projectId",
    "contextId",
    "backendPath",
    "projectRoot",
    "strictContext",
    "expectedAccessPath",
    "expectedProjectRoot",
    "expectedDestinationRoot",
    "timeoutMs",
    "cwd",
  ]) {
    if (params[key] !== undefined) inspectionInput[key] = params[key];
  }

  const inspected = await services.vbaSyncToolService.execute("list_vba_modules", inspectionInput);
  if (!inspected.ok) {
    return { ok: false, response: translateCoreResultToMcpContent(inspected) };
  }

  const modules = (inspected.data as { modules?: readonly Record<string, unknown>[] }).modules;
  if (!Array.isArray(modules)) {
    return {
      ok: false,
      response: {
        content: [
          {
            type: "text",
            text: "BINARY_INSPECTION_UNAVAILABLE: list_vba_modules returned no modules array.",
          },
        ],
        isError: true,
        ok: false,
      },
    };
  }
  return { ok: true, modules };
}

/** Resolve inline, project-source, or explicitly opted-in binary module code. */
async function resolveProcedureSource(
  input: unknown,
  moduleName: string,
  source: string | undefined,
  destinationRoot: string | undefined,
  accessContextResolver: McpAccessContextResolver,
  services: DysflowMcpServices,
): Promise<ProcedureSourceResolution> {
  if (source !== "binary") {
    return {
      ok: true,
      source: await resolveVbaSourceFile(
        input,
        moduleName,
        source,
        destinationRoot,
        accessContextResolver,
      ),
    };
  }

  const inspected = await inspectBinaryModules(input, services, moduleName);
  if (!inspected.ok) return inspected;
  const modules = inspected.modules;
  const match = modules.find(
    (candidate) =>
      candidate.binaryExists === true &&
      typeof candidate.name === "string" &&
      candidate.name.toLowerCase() === moduleName.toLowerCase(),
  );
  if (match === undefined) return { ok: true, source: undefined };
  if (typeof match.binarySource !== "string") {
    return {
      ok: false,
      response: {
        content: [
          {
            type: "text",
            text: `BINARY_INSPECTION_UNAVAILABLE: Module '${moduleName}' returned no binary source.`,
          },
        ],
        isError: true,
        ok: false,
      },
    };
  }
  return { ok: true, source: match.binarySource };
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

export type CreateModernAnalysisToolsOptions = {
  services: DysflowMcpServices;
  allowedProcedures?: AllowedProcedures;
  accessContextResolver: McpAccessContextResolver;
  lintRulesOverride: Readonly<
    Partial<Record<VbaModuleLintRule, { enabled: boolean; reason?: string }>>
  >;
  lintIdentifierSafetyStrict: boolean;
};

function moduleMismatch(module: string, sourceModule: string): McpToolResult {
  const message = `Module '${module}' does not match source VB_Name '${sourceModule}'.`;
  return {
    content: [{ type: "text", text: `MODULE_MISMATCH: ${message}` }],
    isError: true,
    ok: false,
    error: {
      code: "MODULE_MISMATCH",
      message,
      details: { module, sourceModule },
      remediation:
        "Pass the source's VB_Name in module, or provide source for the requested module.",
    },
  };
}

/** Build the cohesive read-only VBA source-analysis tool family. */
/**
 * Issue #1668 — a schema rejection in this family used to reach the consumer
 * as a bare `MCP_INPUT_INVALID` string, so `lint_module({ moduleName })` said
 * only "module is required." with no structured `missingParam` / `rejectedFlag`
 * to act on. Route every rejection through the shared enrichment so the
 * envelope names the field at fault, exactly as the dispatch-gated tools do.
 */
function rejectInvalidInput(validation: string, toolName: string, schema: JsonObjectSchema) {
  const enrichment = enrichmentForValidationMessage(validation, toolName, schema);
  return enrichment === undefined
    ? invalidInput(validation)
    : invalidInput(validation, undefined, enrichment);
}

export function createModernAnalysisTools(
  options: CreateModernAnalysisToolsOptions,
): DysflowMcpTool[] {
  const {
    services,
    allowedProcedures,
    accessContextResolver,
    lintRulesOverride,
    lintIdentifierSafetyStrict,
  } = options;

  return [
    // issue #701 — read-only VBA procedure introspection
    {
      name: "list_procedures",
      description: `List VBA procedures in a module with optional name filter. Pass source directly, use source:"binary" with accessPath and allowExternalAccessPath:true for direct read-only binary inspection, or omit source to resolve via the project's source root. Returns procedure catalog entries with name, kind, visibility, and declaration line. Read-only. ${MCP_TOOL_CONTRACTS.list_procedures.summary}`,
      inputSchema: LIST_PROCEDURES_SCHEMA,
      resultContract: listProceduresResultContract,
      handler: async (input) => {
        const validation = validateInput(input, LIST_PROCEDURES_SCHEMA);
        if (validation !== undefined)
          return rejectInvalidInput(validation, "list_procedures", LIST_PROCEDURES_SCHEMA);
        const { module, filter, kind, source, destinationRoot } = input as {
          module: string;
          filter?: string;
          kind?: "Sub" | "Function" | "Property" | "both";
          source?: string;
          destinationRoot?: string;
        };
        const sourceResolution = await resolveProcedureSource(
          input,
          module,
          source,
          destinationRoot,
          accessContextResolver,
          services,
        );
        if (!sourceResolution.ok) return sourceResolution.response;
        const resolvedSource = sourceResolution.source;
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
        const sourceModule = extractVbName(resolvedSource);
        if (sourceModule !== null && sourceModule.toLowerCase() !== module.toLowerCase()) {
          return moduleMismatch(module, sourceModule);
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
      description: `Retrieve a single VBA procedure's declaration line, end line, and body text. Pass source directly, use source:"binary" with accessPath and allowExternalAccessPath:true for direct read-only binary inspection, or omit source to resolve via the project's source root. Returns module, procedure name, startLine, endLine, and verbatim body. Read-only. ${MCP_TOOL_CONTRACTS.get_procedure.summary}`,
      inputSchema: GET_PROCEDURE_SCHEMA,
      resultContract: getProcedureResultContract,
      handler: async (input) => {
        const validation = validateInput(input, GET_PROCEDURE_SCHEMA);
        if (validation !== undefined)
          return rejectInvalidInput(validation, "get_procedure", GET_PROCEDURE_SCHEMA);
        const { module, procedure, source, destinationRoot } = input as {
          module: string;
          procedure: string;
          source?: string;
          destinationRoot?: string;
        };
        const parsedProcedure = parseProcedureName(procedure);
        if (!parsedProcedure.ok) {
          return invalidInput(
            `${parsedProcedure.message} Split the value into module + procedure fields.`,
          );
        }
        if (
          parsedProcedure.moduleName.length > 0 &&
          parsedProcedure.moduleName.toLowerCase() !== module.toLowerCase()
        ) {
          return moduleMismatch(module, parsedProcedure.moduleName);
        }
        const sourceResolution = await resolveProcedureSource(
          input,
          module,
          source,
          destinationRoot,
          accessContextResolver,
          services,
        );
        if (!sourceResolution.ok) return sourceResolution.response;
        const resolvedSource = sourceResolution.source;
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
        const sourceModule = extractVbName(resolvedSource);
        if (sourceModule !== null && sourceModule.toLowerCase() !== module.toLowerCase()) {
          return moduleMismatch(module, sourceModule);
        }
        const detail = getVbaProcedure(resolvedSource, parsedProcedure.procName);
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
      resultContract: findReferencesResultContract,
      handler: async (input) => {
        const validation = validateInput(input, FIND_REFERENCES_SCHEMA);
        if (validation !== undefined)
          return rejectInvalidInput(validation, "find_references", FIND_REFERENCES_SCHEMA);

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
                let binaryInspectionFailure: McpToolResult | undefined;
                if (services.vbaSyncToolService === undefined) {
                  binaryInspectionFailure = {
                    content: [
                      {
                        type: "text",
                        text: `SERVICE_UNAVAILABLE: vbaSyncToolService is not configured.`,
                      },
                    ],
                    isError: true,
                    ok: false,
                  };
                } else {
                  // #1019 follow-up — a full export performs SaveAsText for every form/report,
                  // writes a disposable source tree, then reads it back before scanning. That
                  // path exceeded the 30 s MCP transport budget even for a five-result page.
                  // list_vba_modules' internal includeSource mode reads every live
                  // VBComponent.CodeModule in one password-aware Access session instead. It is
                  // still a complete binary-corpus scan, so real source/binary drift remains
                  // visible; only the irrelevant layout/filesystem export is removed.
                  const inspectionResult = await services.vbaSyncToolService.execute(
                    "list_vba_modules",
                    { ...params, includeSource: true },
                  );

                  if (!inspectionResult.ok) {
                    const message = `Binary reference scan failed: ${inspectionResult.error.message}`;
                    binaryInspectionFailure = {
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
                  } else {
                    const inspectedModules = (
                      inspectionResult.data as {
                        modules?: readonly {
                          name?: unknown;
                          binaryExists?: unknown;
                          binarySource?: unknown;
                        }[];
                      }
                    ).modules;
                    if (!Array.isArray(inspectedModules)) {
                      const message = "Binary reference scan returned no modules array.";
                      binaryInspectionFailure = {
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
                    } else {
                      for (const module of inspectedModules) {
                        if (
                          module.binaryExists === true &&
                          typeof module.name === "string" &&
                          typeof module.binarySource === "string"
                        ) {
                          binaryModules[module.name] = module.binarySource;
                        }
                      }
                    }
                  }
                }
                if (binaryInspectionFailure !== undefined) return binaryInspectionFailure;
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
    // issue #705 — read-only dead-code analysis. Inline `modules` stay pure;
    // #1542 additionally permits explicit external-binary inspection through
    // the list_vba_modules port before the same pure core analysis runs.
    {
      name: "detect_dead_code",
      description: `Find VBA procedures and module-level declarations defined but never referenced. Inline \`modules\` analysis is process-free; scope \`binary\` can inspect an explicit Access binary read-only with \`allowExternalAccessPath:true\`. Never mutates the filesystem. Sibling of \`find_references\` (#701). ${MCP_TOOL_CONTRACTS.detect_dead_code.summary}`,
      inputSchema: DETECT_DEAD_CODE_SCHEMA,
      resultContract: detectDeadCodeResultContract,
      handler: async (input) => {
        const validation = validateInput(input, DETECT_DEAD_CODE_SCHEMA);
        if (validation !== undefined)
          return rejectInvalidInput(validation, "detect_dead_code", DETECT_DEAD_CODE_SCHEMA);

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

        if (
          modules === undefined &&
          scope === "binary" &&
          params.allowExternalAccessPath === true
        ) {
          const inspected = await inspectBinaryModules(input, services);
          if (!inspected.ok) return inspected.response;

          modules = {};
          for (const candidate of inspected.modules) {
            if (
              candidate.binaryExists === true &&
              typeof candidate.name === "string" &&
              typeof candidate.binarySource === "string"
            ) {
              modules[candidate.name] = candidate.binarySource;
            }
          }
          if (Object.keys(modules).length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: "BINARY_INSPECTION_UNAVAILABLE: list_vba_modules returned no readable binary module source.",
                },
              ],
              isError: true,
              ok: false,
            };
          }
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
      description: `Validate a VBA test manifest before running test_vba. Checks manifest parseability, procedure existence in the resolved source modules, argument count/type compatibility, and tag shape. Read-only. Issue #1046 (Bug D): pass validateManifestIncludesAllowlistCheck:true to also surface allowlist drift as invalid[] entries — keeps the legacy shape untouched when the flag is absent. ${MCP_TOOL_CONTRACTS.validate_manifest.summary}`,
      inputSchema: VALIDATE_MANIFEST_SCHEMA,
      resultContract: validateManifestResultContract,
      handler: async (input) => {
        const validation = validateInput(input, VALIDATE_MANIFEST_SCHEMA);
        if (validation !== undefined)
          return rejectInvalidInput(validation, "validate_manifest", VALIDATE_MANIFEST_SCHEMA);

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

        // Issue #1046 (Bug D) — opt-in allowlist coherence. When the caller
        // passes `validateManifestIncludesAllowlistCheck: true`, resolve the
        // active allowlist (per-input via the same resolver the test_vba
        // gate uses) and forward it to `validateVbaTestManifest` so drift
        // is reported on `report.invalid[]`. The legacy path (flag absent)
        // is byte-identical to pre-fix consumers.
        const includeAllowlistCheck = params.validateManifestIncludesAllowlistCheck === true;
        let allowlistForReport: readonly string[] | undefined;
        if (includeAllowlistCheck) {
          const resolved = await resolveAllowedProceduresFor(allowedProcedures, input);
          allowlistForReport = Array.isArray(resolved) ? resolved : undefined;
        }

        const report = validateVbaTestManifest(manifestResult.data, modules, {
          includeAllowlistCheck,
          allowedProcedures: allowlistForReport,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(report) }],
          isError: !report.valid,
          ok: report.valid,
        };
      },
    },
    {
      name: "lint_module",
      description: `Lint one VBA .bas/.cls module before import. Pass inline source, omit it to resolve managed source, or use \`source:"binary"\` with the explicit external-path opt-in. Rules cover Access Option declarations, identifier safety, declaration ordering, conservative literal argument type checks, and the F22 forbidden-name rule (flags identifiers that shadow VBA / Access / DAO globals such as Err, Date, Name, Form, DoCmd — case-insensitive — on Dim/Const/Type/Enum/Sub/Function/Property/parameter declarations, with a project-convention recommendation). The cross-form openargs-contract-mismatch rule (#1006) is a project-lint that pairs DoCmd.OpenForm producer sites against Me.OpenArgs consumers across the configured project's .cls tree and is dispatched when its rule id appears in the input rules list. Read-only. ${MCP_TOOL_CONTRACTS.lint_module.summary}`,
      inputSchema: LINT_MODULE_SCHEMA,
      resultContract: lintModuleResultContract,
      handler: async (input) => {
        const validation = validateInput(input, LINT_MODULE_SCHEMA);
        if (validation !== undefined)
          return rejectInvalidInput(validation, "lint_module", LINT_MODULE_SCHEMA);

        const params = input as Record<string, unknown>;
        const module = params.module as string;
        const sourceResolution = await resolveProcedureSource(
          input,
          module,
          params.source as string | undefined,
          params.destinationRoot as string | undefined,
          accessContextResolver,
          services,
        );
        if (!sourceResolution.ok) return sourceResolution.response;
        const resolvedSource = sourceResolution.source;
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
  ];
}
