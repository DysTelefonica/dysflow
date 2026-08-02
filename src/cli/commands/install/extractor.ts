import { cp, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runCommand } from "./command-runner.js";
import { fileExists } from "./file-utils.js";
import { writeRuntimeLaunchers } from "./path-configurator.js";
import { getSystemMarkerPath, RUNTIME_MARKER_VERSION } from "./runtime-dir.js";

export type RuntimePaths = {
  runtimeDir: string;
  appDir: string;
  binDir: string;
  readmePath: string;
  changelogPath: string;
  distSource: string;
  scriptsSource: string;
  scriptsDest: string;
  packageJsonSource: string;
  packageJsonDest: string;
  skillsSource: string;
  skillsDest: string;
};

export function resolveRuntimePaths(runtimeDir: string, packageRoot: string): RuntimePaths {
  const appDir = path.join(runtimeDir, "app");

  return {
    runtimeDir,
    appDir,
    binDir: path.join(runtimeDir, "bin"),
    readmePath: path.join(runtimeDir, "README.md"),
    changelogPath: path.join(runtimeDir, "CHANGELOG.md"),
    distSource: path.join(packageRoot, "dist"),
    scriptsSource: path.join(packageRoot, "scripts"),
    scriptsDest: path.join(appDir, "scripts"),
    packageJsonSource: path.join(packageRoot, "package.json"),
    packageJsonDest: path.join(appDir, "package.json"),
    skillsSource: path.join(packageRoot, "skills"),
    skillsDest: path.join(appDir, "skills"),
  };
}

async function copyIfDifferent(
  source: string,
  destination: string,
  options: Parameters<typeof cp>[2],
): Promise<boolean> {
  if (path.resolve(source) === path.resolve(destination)) return false;
  await cp(source, destination, options);
  return true;
}

async function listDestinationFiles(
  sourceRoot: string,
  destinationRoot: string,
): Promise<string[]> {
  const destinations: string[] = [];

  async function visit(sourceDirectory: string, destinationDirectory: string): Promise<void> {
    const entries = await readdir(sourceDirectory, { withFileTypes: true });
    for (const entry of entries) {
      const source = path.join(sourceDirectory, entry.name);
      const destination = path.join(destinationDirectory, entry.name);
      if (entry.isDirectory()) {
        await visit(source, destination);
      } else if (entry.isFile()) {
        destinations.push(destination);
      }
    }
  }

  await visit(sourceRoot, destinationRoot);
  return destinations;
}

async function copyRuntime(runtimePaths: RuntimePaths, packageRoot: string): Promise<string[]> {
  const copiedFiles: string[] = [];
  await mkdir(runtimePaths.appDir, { recursive: true });
  await mkdir(runtimePaths.binDir, { recursive: true });

  if (!(await fileExists(runtimePaths.distSource))) {
    throw new Error(
      `Cannot install: runtime distribution not found at ${runtimePaths.distSource}.`,
    );
  }

  const distDestination = path.join(runtimePaths.appDir, "dist");
  if (
    await copyIfDifferent(runtimePaths.distSource, distDestination, {
      recursive: true,
      force: true,
    })
  ) {
    copiedFiles.push(...(await listDestinationFiles(runtimePaths.distSource, distDestination)));
  }

  // Scripts are required by MCP/Access/VBA tools at runtime.
  await mkdir(runtimePaths.scriptsDest, { recursive: true });
  if (await fileExists(runtimePaths.scriptsSource)) {
    if (
      await copyIfDifferent(runtimePaths.scriptsSource, runtimePaths.scriptsDest, {
        recursive: true,
        force: true,
      })
    ) {
      copiedFiles.push(
        ...(await listDestinationFiles(runtimePaths.scriptsSource, runtimePaths.scriptsDest)),
      );
    }
  }

  // Copy pnpm-lock.yaml so the install is reproducible (#666). Without it,
  // `pnpm install --prod` re-resolves the transitive graph from the public
  // registry on every install, which defeats the trust model that says we
  // ship exactly the graph we built and signed.
  const lockfileSource = path.join(packageRoot, "pnpm-lock.yaml");
  const lockfileDest = path.join(runtimePaths.appDir, "pnpm-lock.yaml");
  const lockfileAvailable = await fileExists(lockfileSource);
  if (lockfileAvailable) {
    if (await copyIfDifferent(lockfileSource, lockfileDest, { force: true })) {
      copiedFiles.push(lockfileDest);
    }
  }

  if (await fileExists(runtimePaths.packageJsonSource)) {
    if (
      await copyIfDifferent(runtimePaths.packageJsonSource, runtimePaths.packageJsonDest, {
        force: true,
      })
    ) {
      copiedFiles.push(runtimePaths.packageJsonDest);
    }
    // Install production dependencies so runtime deps (e.g. @modelcontextprotocol/sdk)
    // are available without requiring the full source node_modules to be copied.
    // When the lockfile is present we pass --frozen-lockfile to fail closed if
    // the registry returns a different graph than what we signed.
    // A runtime refresh must relink the complete production graph. Plain
    // `pnpm install` may trust a stale node_modules layout left by an older
    // runtime and keep broken transitive links (for example AJV -> fast-uri).
    const installArgs = ["install", "--ignore-scripts", "--prod", "--force"];
    if (lockfileAvailable) {
      installArgs.push("--frozen-lockfile");
    }
    await runCommand("pnpm", installArgs, runtimePaths.appDir, {
      timeoutMs: 120_000,
    });
  }

  // Issue #1323 — retain the canonical harness bundle in the installed
  // runtime so update/doctor can compare and republish the exact release bytes.
  if (await fileExists(runtimePaths.skillsSource)) {
    if (
      await copyIfDifferent(runtimePaths.skillsSource, runtimePaths.skillsDest, {
        recursive: true,
        force: true,
      })
    ) {
      copiedFiles.push(
        ...(await listDestinationFiles(runtimePaths.skillsSource, runtimePaths.skillsDest)),
      );
    }
  }
  return copiedFiles;
}

async function copyDocs(runtimePaths: RuntimePaths, packageRoot: string): Promise<string[]> {
  const copiedFiles: string[] = [];
  const sourceReadme = path.join(packageRoot, "README.md");
  const sourceChangelog = path.join(packageRoot, "CHANGELOG.md");

  if (await fileExists(sourceReadme)) {
    await cp(sourceReadme, runtimePaths.readmePath, { force: true });
    copiedFiles.push(runtimePaths.readmePath);
  }

  if (await fileExists(sourceChangelog)) {
    await cp(sourceChangelog, runtimePaths.changelogPath, { force: true });
    copiedFiles.push(runtimePaths.changelogPath);
  }

  // Issue #940 — the install pipeline ships three diagnostic docs in the
  // release tarball. Older releases stripped them at extract time, leaving
  // every typed error envelope's `remediation` field pointing at a markdown
  // anchor that did not exist on disk. Copy them through, creating parent
  // directories as needed.
  const errorCodes = await copyDocIfPresent(
    packageRoot,
    path.join("references", "error-codes.md"),
    path.join(runtimePaths.runtimeDir, "references", "error-codes.md"),
  );
  const hresultGuide = await copyDocIfPresent(
    packageRoot,
    path.join("docs", "diagnostics", "hresult-guide.md"),
    path.join(runtimePaths.runtimeDir, "docs", "diagnostics", "hresult-guide.md"),
  );
  const formImportGuide = await copyDocIfPresent(
    packageRoot,
    path.join("docs", "diagnostics", "form-import-gate-failures.md"),
    path.join(runtimePaths.runtimeDir, "docs", "diagnostics", "form-import-gate-failures.md"),
  );
  copiedFiles.push(
    ...[errorCodes, hresultGuide, formImportGuide].filter(
      (file): file is string => file !== undefined,
    ),
  );
  return copiedFiles;
}

async function copyDocIfPresent(
  packageRoot: string,
  relativeSource: string,
  destination: string,
): Promise<string | undefined> {
  const source = path.join(packageRoot, relativeSource);
  if (!(await fileExists(source))) return undefined;
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, { force: true });
  return destination;
}

export async function writeRuntimeMarker(markerPath: string, runtimeDir: string): Promise<void> {
  const markerDir = path.dirname(markerPath);
  await mkdir(markerDir, { recursive: true });
  // Write marker with version + runtime dir, so future versions can evolve the format
  const markerContent = `${RUNTIME_MARKER_VERSION}\n${runtimeDir}\n`;
  await writeFile(markerPath, markerContent, "utf8");
}

export function createInstallReport(
  runtimeDir: string,
  configuredAgents: readonly string[],
  options: {
    copiedFiles?: readonly string[];
    mcpConfigurations?: readonly {
      agent: string;
      status: "added" | "changed" | "unchanged";
      active: boolean;
    }[];
    verbose?: boolean;
  } = {},
): string {
  const copiedFiles = options.copiedFiles ?? [];
  const lines = [
    `Dysflow runtime installed at: ${runtimeDir}`,
    `Configured agents: ${configuredAgents.length === 0 ? "(none)" : configuredAgents.join(", ")}`,
    `Copied files: ${copiedFiles.length}`,
  ];
  if (options.verbose === true && copiedFiles.length > 0) {
    lines.push("Copied destinations:", ...copiedFiles.map((file) => `- ${file}`));
  }
  if (options.mcpConfigurations !== undefined && options.mcpConfigurations.length > 0) {
    lines.push(
      "MCP active config:",
      ...options.mcpConfigurations.map(
        (config) =>
          `- ${config.agent}: ${config.active ? "active" : "inactive"} (${config.status})`,
      ),
    );
  }
  lines.push(
    "",
    "Note:",
    "- Runtime docs were copied to INSTALL_DIR: README.md, CHANGELOG.md,",
    "  references/error-codes.md, docs/diagnostics/hresult-guide.md,",
    "  and docs/diagnostics/form-import-gate-failures.md.",
    `- MCP server command used in integrations: ${path.join(runtimeDir, "bin", "dysflow.cmd")}`,
    "- Re-run `dysflow install` to refresh runtime + integrations.",
    "- Reload your selected agents to activate the refreshed integration.",
  );
  return lines.join("\n");
}

export type RuntimeInstallReport = {
  copiedFiles: string[];
};

export async function installRuntime(
  runtimePaths: RuntimePaths,
  packageRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<RuntimeInstallReport> {
  const copiedFiles = [
    ...(await copyRuntime(runtimePaths, packageRoot)),
    ...(await copyDocs(runtimePaths, packageRoot)),
  ];
  await writeRuntimeLaunchers(runtimePaths.binDir, runtimePaths.runtimeDir);
  await writeRuntimeMarker(getSystemMarkerPath(env), runtimePaths.runtimeDir);
  return { copiedFiles };
}
