import { cp, mkdir, writeFile } from "node:fs/promises";
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
  };
}

async function copyIfDifferent(
  source: string,
  destination: string,
  options: Parameters<typeof cp>[2],
): Promise<void> {
  if (path.resolve(source) === path.resolve(destination)) return;
  await cp(source, destination, options);
}

async function copyRuntime(runtimePaths: RuntimePaths): Promise<void> {
  await mkdir(runtimePaths.appDir, { recursive: true });
  await mkdir(runtimePaths.binDir, { recursive: true });

  if (!(await fileExists(runtimePaths.distSource))) {
    throw new Error(
      `Cannot install: runtime distribution not found at ${runtimePaths.distSource}.`,
    );
  }

  await copyIfDifferent(runtimePaths.distSource, path.join(runtimePaths.appDir, "dist"), {
    recursive: true,
    force: true,
  });

  // Scripts are required by MCP/Access/VBA tools at runtime.
  await mkdir(runtimePaths.scriptsDest, { recursive: true });
  if (await fileExists(runtimePaths.scriptsSource)) {
    await copyIfDifferent(runtimePaths.scriptsSource, runtimePaths.scriptsDest, {
      recursive: true,
      force: true,
    });
  }

  if (await fileExists(runtimePaths.packageJsonSource)) {
    await copyIfDifferent(runtimePaths.packageJsonSource, runtimePaths.packageJsonDest, {
      force: true,
    });
    // Install production dependencies so runtime deps (e.g. @modelcontextprotocol/sdk)
    // are available without requiring the full source node_modules to be copied.
    await runCommand("pnpm", ["install", "--ignore-scripts", "--prod"], runtimePaths.appDir, {
      timeoutMs: 120_000,
    });
  }
}

async function copyDocs(runtimePaths: RuntimePaths, packageRoot: string): Promise<void> {
  const sourceReadme = path.join(packageRoot, "README.md");
  const sourceChangelog = path.join(packageRoot, "CHANGELOG.md");

  if (await fileExists(sourceReadme)) {
    await cp(sourceReadme, runtimePaths.readmePath, { force: true });
  }

  if (await fileExists(sourceChangelog)) {
    await cp(sourceChangelog, runtimePaths.changelogPath, { force: true });
  }
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
): string {
  return [
    `Dysflow runtime installed at: ${runtimeDir}`,
    `Configured agents: ${configuredAgents.length === 0 ? "(none)" : configuredAgents.join(", ")}`,
    "",
    "Note:",
    "- Runtime docs were copied to INSTALL_DIR: README.md and CHANGELOG.md.",
    `- MCP server command used in integrations: ${path.join(runtimeDir, "bin", "dysflow.cmd")}`,
    "- Re-run `dysflow install` to refresh runtime + integrations.",
  ].join("\n");
}

export async function installRuntime(
  runtimePaths: RuntimePaths,
  packageRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  await copyRuntime(runtimePaths);
  await copyDocs(runtimePaths, packageRoot);
  await writeRuntimeLaunchers(runtimePaths.binDir, runtimePaths.runtimeDir);
  await writeRuntimeMarker(getSystemMarkerPath(env), runtimePaths.runtimeDir);
}
