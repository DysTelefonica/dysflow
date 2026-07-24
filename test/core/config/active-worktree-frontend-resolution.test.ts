import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nodeConfigFileSystem } from "../../../src/adapters/config/dysflow-config-node.js";
import { diagnoseProjectConfig } from "../../../src/adapters/config/project-config-diagnostic.js";
import { loadDysflowConfigAsyncWith } from "../../../src/core/config/dysflow-config.js";
import { resolveExecutionTarget } from "../../../src/core/config/execution-target.js";

const hash = async (path: string): Promise<string> =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex");

const errorCode = (
  result: Awaited<ReturnType<typeof loadDysflowConfigAsyncWith>>,
): string | null => (result.ok ? null : result.error.code);

describe("active-worktree frontend resolution (#1092)", () => {
  let parent: string;
  let worktreeA: string;
  let worktreeB: string;
  let sharedBackend: string;

  beforeEach(async () => {
    parent = join(tmpdir(), `dysflow-1092-${Math.random().toString(36).slice(2)}`);
    worktreeA = join(parent, "A");
    worktreeB = join(parent, "B");
    sharedBackend = join(parent, "SharedBackend.accdb");
    for (const root of [worktreeA, worktreeB]) {
      await mkdir(join(root, ".dysflow"), { recursive: true });
      await mkdir(join(root, ".git"), { recursive: true });
      await mkdir(join(root, "src"), { recursive: true });
      await writeFile(join(root, "App.accdb"), "frontend");
    }
    await writeFile(sharedBackend, "backend");
  });

  afterEach(async () => {
    await rm(parent, { recursive: true, force: true });
  });

  const writeConfig = async (root: string, value: Record<string, unknown>): Promise<string> => {
    const path = join(root, ".dysflow", "project.json");
    await writeFile(path, JSON.stringify(value));
    return path;
  };

  it("1 rejects copied absolute frontend/source paths instead of selecting worktree A from B", async () => {
    await writeConfig(worktreeB, {
      id: "b",
      accessPath: join(worktreeA, "App.accdb"),
      destinationRoot: join(worktreeA, "src"),
    });
    const result = await loadDysflowConfigAsyncWith({ cwd: worktreeB }, nodeConfigFileSystem);
    expect(errorCode(result)).toBe("FRONTEND_PATH_NOT_BASENAME");
  });

  it("2 anchors local frontend and destination to B while preserving an absolute shared backend", async () => {
    await writeConfig(worktreeB, {
      id: "b",
      frontendFile: "App.accdb",
      destinationRoot: "src",
      backendPath: sharedBackend,
    });
    const result = await loadDysflowConfigAsyncWith({ cwd: worktreeB }, nodeConfigFileSystem);
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.data).toMatchObject({
      accessDbPath: join(worktreeB, "App.accdb"),
      destinationRoot: join(worktreeB, "src"),
      backendPath: sharedBackend,
      projectRoot: worktreeB,
    });
  });

  it("3 reports FRONTEND_TARGET_MISSING when no local frontend candidate exists", async () => {
    await rm(join(worktreeB, "App.accdb"));
    await writeConfig(worktreeB, { id: "b" });
    const result = await loadDysflowConfigAsyncWith({ cwd: worktreeB }, nodeConfigFileSystem);
    expect(errorCode(result)).toBe("FRONTEND_TARGET_MISSING");
  });

  it("4 reports FRONTEND_TARGET_AMBIGUOUS for multiple local frontend candidates", async () => {
    await writeFile(join(worktreeB, "Other.accdb"), "other");
    await writeConfig(worktreeB, { id: "b" });
    const result = await loadDysflowConfigAsyncWith({ cwd: worktreeB }, nodeConfigFileSystem);
    expect(errorCode(result)).toBe("FRONTEND_TARGET_AMBIGUOUS");
  });

  it("5 lists App.accdb and BackendFixture.accdb when implicit selection is ambiguous", async () => {
    await writeFile(join(worktreeB, "BackendFixture.accdb"), "fixture");
    await writeConfig(worktreeB, { id: "b" });
    const result = await loadDysflowConfigAsyncWith({ cwd: worktreeB }, nodeConfigFileSystem);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected ambiguity");
    expect(result.error.code).toBe("FRONTEND_TARGET_AMBIGUOUS");
    expect(result.error.message).toContain("App.accdb");
    expect(result.error.message).toContain("BackendFixture.accdb");
  });

  it("6 migrates basename-only accessPath losslessly to the local effective frontend", async () => {
    await writeConfig(worktreeB, { id: "b", accessPath: "App.accdb" });
    const result = await loadDysflowConfigAsyncWith({ cwd: worktreeB }, nodeConfigFileSystem);
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.data.accessDbPath).toBe(join(worktreeB, "App.accdb"));
    expect(result.data.frontendFile).toBe("App.accdb");
  });

  it("7 rejects legacy absolute sibling accessPath with migration guidance", async () => {
    await writeConfig(worktreeB, { id: "b", accessPath: join(worktreeA, "App.accdb") });
    const result = await loadDysflowConfigAsyncWith({ cwd: worktreeB }, nodeConfigFileSystem);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected basename rejection");
    expect(result.error.code).toBe("FRONTEND_PATH_NOT_BASENAME");
    expect(result.error.message).toContain(basename(join(worktreeA, "App.accdb")));
    expect(result.error.message).toContain("frontendFile");
  });

  it("8 allows explicit projectId or absolute accessPath to select sibling A", async () => {
    await writeConfig(worktreeA, { id: "a", frontendFile: "App.accdb" });
    await writeConfig(worktreeB, { id: "b", frontendFile: "App.accdb" });
    const context = { cwd: worktreeB, env: {}, fileSystem: nodeConfigFileSystem };
    const byId = await resolveExecutionTarget({ projectId: "a" }, context);
    const byPath = await resolveExecutionTarget(
      { accessPath: join(worktreeA, "App.accdb") },
      context,
    );
    expect(byId.ok && byId.data.accessDbPath).toBe(join(worktreeA, "App.accdb"));
    expect(byPath.ok && byPath.data.accessDbPath).toBe(join(worktreeA, "App.accdb"));
  });

  it("9 returns explicit target provenance for an external absolute accessPath without persisting it", async () => {
    const configPath = await writeConfig(worktreeB, { id: "b", frontendFile: "App.accdb" });
    const external = join(parent, "external", "External.accdb");
    await mkdir(join(parent, "external"));
    await writeFile(external, "external");
    const before = await hash(configPath);
    const result = await resolveExecutionTarget(
      { accessPath: external },
      { cwd: worktreeB, env: {}, fileSystem: nodeConfigFileSystem },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.data.accessDbPath).toBe(external);
    expect(result.data.targetProvenance).toBe("explicit-access-path");
    expect(await hash(configPath)).toBe(before);
  });

  it("10 returns PROJECT_ID_COLLISION instead of selecting the first duplicate sibling id", async () => {
    await writeConfig(worktreeA, { id: "duplicate", frontendFile: "App.accdb" });
    await writeConfig(worktreeB, { id: "duplicate", frontendFile: "App.accdb" });
    const result = await loadDysflowConfigAsyncWith(
      { cwd: worktreeB, projectId: "duplicate" },
      nodeConfigFileSystem,
    );
    expect(errorCode(result)).toBe("PROJECT_ID_COLLISION");
  });

  it("11 doctor resolves directly from cwd without prior resolve_project state", async () => {
    await writeConfig(worktreeB, { id: "b", frontendFile: "App.accdb" });
    const read = await loadDysflowConfigAsyncWith({ cwd: worktreeB }, nodeConfigFileSystem);
    const doctor = diagnoseProjectConfig(worktreeB);
    expect(read.ok).toBe(true);
    if (!read.ok) throw read.error;
    expect(doctor).toMatchObject({
      status: "valid",
      projectId: "b",
    });
    expect(doctor.accessPath?.replaceAll("\\", "/")).toBe(
      read.data.accessDbPath.replaceAll("\\", "/"),
    );
    expect(doctor.projectRoot.replaceAll("\\", "/")).toBe(
      read.data.projectRoot?.replaceAll("\\", "/"),
    );
  });

  it("12 read-only resolution and diagnosis leave config, frontend, source, and backend hashes unchanged", async () => {
    const configPath = await writeConfig(worktreeB, {
      id: "b",
      frontendFile: "App.accdb",
      backendPath: sharedBackend,
    });
    const paths = [configPath, join(worktreeB, "App.accdb"), sharedBackend];
    await writeFile(join(worktreeB, "src", "Module.bas"), "Option Explicit");
    paths.push(join(worktreeB, "src", "Module.bas"));
    const before = await Promise.all(paths.map(hash));
    await loadDysflowConfigAsyncWith({ cwd: worktreeB }, nodeConfigFileSystem);
    diagnoseProjectConfig(worktreeB);
    const after = await Promise.all(paths.map(hash));
    expect(after).toEqual(before);
  });
});
