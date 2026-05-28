import { createHash } from "node:crypto";
import { accessSync, constants } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { compareVersions } from "../../core/utils/version.js";
import {
  type AgentConfigPaths,
  type AgentName,
  ALL_AGENTS,
  ensureObject,
  fileExists,
  getHome,
  getSystemMarkerPath,
  MAX_SUBPROCESS_BUFFER_BYTES,
  RUNTIME_MARKER_VERSION,
  readJson,
  removeAgentConfig,
  removeDysflowMcpConfig,
  resolveAgentConfigPaths,
  resolveRuntimeDir,
  runCommand,
  runCommandOutput,
  writeJson,
} from "./install-utils.js";
import type { CliResult } from "./types.js";

export type { AgentConfigPaths, AgentName };
export { ALL_AGENTS, MAX_SUBPROCESS_BUFFER_BYTES, removeDysflowMcpConfig, resolveAgentConfigPaths };

const INSTALL_USAGE =
  "Usage: dysflow install [--runtime-dir <dir>] [--agents <codex,opencode,claude,pi>] [--agent-all] [--no-tui]";
const UPDATE_USAGE = "Usage: dysflow update [--runtime-dir <dir>] [--force]";
const GITHUB_REPO_URL = "https://github.com/DysTelefonica/dysflow.git";
const GITHUB_LATEST_RELEASE_API =
  "https://api.github.com/repos/DysTelefonica/dysflow/releases/latest";
export const MAX_PACKAGE_ROOT_DEPTH = 12;

export type ReleaseInfo = {
  version: string;
  tagName?: string;
};

export type PreparedReleasePackage = {
  packageRoot: string;
  commitSha?: string;
  cleanup?: () => Promise<void>;
};

export type ReleaseUpdateProvider = {
  resolveLatestRelease(): Promise<ReleaseInfo>;
  preparePackage(
    release: ReleaseInfo,
    options?: { skipChecksum?: boolean; env?: NodeJS.ProcessEnv },
  ): Promise<PreparedReleasePackage>;
};

type InstallOptions = {
  runtimeDir?: string;
  agentNames: AgentName[];
  interactive: boolean;
};

type UpdateOptions = {
  runtimeDir?: string;
  force: boolean;
  skipChecksum: boolean;
};

type RuntimePaths = {
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

export function parseAgentList(
  raw: string | undefined,
): { ok: true; agents: AgentName[] } | { ok: false; message: string } {
  if (raw === undefined) {
    return { ok: true, agents: [] };
  }

  const names = raw
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name.length > 0);
  const unknown = names.filter((name) => !ALL_AGENTS.includes(name as AgentName));

  if (unknown.length > 0) {
    return { ok: false, message: `Unknown agent(s): ${unknown.join(", ")}.` };
  }

  return { ok: true, agents: Array.from(new Set(names as AgentName[])) };
}

export function parseInstallArgs(
  args: readonly string[],
): { ok: true; options: InstallOptions } | { ok: false; message: string } {
  if (args.includes("--help") || args.includes("-h")) {
    return { ok: false, message: INSTALL_USAGE };
  }

  const options: InstallOptions = {
    agentNames: [],
    interactive: true,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--runtime-dir") {
      const runtimeDir = args[index + 1];
      if (runtimeDir === undefined || runtimeDir.startsWith("--")) {
        return { ok: false, message: "Missing value for --runtime-dir." };
      }
      options.runtimeDir = runtimeDir;
      index += 1;
      continue;
    }

    if (arg === "--agents") {
      const parsed = parseAgentList(args[index + 1]);
      if (!parsed.ok) {
        return { ok: false, message: parsed.message };
      }
      options.agentNames = parsed.agents;
      options.interactive = false;
      index += 1;
      continue;
    }

    if (arg === "--agent-all") {
      options.interactive = false;
      options.agentNames = [...ALL_AGENTS];
      continue;
    }

    if (arg === "--no-tui") {
      options.interactive = false;
      continue;
    }

    return { ok: false, message: `Unsupported install option: ${arg}` };
  }

  return { ok: true, options };
}

export function parseUpdateArgs(
  args: readonly string[],
): { ok: true; options: UpdateOptions } | { ok: false; message: string } {
  if (args.includes("--help") || args.includes("-h")) {
    return { ok: false, message: UPDATE_USAGE };
  }

  const options: UpdateOptions = {
    runtimeDir: undefined,
    force: false,
    skipChecksum: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--runtime-dir") {
      const runtimeDir = args[index + 1];
      if (runtimeDir === undefined || runtimeDir.startsWith("--")) {
        return { ok: false, message: "Missing value for --runtime-dir." };
      }
      options.runtimeDir = runtimeDir;
      index += 1;
      continue;
    }

    if (arg === "--force") {
      options.force = true;
      continue;
    }

    if (arg === "--skip-checksum") {
      options.skipChecksum = true;
      continue;
    }

    return { ok: false, message: `Unsupported update option: ${arg}` };
  }

  return { ok: true, options };
}

export function resolvePackageRoot(options: { moduleUrl?: string; cwd?: string } = {}): string {
  const commandPath = fileURLToPath(options.moduleUrl ?? import.meta.url);
  let currentDir = path.dirname(commandPath);

  for (let depth = 0; depth < MAX_PACKAGE_ROOT_DEPTH; depth += 1) {
    const packageJson = path.join(currentDir, "package.json");
    const tsConfig = path.join(currentDir, "tsconfig.json");
    const distDir = path.join(currentDir, "dist");

    if (hasPath(packageJson) && (hasPath(tsConfig) || hasPath(distDir))) {
      return currentDir;
    }

    const parent = path.dirname(currentDir);
    if (parent === currentDir) {
      break;
    }
    currentDir = parent;
  }

  return path.resolve(options.cwd ?? process.cwd());
}

function hasPath(candidate: string): boolean {
  try {
    accessSync(candidate, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveRuntimePaths(runtimeDir: string, packageRoot: string): RuntimePaths {
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

function commandPathForConfig(runtimeDir: string): string {
  return path.join(runtimeDir, "bin", "dysflow.cmd").replaceAll("\\", "/");
}

async function opencodeCommandForConfig(runtimeDir: string): Promise<string[]> {
  const launcher = commandPathForConfig(runtimeDir);
  const normalizedLauncher = launcher.replaceAll("\\", "/");
  const entrypoint = path.join(runtimeDir, "app", "dist", "cli", "index.js");
  const normalizedEntrypoint = entrypoint.replaceAll("\\", "/");

  if (!(await fileExists(launcher))) {
    throw new Error(
      `Cannot configure OpenCode MCP: runtime launcher not found at ${normalizedLauncher}.`,
    );
  }
  if (!(await fileExists(entrypoint))) {
    throw new Error(
      `Cannot configure OpenCode MCP: runtime entrypoint not found at ${normalizedEntrypoint}.`,
    );
  }

  return [normalizedLauncher, "mcp"];
}

export async function hasDysflowMcpConfig(agent: AgentName, filePath: string): Promise<boolean> {
  if (agent === "codex") {
    const raw = await readFile(filePath, "utf8").catch(() => "");
    return raw
      .replace(/\r\n/g, "\n")
      .split("\n")
      .some((line) => line.trim() === "[mcp_servers.dysflow]");
  }

  const root = await readJson(filePath);
  const container = agent === "opencode" ? ensureObject(root.mcp) : ensureObject(root.mcpServers);
  return container.dysflow !== undefined;
}

export function replaceCodexMcpSection(content: string, commandPath: string): string {
  const normalized = commandPath.replaceAll("\\", "/");
  const sectionHeader = "[mcp_servers.dysflow]";
  const replacementLines = [
    sectionHeader,
    `command = '${normalized}'`,
    `args = ["mcp"]`,
    "startup_timeout_sec = 60.0",
    "",
  ];

  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((line) => line.trim() === sectionHeader);

  if (start === -1) {
    return `${lines.join("\n").trimEnd()}\n\n${replacementLines.join("\n").trimEnd()}\n`;
  }

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line.startsWith("#") && line.startsWith("[") && line.endsWith("]")) {
      const sectionName = line.slice(1, -1);
      if (!sectionName.startsWith("mcp_servers.dysflow")) {
        end = index;
        break;
      }
    }
  }

  const updated = [...lines.slice(0, start), ...replacementLines, ...lines.slice(end)];
  return `${updated.join("\n").trimEnd()}\n`;
}

async function configureCodex(filePath: string, commandPath: string): Promise<void> {
  const raw = await readFile(filePath, "utf8").catch(() => "");
  const updated = replaceCodexMcpSection(raw, commandPath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, updated, "utf8");
}

async function configureOpencode(filePath: string, command: readonly string[]): Promise<void> {
  const root = await readJson(filePath);
  const mcp = ensureObject(root.mcp);
  mcp.dysflow = {
    enabled: true,
    type: "local",
    command: [...command],
  };
  root.mcp = mcp;
  await writeJson(filePath, root);
}

async function configureClaude(filePath: string, commandPath: string): Promise<void> {
  const root = await readJson(filePath);
  const mcpServers = ensureObject(root.mcpServers);
  mcpServers.dysflow = { command: commandPath, args: ["mcp"] };
  root.mcpServers = mcpServers;
  await writeJson(filePath, root);
}

async function configurePi(filePath: string, commandPath: string): Promise<void> {
  const root = await readJson(filePath);
  const mcpServers = ensureObject(root.mcpServers);
  mcpServers.dysflow = {
    command: commandPath,
    args: ["mcp"],
    directTools: true,
    type: "local",
    lifecycle: "lazy",
  };
  root.mcpServers = mcpServers;
  await writeJson(filePath, root);
}

export async function applyIntegrationSelection(
  selectedAgents: readonly AgentName[],
  options: {
    env?: NodeJS.ProcessEnv;
    runtimeDir?: string;
    packageRoot?: string;
  } = {},
): Promise<CliResult> {
  const env = options.env ?? process.env;
  const runtimeDir = resolveRuntimeDir(options.runtimeDir, env);
  const packageRoot = options.packageRoot ?? resolvePackageRoot();
  const runtimePaths = resolveRuntimePaths(runtimeDir, packageRoot);
  const agentConfigPaths = resolveAgentConfigPaths(getHome(env));
  const commandPath = commandPathForConfig(runtimeDir);
  const selected = new Set(selectedAgents);

  try {
    await installRuntime(runtimePaths, packageRoot, env);
    for (const agent of ALL_AGENTS) {
      if (selected.has(agent)) {
        await configureAgent(agent, agentConfigPaths, commandPath, runtimeDir);
        continue;
      }
      await removeAgentConfig(agent, agentConfigPaths);
    }
    return {
      exitCode: 0,
      stdout: createInstallReport(runtimeDir, [...selected]),
      stderr: "",
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to apply Dysflow integrations.";
    return { exitCode: 1, stdout: "", stderr: message };
  }
}

async function configureAgent(
  agent: AgentName,
  agentConfigPaths: AgentConfigPaths,
  commandPath: string,
  runtimeDir: string,
): Promise<void> {
  if (agent === "codex") return configureCodex(agentConfigPaths.codex, commandPath);
  if (agent === "opencode") {
    return configureOpencode(agentConfigPaths.opencode, await opencodeCommandForConfig(runtimeDir));
  }
  if (agent === "claude")
    return configureClaude(await resolveClaudeConfigPath(agentConfigPaths), commandPath);
  return configurePi(agentConfigPaths.pi, commandPath);
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
  }
}

async function copyIfDifferent(
  source: string,
  destination: string,
  options: Parameters<typeof cp>[2],
): Promise<void> {
  if (path.resolve(source) === path.resolve(destination)) return;
  await cp(source, destination, options);
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

async function installRuntime(
  runtimePaths: RuntimePaths,
  packageRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  await copyRuntime(runtimePaths);
  await copyDocs(runtimePaths, packageRoot);
  await writeRuntimeLaunchers(runtimePaths.binDir, runtimePaths.runtimeDir);
  await writeRuntimeMarker(getSystemMarkerPath(env), runtimePaths.runtimeDir);
}

async function writeRuntimeMarker(markerPath: string, runtimeDir: string): Promise<void> {
  const markerDir = path.dirname(markerPath);
  await mkdir(markerDir, { recursive: true });
  // Write marker with version + runtime dir, so future versions can evolve the format
  const markerContent = `${RUNTIME_MARKER_VERSION}\n${runtimeDir}\n`;
  await writeFile(markerPath, markerContent, "utf8");
}

function createInstallReport(runtimeDir: string, configuredAgents: readonly AgentName[]): string {
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

function createNoUpdateReport(runtimeDir: string, localVersion: string): string {
  return `Dysflow runtime is up to date and already at the latest version: v${localVersion} (at ${runtimeDir}).`;
}

async function readPackageJsonVersion(packagePath: string): Promise<string | undefined> {
  const raw = await readFile(packagePath, "utf8").catch(() => undefined);
  if (raw === undefined) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as { version?: string };
    if (typeof parsed.version === "string" && parsed.version.length > 0) {
      return parsed.version;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

type GitHubLatestReleaseResponse = {
  tag_name?: unknown;
  name?: unknown;
};

function normalizeReleaseVersion(value: string): string {
  return value.startsWith("v") ? value.slice(1) : value;
}

export function validateReleaseTagName(tagName: string): string {
  if (!/^v\d+\.\d+\.\d+$/.test(tagName)) {
    throw new Error(`Invalid Dysflow release tag: ${tagName}`);
  }
  return tagName;
}

export function createGitHubReleaseRequestHeaders(
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const token = env.GH_TOKEN ?? env.GITHUB_TOKEN;
  return {
    Accept: "application/vnd.github+json",
    ...(token !== undefined && token.length > 0 ? { Authorization: `Bearer ${token}` } : {}),
    "User-Agent": "dysflow-updater",
  };
}

function _createCommandError(command: string, error: unknown): Error {
  if (error instanceof Error) {
    return new Error(`${command} failed: ${error.message}`);
  }
  return new Error(`${command} failed.`);
}

async function resolveLatestReleaseWithGh(): Promise<ReleaseInfo> {
  const tagName = await runCommandOutput(
    "gh",
    ["release", "view", "--repo", "DysTelefonica/dysflow", "--json", "tagName", "--jq", ".tagName"],
    process.cwd(),
  );
  if (tagName.length === 0) {
    throw new Error("gh release view did not return a tagName.");
  }
  validateReleaseTagName(tagName);
  return {
    tagName,
    version: normalizeReleaseVersion(tagName),
  };
}

async function tryResolveGitCommitSha(cwd: string): Promise<string | undefined> {
  try {
    const sha = await runCommandOutput("git", ["rev-parse", "HEAD"], cwd);
    return /^[0-9a-f]{40}$/i.test(sha) ? sha : undefined;
  } catch {
    return undefined;
  }
}

export function createGitHubReleaseUpdateProvider(): ReleaseUpdateProvider {
  return {
    async resolveLatestRelease(): Promise<ReleaseInfo> {
      const response = await fetch(GITHUB_LATEST_RELEASE_API, {
        headers: createGitHubReleaseRequestHeaders(),
      });
      if (!response.ok) {
        try {
          return await resolveLatestReleaseWithGh();
        } catch {
          throw new Error(`GitHub latest release lookup failed with HTTP ${response.status}.`);
        }
      }

      const body = (await response.json()) as GitHubLatestReleaseResponse;
      if (typeof body.tag_name !== "string" || body.tag_name.length === 0) {
        throw new Error("GitHub latest release response did not include tag_name.");
      }
      validateReleaseTagName(body.tag_name);

      return {
        tagName: body.tag_name,
        version: normalizeReleaseVersion(body.tag_name),
      };
    },

    async preparePackage(
      release: ReleaseInfo,
      options?: { skipChecksum?: boolean; env?: NodeJS.ProcessEnv },
    ): Promise<PreparedReleasePackage> {
      const tagName = validateReleaseTagName(release.tagName ?? `v${release.version}`);
      const tempRoot = await mkdtemp(path.join(tmpdir(), "dysflow-update-"));
      const packageRoot = path.join(tempRoot, "source");
      const cleanup = async (): Promise<void> => {
        await rm(tempRoot, { recursive: true, force: true });
      };

      const environment = options?.env ?? process.env;

      try {
        const archiveName = `dysflow-${tagName}.tar.gz`;
        const archiveUrl = `https://github.com/DysTelefonica/dysflow/releases/download/${tagName}/${archiveName}`;
        const checksumsUrl = `https://github.com/DysTelefonica/dysflow/releases/download/${tagName}/SHA256SUMS`;

        // 1. Download archive
        const archiveResponse = await fetch(archiveUrl, {
          headers: createGitHubReleaseRequestHeaders(environment),
        });
        if (!archiveResponse.ok) {
          throw new Error(
            `Failed to download release archive from ${archiveUrl}: HTTP ${archiveResponse.status}`,
          );
        }
        const archiveBuffer = Buffer.from(await archiveResponse.arrayBuffer());

        // 2. Verification
        if (!options?.skipChecksum) {
          const checksumsResponse = await fetch(checksumsUrl, {
            headers: createGitHubReleaseRequestHeaders(environment),
          });
          if (!checksumsResponse.ok) {
            throw new Error(
              `Failed to download checksums file from ${checksumsUrl}: HTTP ${checksumsResponse.status}. ` +
                "Use --skip-checksum if you want to bypass verification.",
            );
          }
          const checksumsText = await checksumsResponse.text();
          const lines = checksumsText.split(/\r?\n/);
          let expectedHash: string | undefined;
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 2 && parts[1].replace(/^\*/, "") === archiveName) {
              expectedHash = parts[0];
              break;
            }
          }

          if (expectedHash === undefined) {
            throw new Error(`Expected hash for ${archiveName} not found in SHA256SUMS.`);
          }

          const actualHash = createHash("sha256").update(archiveBuffer).digest("hex");
          if (actualHash !== expectedHash) {
            throw new Error(
              `Checksum mismatch for downloaded artifact.\n` +
                `Expected: ${expectedHash}\n` +
                `Got:      ${actualHash}`,
            );
          }
        }

        // 3. Write archive to temp folder
        const archivePath = path.join(tempRoot, archiveName);
        await writeFile(archivePath, archiveBuffer);

        // 4. Extract archive
        await mkdir(packageRoot, { recursive: true });
        await runCommand("tar", ["-xzf", archivePath, "-C", packageRoot], tempRoot);

        const commitSha = await tryResolveGitCommitSha(packageRoot);
        return { packageRoot, commitSha, cleanup };
      } catch (error) {
        // Fallback to git clone if archive was not found
        if (error instanceof Error && error.message.includes("Checksum mismatch")) {
          await cleanup();
          throw error;
        }

        try {
          await runCommand(
            "git",
            ["clone", "--depth", "1", "--branch", tagName, GITHUB_REPO_URL, packageRoot],
            tempRoot,
          );
          const commitSha = await tryResolveGitCommitSha(packageRoot);
          await runCommand("pnpm", ["install", "--frozen-lockfile"], packageRoot);
          await runCommand("pnpm", ["build"], packageRoot);
          return { packageRoot, commitSha, cleanup };
        } catch (cloneError) {
          await cleanup();
          throw new Error(
            `Failed to prepare package: Archive error: ${error instanceof Error ? error.message : String(error)}. Clone error: ${cloneError instanceof Error ? cloneError.message : String(cloneError)}`,
          );
        }
      }
    },
  };
}

async function resolveClaudeConfigPath(
  paths: Pick<AgentConfigPaths, "claudeDesktop" | "claudeSettings">,
): Promise<string> {
  if (await fileExists(paths.claudeSettings)) {
    return paths.claudeSettings;
  }

  if (await fileExists(paths.claudeDesktop)) {
    return paths.claudeDesktop;
  }

  return paths.claudeSettings;
}

async function selectAgentsInteractive(allowList: readonly AgentName[]): Promise<AgentName[]> {
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const selected: AgentName[] = [];
    for (const agent of allowList) {
      const answer = await prompt.question(`[${agent}] Install MCP integration? [y/N] `);
      if (answer.trim().toLowerCase().startsWith("y")) {
        selected.push(agent);
      }
    }
    return selected;
  } finally {
    prompt.close();
  }
}

export async function writeRuntimeLaunchers(binDir: string, runtimeDir: string): Promise<void> {
  const normalizedRuntimeDir = runtimeDir.replaceAll("\\", "\\\\");
  const cmdRuntimeDir = escapeCmdSetValue(normalizedRuntimeDir);
  const psRuntimeDir = escapePowerShellDoubleQuotedString(normalizedRuntimeDir);
  const cmdContent = [
    "@echo off",
    "setlocal",
    `set "DYSFLOW_HOME=${cmdRuntimeDir}"`,
    // Prepend Node pnpm/npm path so child processes (pnpm install during update)
    // can find the package manager even when launched without a full PATH.
    `set "PATH=%ProgramFiles%\\nodejs;%PATH%"`,
    `node "%DYSFLOW_HOME%\\app\\dist\\cli\\index.js" %*`,
    "exit /b %ERRORLEVEL%",
    "",
  ].join("\r\n");

  const ps1Content = [
    '$ErrorActionPreference = "Stop"',
    `$env:DYSFLOW_HOME = "${psRuntimeDir}"`,
    `$env:PATH = "$env:ProgramFiles\\nodejs;$env:PATH"`,
    `& node (Join-Path $env:DYSFLOW_HOME "app\\dist\\cli\\index.js") @args`,
    "exit $LASTEXITCODE",
    "",
  ].join("\r\n");

  await writeFile(path.join(binDir, "dysflow.cmd"), cmdContent, "utf8");
  await writeFile(path.join(binDir, "dysflow.ps1"), ps1Content, "utf8");
}

function escapeCmdSetValue(value: string): string {
  return value.replaceAll("%", "%%").replaceAll('"', '^"');
}

function escapePowerShellDoubleQuotedString(value: string): string {
  return value.replaceAll("`", "``").replaceAll("$", "`$").replaceAll('"', '`"');
}

export async function handleInstallCommand(
  args: readonly string[],
  context: { env?: NodeJS.ProcessEnv; packageRoot?: string } = {},
): Promise<CliResult> {
  const parsed = parseInstallArgs(args);
  if (!parsed.ok) {
    const isUsage = parsed.message === INSTALL_USAGE;
    return {
      exitCode: isUsage ? 0 : 1,
      stdout: isUsage ? INSTALL_USAGE : "",
      stderr: isUsage ? "" : parsed.message,
    };
  }

  const env = context.env ?? process.env;
  const runtimeDir = resolveRuntimeDir(parsed.options.runtimeDir, env);
  const packageRoot = context.packageRoot ?? resolvePackageRoot();
  const runtimePaths = resolveRuntimePaths(runtimeDir, packageRoot);
  const agentConfigPaths = resolveAgentConfigPaths(getHome(env));
  const commandPath = commandPathForConfig(runtimeDir);

  try {
    let agents = parsed.options.agentNames;
    if (agents.length === 0 && parsed.options.interactive && process.stdin.isTTY) {
      agents = await selectAgentsInteractive(ALL_AGENTS);
    }

    await installRuntime(runtimePaths, packageRoot, env);

    for (const agent of agents) {
      if (agent === "codex") {
        await configureCodex(agentConfigPaths.codex, commandPath);
        continue;
      }

      if (agent === "opencode") {
        await configureOpencode(
          agentConfigPaths.opencode,
          await opencodeCommandForConfig(runtimeDir),
        );
        continue;
      }

      if (agent === "claude") {
        const pathToUse = await resolveClaudeConfigPath(agentConfigPaths);
        await configureClaude(pathToUse, commandPath);
        continue;
      }

      await configurePi(agentConfigPaths.pi, commandPath);
    }

    return {
      exitCode: 0,
      stdout: createInstallReport(runtimeDir, agents),
      stderr: "",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to install Dysflow runtime.";
    return {
      exitCode: 1,
      stdout: "",
      stderr: message,
    };
  }
}

export async function handleUpdateCommand(
  args: readonly string[],
  context: {
    env?: NodeJS.ProcessEnv;
    releaseUpdateProvider?: ReleaseUpdateProvider;
    packageRoot?: string;
  } = {},
): Promise<CliResult> {
  const parsed = parseUpdateArgs(args);
  if (!parsed.ok) {
    const isUsage = parsed.message === UPDATE_USAGE;
    return {
      exitCode: isUsage ? 0 : 1,
      stdout: isUsage ? UPDATE_USAGE : "",
      stderr: isUsage ? "" : parsed.message,
    };
  }

  const env = context.env ?? process.env;
  const runtimeDir = resolveRuntimeDir(parsed.options.runtimeDir, env);
  const localPackageRoot = context.packageRoot ?? resolvePackageRoot();
  const runtimePaths = resolveRuntimePaths(runtimeDir, localPackageRoot);

  const installedVersion = await readPackageJsonVersion(runtimePaths.packageJsonDest);
  const provider = context.releaseUpdateProvider ?? createGitHubReleaseUpdateProvider();

  let latestRelease: ReleaseInfo;
  try {
    latestRelease = await provider.resolveLatestRelease();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to resolve latest release.";
    return {
      exitCode: 1,
      stdout: "",
      stderr: `Failed to update Dysflow runtime: ${message}`,
    };
  }

  const isUpdateNeeded =
    parsed.options.force ||
    installedVersion === undefined ||
    compareVersions(latestRelease.version, installedVersion) > 0;

  if (!isUpdateNeeded) {
    // Even when up to date, persist the marker so that future update calls
    // (without --runtime-dir) can still discover this runtime directory.
    await writeRuntimeMarker(getSystemMarkerPath(env), runtimeDir);
    return {
      exitCode: 0,
      stdout: createNoUpdateReport(runtimeDir, latestRelease.version),
      stderr: "",
    };
  }

  const previousVersion = installedVersion ?? "not installed";
  let preparedPackage: PreparedReleasePackage | undefined;
  try {
    preparedPackage = await provider.preparePackage(latestRelease, {
      skipChecksum: parsed.options.skipChecksum,
      env,
    });
    const releaseRuntimePaths = resolveRuntimePaths(runtimeDir, preparedPackage.packageRoot);
    await installRuntime(releaseRuntimePaths, preparedPackage.packageRoot, env);
    const previousVersionStr =
      installedVersion !== undefined ? `v${installedVersion}` : "none (not installed)";
    const latestVersionStr = `v${latestRelease.version}`;
    return {
      exitCode: 0,
      stdout:
        `Dysflow runtime update: upgrading from ${previousVersionStr} to ${latestVersionStr} (${previousVersion} -> ${latestRelease.version})\n` +
        (preparedPackage.commitSha === undefined
          ? ""
          : `Installed release commit: ${preparedPackage.commitSha}\n`) +
        createInstallReport(runtimeDir, []),
      stderr: "",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update Dysflow runtime.";
    return {
      exitCode: 1,
      stdout: "",
      stderr: `Failed to update Dysflow runtime: ${message}`,
    };
  } finally {
    await preparedPackage?.cleanup?.();
  }
}

export function formatAgentsLine(agents: readonly AgentName[]): string {
  return agents.length === 0 ? "(none)" : agents.join(", ");
}
