import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nodeConfigFileSystem } from "../../../src/adapters/config/dysflow-config-node";
import { diagnoseProjectConfig } from "../../../src/adapters/config/project-config-diagnostic";
import { loadDysflowConfigAsyncWith } from "../../../src/core/config/dysflow-config";
import { resolveExecutionTarget } from "../../../src/core/config/execution-target";

describe("Multi-worktree project config resolution (#1058)", () => {
  let rootDir: string;
  let mainDir: string;
  let stagingDir: string;

  beforeEach(async () => {
    rootDir = join(tmpdir(), `dysflow-multi-wt-${Math.random().toString(36).slice(2)}`);
    mainDir = join(rootDir, "main");
    stagingDir = join(rootDir, "staging");

    await mkdir(join(mainDir, ".dysflow"), { recursive: true });
    await mkdir(join(mainDir, ".git"), { recursive: true });
    await mkdir(join(mainDir, "src"), { recursive: true });
    await writeFile(join(mainDir, "Main.accdb"), "");
    await writeFile(
      join(mainDir, ".dysflow", "project.json"),
      JSON.stringify({
        id: "expedientes-main",
        projectRoot: mainDir,
        accessPath: join(mainDir, "Main.accdb"),
        destinationRoot: join(mainDir, "src"),
        capabilities: { allowWrites: true },
      }),
    );

    await mkdir(join(stagingDir, ".dysflow"), { recursive: true });
    await mkdir(join(stagingDir, ".git"), { recursive: true });
    await mkdir(join(stagingDir, "src"), { recursive: true });
    await writeFile(join(stagingDir, "Staging.accdb"), "");
    await writeFile(
      join(stagingDir, ".dysflow", "project.json"),
      JSON.stringify({
        id: "expedientes-staging",
        projectRoot: stagingDir,
        accessPath: join(stagingDir, "Staging.accdb"),
        destinationRoot: join(stagingDir, "src"),
        capabilities: { allowWrites: true },
      }),
    );
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it("resolveExecutionTarget auto-discovers config when accessPath points to a sibling worktree binary", async () => {
    const context = {
      env: {},
      cwd: mainDir,
      fileSystem: nodeConfigFileSystem,
    };

    const result = await resolveExecutionTarget(
      { accessPath: join(stagingDir, "Staging.accdb") },
      context,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected successful target resolution");
    expect(result.data.projectId).toBe("expedientes-staging");
    expect(result.data.projectRoot).toBe(stagingDir);
  });

  it("resolveExecutionTarget selects config by explicit projectId", async () => {
    const context = {
      env: {},
      cwd: mainDir,
      fileSystem: nodeConfigFileSystem,
    };

    const result = await resolveExecutionTarget({ projectId: "expedientes-staging" }, context);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected successful target resolution");
    expect(result.data.projectId).toBe("expedientes-staging");
    expect(result.data.projectRoot).toBe(stagingDir);
  });

  it("diagnoseProjectConfig validates sibling worktree target when explicit accessPath is passed", () => {
    const result = diagnoseProjectConfig(mainDir, {
      accessPath: join(stagingDir, "Staging.accdb"),
    });

    expect(result.status).toBe("valid");
    expect(result.writeReady).toBe(true);
    expect(result.projectId).toBe("expedientes-staging");
  });

  it("project-root guard remains active when accessPath belongs to no known config", () => {
    const unknownDir = join(rootDir, "unknown");
    const unknownAccdb = join(unknownDir, "Unknown.accdb");

    const result = diagnoseProjectConfig(mainDir, {
      accessPath: unknownAccdb,
    });

    expect(result.status).toBe("outside-project-root");
    expect(result.writeReady).toBe(false);
  });

  it("loadDysflowConfigAsyncWith surfaces discovered projects list including active indicator", async () => {
    const result = await loadDysflowConfigAsyncWith({ cwd: mainDir }, nodeConfigFileSystem);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected config load success");

    const config = result.data as typeof result.data & {
      discoveredProjects?: Array<{ id: string; projectRoot: string; active: boolean }>;
    };
    expect(config.discoveredProjects).toBeDefined();
    expect(config.discoveredProjects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "expedientes-main", active: true }),
        expect.objectContaining({ id: "expedientes-staging", active: false }),
      ]),
    );
  });
});
