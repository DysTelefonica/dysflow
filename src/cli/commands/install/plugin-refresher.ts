import { randomUUID } from "node:crypto";
import { cp, lstat, mkdir, readdir, readFile, readlink, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileExists } from "./file-utils.js";

const PLUGIN_AGENTS = [
  {
    cliAgent: "claude",
    name: "claude-code",
    sourceDirectory: "claude-code",
    destinationParts: [".claude", "plugins", "dysflow"],
    skillParts: [".claude", "skills", "dysflow-protocol"],
  },
  {
    cliAgent: "codex",
    name: "codex",
    sourceDirectory: "codex",
    destinationParts: [".codex", "plugins", "dysflow"],
    skillParts: [".codex", "skills", "dysflow-protocol"],
  },
  {
    cliAgent: "opencode",
    name: "opencode",
    sourceDirectory: "opencode",
    destinationParts: [".config", "opencode", "plugins", "dysflow"],
    skillParts: [".config", "opencode", "skills", "dysflow-protocol"],
  },
] as const;

type McpConfigDiff = "added" | "changed" | "unchanged";

export type PluginRefreshEntry = {
  agent: (typeof PLUGIN_AGENTS)[number]["name"];
  fileCount: number;
  changedFileCount: number;
  hooks: string[];
  mcpConfigDiff: McpConfigDiff;
  copiedDestinationPaths: string[];
};

export type PluginRefreshReport = {
  entries: PluginRefreshEntry[];
  skillSymlinkStatus: "absent" | "preserved";
};

async function listFileBytes(root: string): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (!entry.isFile()) {
        throw new Error(`Bundled plugin contains unsupported entry: ${absolutePath}`);
      }
      const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");
      files.set(relativePath, await readFile(absolutePath));
    }
  }

  await visit(root);
  return files;
}

function countChangedFiles(source: Map<string, Buffer>, installed: Map<string, Buffer>): number {
  const paths = new Set([...source.keys(), ...installed.keys()]);
  let changed = 0;
  for (const filePath of paths) {
    const sourceBytes = source.get(filePath);
    const installedBytes = installed.get(filePath);
    if (
      sourceBytes === undefined ||
      installedBytes === undefined ||
      !sourceBytes.equals(installedBytes)
    ) {
      changed += 1;
    }
  }
  return changed;
}

function compareMcpConfig(
  source: Map<string, Buffer>,
  installed: Map<string, Buffer>,
): McpConfigDiff {
  const sourceConfig = source.get(".mcp.json");
  const installedConfig = installed.get(".mcp.json");
  if (sourceConfig === undefined) {
    throw new Error("Bundled plugin source is incomplete: missing .mcp.json.");
  }
  if (installedConfig === undefined) return "added";
  return sourceConfig.equals(installedConfig) ? "unchanged" : "changed";
}

async function readHookList(sourceRoot: string): Promise<string[]> {
  const hooksPath = path.join(sourceRoot, "hooks", "hooks.json");
  const raw = await readFile(hooksPath, "utf8").catch(() => undefined);
  if (raw === undefined) return [];

  try {
    const parsed = JSON.parse(raw) as { hooks?: unknown };
    if (typeof parsed.hooks !== "object" || parsed.hooks === null || Array.isArray(parsed.hooks)) {
      throw new Error("hooks must be an object");
    }
    return Object.keys(parsed.hooks);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid JSON";
    throw new Error(`Bundled plugin hooks are invalid at ${hooksPath}: ${message}`);
  }
}

async function mirrorDirectoryAtomically(source: string, destination: string): Promise<void> {
  const parent = path.dirname(destination);
  const token = randomUUID();
  const staging = path.join(parent, `.dysflow-refresh-${token}`);
  const backup = path.join(parent, `.dysflow-backup-${token}`);
  const destinationExists = await fileExists(destination);

  await mkdir(parent, { recursive: true });
  try {
    await cp(source, staging, { recursive: true, force: true });
    if (destinationExists) {
      await rename(destination, backup);
    }
    try {
      await rename(staging, destination);
    } catch (error) {
      if (destinationExists) {
        await rename(backup, destination);
      }
      throw error;
    }
    await rm(backup, { recursive: true, force: true });
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

async function readSkillSymlinks(home: string): Promise<Map<string, string>> {
  const links = new Map<string, string>();
  for (const agent of PLUGIN_AGENTS) {
    const linkPath = path.join(home, ...agent.skillParts);
    const metadata = await lstat(linkPath).catch(() => undefined);
    if (metadata?.isSymbolicLink() === true) {
      links.set(linkPath, await readlink(linkPath));
    }
  }
  return links;
}

export async function refreshBundledAgentPlugins(
  packageRoot: string,
  home: string,
  selectedAgents?: readonly ("codex" | "opencode" | "claude")[],
): Promise<PluginRefreshReport | undefined> {
  const pluginRoot = path.join(packageRoot, "plugin");
  if (!(await fileExists(pluginRoot))) {
    return undefined;
  }

  const selected =
    selectedAgents === undefined
      ? PLUGIN_AGENTS
      : PLUGIN_AGENTS.filter((agent) => selectedAgents.includes(agent.cliAgent));
  if (selected.length === 0) return undefined;
  const sources = selected.map((agent) => ({
    agent,
    sourceRoot: path.join(pluginRoot, agent.sourceDirectory),
  }));
  for (const source of sources) {
    const metadata = await stat(source.sourceRoot).catch(() => undefined);
    if (metadata?.isDirectory() !== true) {
      throw new Error(
        `Bundled plugin source is incomplete: missing plugin/${source.agent.sourceDirectory}.`,
      );
    }
  }

  const skillSymlinksBefore = await readSkillSymlinks(home);
  const entries: PluginRefreshEntry[] = [];
  for (const source of sources) {
    const destination = path.join(home, ...source.agent.destinationParts);
    const sourceFiles = await listFileBytes(source.sourceRoot);
    const installedFiles = (await fileExists(destination))
      ? await listFileBytes(destination)
      : new Map<string, Buffer>();
    const entry: PluginRefreshEntry = {
      agent: source.agent.name,
      fileCount: sourceFiles.size,
      changedFileCount: countChangedFiles(sourceFiles, installedFiles),
      hooks: await readHookList(source.sourceRoot),
      mcpConfigDiff: compareMcpConfig(sourceFiles, installedFiles),
      copiedDestinationPaths: [...sourceFiles.keys()].map((relativePath) =>
        path.join(destination, ...relativePath.split("/")),
      ),
    };

    await mirrorDirectoryAtomically(source.sourceRoot, destination);
    const refreshedFiles = await listFileBytes(destination);
    if (
      countChangedFiles(sourceFiles, refreshedFiles) !== 0 ||
      sourceFiles.size !== refreshedFiles.size
    ) {
      throw new Error(`Plugin refresh verification failed for ${entry.agent}.`);
    }
    entries.push(entry);
  }

  const skillSymlinksAfter = await readSkillSymlinks(home);
  for (const [linkPath, target] of skillSymlinksBefore) {
    if (skillSymlinksAfter.get(linkPath) !== target) {
      throw new Error(`dysflow-protocol skill symlink changed during update: ${linkPath}`);
    }
  }

  return {
    entries,
    skillSymlinkStatus: skillSymlinksBefore.size === 0 ? "absent" : "preserved",
  };
}

export function createPluginRefreshReport(
  report: PluginRefreshReport | undefined,
  options: { verbose?: boolean } = {},
): string {
  if (report === undefined) return "";
  const lines = ["Plugin layer refresh:"];
  for (const entry of report.entries) {
    lines.push(
      `- ${entry.agent}: ${entry.fileCount} file(s), ${entry.changedFileCount} changed; ` +
        `hooks: ${entry.hooks.length === 0 ? "(none)" : entry.hooks.join(", ")}; ` +
        `MCP config: ${entry.mcpConfigDiff}`,
    );
    if (options.verbose === true) {
      lines.push(...entry.copiedDestinationPaths.map((file) => `  - ${file}`));
    }
  }
  lines.push(`- dysflow-protocol skill symlink: ${report.skillSymlinkStatus}`);
  return lines.join("\n");
}
