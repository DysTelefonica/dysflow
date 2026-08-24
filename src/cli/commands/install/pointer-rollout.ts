import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { SKILL_AGENT_IDS, type SkillAgentId, type SkillTarget } from "./skills-installer.js";

const POINTER_OPEN = "<!-- user-supplement:dysflow:pointer -->";
const POINTER_CLOSE = "<!-- /user-supplement:dysflow:pointer -->";

export type PointerRolloutTarget = Pick<SkillTarget, "agentId">;

export type PointerRolloutTargetReport = {
  agentId: SkillAgentId;
  instructionFile: string;
  status: "appended" | "replaced" | "noop";
  beforeHash?: string;
  afterHash: string;
};

export type PointerRolloutReport = {
  pointerHash: string;
  backupDir?: string;
  targets: PointerRolloutTargetReport[];
};

function resolvedUserHome(home: string): string {
  if (home.trim().length === 0 || !path.isAbsolute(home)) {
    throw new Error(
      `Pointer rollout requires an absolute user home path; received: ${home || "<empty>"}`,
    );
  }
  const resolved = path.resolve(home);
  if (resolved === path.parse(resolved).root) {
    throw new Error(`Refusing filesystem-root user home for pointer rollout: ${resolved}`);
  }
  return resolved;
}

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function markerCount(content: string, marker: string): number {
  return content.split(marker).length - 1;
}

function pointerRegion(content: string, source: string): string {
  const openCount = markerCount(content, POINTER_OPEN);
  const closeCount = markerCount(content, POINTER_CLOSE);
  if (openCount !== 1 || closeCount !== 1) {
    throw new Error(
      `Expected exactly one complete pointer marker pair in ${source}; found ${openCount} opening and ${closeCount} closing marker(s).`,
    );
  }
  const start = content.indexOf(POINTER_OPEN) + POINTER_OPEN.length;
  const end = content.indexOf(POINTER_CLOSE, start);
  if (end < start) {
    throw new Error(`Pointer markers are out of order in ${source}.`);
  }
  return content.slice(start, end);
}

export function pointerInstructionFile(home: string, agentId: SkillAgentId): string {
  const relativePaths: Record<SkillAgentId, readonly string[]> = {
    opencode: [".config", "opencode", "AGENTS.md"],
    claude: [".claude", "CLAUDE.md"],
    codex: [".codex", "AGENTS.md"],
    cursor: [".cursor", "rules", "dysflow-vba.mdc"],
    pi: [".pi", "agent", "APPEND_SYSTEM.md"],
  };
  return path.join(resolvedUserHome(home), ...relativePaths[agentId]);
}

export function discoverPointerRolloutTargets(options: {
  home: string;
  installedSkillTargets: readonly SkillTarget[];
  only?: readonly SkillAgentId[];
  exclude?: readonly SkillAgentId[];
}): PointerRolloutTarget[] {
  const home = resolvedUserHome(options.home);
  const only = new Set(options.only ?? []);
  const exclude = new Set(options.exclude ?? []);
  const installed = new Set(options.installedSkillTargets.map((target) => target.agentId));
  return SKILL_AGENT_IDS.filter((agentId) => {
    if (exclude.has(agentId)) return false;
    if (only.size > 0) return only.has(agentId);
    return installed.has(agentId) || existsSync(pointerInstructionFile(home, agentId));
  }).map((agentId) => ({ agentId }));
}

async function exists(filePath: string): Promise<boolean> {
  return stat(filePath)
    .then(() => true)
    .catch(() => false);
}

function appendPointer(existing: string, pointer: string): string {
  if (existing.length === 0) return pointer;
  const separator = existing.endsWith("\n") || existing.endsWith("\r") ? "\n" : "\n\n";
  return `${existing}${separator}${pointer}`;
}

function cursorFrontmatter(content: string, filePath: string): string {
  const match = /^(?:\uFEFF)?---\r?\n[\s\S]*?\r?\n---/.exec(content);
  if (match === null) {
    throw new Error(`Cursor pointer target has missing or malformed frontmatter: ${filePath}`);
  }
  return match[0];
}

async function assertNoSymlinkTraversal(home: string, filePath: string): Promise<void> {
  const resolvedHome = resolvedUserHome(home);
  const relative = path.relative(resolvedHome, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing pointer target outside the user home: ${filePath}`);
  }
  let current = resolvedHome;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    const info = await lstat(current).catch(() => undefined);
    if (info === undefined) break;
    if (info.isSymbolicLink()) {
      throw new Error(`Refusing symbolic-link pointer path: ${current}`);
    }
  }
}

export async function installBundledPointerBlocks(options: {
  bundleRoot: string;
  home: string;
  targets: readonly PointerRolloutTarget[];
}): Promise<PointerRolloutReport> {
  const canonicalPointer = await readFile(
    path.join(
      path.resolve(options.bundleRoot),
      "skills",
      "dysflow-pointer-rollout",
      "assets",
      "pointer.md",
    ),
    "utf8",
  );
  const canonicalRegion = pointerRegion(canonicalPointer, "bundled pointer.md");
  const pointerHash = sha256(canonicalRegion);
  const reports: PointerRolloutTargetReport[] = [];
  const failures: string[] = [];
  const mutations: Array<{ filePath: string; previous?: string }> = [];
  let backupDir: string | undefined;

  async function backUp(filePath: string, content: string): Promise<void> {
    backupDir ??= await mkdtemp(path.join(tmpdir(), "dysflow-pointer-backup-"));
    const relative = path.relative(path.resolve(options.home), filePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Refusing to back up pointer target outside the user home: ${filePath}`);
    }
    const backupPath = path.join(backupDir, `${relative}.bak`);
    await mkdir(path.dirname(backupPath), { recursive: true });
    await writeFile(backupPath, content, "utf8");
  }

  for (const target of options.targets) {
    const filePath = pointerInstructionFile(options.home, target.agentId);
    try {
      await assertNoSymlinkTraversal(options.home, filePath);
      const fileExists = await exists(filePath);
      const current = fileExists ? await readFile(filePath, "utf8") : "";
      let next: string;
      let status: PointerRolloutTargetReport["status"];
      let beforeHash: string | undefined;

      if (target.agentId === "cursor") {
        const frontmatter = fileExists
          ? cursorFrontmatter(current, filePath)
          : "---\ndescription: Dysflow runtime-first rule\nalwaysApply: true\n---";
        const body = fileExists ? current.slice(frontmatter.length) : "";
        beforeHash = sha256(body);
        if (body === canonicalRegion) {
          reports.push({
            agentId: target.agentId,
            instructionFile: filePath,
            status: "noop",
            beforeHash,
            afterHash: pointerHash,
          });
          continue;
        }
        next = `${frontmatter}${canonicalRegion}`;
        status = fileExists ? "replaced" : "appended";
      } else {
        const openCount = markerCount(current, POINTER_OPEN);
        const closeCount = markerCount(current, POINTER_CLOSE);
        if (openCount === 0 && closeCount === 0) {
          next = appendPointer(current, canonicalPointer);
          status = "appended";
        } else {
          const currentRegion = pointerRegion(current, filePath);
          beforeHash = sha256(currentRegion);
          if (currentRegion === canonicalRegion) {
            reports.push({
              agentId: target.agentId,
              instructionFile: filePath,
              status: "noop",
              beforeHash,
              afterHash: pointerHash,
            });
            continue;
          }
          const start = current.indexOf(POINTER_OPEN) + POINTER_OPEN.length;
          const end = current.indexOf(POINTER_CLOSE, start);
          next = `${current.slice(0, start)}${canonicalRegion}${current.slice(end)}`;
          status = "replaced";
        }
      }

      if (fileExists) await backUp(filePath, current);
      await mkdir(path.dirname(filePath), { recursive: true });
      mutations.push({ filePath, ...(fileExists ? { previous: current } : {}) });
      await writeFile(filePath, next, "utf8");
      const persisted = await readFile(filePath, "utf8");
      const persistedRegion =
        target.agentId === "cursor"
          ? persisted.slice(cursorFrontmatter(persisted, filePath).length)
          : pointerRegion(persisted, filePath);
      const afterHash = sha256(persistedRegion);
      if (afterHash !== pointerHash) {
        throw new Error(`Pointer read-back hash mismatch for ${filePath}.`);
      }
      reports.push({
        agentId: target.agentId,
        instructionFile: filePath,
        status,
        ...(beforeHash === undefined ? {} : { beforeHash }),
        afterHash,
      });
    } catch (error) {
      failures.push(
        `${filePath}: ${error instanceof Error ? error.message : "unknown pointer rollout failure"}`,
      );
    }
  }

  if (failures.length > 0) {
    const rollbackFailures: string[] = [];
    for (const mutation of [...mutations].reverse()) {
      try {
        if (mutation.previous === undefined) await rm(mutation.filePath, { force: true });
        else await writeFile(mutation.filePath, mutation.previous, "utf8");
      } catch (error) {
        rollbackFailures.push(
          `${mutation.filePath}: ${error instanceof Error ? error.message : "unknown rollback failure"}`,
        );
      }
    }
    throw new Error(
      [
        "Pointer rollout failed; applied pointer files were rolled back.",
        ...failures,
        `Backup: ${backupDir ?? "none (no existing file was changed)"}`,
        ...(rollbackFailures.length === 0 ? [] : ["Rollback failures:", ...rollbackFailures]),
      ].join("\n"),
    );
  }
  return {
    pointerHash,
    ...(backupDir === undefined ? {} : { backupDir }),
    targets: reports,
  };
}

export function formatPointerRolloutReport(report: PointerRolloutReport): string {
  if (report.targets.length === 0) {
    return "Pointer rollout: no discovered or explicitly selected user-global targets.";
  }
  const changed = report.targets.filter((target) => target.status !== "noop").length;
  return [
    `Pointer rollout: ${changed} changed, ${report.targets.length - changed} current; inlined SHA-256 ${report.pointerHash}.`,
    ...(report.backupDir === undefined ? [] : [`- backups: ${report.backupDir}`]),
    ...report.targets.map(
      (target) => `- ${target.agentId}: ${target.status} at ${target.instructionFile}`,
    ),
  ].join("\n");
}
