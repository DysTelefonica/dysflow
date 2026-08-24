import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  discoverPointerRolloutTargets,
  installBundledPointerBlocks,
  type PointerRolloutTarget,
} from "../../../../src/cli/commands/install/pointer-rollout.js";

const roots: string[] = [];
const OPEN = "<!-- user-supplement:dysflow:pointer -->";
const CLOSE = "<!-- /user-supplement:dysflow:pointer -->";

async function fixture(): Promise<{ bundleRoot: string; home: string; pointer: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "dysflow-pointer-rollout-"));
  roots.push(root);
  const bundleRoot = path.join(root, "bundle");
  const home = path.join(root, "home");
  const pointer = `${OPEN}\n## Current pointer\n\nUse the live runtime.\n${CLOSE}\n`;
  await mkdir(path.join(bundleRoot, "skills", "dysflow-pointer-rollout", "assets"), {
    recursive: true,
  });
  await writeFile(
    path.join(bundleRoot, "skills", "dysflow-pointer-rollout", "assets", "pointer.md"),
    pointer,
    "utf8",
  );
  return { bundleRoot, home, pointer };
}

function region(content: string): string {
  const start = content.indexOf(OPEN) + OPEN.length;
  return content.slice(start, content.indexOf(CLOSE, start));
}

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function targets(): PointerRolloutTarget[] {
  return ["opencode", "claude", "codex", "cursor", "pi"].map((agentId) => ({
    agentId: agentId as PointerRolloutTarget["agentId"],
  }));
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("discoverPointerRolloutTargets", () => {
  it("includes existing instruction files even when no SkillsDir target is discovered", async () => {
    const { home } = await fixture();
    const claudePath = path.join(home, ".claude", "CLAUDE.md");
    await mkdir(path.dirname(claudePath), { recursive: true });
    await writeFile(claudePath, "existing instructions\n", "utf8");

    expect(
      discoverPointerRolloutTargets({
        home,
        installedSkillTargets: [],
      }),
    ).toEqual([{ agentId: "claude" }]);
  });

  it("rejects an empty or relative home before discovering targets", () => {
    expect(() =>
      discoverPointerRolloutTargets({
        home: "",
        installedSkillTargets: [],
        only: ["codex"],
      }),
    ).toThrow(/absolute user home/i);
    expect(() =>
      discoverPointerRolloutTargets({
        home: "relative-home",
        installedSkillTargets: [],
        only: ["codex"],
      }),
    ).toThrow(/absolute user home/i);
  });
});

describe("installBundledPointerBlocks", () => {
  it("rewrites every in-matrix user-global to the canonical inlined-region hash", async () => {
    const { bundleRoot, home, pointer } = await fixture();
    const paths = {
      opencode: path.join(home, ".config", "opencode", "AGENTS.md"),
      claude: path.join(home, ".claude", "CLAUDE.md"),
      codex: path.join(home, ".codex", "AGENTS.md"),
      cursor: path.join(home, ".cursor", "rules", "dysflow-vba.mdc"),
      pi: path.join(home, ".pi", "agent", "APPEND_SYSTEM.md"),
    } as const;
    for (const filePath of [paths.opencode, paths.claude, paths.codex, paths.pi]) {
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, `keep-before\n${OPEN}\nstale\n${CLOSE}\nkeep-after\n`, "utf8");
    }
    await mkdir(path.dirname(paths.cursor), { recursive: true });
    const cursorFrontmatter = "---\ndescription: Dysflow\nalwaysApply: true\n---";
    await writeFile(paths.cursor, `${cursorFrontmatter}\nstale\n`, "utf8");

    const report = await installBundledPointerBlocks({
      bundleRoot,
      home,
      targets: targets(),
    });

    const canonicalHash = sha256(region(pointer));
    expect(report.pointerHash).toBe(canonicalHash);
    expect(report.targets).toHaveLength(5);
    expect(report.targets.every((target) => target.status === "replaced")).toBe(true);
    for (const filePath of [paths.opencode, paths.claude, paths.codex, paths.pi]) {
      const installed = await readFile(filePath, "utf8");
      expect(sha256(region(installed))).toBe(canonicalHash);
      expect(installed).toContain("keep-before");
      expect(installed).toContain("keep-after");
    }
    const cursorInstalled = await readFile(paths.cursor, "utf8");
    expect(cursorInstalled.startsWith(cursorFrontmatter)).toBe(true);
    expect(sha256(cursorInstalled.slice(cursorFrontmatter.length))).toBe(canonicalHash);
  });

  it("creates an absent selected user-global and reports appended", async () => {
    const { bundleRoot, home, pointer } = await fixture();

    const report = await installBundledPointerBlocks({
      bundleRoot,
      home,
      targets: [{ agentId: "codex" }],
    });

    const installed = await readFile(path.join(home, ".codex", "AGENTS.md"), "utf8");
    expect(installed).toBe(pointer);
    expect(report.targets).toMatchObject([{ agentId: "codex", status: "appended" }]);
  });

  it("fails closed without changing a file that has only one pointer marker", async () => {
    const { bundleRoot, home } = await fixture();
    const filePath = path.join(home, ".codex", "AGENTS.md");
    const malformed = `keep\n${OPEN}\nstale without close\n`;
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, malformed, "utf8");

    await expect(
      installBundledPointerBlocks({
        bundleRoot,
        home,
        targets: [{ agentId: "codex" }],
      }),
    ).rejects.toThrow(/pointer marker/i);
    expect(await readFile(filePath, "utf8")).toBe(malformed);
  });

  it("rolls back prior targets and reports the backup when a later target fails", async () => {
    const { bundleRoot, home } = await fixture();
    const codexPath = path.join(home, ".codex", "AGENTS.md");
    const claudePath = path.join(home, ".claude", "CLAUDE.md");
    const codexBefore = `codex-before\n${OPEN}\nstale\n${CLOSE}\n`;
    await mkdir(path.dirname(codexPath), { recursive: true });
    await mkdir(path.dirname(claudePath), { recursive: true });
    await writeFile(codexPath, codexBefore, "utf8");
    await writeFile(claudePath, `${OPEN}\nmissing close\n`, "utf8");

    let failure: Error | undefined;
    try {
      await installBundledPointerBlocks({
        bundleRoot,
        home,
        targets: [{ agentId: "codex" }, { agentId: "claude" }],
      });
    } catch (error) {
      failure = error as Error;
    }
    expect(failure?.message).toMatch(/rolled back[\s\S]*Backup:/i);
    expect(await readFile(codexPath, "utf8")).toBe(codexBefore);
    const backupDir = failure?.message.match(/^Backup: (.+)$/m)?.[1];
    expect(backupDir).toBeTruthy();
    if (backupDir === undefined) throw new Error("Expected a backup directory in the failure");
    roots.push(backupDir);
    expect(await readFile(path.join(backupDir, ".codex", "AGENTS.md.bak"), "utf8")).toBe(
      codexBefore,
    );
  });

  it("refuses a target whose parent directory is a symbolic link", async () => {
    const { bundleRoot, home } = await fixture();
    const outside = path.join(path.dirname(home), "outside");
    await mkdir(outside, { recursive: true });
    await mkdir(home, { recursive: true });
    await symlink(outside, path.join(home, ".codex"), "junction");

    await expect(
      installBundledPointerBlocks({
        bundleRoot,
        home,
        targets: [{ agentId: "codex" }],
      }),
    ).rejects.toThrow(/symbolic-link pointer path/i);
    await expect(readFile(path.join(outside, "AGENTS.md"), "utf8")).rejects.toThrow();
  });
});
