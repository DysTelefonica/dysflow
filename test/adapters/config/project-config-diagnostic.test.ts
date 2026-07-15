import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

describe("sibling worktree (#873)", () => {
  // Two tempdirs at the SAME parent, each with its own stub `.git`, so the
  // three-way AND criterion (same parent + own .git + different identity) is
  // satisfied and the accessPath's canonical realpath lands in the sibling.
  const siblingWorktree = (prefix: string): string => {
    const r = mkdtempSync(join(tmpdir(), prefix));
    writeFileSync(join(r, ".git"), "gitdir: fixture");
    return r;
  };

  // ADD-873-1 — valid real sibling worktree is accepted.
  it("accepts a valid real sibling worktree as the binary's owning tree", () => {
    const cwd = siblingWorktree("dysflow-cwd-sib-");
    const other = siblingWorktree("dysflow-sibling-");
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
    try {
      const result = diagnoseProjectConfig(cwd, { projectId: "expedientes" });
      expect(result).toMatchObject({ status: "valid", writeReady: true });
      expect(result.owningWorktree).toMatch(/^sibling:/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(other, { recursive: true, force: true });
    }
  });

  // ADD-873-2 — call-level overrides targeting the sibling are accepted.
  it("accepts call-level overrides that target the sibling worktree", () => {
    const cwd = siblingWorktree("dysflow-cwd-sib2-");
    const other = siblingWorktree("dysflow-sibling2-");
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
    try {
      expect(
        diagnoseProjectConfig(cwd, {
          projectId: "expedientes",
          accessPath: access,
          destinationRoot: join(cwd, "src"),
        }),
      ).toMatchObject({ status: "valid", writeReady: true });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(other, { recursive: true, force: true });
    }
  });

  // ADD-873-3 — junction (Windows reparse point) stays REJECTED even though
  // the sibling is real. Platform-gated; on Linux CI this is a no-op.
  const itJunction = process.platform === "win32" ? it : it.skip;
  itJunction("rejects a junction inside cwd that points at the sibling", () => {
    const cwd = siblingWorktree("dysflow-cwd-junc-");
    const other = siblingWorktree("dysflow-sibling-junc-");
    mkdirSync(join(cwd, ".dysflow"));
    mkdirSync(join(cwd, "src"));
    mkdirSync(join(cwd, ".worktrees"));
    const link = join(cwd, ".worktrees", "link");
    // `symlinkSync(..., 'junction')` builds a Windows directory junction
    // without admin privileges and without spawning PowerShell.
    symlinkSync(other, link, "junction");
    try {
      const access = join(link, "Expedientes.accdb");
      writeFileSync(access, "");
      writeFileSync(
        join(cwd, ".dysflow", "project.json"),
        JSON.stringify({
          id: "expedientes",
          accessPath: access,
          destinationRoot: "src",
        }),
      );
      expect(diagnoseProjectConfig(cwd, { projectId: "expedientes" })).toMatchObject({
        status: "outside-project-root",
        writeReady: false,
      });
    } finally {
      rmSync(link, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
      rmSync(other, { recursive: true, force: true });
    }
  });

  // ADD-873-4 — arbitrary cross-project path (no .git at parent) stays
  // rejected as PATH_MISMATCH. Regression guard for #863 invariant.
  it("rejects an arbitrary cross-project path that is not a real sibling worktree", () => {
    const cwd = siblingWorktree("dysflow-cwd-foreign-");
    const foreign = mkdtempSync(join(tmpdir(), "dysflow-foreign-"));
    mkdirSync(join(cwd, ".dysflow"));
    mkdirSync(join(cwd, "src"));
    const foreignAccess = join(foreign, "otro.accdb");
    writeFileSync(foreignAccess, "");
    writeFileSync(
      join(cwd, ".dysflow", "project.json"),
      JSON.stringify({
        id: "foreign",
        accessPath: foreignAccess,
        destinationRoot: "src",
      }),
    );
    try {
      expect(diagnoseProjectConfig(cwd, { projectId: "foreign" })).toMatchObject({
        status: "path-mismatch",
        writeReady: false,
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(foreign, { recursive: true, force: true });
    }
  });

  // ADD-873-6 — single-worktree happy path: no sibling, owningWorktree is "cwd".
  it("reports owningWorktree 'cwd' on the single-worktree happy path", () => {
    const root = siblingWorktree("dysflow-single-873-");
    mkdirSync(join(root, ".dysflow"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "app.accdb"), "");
    writeFileSync(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({ id: "app", accessPath: "app.accdb", destinationRoot: "src" }),
    );
    try {
      const result = diagnoseProjectConfig(root, { projectId: "app" });
      expect(result).toMatchObject({ status: "valid", writeReady: true });
      expect(result.owningWorktree).toBe("cwd");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
