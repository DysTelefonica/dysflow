import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { diagnoseProjectConfig } from "../../../src/adapters/config/project-config-diagnostic";

describe("discoveredProjects isolation", () => {
  it("does not expose a sibling project when the current config is invalid", () => {
    const parent = mkdtempSync(join(tmpdir(), "dysflow-project-isolation-"));
    const projectA = join(parent, "A");
    const projectB = join(parent, "B");
    for (const root of [projectA, projectB]) {
      mkdirSync(join(root, ".dysflow"), { recursive: true });
      mkdirSync(join(root, "src"));
      writeFileSync(join(root, ".git"), "gitdir: fixture");
    }
    writeFileSync(join(projectA, ".dysflow", "project.json"), JSON.stringify({}));
    writeFileSync(
      join(projectB, ".dysflow", "project.json"),
      JSON.stringify({ id: "B", frontendFile: "B.accdb", destinationRoot: "src" }),
    );
    writeFileSync(join(projectB, "B.accdb"), "");

    try {
      const result = diagnoseProjectConfig(projectA, { projectId: "A" });
      expect(result.status).toBe("invalid-schema");
      expect(result.discoveredProjects?.map((project) => project.id) ?? []).not.toContain("B");
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
});
