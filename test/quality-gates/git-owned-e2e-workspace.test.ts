import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { diagnoseProjectConfig } from "../../src/adapters/config/project-config-diagnostic";
import { createGitOwnedE2eWorkspace } from "../integration/_helpers/git-owned-e2e-workspace";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("createGitOwnedE2eWorkspace", () => {
  it("creates an isolated sandbox owned by the supplied Git worktree", () => {
    const repo = mkdtempSync(join(tmpdir(), "dysflow-owned-e2e-repo-"));
    roots.push(repo);
    initializeRepository(repo);

    const sandbox = createGitOwnedE2eWorkspace(repo, "unicode");

    expect(existsSync(sandbox.root)).toBe(true);
    expect(sandbox.root.replaceAll("\\", "/")).toMatch(/\/\.dysflow-e2e\/unicode-[^/]+$/);
    expect(sandbox.gitRoot).toBe(sandbox.root);
    sandbox.cleanup();
    expect(existsSync(sandbox.root)).toBe(false);
  });

  it("rejects a directory that is not owned by a Git worktree", () => {
    const directory = mkdtempSync(join(tmpdir(), "dysflow-unowned-e2e-"));
    roots.push(directory);

    expect(() => createGitOwnedE2eWorkspace(directory, "write-test")).toThrow(/Git worktree/i);
  });

  it("reproduces temp rejection and makes an intended-write sandbox write-ready", () => {
    const tempWorkspace = mkdtempSync(join(tmpdir(), "dysflow-write-e2e-temp-"));
    roots.push(tempWorkspace);
    writeProjectFixture(tempWorkspace, true);
    expect(diagnoseProjectConfig(tempWorkspace)).toMatchObject({
      status: "outside-project-root",
      writeReady: false,
    });

    const repo = mkdtempSync(join(tmpdir(), "dysflow-write-e2e-repo-"));
    roots.push(repo);
    initializeRepository(repo);
    const sandbox = createGitOwnedE2eWorkspace(repo, "write-ready");
    writeProjectFixture(sandbox.root, true);

    expect(diagnoseProjectConfig(sandbox.root, { projectId: "write-e2e" })).toMatchObject({
      status: "valid",
      writeReady: true,
    });
    sandbox.cleanup();
  });
});

function writeProjectFixture(root: string, allowWrites: boolean): void {
  mkdirSync(join(root, ".dysflow"), { recursive: true });
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "app.accdb"), "fixture");
  writeFileSync(
    join(root, ".dysflow", "project.json"),
    JSON.stringify({
      id: "write-e2e",
      accessPath: "app.accdb",
      destinationRoot: "src",
      capabilities: { allowWrites },
    }),
  );
}

function initializeRepository(root: string): void {
  execFileSync("git", ["init", "-q"], { cwd: root, windowsHide: true });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Dysflow Test",
      "-c",
      "user.email=dysflow@example.invalid",
      "commit",
      "--allow-empty",
      "-qm",
      "test fixture",
    ],
    { cwd: root, windowsHide: true },
  );
}
