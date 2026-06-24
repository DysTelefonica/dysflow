/**
 * Regression tests for findRepoProjectConfigPath — the function that
 * locates the project's .dysflow/project.json starting from a cwd.
 *
 * Issue 18 (2026-06-09): the MCP server is spawned by opencode with
 * an arbitrary cwd (the cwd of the host, not the cwd of the
 * project). The function used to look at the cwd only, so it missed
 * the project and the runner silently fell back to the frontend's
 * CurrentDb, returning only 2 tables for projects with 40+ backend
 * tables. The fix walks up the directory tree the same way git
 * discovers .git/ and npm discovers package.json.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nodeConfigFileSystem } from "../../../src/adapters/config/dysflow-config-node.js";
import { findRepoProjectConfigPathForTesting as findRepoProjectConfigPathRaw } from "../../../src/core/config/dysflow-config.js";

// The discovery helper now takes an injected ConfigFileSystemPort. These tests
// create real .dysflow/project.json files in temp workspaces, so they bind the
// node-backed port here and keep the existing single-arg call sites unchanged.
const findRepoProjectConfigPathForTesting = (cwd: string) =>
  findRepoProjectConfigPathRaw(cwd, nodeConfigFileSystem);

let workspace: string;
let outer: string;

beforeEach(() => {
  outer = mkdtempSync(join(tmpdir(), "dysflow-config-discovery-"));
  workspace = join(outer, "code", "project");
  mkdirSync(join(workspace, "src"), { recursive: true });
  mkdirSync(join(workspace, ".dysflow"), { recursive: true });
  writeFileSync(join(workspace, ".dysflow", "project.json"), "{}");
});

afterEach(() => {
  rmSync(outer, { recursive: true, force: true });
});

describe("findRepoProjectConfigPath walks up the directory tree", () => {
  it("finds the project config at the cwd itself", () => {
    const result = findRepoProjectConfigPathForTesting(workspace);
    expect(result.found).toBe("standard");
    if (result.found === "standard") {
      expect(result.path).toBe(join(workspace, ".dysflow", "project.json"));
    }
  });

  it("finds the project config in a parent directory (issue 18 regression)", () => {
    // cwd is nested under the project: .../code/project/src/.
    // The function must walk up two levels to find .dysflow/.
    const result = findRepoProjectConfigPathForTesting(join(workspace, "src"));
    expect(result.found).toBe("standard");
    if (result.found === "standard") {
      expect(result.path).toBe(join(workspace, ".dysflow", "project.json"));
    }
  });

  it("finds the project config when cwd is several levels deep", () => {
    // cwd is .../code/project/src/classes/forms/. 5 levels up.
    const deepCwd = join(workspace, "src", "classes", "forms");
    mkdirSync(deepCwd, { recursive: true });
    const result = findRepoProjectConfigPathForTesting(deepCwd);
    expect(result.found).toBe("standard");
  });

  it("returns 'none' when no project config exists in the tree", () => {
    // A directory tree with no .dysflow/project.json anywhere.
    const empty = join(outer, "no-project-here");
    mkdirSync(empty, { recursive: true });
    const result = findRepoProjectConfigPathForTesting(empty);
    expect(result.found).toBe("none");
  });

  it("prefers the closest .dysflow/project.json over a parent's one", () => {
    // Nested project inside the outer one; both have .dysflow/.
    const nested = join(outer, "nested");
    mkdirSync(join(nested, ".dysflow"), { recursive: true });
    writeFileSync(join(nested, ".dysflow", "project.json"), "{}");
    // The nested project must win because the walker is bottom-up.
    const result = findRepoProjectConfigPathForTesting(nested);
    expect(result.found).toBe("standard");
    if (result.found === "standard") {
      expect(result.path).toBe(join(nested, ".dysflow", "project.json"));
    }
  });

  it("flags ambiguous when both .dysflow/project.json and the legacy dysflow.project.json exist at the same level", () => {
    writeFileSync(join(workspace, "dysflow.project.json"), "{}");
    const result = findRepoProjectConfigPathForTesting(workspace);
    expect(result.found).toBe("ambiguous");
    if (result.found === "ambiguous") {
      expect(result.paths).toEqual([
        join(workspace, ".dysflow", "project.json"),
        join(workspace, "dysflow.project.json"),
      ]);
    }
  });
});
