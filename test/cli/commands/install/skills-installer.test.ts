import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DYSSKILL_NAMES,
  diagnoseBundledSkills,
  discoverSkillTargets,
  HARNESS_METADATA_SCHEMA_VERSION,
  installBundledSkills,
  MCP_HARNESS_VERSION,
} from "../../../../src/cli/commands/install/skills-installer";

const roots: string[] = [];

async function tempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

async function seedBundle(root: string): Promise<void> {
  for (const name of DYSSKILL_NAMES) {
    await mkdir(join(root, "skills", name), { recursive: true });
    await writeFile(join(root, "skills", name, "SKILL.md"), `# ${name}\n`, "utf8");
  }
  await mkdir(join(root, "skills", "dysflow-codegraph-update", "assets", "scripts"), {
    recursive: true,
  });
  await writeFile(
    join(
      root,
      "skills",
      "dysflow-codegraph-update",
      "assets",
      "scripts",
      "Invoke-DysflowSemanticAudit.ps1",
    ),
    Buffer.from([0xef, 0xbb, 0xbf, 0x23, 0x20, 0x61, 0x75, 0x64, 0x69, 0x74, 0x0a]),
  );
  await mkdir(join(root, "skills", "dysflow-usage", "assets", "examples"), {
    recursive: true,
  });
  await writeFile(
    join(root, "skills", "dysflow-usage", "assets", "examples", "bootstrap.md"),
    "# bootstrap\n",
    "utf8",
  );
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("bundled Dysflow skill installation (#1323)", () => {
  it("copies all bundled skills byte-for-byte and writes product-tied metadata", async () => {
    const root = await tempRoot("dysflow-skills-");
    const bundleRoot = join(root, "bundle");
    const skillsDir = join(root, "consumer", "skills");
    await seedBundle(bundleRoot);

    const report = await installBundledSkills({
      bundleRoot,
      targets: [{ agentId: "codex", skillsDir }],
    });

    expect(report.installed).toHaveLength(1);
    for (const name of DYSSKILL_NAMES) {
      const source = await readFile(join(bundleRoot, "skills", name, "SKILL.md"));
      const installed = await readFile(join(skillsDir, name, "SKILL.md"));
      expect(installed.equals(source)).toBe(true);
    }
    const nestedSource = await readFile(
      join(
        bundleRoot,
        "skills",
        "dysflow-codegraph-update",
        "assets",
        "scripts",
        "Invoke-DysflowSemanticAudit.ps1",
      ),
    );
    const nestedInstalled = await readFile(
      join(
        skillsDir,
        "dysflow-codegraph-update",
        "assets",
        "scripts",
        "Invoke-DysflowSemanticAudit.ps1",
      ),
    );
    expect(nestedInstalled.equals(nestedSource)).toBe(true);
    const metadata = JSON.parse(
      await readFile(join(skillsDir, ".dysflow-harness.json"), "utf8"),
    ) as { schemaVersion: number; mcpHarnessVersion: string; skills: Record<string, string> };
    expect(metadata.schemaVersion).toBe(HARNESS_METADATA_SCHEMA_VERSION);
    expect(metadata.mcpHarnessVersion).toBe(MCP_HARNESS_VERSION);
    expect(Object.keys(metadata.skills).sort()).toEqual([...DYSSKILL_NAMES].sort());
  });

  it("binds metadata to the release package version during an update", async () => {
    const root = await tempRoot("dysflow-skills-version-");
    const bundleRoot = join(root, "bundle");
    const skillsDir = join(root, "consumer", "skills");
    await seedBundle(bundleRoot);
    await writeFile(
      join(bundleRoot, "package.json"),
      JSON.stringify({ name: "dysflow", version: "9.9.9" }),
      "utf8",
    );

    const report = await installBundledSkills({
      bundleRoot,
      targets: [{ agentId: "codex", skillsDir }],
    });
    const metadata = JSON.parse(
      await readFile(join(skillsDir, ".dysflow-harness.json"), "utf8"),
    ) as { mcpHarnessVersion: string };

    expect(report.harnessVersion).toBe("9.9.9");
    expect(metadata.mcpHarnessVersion).toBe("9.9.9");
  });

  it("restores existing bytes and removes newly-created paths after a later target fails", async () => {
    const root = await tempRoot("dysflow-skills-rollback-");
    const bundleRoot = join(root, "bundle");
    const firstSkillsDir = join(root, "first", "skills");
    const failingSkillsDir = join(root, "not-a-directory");
    await seedBundle(bundleRoot);
    await mkdir(join(firstSkillsDir, "dysflow-arnes"), { recursive: true });
    await writeFile(join(firstSkillsDir, "dysflow-arnes", "SKILL.md"), "original bytes", "utf8");
    await mkdir(join(firstSkillsDir, "dysflow-codegraph-update", "assets", "scripts"), {
      recursive: true,
    });
    const nestedFile = join(
      firstSkillsDir,
      "dysflow-codegraph-update",
      "assets",
      "scripts",
      "Invoke-DysflowSemanticAudit.ps1",
    );
    await writeFile(nestedFile, "original nested bytes", "utf8");
    await writeFile(failingSkillsDir, "blocks mkdir", "utf8");

    await expect(
      installBundledSkills({
        bundleRoot,
        targets: [
          { agentId: "codex", skillsDir: firstSkillsDir },
          { agentId: "claude", skillsDir: failingSkillsDir },
        ],
      }),
    ).rejects.toThrow();

    expect(await readFile(join(firstSkillsDir, "dysflow-arnes", "SKILL.md"), "utf8")).toBe(
      "original bytes",
    );
    expect(await readFile(nestedFile, "utf8")).toBe("original nested bytes");
    await expect(stat(join(firstSkillsDir, "dysflow-usage"))).rejects.toThrow();
    await expect(stat(join(firstSkillsDir, ".dysflow-harness.json"))).rejects.toThrow();
  });

  it("discovers only existing adapters, while --only targets are explicit", async () => {
    const home = await tempRoot("dysflow-skills-home-");
    await mkdir(join(home, ".codex"), { recursive: true });
    await writeFile(join(home, ".codex", "config.toml"), "# configured\n", "utf8");

    expect(discoverSkillTargets(home).map((target) => target.agentId)).toEqual(["codex"]);
    expect(
      discoverSkillTargets(home, { only: ["opencode"], exclude: [] }).map(
        (target) => target.agentId,
      ),
    ).toEqual(["opencode"]);
    expect(
      discoverSkillTargets(home, { only: [], exclude: ["codex"] }).map((target) => target.agentId),
    ).toEqual([]);
  });

  it("targets Pi's documented global SkillsDir under the agent config root", async () => {
    const home = await tempRoot("dysflow-skills-pi-home-");
    await mkdir(join(home, ".pi", "agent"), { recursive: true });
    await writeFile(join(home, ".pi", "agent", "mcp.json"), "{}\n", "utf8");

    expect(discoverSkillTargets(home)).toContainEqual({
      agentId: "pi",
      skillsDir: join(home, ".pi", "agent", "skills"),
    });
  });

  it("does not touch nonselected adapter skill bytes", async () => {
    const root = await tempRoot("dysflow-skills-selection-");
    const bundleRoot = join(root, "bundle");
    const codexSkills = join(root, "codex", "skills");
    const opencodeSkills = join(root, "opencode", "skills");
    await seedBundle(bundleRoot);
    await mkdir(join(opencodeSkills, "dysflow-arnes"), { recursive: true });
    await writeFile(join(opencodeSkills, "dysflow-arnes", "SKILL.md"), "untouched", "utf8");

    await installBundledSkills({
      bundleRoot,
      targets: [{ agentId: "codex", skillsDir: codexSkills }],
    });

    expect(await readFile(join(opencodeSkills, "dysflow-arnes", "SKILL.md"), "utf8")).toBe(
      "untouched",
    );
    await expect(stat(join(opencodeSkills, ".dysflow-harness.json"))).rejects.toThrow();
  });

  it("replaces legacy managed skill links without editing their external targets", async () => {
    const root = await tempRoot("dysflow-skills-links-");
    const bundleRoot = join(root, "bundle");
    const externalSkill = join(root, "legacy-team-skills", "dysflow-arnes");
    const skillsDir = join(root, "consumer", "skills");
    await seedBundle(bundleRoot);
    await mkdir(externalSkill, { recursive: true });
    await writeFile(join(externalSkill, "SKILL.md"), "legacy external bytes", "utf8");
    await mkdir(skillsDir, { recursive: true });
    await symlink(externalSkill, join(skillsDir, "dysflow-arnes"), "junction");

    await installBundledSkills({
      bundleRoot,
      targets: [{ agentId: "codex", skillsDir }],
    });

    expect((await lstat(join(skillsDir, "dysflow-arnes"))).isSymbolicLink()).toBe(false);
    expect(await readFile(join(externalSkill, "SKILL.md"), "utf8")).toBe("legacy external bytes");
    expect(await readFile(join(skillsDir, "dysflow-arnes", "SKILL.md"), "utf8")).toBe(
      "# dysflow-arnes\n",
    );
  });

  it("rejects unbounded target paths before writing", async () => {
    const root = await tempRoot("dysflow-skills-safety-");
    const bundleRoot = join(root, "bundle");
    await seedBundle(bundleRoot);

    await expect(
      installBundledSkills({
        bundleRoot,
        targets: [{ agentId: "codex", skillsDir: "." }],
      }),
    ).rejects.toThrow(/absolute SkillsDir/i);
  });

  it("doctor reports adapter discovery, hash drift, and harness version drift", async () => {
    const root = await tempRoot("dysflow-skills-doctor-");
    const bundleRoot = join(root, "bundle");
    const skillsDir = join(root, "consumer", "skills");
    await seedBundle(bundleRoot);
    await installBundledSkills({
      bundleRoot,
      targets: [{ agentId: "codex", skillsDir }],
    });
    await writeFile(
      join(skillsDir, "dysflow-usage", "assets", "examples", "bootstrap.md"),
      "stale nested example",
      "utf8",
    );

    const statuses = await diagnoseBundledSkills({
      bundleRoot,
      targets: [{ agentId: "codex", skillsDir }],
    });

    expect(statuses).toEqual([
      expect.objectContaining({
        agentId: "codex",
        skillsDirExists: true,
        versionMatch: true,
        hashesMatch: false,
        staleSkills: ["dysflow-usage"],
      }),
    ]);
    const fileHash = createHash("sha256").update("# dysflow-arnes\n").digest("hex");
    const expected = createHash("sha256").update(`SKILL.md\0${fileHash}`).digest("hex");
    expect(statuses[0]?.expectedHashes["dysflow-arnes"]).toBe(expected);
  });

  it("detects and removes stale nested files that are no longer in the canonical bundle", async () => {
    const root = await tempRoot("dysflow-skills-stale-nested-");
    const bundleRoot = join(root, "bundle");
    const skillsDir = join(root, "consumer", "skills");
    const staleFile = join(skillsDir, "dysflow-usage", "assets", "examples", "removed-tool.md");
    await seedBundle(bundleRoot);
    await installBundledSkills({
      bundleRoot,
      targets: [{ agentId: "codex", skillsDir }],
    });
    await writeFile(staleFile, "stale nested bytes", "utf8");

    const [before] = await diagnoseBundledSkills({
      bundleRoot,
      targets: [{ agentId: "codex", skillsDir }],
    });
    expect(before?.staleSkills).toContain("dysflow-usage");

    await installBundledSkills({
      bundleRoot,
      targets: [{ agentId: "codex", skillsDir }],
    });

    await expect(readFile(staleFile)).rejects.toThrow();
    const [after] = await diagnoseBundledSkills({
      bundleRoot,
      targets: [{ agentId: "codex", skillsDir }],
    });
    expect(after?.hashesMatch).toBe(true);
  });
});
