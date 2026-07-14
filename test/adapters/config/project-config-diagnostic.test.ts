import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { diagnoseProjectConfig } from "../../../src/adapters/config/project-config-diagnostic.js";

describe("per-worktree project config contract", () => {
  const worktree = () => {
    const r = mkdtempSync(join(tmpdir(), "dysflow-config-"));
    writeFileSync(join(r, ".git"), "gitdir: fixture");
    return r;
  };
  it("reports normalized fields and remediation when missing", () => {
    const r = diagnoseProjectConfig(worktree());
    expect(r).toMatchObject({
      status: "missing",
      writeReady: false,
      projectId: null,
      accessPath: null,
      backendPath: null,
      destinationRoot: null,
    });
    expect(r.remediation).toContain(`dysflow setup --cwd ${r.cwd}`);
  });
  it("fails closed when cwd is not inside a Git worktree", () => {
    const root = mkdtempSync(join(tmpdir(), "dysflow-non-git-"));
    expect(diagnoseProjectConfig(root)).toMatchObject({
      status: "outside-project-root",
      writeReady: false,
    });
  });
  it("is valid only for an existing target owned by this worktree", () => {
    const root = worktree();
    mkdirSync(join(root, ".dysflow"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "app.accdb"), "");
    writeFileSync(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({ id: "app", accessPath: "app.accdb", destinationRoot: "src" }),
    );
    expect(diagnoseProjectConfig(root, { projectId: "app" })).toMatchObject({
      status: "valid",
      writeReady: true,
    });
    expect(diagnoseProjectConfig(root, { projectId: "other" }).status).toBe("id-mismatch");
    expect(
      diagnoseProjectConfig(root, { accessPath: join(root, "..", "other", "app.accdb") }).status,
    ).toBe("outside-project-root");
  });
  it("rejects outside paths, missing targets, and ambiguity", () => {
    const root = worktree();
    mkdirSync(join(root, ".dysflow"));
    mkdirSync(join(root, "src"));
    writeFileSync(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({ id: "app", accessPath: "../app.accdb", destinationRoot: "src" }),
    );
    expect(diagnoseProjectConfig(root).status).toBe("path-mismatch");
    writeFileSync(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({ id: "app", accessPath: "app.accdb", destinationRoot: "src" }),
    );
    expect(diagnoseProjectConfig(root).status).toBe("target-not-found");
    writeFileSync(join(root, "dysflow.project.json"), "{}");
    expect(diagnoseProjectConfig(root).status).toBe("ambiguous");
  });
  it("fails closed for malformed shapes, conflicting aliases, and foreign roots", () => {
    const root = worktree();
    mkdirSync(join(root, ".dysflow"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "app.accdb"), "");
    const config = join(root, ".dysflow", "project.json");
    for (const malformed of ["null", "[]", '"text"', "42"]) {
      writeFileSync(config, malformed);
      expect(diagnoseProjectConfig(root).writeReady).toBe(false);
    }
    writeFileSync(
      config,
      JSON.stringify({ id: "app", accessPath: "app.accdb", destinationRoot: "src" }),
    );
    expect(
      diagnoseProjectConfig(root, { accessPath: "app.accdb", sourcePath: "other.accdb" }).status,
    ).toBe("ambiguous");
    expect(diagnoseProjectConfig(root, { projectRoot: join(root, "..") }).status).toBe(
      "outside-project-root",
    );
  });
  it("rejects an existing target owned by a nested worktree", () => {
    const root = worktree();
    mkdirSync(join(root, ".dysflow"));
    mkdirSync(join(root, "src"));
    mkdirSync(join(root, "nested"));
    writeFileSync(join(root, "nested", ".git"), "gitdir: fixture");
    writeFileSync(join(root, "nested", "app.accdb"), "");
    writeFileSync(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({ id: "app", accessPath: "nested/app.accdb", destinationRoot: "src" }),
    );
    expect(diagnoseProjectConfig(root).status).toBe("outside-project-root");
  });
  it.each([
    "databasePath",
    "sourcePath",
    "backendPath",
  ] as const)("accepts %s when it exactly targets the configured owned backend", (alias) => {
    const root = worktree();
    const backend = join(root, "data.accdb");
    mkdirSync(join(root, ".dysflow"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "app.accdb"), "");
    writeFileSync(backend, "");
    writeFileSync(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({
        id: "app",
        accessPath: "app.accdb",
        backendPath: backend,
        destinationRoot: "src",
      }),
    );
    expect(diagnoseProjectConfig(root, { [alias]: backend })).toMatchObject({
      status: "valid",
      writeReady: true,
    });
  });
  it.each([
    "databasePath",
    "sourcePath",
    "backendPath",
  ] as const)("accepts %s when it exactly targets a configured external backend", (alias) => {
    const root = worktree();
    const external = mkdtempSync(join(tmpdir(), "dysflow-backend-external-"));
    const backend = join(external, "data.accdb");
    mkdirSync(join(root, ".dysflow"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "app.accdb"), "");
    writeFileSync(backend, "");
    writeFileSync(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({ id: "app", accessPath: "app.accdb", backendPath: backend }),
    );
    try {
      expect(diagnoseProjectConfig(root, { [alias]: backend })).toMatchObject({
        status: "valid",
        writeReady: true,
      });
      expect(diagnoseProjectConfig(root, { [alias]: join(external, "other.accdb") })).toMatchObject(
        { status: "outside-project-root", writeReady: false },
      );
    } finally {
      rmSync(external, { recursive: true, force: true });
    }
  });
  it("allows a configured backend owned by another worktree", () => {
    const root = worktree();
    const nested = join(root, "nested");
    mkdirSync(join(root, ".dysflow"));
    mkdirSync(join(root, "src"));
    mkdirSync(nested);
    writeFileSync(join(root, "app.accdb"), "");
    writeFileSync(join(nested, ".git"), "gitdir: fixture");
    writeFileSync(join(nested, "data.accdb"), "");
    writeFileSync(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({ id: "app", accessPath: "app.accdb", backendPath: "nested/data.accdb" }),
    );
    expect(diagnoseProjectConfig(root)).toMatchObject({ status: "valid", writeReady: true });
  });
  it("reports target-not-found for an exact configured backend that is missing", () => {
    const root = worktree();
    mkdirSync(join(root, ".dysflow"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "app.accdb"), "");
    const backend = join(root, "missing-backend.accdb");
    writeFileSync(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({ id: "app", accessPath: "app.accdb", backendPath: backend }),
    );
    expect(diagnoseProjectConfig(root, { databasePath: backend }).status).toBe("target-not-found");
  });
  it("fails closed instead of throwing for a nonexistent requested projectRoot", () => {
    const root = worktree();
    mkdirSync(join(root, ".dysflow"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "app.accdb"), "");
    writeFileSync(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({ id: "app", accessPath: "app.accdb" }),
    );
    expect(diagnoseProjectConfig(root, { projectRoot: join(root, "missing") })).toMatchObject({
      status: "outside-project-root",
      writeReady: false,
    });
  });
  it("does not confuse contextId with configured project identity", () => {
    const root = worktree();
    mkdirSync(join(root, ".dysflow"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "app.accdb"), "");
    writeFileSync(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({ id: "app", accessPath: "app.accdb" }),
    );
    expect(diagnoseProjectConfig(root, { contextId: "request-context" }).status).toBe("valid");
  });
});
