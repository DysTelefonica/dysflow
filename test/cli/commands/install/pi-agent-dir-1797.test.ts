import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  resolveAgentConfigPaths,
  resolvePiAgentDir,
} from "../../../../src/cli/commands/install/agent-config.js";
import {
  discoverPointerRolloutTargets,
  installBundledPointerBlocks,
  pointerInstructionFile,
} from "../../../../src/cli/commands/install/pointer-rollout.js";
import { discoverSkillTargets } from "../../../../src/cli/commands/install/skills-installer.js";

const roots: string[] = [];
const OPEN = "<!-- user-supplement:dysflow:pointer -->";
const CLOSE = "<!-- /user-supplement:dysflow:pointer -->";

/**
 * A custom Pi agent directory is deliberately created OUTSIDE the user home,
 * because that is the realistic shape of a host-selected profile.
 */
async function fixture(): Promise<{
  bundleRoot: string;
  home: string;
  customDir: string;
  pointer: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "dysflow-pi-agent-dir-"));
  roots.push(root);
  const bundleRoot = path.join(root, "bundle");
  const home = path.join(root, "home");
  const customDir = path.join(root, "pi-profile", "agent");
  const pointer = `${OPEN}\n## Current pointer\n\nUse the live runtime.\n${CLOSE}\n`;
  await mkdir(home, { recursive: true });
  await mkdir(path.join(bundleRoot, "skills", "dysflow-pointer-rollout", "assets"), {
    recursive: true,
  });
  await writeFile(
    path.join(bundleRoot, "skills", "dysflow-pointer-rollout", "assets", "pointer.md"),
    pointer,
    "utf8",
  );
  return { bundleRoot, home, customDir, pointer };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("PI_CODING_AGENT_DIR owns every Pi-owned artifact (#1797)", () => {
  it("resolves the Pi agent directory from the environment variable", async () => {
    const { home, customDir } = await fixture();

    expect(resolvePiAgentDir(home, { PI_CODING_AGENT_DIR: customDir })).toBe(
      path.resolve(customDir),
    );
  });

  it("points the Pi MCP and settings config paths at the custom directory", async () => {
    const { home, customDir } = await fixture();

    const paths = resolveAgentConfigPaths(home, { PI_CODING_AGENT_DIR: customDir });

    expect(paths.pi).toBe(path.join(path.resolve(customDir), "mcp.json"));
    expect(paths.piSettings).toBe(path.join(path.resolve(customDir), "settings.json"));
    // Non-Pi agents keep their conventional home-relative locations.
    expect(paths.codex).toBe(path.join(home, ".codex", "config.toml"));
    expect(paths.claudeSettings).toBe(path.join(home, ".claude", "settings.json"));
  });

  it("discovers the Pi SkillsDir and probes the MCP config inside the custom directory", async () => {
    const { home, customDir } = await fixture();
    await mkdir(customDir, { recursive: true });
    await writeFile(path.join(customDir, "mcp.json"), "{}\n", "utf8");

    expect(discoverSkillTargets(home, {}, { PI_CODING_AGENT_DIR: customDir })).toContainEqual({
      agentId: "pi",
      skillsDir: path.join(path.resolve(customDir), "skills"),
    });
  });

  it("stops probing the conventional Pi directory once a custom directory is selected", async () => {
    const { home, customDir } = await fixture();
    await mkdir(path.join(home, ".pi", "agent"), { recursive: true });
    await writeFile(path.join(home, ".pi", "agent", "mcp.json"), "{}\n", "utf8");

    const discovered = discoverSkillTargets(home, {}, { PI_CODING_AGENT_DIR: customDir });

    expect(discovered.map((target) => target.agentId)).not.toContain("pi");
  });

  it("resolves the Pi pointer instruction file inside the custom directory", async () => {
    const { home, customDir } = await fixture();

    expect(pointerInstructionFile(home, "pi", { PI_CODING_AGENT_DIR: customDir })).toBe(
      path.join(path.resolve(customDir), "APPEND_SYSTEM.md"),
    );
  });

  it("discovers an existing pointer file inside the custom directory", async () => {
    const { home, customDir } = await fixture();
    await mkdir(customDir, { recursive: true });
    await writeFile(path.join(customDir, "APPEND_SYSTEM.md"), "existing\n", "utf8");

    const targets = discoverPointerRolloutTargets({
      home,
      installedSkillTargets: [],
      env: { PI_CODING_AGENT_DIR: customDir },
    });

    expect(targets.map((target) => target.agentId)).toContain("pi");
  });

  it("writes the Pi pointer bytes into the custom directory", async () => {
    const { bundleRoot, home, customDir, pointer } = await fixture();

    const report = await installBundledPointerBlocks({
      bundleRoot,
      home,
      targets: [{ agentId: "pi" }],
      env: { PI_CODING_AGENT_DIR: customDir },
    });

    const instructionFile = path.join(path.resolve(customDir), "APPEND_SYSTEM.md");
    expect(report.targets).toHaveLength(1);
    expect(report.targets[0]?.instructionFile).toBe(instructionFile);
    expect(report.targets[0]?.status).toBe("appended");
    expect(await readFile(instructionFile, "utf8")).toBe(pointer);
    await expect(
      readFile(path.join(home, ".pi", "agent", "APPEND_SYSTEM.md"), "utf8"),
    ).rejects.toThrow();
  });
});

describe("conventional Pi directory behavior is preserved (#1797)", () => {
  const blankEnvs: Array<[string, NodeJS.ProcessEnv]> = [
    ["absent", {}],
    ["empty", { PI_CODING_AGENT_DIR: "" }],
    ["whitespace", { PI_CODING_AGENT_DIR: "   " }],
  ];

  for (const [label, env] of blankEnvs) {
    it(`falls back to <home>/.pi/agent when PI_CODING_AGENT_DIR is ${label}`, async () => {
      const { bundleRoot, home, pointer } = await fixture();
      const conventional = path.join(home, ".pi", "agent");
      await mkdir(conventional, { recursive: true });
      await writeFile(path.join(conventional, "mcp.json"), "{}\n", "utf8");

      expect(resolvePiAgentDir(home, env)).toBe(conventional);

      const paths = resolveAgentConfigPaths(home, env);
      expect(paths.pi).toBe(path.join(conventional, "mcp.json"));
      expect(paths.piSettings).toBe(path.join(conventional, "settings.json"));

      expect(discoverSkillTargets(home, {}, env)).toContainEqual({
        agentId: "pi",
        skillsDir: path.join(conventional, "skills"),
      });

      expect(pointerInstructionFile(home, "pi", env)).toBe(
        path.join(conventional, "APPEND_SYSTEM.md"),
      );

      const report = await installBundledPointerBlocks({
        bundleRoot,
        home,
        targets: [{ agentId: "pi" }],
        env,
      });
      expect(report.targets[0]?.instructionFile).toBe(path.join(conventional, "APPEND_SYSTEM.md"));
      expect(await readFile(path.join(conventional, "APPEND_SYSTEM.md"), "utf8")).toBe(pointer);
    });
  }
});
