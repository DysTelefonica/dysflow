/**
 * Issue #1860 — the install scope: the `--maintainer-skills` flag (the environment
 * variable stays as an alias), the release channel recorded and reported by doctor,
 * the retired dysflow-protocol link removed, and an update on the main channel that
 * refreshes the consumer skills on an isolated HOME.
 */

import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { removeRetiredProtocolLinks } from "../../../../src/cli/commands/install/plugin-refresher.js";
import {
  CONSUMER_SKILL_NAMES,
  diagnoseBundledSkills,
  installBundledSkills,
  MAINTAINER_SKILL_NAMES,
} from "../../../../src/cli/commands/install/skills-installer.js";
import { parseInstallArgs, parseUpdateArgs } from "../../../../src/cli/commands/install/updater.js";

let root: string;
let bundleRoot: string;
let home: string;

async function seedBundle(text: string): Promise<void> {
  for (const name of [...CONSUMER_SKILL_NAMES, ...MAINTAINER_SKILL_NAMES]) {
    await mkdir(join(bundleRoot, "skills", name), { recursive: true });
    await writeFile(join(bundleRoot, "skills", name, "SKILL.md"), `# ${name} ${text}\n`, "utf8");
  }
  await writeFile(join(bundleRoot, "package.json"), JSON.stringify({ version: "4.4.99" }), "utf8");
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "dysflow-1860-opts-"));
  bundleRoot = join(root, "bundle");
  home = join(root, "home");
  await mkdir(home, { recursive: true });
  await seedBundle("main");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("--maintainer-skills flag (#1860)", () => {
  it("install parses the flag and defaults it off", () => {
    const withFlag = parseInstallArgs(["--maintainer-skills"]);
    const without = parseInstallArgs([]);
    expect(withFlag.ok && withFlag.options.maintainerSkills).toBe(true);
    expect(without.ok && without.options.maintainerSkills).toBe(false);
  });

  it("update parses the flag", () => {
    const parsed = parseUpdateArgs(["--maintainer-skills"]);
    expect(parsed.ok && parsed.options.maintainerSkills).toBe(true);
  });
});

describe("channel recorded and reported (#1860)", () => {
  it("records the channel in the install record and doctor reports it", async () => {
    const skillsDir = join(root, "agent", "skills");
    await installBundledSkills({
      bundleRoot,
      targets: [{ agentId: "codex", skillsDir }],
      channel: "main",
    });

    const metadata = JSON.parse(
      await readFile(join(skillsDir, ".dysflow-harness.json"), "utf8"),
    ) as {
      channel?: string;
    };
    expect(metadata.channel).toBe("main");

    const [status] = await diagnoseBundledSkills({
      bundleRoot,
      targets: [{ agentId: "codex", skillsDir }],
    });
    expect(status?.channel).toBe("main");
  });
});

describe("retired dysflow-protocol link (#1860)", () => {
  it("removes the symlink an earlier install left, and keeps a real directory", async () => {
    const retiredTarget = join(root, "runtime", "skills", "dysflow-protocol");
    await mkdir(retiredTarget, { recursive: true });
    await mkdir(join(home, ".codex", "skills"), { recursive: true });
    await symlink(retiredTarget, join(home, ".codex", "skills", "dysflow-protocol"), "junction");
    const userOwned = join(home, ".claude", "skills", "dysflow-protocol");
    await mkdir(userOwned, { recursive: true });

    const report = await removeRetiredProtocolLinks(home);

    expect(report.removed).toContain(join(home, ".codex", "skills", "dysflow-protocol"));
    expect(report.preserved).toContain(userOwned);
  });
});

describe("update on the main channel refreshes the consumer skills (#1860)", () => {
  it("replaces the old text and records main, on an isolated HOME", async () => {
    const skillsDir = join(home, ".codex", "skills");
    await mkdir(join(skillsDir, "dysflow-usage"), { recursive: true });
    await writeFile(join(skillsDir, "dysflow-usage", "SKILL.md"), "# old\n", "utf8");

    await installBundledSkills({
      bundleRoot,
      targets: [{ agentId: "codex", skillsDir }],
      channel: "main",
    });

    expect(await readFile(join(skillsDir, "dysflow-usage", "SKILL.md"), "utf8")).toBe(
      "# dysflow-usage main\n",
    );
    const [status] = await diagnoseBundledSkills({
      bundleRoot,
      targets: [{ agentId: "codex", skillsDir }],
    });
    expect(status?.channel).toBe("main");
    expect(status?.hashesMatch).toBe(true);
    expect(status?.versionMatch).toBe(true);
  });
});
