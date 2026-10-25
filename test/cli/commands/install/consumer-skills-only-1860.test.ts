/**
 * Issue #1860 — `dysflow install` is the official channel for the two consumer
 * skills. A default install writes exactly `dysflow-usage` and `dysflow-arnes`;
 * maintainer skills need an explicit opt-in; an unedited skill that an earlier
 * install wrote and this version no longer ships is removed.
 */

import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CONSUMER_SKILL_NAMES,
  installBundledSkills,
  MAINTAINER_SKILL_NAMES,
} from "../../../../src/cli/commands/install/skills-installer.js";

let root: string;
let bundleRoot: string;

async function seedBundle(): Promise<void> {
  for (const name of [...CONSUMER_SKILL_NAMES, ...MAINTAINER_SKILL_NAMES]) {
    await mkdir(join(bundleRoot, "skills", name), { recursive: true });
    await writeFile(join(bundleRoot, "skills", name, "SKILL.md"), `# ${name}\n`, "utf8");
  }
  await writeFile(join(bundleRoot, "package.json"), JSON.stringify({ version: "4.4.99" }), "utf8");
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "dysflow-1860-"));
  bundleRoot = join(root, "bundle");
  await seedBundle();
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("consumer skills only by default (#1860)", () => {
  it("a clean install writes exactly dysflow-usage and dysflow-arnes", async () => {
    const skillsDir = join(root, "agent", "skills");

    await installBundledSkills({ bundleRoot, targets: [{ agentId: "codex", skillsDir }] });

    const written = (await readdir(skillsDir)).filter((entry) => !entry.startsWith("."));
    expect(written.sort()).toEqual([...CONSUMER_SKILL_NAMES].sort());
  });

  it("writes the maintainer skills only with the opt-in", async () => {
    const skillsDir = join(root, "agent", "skills");

    await installBundledSkills({
      bundleRoot,
      targets: [{ agentId: "codex", skillsDir }],
      includeMaintainerSkills: true,
    });

    const written = (await readdir(skillsDir)).filter((entry) => !entry.startsWith("."));
    expect(written.sort()).toEqual([...CONSUMER_SKILL_NAMES, ...MAINTAINER_SKILL_NAMES].sort());
  });

  it("removes an unedited maintainer skill that an earlier install wrote", async () => {
    const skillsDir = join(root, "agent", "skills");
    await installBundledSkills({
      bundleRoot,
      targets: [{ agentId: "codex", skillsDir }],
      includeMaintainerSkills: true,
    });

    await installBundledSkills({ bundleRoot, targets: [{ agentId: "codex", skillsDir }] });

    const written = (await readdir(skillsDir)).filter((entry) => !entry.startsWith("."));
    expect(written.sort()).toEqual([...CONSUMER_SKILL_NAMES].sort());
  });

  it("keeps a maintainer skill the user edited", async () => {
    const skillsDir = join(root, "agent", "skills");
    await installBundledSkills({
      bundleRoot,
      targets: [{ agentId: "codex", skillsDir }],
      includeMaintainerSkills: true,
    });
    const edited = join(skillsDir, MAINTAINER_SKILL_NAMES[0], "SKILL.md");
    await writeFile(edited, "user edit\n", "utf8");

    await installBundledSkills({ bundleRoot, targets: [{ agentId: "codex", skillsDir }] });

    expect(await readFile(edited, "utf8")).toBe("user edit\n");
  });

  it("honors DYSFLOW_MAINTAINER_SKILLS=1 as the opt-in", async () => {
    const skillsDir = join(root, "agent", "skills");
    const previous = process.env.DYSFLOW_MAINTAINER_SKILLS;
    process.env.DYSFLOW_MAINTAINER_SKILLS = "1";
    try {
      await installBundledSkills({ bundleRoot, targets: [{ agentId: "codex", skillsDir }] });
    } finally {
      if (previous === undefined) delete process.env.DYSFLOW_MAINTAINER_SKILLS;
      else process.env.DYSFLOW_MAINTAINER_SKILLS = previous;
    }
    const written = (await readdir(skillsDir)).filter((entry) => !entry.startsWith("."));
    expect(written.sort()).toEqual([...CONSUMER_SKILL_NAMES, ...MAINTAINER_SKILL_NAMES].sort());
  });

  it("does not ship access-form-ui-builder any more", async () => {
    const skillsDir = join(root, "agent", "skills");
    await mkdir(join(bundleRoot, "skills", "access-form-ui-builder"), { recursive: true });
    await writeFile(join(bundleRoot, "skills", "access-form-ui-builder", "SKILL.md"), "x", "utf8");

    await installBundledSkills({
      bundleRoot,
      targets: [{ agentId: "codex", skillsDir }],
      includeMaintainerSkills: true,
    });

    const written = await readdir(skillsDir);
    expect(written).not.toContain("access-form-ui-builder");
  });
});
