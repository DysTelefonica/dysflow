import { lstat, realpath } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, parse, relative, resolve } from "node:path";

const SANDBOX_BASENAME_PREFIX = "dysflow-mcp-e2e-";

function isSameOrInside(candidate, parent) {
  const rel = relative(parent, candidate);
  return rel === "" || (!rel.startsWith("..") && !parse(rel).root);
}

function productionRuntimeRoots() {
  return [process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "dysflow") : undefined]
    .filter(Boolean)
    .map((path) => resolve(path));
}

function looksLikeProductionRuntime(candidate) {
  return /(?:^|[\\/])localappdata[\\/]dysflow$/i.test(candidate);
}

export function assertSafeSandboxParent(parent, { scriptDir, repoRoot }) {
  const normalizedParent = resolve(parent);
  const normalizedScriptDir = resolve(scriptDir);
  const normalizedRepoRoot = resolve(repoRoot);
  const normalizedHome = resolve(homedir());
  const driveRoot = parse(normalizedParent).root;

  const unsafe =
    normalizedParent === driveRoot ||
    isSameOrInside(normalizedParent, normalizedRepoRoot) ||
    isSameOrInside(normalizedParent, normalizedScriptDir) ||
    normalizedParent === normalizedHome ||
    looksLikeProductionRuntime(normalizedParent) ||
    productionRuntimeRoots().some((runtimeRoot) => isSameOrInside(normalizedParent, runtimeRoot));

  if (unsafe) {
    throw new Error(
      `Unsafe MCP E2E sandbox parent: ${parent}. DYSFLOW_E2E_SANDBOX_ROOT must be a parent outside the repo, fixture tree, home directory, drive root, and production runtime.`,
    );
  }

  return normalizedParent;
}

export async function assertSafeExistingSandboxRoot(root, options) {
  const parent = assertSafeSandboxParent(options.sandboxParent ?? tmpdir(), options);
  const rootInfo = await lstat(root);
  if (rootInfo.isSymbolicLink()) throw new Error(`Unsafe MCP E2E resume reparse root: ${root}`);
  const [rootReal, parentReal] = await Promise.all([realpath(root), realpath(parent)]);
  assertSafeSandboxParent(parentReal, options);
  if (!isSameOrInside(rootReal, parentReal) || rootReal === parentReal) {
    throw new Error(`Unsafe MCP E2E resume root outside sandbox parent: ${root}`);
  }
  if (!rootReal.split(/[\\/]/).at(-1)?.startsWith(SANDBOX_BASENAME_PREFIX)) {
    throw new Error(`Unsafe MCP E2E resume root: ${root}`);
  }
  return rootReal;
}

export function buildMcpE2eSandboxPlan({ scriptDir, sandboxRoot, existingRoot }) {
  const repoRoot = resolve(scriptDir, "..");
  const sandboxParent = assertSafeSandboxParent(sandboxRoot ?? tmpdir(), { scriptDir, repoRoot });
  const root = existingRoot
    ? resolve(existingRoot)
    : join(sandboxParent, `${SANDBOX_BASENAME_PREFIX}${process.pid}-${Date.now()}`);
  const source = {
    accessPath: join(scriptDir, "NoConformidades.accdb"),
    backendPath: join(scriptDir, "NoConformidades_Datos.accdb"),
    destinationRoot: join(scriptDir, "src"),
  };
  const sandbox = {
    root,
    accessPath: join(root, "NoConformidades.accdb"),
    backendPath: join(root, "NoConformidades_Datos.accdb"),
    destinationRoot: join(root, "src"),
    exportsRoot: join(root, "exports"),
    pruneExportPath: join(root, "exports", "prune"),
    erdPath: join(root, "ERD"),
    reportPath: join(root, "mcp-e2e-report.md"),
    sqlScript: join(root, "script.sql"),
    formSpec: join(root, "form-spec.json"),
    queriesExportPath: join(root, "exports", "queries.json"),
    catalogPath: join(root, "src", "catalog.json"),
  };

  return {
    source,
    sandbox,
    mutablePaths: [
      sandbox.accessPath,
      sandbox.backendPath,
      sandbox.destinationRoot,
      sandbox.exportsRoot,
      sandbox.pruneExportPath,
      sandbox.erdPath,
      sandbox.reportPath,
      sandbox.sqlScript,
      sandbox.formSpec,
      sandbox.queriesExportPath,
      sandbox.catalogPath,
    ],
  };
}
