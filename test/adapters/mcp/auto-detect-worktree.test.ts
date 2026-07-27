/**
 * Issue #1179 — auto-detect active git worktree from cwd.
 *
 * Acceptance contract (verbatim from #1179):
 *   1. `get_capabilities.projectConfig.cwd` returns the git worktree toplevel
 *      when the process cwd is inside a git worktree, NOT the process spawn cwd.
 *   2. `get_capabilities.projectConfig.accessPath` reflects the worktree's
 *      resolved path (the worktree's `.accdb`, not the parent worktree's).
 *   3. Falls back to process cwd with a typed warning when cwd is NOT inside
 *      a worktree.
 *   4. Emits a typed warning when the auto-detected worktree differs from the
 *      implicit target (target-mismatch).
 *
 * The resolver under test is `diagnoseProjectConfig` — the same function that
 * populates `get_capabilities.projectConfig` via `projectConfigResolver` in
 * `stdio.ts`. Fixtures use `.git` file markers so the resolver auto-detects
 * the worktree via the filesystem walk in `worktreeRoot()` without requiring
 * a real `git` binary.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, normalize } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { diagnoseProjectConfig } from "../../../src/adapters/config/project-config-diagnostic.js";

function normalizePath(value: string): string {
  return normalize(value).replaceAll("\\", "/");
}

function markAsWorktree(root: string): void {
  writeFileSync(join(root, ".git"), "gitdir: isolated-fixture", "utf-8");
}

function writeProjectConfig(root: string, contents: object): string {
  mkdirSync(join(root, ".dysflow"), { recursive: true });
  mkdirSync(join(root, "src"), { recursive: true });
  const accessFile = join(root, "app.accdb");
  writeFileSync(accessFile, "fake", "utf-8");
  writeFileSync(join(root, ".dysflow", "project.json"), JSON.stringify(contents), "utf-8");
  return accessFile;
}

let worktreeA: string;
let worktreeB: string;
let nonWorktree: string;

beforeEach(() => {
  worktreeA = mkdtempSync(join(tmpdir(), "dysflow-1179-A-"));
  markAsWorktree(worktreeA);
  writeProjectConfig(worktreeA, {
    id: "project-a",
    accessPath: "app.accdb",
    destinationRoot: "src",
  });

  worktreeB = mkdtempSync(join(tmpdir(), "dysflow-1179-B-"));
  markAsWorktree(worktreeB);
  writeProjectConfig(worktreeB, {
    id: "project-b",
    accessPath: "app.accdb",
    destinationRoot: "src",
  });

  nonWorktree = mkdtempSync(join(tmpdir(), "dysflow-1179-nonworktree-"));
});

afterEach(() => {
  rmSync(worktreeA, { recursive: true, force: true });
  rmSync(worktreeB, { recursive: true, force: true });
  rmSync(nonWorktree, { recursive: true, force: true });
});

describe("auto-detect worktree from cwd (#1179)", () => {
  it("uses git toplevel when cwd is inside a worktree", () => {
    // cwd points at a subdirectory of the worktree; the resolver must walk
    // up to the worktree toplevel rather than echoing the input cwd back.
    const subdir = join(worktreeA, "src");
    mkdirSync(subdir, { recursive: true });
    const result = diagnoseProjectConfig(subdir);
    expect(normalizePath(result.cwd)).toBe(normalizePath(worktreeA));
    expect(normalizePath(result.accessPath ?? "")).toBe(
      normalizePath(join(worktreeA, "app.accdb")),
    );
    expect(result.projectId).toBe("project-a");
  });

  it("falls back to process cwd when cwd is NOT inside a worktree", () => {
    const result = diagnoseProjectConfig(nonWorktree);
    expect(normalizePath(result.cwd)).toBe(normalizePath(nonWorktree));
    // The "cwd not in a worktree" warning must surface so the consumer can
    // show a sensible message instead of an opaque failure.
    expect(
      result.diagnostics.some(
        (d) => d.code === "CWD_NOT_IN_WORKTREE" && d.severity === "warning",
      ),
    ).toBe(true);
  });

  it("emits typed warning when resolve_project would change target (target-mismatch)", () => {
    // cwd is in worktree A (id: project-a), but the request asks for project-b.
    // The auto-detected worktree is A; the request points to B. The gap must
    // surface as a typed warning so the consumer can flag it explicitly.
    const result = diagnoseProjectConfig(worktreeA, { projectId: "project-b" });
    expect(
      result.diagnostics.some(
        (d) => d.code === "TARGET_MISMATCH_WARNING" && d.severity === "warning",
      ),
    ).toBe(true);
  });
});
