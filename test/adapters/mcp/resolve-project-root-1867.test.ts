/**
 * Issue #1867 — resolve_project must not report two project roots in one response.
 * A `projectRoot` copied from another worktree in .dysflow/project.json is stale;
 * the top-level projectRoot and projectConfig.projectRoot must both be the worktree
 * the call resolved to.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createResolveProjectTool } from "../../../src/adapters/mcp/resolve-project-tool.js";

let root: string;
let worktree: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "dysflow-1867-root-"));
  worktree = join(root, "bench-main");
  mkdirSync(join(worktree, ".dysflow"), { recursive: true });
  mkdirSync(join(worktree, "src"), { recursive: true });
  writeFileSync(join(worktree, ".git"), "gitdir: isolated-fixture", "utf-8");
  writeFileSync(join(worktree, "front.accdb"), "fake", "utf-8");
  writeFileSync(
    join(worktree, ".dysflow", "project.json"),
    JSON.stringify({
      id: "bench-main",
      frontendFile: "front.accdb",
      destinationRoot: "src",
      projectRoot: join(root, "old-worktree"),
    }),
    "utf-8",
  );
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("resolve_project reports one project root (#1867)", () => {
  it("top-level projectRoot matches projectConfig.projectRoot", async () => {
    const tool = createResolveProjectTool({ cwd: worktree });

    const response = await tool.handler({ cwd: worktree });
    const text = response.content[0]?.text ?? "{}";
    const payload = JSON.parse(text) as {
      projectRoot?: string | null;
      projectConfig?: { projectRoot?: string };
    };

    expect(payload.projectConfig?.projectRoot).toBeTruthy();
    expect(payload.projectRoot).toBe(payload.projectConfig?.projectRoot);
  });
});
