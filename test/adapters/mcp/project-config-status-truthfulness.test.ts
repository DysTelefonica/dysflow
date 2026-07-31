import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { diagnoseProjectConfig } from "../../../src/adapters/config/project-config-diagnostic";

function worktree(): string {
  const root = mkdtempSync(join(tmpdir(), "dysflow-config-status-"));
  writeFileSync(join(root, ".git"), "gitdir: fixture");
  return root;
}

describe("projectConfig.status truthfulness", () => {
  it("uses invalid-schema when project.json exists but is incomplete", () => {
    const root = worktree();
    mkdirSync(join(root, ".dysflow"));
    writeFileSync(join(root, ".dysflow", "project.json"), JSON.stringify({ id: "x" }));
    try {
      expect(diagnoseProjectConfig(root).status).toBe("invalid-schema");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("uses missing only when project.json is absent", () => {
    const root = worktree();
    try {
      expect(diagnoseProjectConfig(root).status).toBe("missing");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
