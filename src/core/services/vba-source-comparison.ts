import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, parse, relative, resolve } from "node:path";
import {
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
} from "../contracts/index.js";
import {
  type AccessOperationPreflightCleanupResult,
  diagnosticsFromPreflightCleanup,
} from "../operations/access-operation-preflight.js";
import { sanitizeSecrets, truthy } from "../utils/index.js";

export type VbaSourceComparisonFile = {
  moduleName: string;
  fileType: string;
  path: string;
  relativePath: string;
};

export type VbaSourceComparisonEntry = {
  moduleName: string;
  fileType: string;
  sourcePath?: string;
  binaryPath?: string;
};

export type VbaSourceDiffEntry = VbaSourceComparisonEntry & {
  sourceSnippet: string;
  binarySnippet: string;
};

export type VbaVerifyResult = {
  operation: "verify_code" | "verify_binary";
  ok: boolean;
  dryRun: true;
  willModifyAccess: false;
  sourceRoot: string;
  matched: readonly VbaSourceComparisonEntry[];
  different: readonly VbaSourceComparisonEntry[];
  missingInSource: readonly VbaSourceComparisonEntry[];
  missingInBinary: readonly VbaSourceComparisonEntry[];
  diffs?: readonly VbaSourceDiffEntry[];
};

export type VbaReconcilePlanResult = Omit<VbaVerifyResult, "operation"> & {
  operation: "reconcile_binary";
  recommendation: string;
};

export type VbaExecutionTarget = {
  accessPath?: string;
  destinationRoot: string;
  projectRoot?: string;
  processTimeoutMs: number;
};

export type VbaExecutionRequest = {
  scriptPath: string;
  action: string;
  accessPath?: string;
  destinationRoot: string;
  moduleNames: readonly string[];
  password?: string;
  json: boolean;
  extra: Record<string, string | boolean | number | undefined>;
  timeoutMs: number;
  env?: Record<string, string | undefined>;
};

export type VbaExecutionResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
};

export type VbaComparisonContext = {
  scriptPath: string;
  accessPassword?: string;
  resolveExecutionTarget(
    params: Record<string, unknown>,
  ): Promise<OperationResult<VbaExecutionTarget>>;
  validateStrictContext(
    params: Record<string, unknown>,
    target: VbaExecutionTarget,
  ): OperationResult<undefined>;
  runPreflightCleanup(target: VbaExecutionTarget): Promise<AccessOperationPreflightCleanupResult>;
  executeWithTimeout(request: VbaExecutionRequest): Promise<VbaExecutionResult>;
};

export async function compareSourceAgainstBinary(
  toolName: "verify_code" | "verify_binary",
  params: Record<string, unknown>,
  ctx: VbaComparisonContext,
): Promise<OperationResult<VbaVerifyResult>> {
  const target = await ctx.resolveExecutionTarget(params);
  if (!target.ok) return target as unknown as OperationResult<VbaVerifyResult>;
  const strict = ctx.validateStrictContext(params, target.data);
  if (!strict.ok) return strict as unknown as OperationResult<VbaVerifyResult>;

  const sourceRoot = target.data.destinationRoot;
  const tempExportRoot = await mkdtemp(resolve(tmpdir(), "dysflow-vba-verify-"));
  const password = ctx.accessPassword;
  const effectiveTimeoutMs =
    typeof params.timeoutMs === "number" && params.timeoutMs > 0
      ? params.timeoutMs
      : target.data.processTimeoutMs;
  try {
    const request = {
      scriptPath: ctx.scriptPath,
      action: "Export",
      accessPath: target.data.accessPath,
      destinationRoot: tempExportRoot,
      moduleNames: stringArray(params.moduleNames),
      password,
      json: false,
      extra: {},
      timeoutMs: effectiveTimeoutMs,
      env:
        password === undefined
          ? undefined
          : { DYSFLOW_ACCESS_PASSWORD: password, ACCESS_VBA_PASSWORD: password },
    };

    const preflightDiagnostics = diagnosticsFromPreflightCleanup(
      await ctx.runPreflightCleanup(target.data),
    );
    const result = await ctx.executeWithTimeout(request);
    const secrets = [password].filter((secret): secret is string => Boolean(secret));
    if (result.timedOut) {
      return failureResult(
        createDysflowError(
          "VBA_MANAGER_TIMEOUT",
          `verify export timed out after ${result.durationMs}ms`,
          { retryable: true },
        ),
        { diagnostics: preflightDiagnostics, durationMs: result.durationMs },
      );
    }
    if (result.exitCode !== 0) {
      return failureResult(
        createDysflowError(
          "VBA_MANAGER_FAILED",
          `verify export failed with exit code ${result.exitCode ?? "unknown"}: ${sanitizeSecrets(result.stderr || result.stdout || "No output.", secrets)}`,
        ),
        { diagnostics: preflightDiagnostics, durationMs: result.durationMs },
      );
    }

    const comparison = await compareVbaSourceTrees(
      sourceRoot,
      tempExportRoot,
      stringArray(params.moduleNames),
      truthy(params.diff),
    );
    return successResult(
      { operation: toolName, ...comparison },
      { diagnostics: preflightDiagnostics, durationMs: result.durationMs },
    );
  } finally {
    await rm(tempExportRoot, { recursive: true, force: true });
  }
}

export async function planReconcileBinary(
  params: Record<string, unknown>,
  ctx: VbaComparisonContext,
): Promise<OperationResult<VbaReconcilePlanResult>> {
  const comparison = await compareSourceAgainstBinary("verify_code", params, ctx);
  if (!comparison.ok) return comparison as unknown as OperationResult<VbaReconcilePlanResult>;
  return successResult(
    {
      operation: "reconcile_binary",
      ok: comparison.data.ok,
      dryRun: comparison.data.dryRun,
      willModifyAccess: comparison.data.willModifyAccess,
      sourceRoot: comparison.data.sourceRoot,
      matched: comparison.data.matched,
      different: comparison.data.different,
      missingInSource: comparison.data.missingInSource,
      missingInBinary: comparison.data.missingInBinary,
      diffs: comparison.data.diffs,
      recommendation: comparison.data.ok
        ? "Source and Access binary exports already match; no reconciliation is needed."
        : "Dry-run only: review differences, then run an explicit import/export workflow if you want to reconcile.",
    },
    { diagnostics: comparison.diagnostics, durationMs: comparison.durationMs },
  );
}

export async function compareVbaSourceTrees(
  sourceRoot: string,
  binaryExportRoot: string,
  moduleNames: readonly string[],
  includeDiffs: boolean,
): Promise<Omit<VbaVerifyResult, "operation">> {
  const moduleFilter = new Set(moduleNames.map((name) => name.toLowerCase()));
  const sourceFiles = await collectVbaSourceFiles(sourceRoot, moduleFilter);
  const binaryFiles = await collectVbaSourceFiles(binaryExportRoot, moduleFilter);
  const sourceByKey = new Map(sourceFiles.map((file) => [comparisonKey(file), file]));
  const binaryByKey = new Map(binaryFiles.map((file) => [comparisonKey(file), file]));
  const matched: VbaSourceComparisonEntry[] = [];
  const different: VbaSourceComparisonEntry[] = [];
  const missingInSource: VbaSourceComparisonEntry[] = [];
  const missingInBinary: VbaSourceComparisonEntry[] = [];
  const diffs: VbaSourceDiffEntry[] = [];

  for (const [key, binaryFile] of binaryByKey) {
    const sourceFile = sourceByKey.get(key);
    if (sourceFile === undefined) {
      missingInSource.push(toComparisonEntry(undefined, binaryFile));
      continue;
    }

    const [sourceText, binaryText] = await Promise.all([
      readFile(sourceFile.path, "utf8"),
      readFile(binaryFile.path, "utf8"),
    ]);
    const entry = toComparisonEntry(sourceFile, binaryFile);
    if (sourceText === binaryText) {
      matched.push(entry);
    } else {
      different.push(entry);
      if (includeDiffs) {
        diffs.push({
          ...entry,
          sourceSnippet: firstDifferentLineSnippet(sourceText, binaryText, "source"),
          binarySnippet: firstDifferentLineSnippet(binaryText, sourceText, "binary"),
        });
      }
    }
  }

  for (const [key, sourceFile] of sourceByKey) {
    if (!binaryByKey.has(key)) missingInBinary.push(toComparisonEntry(sourceFile, undefined));
  }

  return {
    ok: different.length === 0 && missingInSource.length === 0 && missingInBinary.length === 0,
    dryRun: true,
    willModifyAccess: false,
    sourceRoot,
    matched: sortComparisonEntries(matched),
    different: sortComparisonEntries(different),
    missingInSource: sortComparisonEntries(missingInSource),
    missingInBinary: sortComparisonEntries(missingInBinary),
    ...(includeDiffs ? { diffs: sortDiffEntries(diffs) } : {}),
  };
}

export async function collectVbaSourceFiles(
  root: string,
  moduleFilter: ReadonlySet<string>,
): Promise<VbaSourceComparisonFile[]> {
  const files: VbaSourceComparisonFile[] = [];
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
        continue;
      }
      if (!entry.isFile()) continue;
      const fileType = vbaSourceFileType(entry.name);
      if (fileType === undefined) continue;
      const moduleName = moduleNameFromVbaFile(entry.name);
      if (moduleFilter.size > 0 && !moduleFilter.has(moduleName.toLowerCase())) continue;
      files.push({
        moduleName,
        fileType,
        path,
        relativePath: relative(root, path).replace(/\\/g, "/"),
      });
    }
  }

  await visit(root);
  return files;
}

function vbaSourceFileType(fileName: string): string | undefined {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".form.txt")) return "form.txt";
  if (lower.endsWith(".report.txt")) return "report.txt";
  const extension = extname(lower);
  if (extension === ".bas" || extension === ".cls" || extension === ".frm")
    return extension.slice(1);
  return undefined;
}

function moduleNameFromVbaFile(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".form.txt")) return fileName.slice(0, -".form.txt".length);
  if (lower.endsWith(".report.txt")) return fileName.slice(0, -".report.txt".length);
  return parse(fileName).name;
}

function comparisonKey(file: VbaSourceComparisonFile): string {
  return `${file.moduleName.toLowerCase()}\0${file.fileType}`;
}

function toComparisonEntry(
  sourceFile: VbaSourceComparisonFile | undefined,
  binaryFile: VbaSourceComparisonFile | undefined,
): VbaSourceComparisonEntry {
  const file = sourceFile ?? binaryFile;
  return {
    moduleName: file?.moduleName ?? "",
    fileType: file?.fileType ?? "",
    sourcePath: sourceFile?.relativePath,
    binaryPath: binaryFile?.relativePath,
  };
}

function sortComparisonEntries(entries: VbaSourceComparisonEntry[]): VbaSourceComparisonEntry[] {
  return entries.sort((left, right) =>
    `${left.moduleName}\0${left.fileType}`.localeCompare(`${right.moduleName}\0${right.fileType}`),
  );
}

function sortDiffEntries(entries: VbaSourceDiffEntry[]): VbaSourceDiffEntry[] {
  return entries.sort((left, right) =>
    `${left.moduleName}\0${left.fileType}`.localeCompare(`${right.moduleName}\0${right.fileType}`),
  );
}

function firstDifferentLineSnippet(leftText: string, rightText: string, label: string): string {
  const leftLines = leftText.split(/\r?\n/);
  const rightLines = rightText.split(/\r?\n/);
  const max = Math.max(leftLines.length, rightLines.length);
  for (let index = 0; index < max; index += 1) {
    if (leftLines[index] !== rightLines[index])
      return `${label}:${index + 1}: ${leftLines[index] ?? ""}`;
  }
  return `${label}: files differ`;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}
