import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { handleDoctorCommand } from "../../../src/cli/commands/doctor";
import { resolvePackageRoot } from "../../../src/cli/commands/install/package-root";
import { installBundledSkills } from "../../../src/cli/commands/install/skills-installer";
import { successResult } from "../../../src/core/contracts/index";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("doctor bundled-skills check (#1323)", () => {
  it("flags a discovered adapter with hash drift as a severe finding", async () => {
    const home = await mkdtemp(join(tmpdir(), "dysflow-doctor-skills-"));
    roots.push(home);
    const skillsDir = join(home, ".codex", "skills");
    await mkdir(skillsDir, { recursive: true });
    await installBundledSkills({
      bundleRoot: resolvePackageRoot(),
      targets: [{ agentId: "codex", skillsDir }],
    });
    await writeFile(join(skillsDir, "dysflow-arnes", "SKILL.md"), "drift", "utf8");

    const result = await handleDoctorCommand([], {
      env: { HOME: home },
      diagnosticsService: {
        run: async () => successResult({ checks: [] }),
      },
      checkMcpWiring: async () => null,
      checkSupplementDrift: false,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("✗ skills-installation[codex]");
    expect(result.stdout).toContain("stale skills: dysflow-arnes");
  });

  it("supports a skills-only doctor without Access or project configuration", async () => {
    const home = await mkdtemp(join(tmpdir(), "dysflow-doctor-skills-only-"));
    roots.push(home);
    const skillsDir = join(home, ".codex", "skills");
    await installBundledSkills({
      bundleRoot: resolvePackageRoot(),
      targets: [{ agentId: "codex", skillsDir }],
    });

    const result = await handleDoctorCommand(["--skills"], { env: { HOME: home } });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("✓ skills-installation[codex]");
  });
});
