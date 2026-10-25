import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  lstat,
  mkdir,
  readdir,
  readFile,
  readlink,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { readPackageVersionNear } from "../../../core/utils/package-info.js";
import { resolvePiAgentDir } from "./agent-config.js";

/**
 * #1860 — the skills an agent receives from `dysflow install`. The two consumer
 * skills are installed by default. The maintainer skills are for working on
 * dysflow itself and need an explicit opt-in. `access-form-ui-builder` is not
 * shipped: the team keeps its own copy in the catalog.
 */
export const CONSUMER_SKILL_NAMES = ["dysflow-arnes", "dysflow-usage"] as const;
export const MAINTAINER_SKILL_NAMES = [
  "dysflow-codegraph-update",
  "dysflow-examples-sync",
  "dysflow-pointer-rollout",
] as const;
export const DYSSKILL_NAMES = [...CONSUMER_SKILL_NAMES, ...MAINTAINER_SKILL_NAMES] as const;

export type DysflowSkillName = (typeof DYSSKILL_NAMES)[number];
export const SKILL_AGENT_IDS = ["opencode", "claude", "codex", "cursor", "pi"] as const;
export type SkillAgentId = (typeof SKILL_AGENT_IDS)[number];

/** Product version that owns the bundled harness bytes. */
export const MCP_HARNESS_VERSION = readPackageVersionNear(import.meta.url);
export const HARNESS_METADATA_FILE = ".dysflow-harness.json";
export const HARNESS_METADATA_SCHEMA_VERSION = 2;

export type SkillTarget = {
  agentId: SkillAgentId;
  skillsDir: string;
};

export type SkillTargetFilters = {
  only?: readonly SkillAgentId[];
  exclude?: readonly SkillAgentId[];
};

export type SkillInstallTargetReport = SkillTarget & {
  writtenFiles: string[];
};

export type SkillInstallReport = {
  harnessVersion: string;
  installed: SkillInstallTargetReport[];
};

export type SkillDoctorStatus = SkillTarget & {
  skillsDirExists: boolean;
  versionMatch: boolean;
  hashesMatch: boolean;
  installedVersion?: string;
  expectedHashes: Record<DysflowSkillName, string>;
  staleSkills: DysflowSkillName[];
};

type FileSnapshot = {
  path: string;
  previous?: Buffer;
};

type DirectorySnapshot = {
  path: string;
  existed: boolean;
};

type LinkSnapshot = {
  path: string;
  target: string;
  directory: boolean;
};

function sha256(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

type BundledSkill = {
  files: Map<string, Buffer>;
};

function skillTreeHash(files: ReadonlyMap<string, Buffer>): string {
  const manifest = [...files.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([relativePath, content]) => `${relativePath}\0${sha256(content)}`)
    .join("\n");
  return sha256(Buffer.from(manifest, "utf8"));
}

async function readSkillTree(skillRoot: string): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();

  async function visit(directory: string, relativeDirectory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = relativeDirectory
        ? path.posix.join(relativeDirectory, entry.name)
        : entry.name;
      if (entry.isSymbolicLink()) {
        throw new Error(`Bundled skill assets must not contain symbolic links: ${absolutePath}`);
      }
      if (entry.isDirectory()) {
        await visit(absolutePath, relativePath);
      } else if (entry.isFile()) {
        files.set(relativePath, await readFile(absolutePath));
      } else {
        throw new Error(`Unsupported bundled skill asset: ${absolutePath}`);
      }
    }
  }

  await visit(skillRoot, "");
  if (!files.has("SKILL.md")) {
    throw new Error(`Bundled skill is missing SKILL.md: ${path.join(skillRoot, "SKILL.md")}`);
  }
  return files;
}

function canonicalSkillTargets(home: string, env: NodeJS.ProcessEnv): SkillTarget[] {
  return [
    { agentId: "opencode", skillsDir: path.join(home, ".config", "opencode", "skills") },
    { agentId: "claude", skillsDir: path.join(home, ".claude", "skills") },
    { agentId: "codex", skillsDir: path.join(home, ".codex", "skills") },
    { agentId: "cursor", skillsDir: path.join(home, ".cursor", "skills") },
    { agentId: "pi", skillsDir: path.join(resolvePiAgentDir(home, env), "skills") },
  ];
}

function hasAdapterConfiguration(
  home: string,
  agentId: SkillAgentId,
  env: NodeJS.ProcessEnv,
): boolean {
  const configPaths: Record<SkillAgentId, string[]> = {
    opencode: [path.join(home, ".config", "opencode", "opencode.json")],
    claude: [
      path.join(home, ".claude", "settings.json"),
      path.join(home, "AppData", "Roaming", "Claude", "claude_desktop_config.json"),
    ],
    codex: [path.join(home, ".codex", "config.toml")],
    cursor: [path.join(home, ".cursor", "mcp.json")],
    pi: [path.join(resolvePiAgentDir(home, env), "mcp.json")],
  };
  return configPaths[agentId].some((configPath) => existsSync(configPath));
}

/**
 * Return only adapter-owned SkillsDir targets that are already discoverable.
 * `only` is the explicit opt-in route and may therefore return a target whose
 * directory does not exist yet. `exclude` never creates or discovers paths.
 * `env` selects the Pi agent directory (see `resolvePiAgentDir`).
 */
export function discoverSkillTargets(
  home: string,
  filters: SkillTargetFilters = {},
  env: NodeJS.ProcessEnv = process.env,
): SkillTarget[] {
  if (home.trim().length === 0) return [];
  const resolvedHome = path.resolve(home);
  const candidates = canonicalSkillTargets(resolvedHome, env);
  const only = new Set(filters.only ?? []);
  const exclude = new Set(filters.exclude ?? []);
  return candidates.filter((candidate) => {
    if (exclude.has(candidate.agentId)) return false;
    if (only.size > 0) return only.has(candidate.agentId);
    return (
      existsSync(candidate.skillsDir) ||
      hasAdapterConfiguration(resolvedHome, candidate.agentId, env)
    );
  });
}

function assertSafeSkillsDir(target: SkillTarget): string {
  if (!path.isAbsolute(target.skillsDir)) {
    throw new Error(`Refusing non-absolute SkillsDir for ${target.agentId}: ${target.skillsDir}`);
  }
  const resolved = path.resolve(target.skillsDir);
  if (resolved === path.parse(resolved).root) {
    throw new Error(`Refusing filesystem-root SkillsDir for ${target.agentId}: ${resolved}`);
  }
  return resolved;
}

function childPath(root: string, ...segments: string[]): string {
  const candidate = path.resolve(root, ...segments);
  const relative = path.relative(root, candidate);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing path outside SkillsDir: ${candidate}`);
  }
  return candidate;
}

async function pathExists(candidate: string): Promise<boolean> {
  return stat(candidate)
    .then(() => true)
    .catch(() => false);
}

async function assertNotSymbolicLink(candidate: string): Promise<void> {
  const info = await lstat(candidate).catch(() => undefined);
  if (info?.isSymbolicLink()) {
    throw new Error(
      `Refusing symbolic-link path outside the bounded SkillsDir transaction: ${candidate}`,
    );
  }
}

async function replaceManagedLink(candidate: string, links: LinkSnapshot[]): Promise<void> {
  const info = await lstat(candidate).catch(() => undefined);
  if (!info?.isSymbolicLink()) return;
  const target = await readlink(candidate);
  const targetInfo = await stat(candidate).catch(() => undefined);
  links.push({ path: candidate, target, directory: targetInfo?.isDirectory() === true });
  // Removing the link itself does not mutate its external target. This is the
  // migration boundary from legacy team-skills links to release-owned bytes.
  await rm(candidate, { recursive: true, force: true });
}

async function recordCreatedDirectoryChain(
  directory: string,
  directories: DirectorySnapshot[],
): Promise<void> {
  const missing: string[] = [];
  let current = directory;
  while (!(await pathExists(current))) {
    missing.push(current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  for (const candidate of missing.reverse()) {
    if (!directories.some((snapshot) => snapshot.path === candidate)) {
      directories.push({ path: candidate, existed: false });
    }
  }
  if (missing.length === 0 && !directories.some((snapshot) => snapshot.path === directory)) {
    directories.push({ path: directory, existed: true });
  }
}

async function rollbackFiles(files: readonly FileSnapshot[]): Promise<void> {
  for (const file of [...files].reverse()) {
    if (file.previous === undefined) {
      await rm(file.path, { force: true }).catch(() => undefined);
    } else {
      await mkdir(path.dirname(file.path), { recursive: true }).catch(() => undefined);
      await writeFile(file.path, file.previous).catch(() => undefined);
    }
  }
}

async function rollbackDirectories(directories: readonly DirectorySnapshot[]): Promise<void> {
  for (const directory of [...directories].reverse()) {
    if (!directory.existed) {
      await rm(directory.path, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

async function rollbackLinks(links: readonly LinkSnapshot[]): Promise<void> {
  for (const link of [...links].reverse()) {
    await rm(link.path, { recursive: true, force: true }).catch(() => undefined);
    await mkdir(path.dirname(link.path), { recursive: true }).catch(() => undefined);
    await symlink(link.target, link.path, link.directory ? "junction" : "file").catch(
      () => undefined,
    );
  }
}

async function readBundle(bundleRoot: string): Promise<{
  skills: Record<DysflowSkillName, BundledSkill>;
  hashes: Record<DysflowSkillName, string>;
  harnessVersion: string;
}> {
  const skillsRoot = path.resolve(bundleRoot, "skills");
  const skills = {} as Record<DysflowSkillName, BundledSkill>;
  const hashes = {} as Record<DysflowSkillName, string>;
  for (const name of DYSSKILL_NAMES) {
    const skillRoot = childPath(skillsRoot, name);
    const files = await readSkillTree(skillRoot);
    const hash = skillTreeHash(files);
    skills[name] = { files };
    hashes[name] = hash;
  }
  let harnessVersion = MCP_HARNESS_VERSION;
  try {
    const packageJson = JSON.parse(
      await readFile(path.join(path.resolve(bundleRoot), "package.json"), "utf8"),
    ) as { version?: unknown };
    if (typeof packageJson.version === "string" && packageJson.version.length > 0) {
      harnessVersion = packageJson.version;
    }
  } catch {
    // Unit fixtures may consist solely of the skill bundle. Production release
    // packages always carry package.json and therefore take the product version.
  }
  return { skills, hashes, harnessVersion };
}

async function ensureManagedDirectory(
  skillDir: string,
  relativeDirectory: string,
  directories: DirectorySnapshot[],
  links: LinkSnapshot[],
): Promise<void> {
  let current = skillDir;
  for (const segment of relativeDirectory.split("/").filter(Boolean)) {
    current = childPath(current, segment);
    const existed = await pathExists(current);
    await replaceManagedLink(current, links);
    if (!directories.some((snapshot) => snapshot.path === current)) {
      directories.push({ path: current, existed });
    }
    await mkdir(current, { recursive: true });
  }
}

async function pruneUnexpectedSkillFiles(
  skillDir: string,
  expectedPaths: ReadonlySet<string>,
  files: FileSnapshot[],
  links: LinkSnapshot[],
  relativeDirectory = "",
): Promise<void> {
  const directory = relativeDirectory
    ? childPath(skillDir, ...relativeDirectory.split("/"))
    : skillDir;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relativePath = relativeDirectory
      ? path.posix.join(relativeDirectory, entry.name)
      : entry.name;
    const absolutePath = childPath(skillDir, ...relativePath.split("/"));
    if (entry.isSymbolicLink()) {
      await replaceManagedLink(absolutePath, links);
    } else if (entry.isDirectory()) {
      await pruneUnexpectedSkillFiles(skillDir, expectedPaths, files, links, relativePath);
    } else if (entry.isFile() && !expectedPaths.has(relativePath)) {
      files.push({ path: absolutePath, previous: await readFile(absolutePath) });
      await rm(absolutePath, { force: true });
    }
  }
}

/**
 * Fail-closed release/install preflight. Every runtime install must carry the
 * complete canonical skill bundle before any destination path is mutated.
 */
export async function assertBundledSkillsAvailable(bundleRoot: string): Promise<void> {
  await readBundle(bundleRoot);
}

/** #1860 — hashes of the skills this install writes, keyed by name. */
function pickHashes(
  hashes: Record<DysflowSkillName, string>,
  names: readonly DysflowSkillName[],
): Record<DysflowSkillName, string> {
  return Object.fromEntries(names.map((name) => [name, hashes[name]])) as Record<
    DysflowSkillName,
    string
  >;
}

/** #1860 — the skill hashes recorded by an earlier install in `skillsDir`, if any. */
async function readRecordedSkillHashes(skillsDir: string): Promise<Record<string, string>> {
  try {
    const parsed = JSON.parse(
      await readFile(childPath(skillsDir, HARNESS_METADATA_FILE), "utf8"),
    ) as { skills?: unknown };
    if (typeof parsed.skills !== "object" || parsed.skills === null) return {};
    return Object.fromEntries(
      Object.entries(parsed.skills as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

function metadataContent(hashes: Record<DysflowSkillName, string>, harnessVersion: string): string {
  return `${JSON.stringify(
    {
      schemaVersion: HARNESS_METADATA_SCHEMA_VERSION,
      mcpHarnessVersion: harnessVersion,
      skills: hashes,
    },
    null,
    2,
  )}\n`;
}

/**
 * Transactionally replace Dysflow-owned skill bytes across every selected
 * adapter. Pre-existing files are restored byte-for-byte on failure; files and
 * directories created by this transaction are removed. No unrelated skill is
 * enumerated or modified.
 */
export async function installBundledSkills(options: {
  bundleRoot: string;
  targets: readonly SkillTarget[];
  /** #1860 — maintainer skills are written only when explicitly requested. */
  includeMaintainerSkills?: boolean;
}): Promise<SkillInstallReport> {
  const bundle = await readBundle(options.bundleRoot);
  // The environment switch is the opt-in until the install and update commands take a flag.
  const maintainerOptIn =
    options.includeMaintainerSkills ?? process.env.DYSFLOW_MAINTAINER_SKILLS === "1";
  const selected: readonly DysflowSkillName[] = maintainerOptIn
    ? DYSSKILL_NAMES
    : CONSUMER_SKILL_NAMES;
  const files: FileSnapshot[] = [];
  const directories: DirectorySnapshot[] = [];
  const links: LinkSnapshot[] = [];
  const installed: SkillInstallTargetReport[] = [];
  const seen = new Set<string>();

  try {
    for (const target of options.targets) {
      const skillsDir = assertSafeSkillsDir(target);
      const key = `${target.agentId}\0${skillsDir.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      await assertNotSymbolicLink(skillsDir);
      await recordCreatedDirectoryChain(skillsDir, directories);
      await mkdir(skillsDir, { recursive: true });
      const writtenFiles: string[] = [];

      for (const name of selected) {
        const skillDir = childPath(skillsDir, name);
        const skillDirExisted = await pathExists(skillDir);
        await replaceManagedLink(skillDir, links);
        if (!directories.some((snapshot) => snapshot.path === skillDir)) {
          directories.push({ path: skillDir, existed: skillDirExisted });
        }
        await mkdir(skillDir, { recursive: true });
        for (const [relativePath, content] of bundle.skills[name].files) {
          await ensureManagedDirectory(
            skillDir,
            path.posix.dirname(relativePath) === "." ? "" : path.posix.dirname(relativePath),
            directories,
            links,
          );
          const skillFile = childPath(skillsDir, name, ...relativePath.split("/"));
          await replaceManagedLink(skillFile, links);
          const previous = await readFile(skillFile).catch(() => undefined);
          files.push({ path: skillFile, previous });
          await writeFile(skillFile, content);
          writtenFiles.push(skillFile);
        }
        await pruneUnexpectedSkillFiles(
          skillDir,
          new Set(bundle.skills[name].files.keys()),
          files,
          links,
        );
      }

      // #1860 — remove an unedited skill this install record owns but this version
      // no longer ships. An edited copy stays, as in removeOwnedBundledSkills.
      const recorded = await readRecordedSkillHashes(skillsDir);
      for (const [stale, expected] of Object.entries(recorded)) {
        if (selected.includes(stale as DysflowSkillName)) continue;
        const staleDir = childPath(skillsDir, stale);
        if (!(await pathExists(staleDir))) continue;
        const actual = await readSkillTree(staleDir)
          .then((files) => skillTreeHash(files))
          .catch(() => undefined);
        if (actual === expected) await rm(staleDir, { recursive: true, force: true });
      }

      const metadataFile = childPath(skillsDir, HARNESS_METADATA_FILE);
      await replaceManagedLink(metadataFile, links);
      const previousMetadata = await readFile(metadataFile).catch(() => undefined);
      files.push({ path: metadataFile, previous: previousMetadata });
      await writeFile(
        metadataFile,
        metadataContent(pickHashes(bundle.hashes, selected), bundle.harnessVersion),
        "utf8",
      );
      writtenFiles.push(metadataFile);
      installed.push({ agentId: target.agentId, skillsDir, writtenFiles });
    }
  } catch (error) {
    await rollbackFiles(files);
    await rollbackDirectories(directories);
    await rollbackLinks(links);
    throw error;
  }

  return { harnessVersion: bundle.harnessVersion, installed };
}

export async function diagnoseBundledSkills(options: {
  bundleRoot: string;
  targets: readonly SkillTarget[];
}): Promise<SkillDoctorStatus[]> {
  const bundle = await readBundle(options.bundleRoot);
  const statuses: SkillDoctorStatus[] = [];
  for (const target of options.targets) {
    const skillsDir = assertSafeSkillsDir(target);
    const skillsDirExists = await pathExists(skillsDir);
    let installedVersion: string | undefined;
    let recordedNames: string[] = [];
    try {
      const metadata = JSON.parse(
        await readFile(childPath(skillsDir, HARNESS_METADATA_FILE), "utf8"),
      ) as { mcpHarnessVersion?: unknown; skills?: unknown };
      if (typeof metadata.mcpHarnessVersion === "string") {
        installedVersion = metadata.mcpHarnessVersion;
      }
      if (typeof metadata.skills === "object" && metadata.skills !== null) {
        recordedNames = Object.keys(metadata.skills);
      }
    } catch {
      installedVersion = undefined;
    }
    // #1860 — check the skills this install owns; a default install owns the consumer pair only.
    const owned = (recordedNames.length > 0 ? recordedNames : CONSUMER_SKILL_NAMES).filter(
      (name): name is DysflowSkillName => (DYSSKILL_NAMES as readonly string[]).includes(name),
    );
    const staleSkills: DysflowSkillName[] = [];
    for (const name of owned) {
      const installedFiles = await readSkillTree(childPath(skillsDir, name)).catch(() => undefined);
      if (
        installedFiles === undefined ||
        installedFiles.size !== bundle.skills[name].files.size ||
        skillTreeHash(installedFiles) !== bundle.hashes[name]
      ) {
        staleSkills.push(name);
      }
    }
    statuses.push({
      agentId: target.agentId,
      skillsDir,
      skillsDirExists,
      installedVersion,
      versionMatch: installedVersion === bundle.harnessVersion,
      hashesMatch: staleSkills.length === 0,
      expectedHashes: bundle.hashes,
      staleSkills,
    });
  }
  return statuses;
}

export type OwnedSkillRemovalReport = {
  skillsDir: string;
  removed: DysflowSkillName[];
  /** Skills whose bytes no longer match the recorded hash: left in place. */
  preserved: DysflowSkillName[];
};

/**
 * Remove the release-owned skills a previous install wrote into `skillsDir`.
 * Ownership is the `.dysflow-harness.json` record: a skill is removed only
 * while its tree still hashes to the recorded value, so an edited copy and
 * every unrelated skill stay byte-identical. The record goes away once no
 * owned skill remains.
 */
export async function removeOwnedBundledSkills(
  skillsDir: string,
): Promise<OwnedSkillRemovalReport> {
  const root = assertSafeSkillsDir({ agentId: "pi", skillsDir });
  const report: OwnedSkillRemovalReport = { skillsDir: root, removed: [], preserved: [] };
  const metadataFile = childPath(root, HARNESS_METADATA_FILE);
  let recorded: Partial<Record<DysflowSkillName, unknown>>;
  try {
    const parsed = JSON.parse(await readFile(metadataFile, "utf8")) as { skills?: unknown };
    if (typeof parsed.skills !== "object" || parsed.skills === null) return report;
    recorded = parsed.skills as Partial<Record<DysflowSkillName, unknown>>;
  } catch {
    return report;
  }
  for (const name of DYSSKILL_NAMES) {
    const expected = recorded[name];
    const skillDir = childPath(root, name);
    if (typeof expected !== "string" || !(await pathExists(skillDir))) continue;
    const actual = await readSkillTree(skillDir)
      .then((files) => skillTreeHash(files))
      .catch(() => undefined);
    if (actual === expected) {
      await rm(skillDir, { recursive: true, force: true });
      report.removed.push(name);
    } else {
      report.preserved.push(name);
    }
  }
  if (report.preserved.length === 0) await rm(metadataFile, { force: true });
  return report;
}

export function formatSkillInstallReport(report: SkillInstallReport): string {
  if (report.installed.length === 0) {
    return "Bundled skills: no discovered or explicitly selected adapter SkillsDir targets.";
  }
  return [
    `Bundled skills v${report.harnessVersion}: installed to ${report.installed.length} adapter target(s).`,
    ...report.installed.map(
      (target) => `- ${target.agentId}: ${target.skillsDir} (${DYSSKILL_NAMES.length} skills)`,
    ),
  ].join("\n");
}
