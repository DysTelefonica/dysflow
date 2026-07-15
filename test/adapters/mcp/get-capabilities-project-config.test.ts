import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { diagnoseProjectConfig } from "../../../src/adapters/config/project-config-diagnostic.js";
import { createGetCapabilitiesTool } from "../../../src/adapters/mcp/get-capabilities-tool.js";

describe("get_capabilities projectConfig", () => {
  it("re-resolves the active worktree on every call without mutation", async () => {
    const root = mkdtempSync(join(tmpdir(), "dysflow-caps-"));
    writeFileSync(join(root, ".git"), "");
    try {
      const tool = createGetCapabilitiesTool({
        writesEnabled: true,
        writeAccessResolver: undefined,
        allowedProcedures: undefined,
        projectId: undefined,
        allowWrites: true,
        projectConfigResolver: () => diagnoseProjectConfig(root),
      });
      const first = JSON.parse((await tool.handler({})).content[0]?.text ?? "{}");
      expect(first.projectConfig.status).toBe("missing");
      mkdirSync(join(root, ".dysflow"));
      mkdirSync(join(root, "src"));
      writeFileSync(join(root, "app.accdb"), "");
      writeFileSync(
        join(root, ".dysflow", "project.json"),
        JSON.stringify({ id: "app", accessPath: "app.accdb", destinationRoot: "src" }),
      );
      const second = JSON.parse((await tool.handler({})).content[0]?.text ?? "{}");
      expect(second.projectConfig).toMatchObject({ status: "valid", writeReady: true });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // ADD-873-5 — when the accessPath resolves into a real sibling worktree,
  // get_capabilities surfaces `projectConfig.owningWorktree` with the
  // "sibling:<abs>" prefix so consumers can read it without a second
  // resolve_project round-trip.
  it("surfaces owningWorktree with sibling prefix when the accessPath lives in a sibling worktree (#873)", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "dysflow-caps-cwd-"));
    const other = mkdtempSync(join(tmpdir(), "dysflow-caps-sib-"));
    writeFileSync(join(cwd, ".git"), "gitdir: fixture");
    writeFileSync(join(other, ".git"), "gitdir: fixture");
    try {
      mkdirSync(join(cwd, ".dysflow"));
      mkdirSync(join(cwd, "src"));
      const access = join(other, "Expedientes.accdb");
      writeFileSync(access, "");
      writeFileSync(
        join(cwd, ".dysflow", "project.json"),
        JSON.stringify({
          id: "expedientes",
          accessPath: access,
          destinationRoot: "src",
        }),
      );
      const tool = createGetCapabilitiesTool({
        writesEnabled: true,
        writeAccessResolver: undefined,
        allowedProcedures: undefined,
        projectId: "expedientes",
        allowWrites: true,
        projectConfigResolver: () => diagnoseProjectConfig(cwd),
      });
      const result = JSON.parse((await tool.handler({})).content[0]?.text ?? "{}");
      expect(result.projectConfig).toMatchObject({ status: "valid", writeReady: true });
      expect(result.projectConfig.owningWorktree).toMatch(/^sibling:/);
      expect(result.writeClassToolsPermitted).toContain("import_modules");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(other, { recursive: true, force: true });
    }
  });
});
