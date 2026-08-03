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
    expect(r.remediation).toContain("--project-id <id>");
    expect(r.remediation).toContain("--access-path <path>");
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
  // migrated to #1092 contract on 2026-07-24
  it("rejects legacy accessPath values with separators before nested-worktree ownership checks", () => {
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
    const result = diagnoseProjectConfig(root);
    expect(result.status).toBe("path-mismatch");
    expect(result.diagnostics[0]?.code).toBe("FRONTEND_PATH_NOT_BASENAME");
  });
  it("exposes structured migration remediation and preserves the legacy string", () => {
    const root = worktree();
    const access = join(root, "sibling", "Expedientes.accdb");
    mkdirSync(join(root, ".dysflow"));
    mkdirSync(join(root, "src"));
    mkdirSync(join(root, "sibling"));
    writeFileSync(join(root, "sibling", ".git"), "gitdir: fixture");
    writeFileSync(access, "");
    writeFileSync(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({ id: "app", accessPath: access, destinationRoot: "src" }),
    );

    const result = diagnoseProjectConfig(root);
    expect(result.diagnostics[0]?.remediation).toEqual({
      kind: "config-migration",
      field: "accessPath",
      replaceWith: "frontendFile",
      suggestedValue: "Expedientes.accdb",
      rationale:
        "absolute and separator-containing frontend paths cannot authorize cross-worktree access",
    });
    expect(result.remediation).toBe("Replace it with frontendFile: 'Expedientes.accdb'.");
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

  it("surfaces malformed sibling discovery through projectConfig diagnostics", () => {
    const parent = mkdtempSync(join(tmpdir(), "dysflow-discovery-parent-"));
    const active = join(parent, "active");
    const malformed = join(parent, "malformed");
    mkdirSync(join(active, ".dysflow"), { recursive: true });
    mkdirSync(join(active, "src"));
    mkdirSync(join(malformed, ".dysflow"), { recursive: true });
    writeFileSync(join(active, ".git"), "gitdir: fixture");
    writeFileSync(join(malformed, ".git"), "gitdir: fixture");
    writeFileSync(join(active, "app.accdb"), "");
    writeFileSync(
      join(active, ".dysflow", "project.json"),
      JSON.stringify({ id: "active", frontendFile: "app.accdb", destinationRoot: "src" }),
    );
    const malformedPath = join(malformed, ".dysflow", "project.json");
    writeFileSync(malformedPath, "{");

    try {
      const result = diagnoseProjectConfig(active, { projectId: "missing" });
      expect(result).toMatchObject({ status: "id-mismatch", writeReady: false });
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          code: "INVALID_JSON",
          severity: "warning",
          phase: "parse",
          path: malformedPath.replaceAll("\\", "/"),
          message: expect.stringContaining("JSON"),
        }),
      );
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("diagnoseProjectConfig returns destination-root-not-found when destinationRoot dir is missing", () => {
    const root = worktree();
    mkdirSync(join(root, ".dysflow"));
    writeFileSync(join(root, "app.accdb"), "");
    writeFileSync(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({ id: "app", accessPath: "app.accdb", destinationRoot: "src" }),
    );
    const result = diagnoseProjectConfig(root, { projectId: "app" });
    expect(result.status).toBe("destination-root-not-found");
    expect(result.diagnostics[0]?.code).toBe("DESTINATION_ROOT_NOT_FOUND");
    expect(result.remediation).toContain("mkdir");
    // Issue #970 — diagnostics[].remediation is now a structured Remediation
    // object. The original text survives as `description`.
    const destRem = result.diagnostics[0]?.remediation as { description?: string } | undefined;
    expect(destRem?.description).toContain("mkdir");
  });

  it("diagnoseProjectConfig returns capabilities-disallow-write status when capabilities.allowWrites=false", () => {
    const root = worktree();
    mkdirSync(join(root, ".dysflow"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "app.accdb"), "");
    writeFileSync(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({
        id: "app",
        accessPath: "app.accdb",
        destinationRoot: "src",
        capabilities: { allowWrites: false },
      }),
    );
    const result = diagnoseProjectConfig(root, { projectId: "app" });
    expect(result.status).toBe("capabilities-disallow-write");
    expect(result.diagnostics[0]?.code).toBe("CAPABILITIES_DISALLOW_WRITE");
    expect(result.diagnostics[0]?.message).toContain("allowWrites = false");
    expect(result.remediation).toContain("dysflow doctor --cwd");
    // Issue #970 — diagnostics[].remediation is now a structured Remediation.
    const capsRem = result.diagnostics[0]?.remediation as { description?: string } | undefined;
    expect(capsRem?.description).toContain("dysflow doctor --cwd");
  });
});

describe("legacy sibling worktree config migration (#873 → #1092)", () => {
  // Two tempdirs at the SAME parent, each with its own stub `.git`, so the
  // three-way AND criterion (same parent + own .git + different identity) is
  // satisfied and the accessPath's canonical realpath lands in the sibling.
  const siblingWorktree = (prefix: string): string => {
    const r = mkdtempSync(join(tmpdir(), prefix));
    writeFileSync(join(r, ".git"), "gitdir: fixture");
    return r;
  };

  // migrated to #1092 contract on 2026-07-24
  it("rejects an inherited absolute sibling frontend instead of authorizing it", () => {
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
      expect(result).toMatchObject({ status: "path-mismatch", writeReady: false });
      expect(result.diagnostics[0]?.code).toBe("INHERITED_WORKTREE_MISMATCH");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(other, { recursive: true, force: true });
    }
  });

  // migrated to #1092 contract on 2026-07-24
  it("rejects sibling-owned destinationRoot when inherited through an absolute frontend", () => {
    const cwd = siblingWorktree("dysflow-cwd-dest-sib-");
    const sibling = siblingWorktree("dysflow-dest-sibling-");
    mkdirSync(join(cwd, ".dysflow"));
    mkdirSync(join(sibling, "src"));
    const access = join(sibling, "Expedientes.accdb");
    writeFileSync(access, "");
    writeFileSync(
      join(cwd, ".dysflow", "project.json"),
      JSON.stringify({
        id: "expedientes",
        accessPath: access,
        destinationRoot: join(sibling, "src"),
      }),
    );
    try {
      const result = diagnoseProjectConfig(cwd, { projectId: "expedientes" });
      expect(result).toMatchObject({ status: "path-mismatch", writeReady: false });
      expect(result.diagnostics[0]?.code).toBe("INHERITED_WORKTREE_MISMATCH");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(sibling, { recursive: true, force: true });
    }
  });

  // migrated to #1092 contract on 2026-07-24
  it("rejects foreign destinationRoot after rejecting inherited absolute frontend", () => {
    const cwd = siblingWorktree("dysflow-cwd-dest-foreign-");
    const sibling = siblingWorktree("dysflow-dest-owner-");
    const foreign = mkdtempSync(join(tmpdir(), "dysflow-dest-foreign-"));
    mkdirSync(join(cwd, ".dysflow"));
    mkdirSync(join(foreign, "src"));
    const access = join(sibling, "Expedientes.accdb");
    writeFileSync(access, "");
    writeFileSync(
      join(cwd, ".dysflow", "project.json"),
      JSON.stringify({
        id: "expedientes",
        accessPath: access,
        destinationRoot: join(foreign, "src"),
      }),
    );
    try {
      const result = diagnoseProjectConfig(cwd, { projectId: "expedientes" });
      expect(result).toMatchObject({
        status: "path-mismatch",
        writeReady: false,
      });
      expect(result.diagnostics[0]?.code).toBe("INHERITED_WORKTREE_MISMATCH");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(sibling, { recursive: true, force: true });
      rmSync(foreign, { recursive: true, force: true });
    }
  });

  // migrated to #1092 contract on 2026-07-24
  it("rejects a sibling accessPath when diagnostic targeting lacks an explicit matching projectId", () => {
    const cwd = siblingWorktree("dysflow-cwd-sib2-");
    const other = siblingWorktree("dysflow-sibling2-");
    mkdirSync(join(cwd, ".dysflow"));
    mkdirSync(join(cwd, "src"));
    mkdirSync(join(other, ".dysflow"));
    mkdirSync(join(other, "src"));
    const access = join(other, "Expedientes.accdb");
    writeFileSync(access, "");
    writeFileSync(join(cwd, "Local.accdb"), "");
    writeFileSync(
      join(cwd, ".dysflow", "project.json"),
      JSON.stringify({ id: "cwd", frontendFile: "Local.accdb", destinationRoot: "src" }),
    );
    writeFileSync(
      join(other, ".dysflow", "project.json"),
      JSON.stringify({
        id: "expedientes",
        frontendFile: "Expedientes.accdb",
        destinationRoot: "src",
      }),
    );
    try {
      const result = diagnoseProjectConfig(cwd, {
        accessPath: access,
        destinationRoot: join(other, "src"),
      });
      expect(result).toMatchObject({ status: "outside-project-root", writeReady: false });
      expect(result.diagnostics[0]?.code).toBe("OUTSIDE_PROJECT_ROOT");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(other, { recursive: true, force: true });
    }
  });

  // migrated to #1092 contract on 2026-07-24
  const itJunction = process.platform === "win32" ? it : it.skip;
  itJunction("rejects a junction target even when supplied explicitly", () => {
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
        JSON.stringify({ id: "cwd", frontendFile: "Local.accdb", destinationRoot: "src" }),
      );
      writeFileSync(join(cwd, "Local.accdb"), "");
      const result = diagnoseProjectConfig(cwd, { accessPath: access });
      expect(result).toMatchObject({
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
  // ════════════════════════════════════════════════════════════════════════
  // Round 16 — legacy `projectId` / `accessPath` / `destinationRoot`
  // keys (pre-#1092 contract). The resolver MUST honor them with an
  // explicit migration hint instead of the misleading "(missing)"
  // surface that round 16 reproducer hit in `expedientes`.
  // ════════════════════════════════════════════════════════════════════════

  it("R16-1: reads legacy `projectId` key as fallback when `id` is absent", () => {
    const root = siblingWorktree("dysflow-r16-1-");
    mkdirSync(join(root, ".dysflow"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "app.accdb"), "");
    writeFileSync(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({
        projectId: "legacy-name",
        accessPath: "app.accdb",
        destinationRoot: "src",
      }),
    );
    try {
      const result = diagnoseProjectConfig(root, { projectId: "legacy-name" });
      expect(result).toMatchObject({
        status: "valid",
        writeReady: true,
        projectId: "legacy-name",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("R16-2: emits MIGRATE_LEGACY warning (severity=warning) when legacy `projectId` is read", () => {
    const root = siblingWorktree("dysflow-r16-2-");
    mkdirSync(join(root, ".dysflow"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "app.accdb"), "");
    writeFileSync(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({
        projectId: "legacy-name",
        accessPath: "app.accdb",
        destinationRoot: "src",
      }),
    );
    try {
      const result = diagnoseProjectConfig(root, { projectId: "legacy-name" });
      expect(result.diagnostics).toContainEqual({
        code: "MIGRATE_LEGACY_PROJECT_ID",
        severity: "warning",
        message: expect.stringContaining("dysflow migrate-project-config"),
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("R16-3: legacy absolute accessPath is reported with structured migration remediation", () => {
    const root = siblingWorktree("dysflow-r16-3-");
    mkdirSync(join(root, ".dysflow"));
    mkdirSync(join(root, "src"));
    writeFileSync(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({
        projectId: "legacy-name",
        accessPath: "/tmp/legacy/.accdb",
        destinationRoot: "src",
      }),
    );
    try {
      const result = diagnoseProjectConfig(root, { projectId: "legacy-name" });
      expect(result).toMatchObject({
        status: "path-mismatch",
        writeReady: false,
        projectId: null,
        diagnostics: [
          {
            code: "INHERITED_WORKTREE_MISMATCH",
            severity: "error",
            remediation: {
              kind: "config-migration",
              field: "accessPath",
              replaceWith: "frontendFile",
              suggestedValue: ".accdb",
            },
          },
        ],
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("R16-4: honors `cwd` override in the request payload (per-worktree config takes priority)", () => {
    // Setup: a parent dir with legacy shared config + a per-worktree dir
    // with canonical config. Calling diagnoseProjectConfig with the
    // worktree's cwd should resolve the worktree's config, NOT the parent's.
    const parentRoot = mkdtempSync(join(tmpdir(), "dysflow-r16-parent-"));
    const worktreeRoot = mkdtempSync(join(tmpdir(), "dysflow-r16-worktree-"));
    writeFileSync(join(parentRoot, ".git"), "gitdir: fixture");
    writeFileSync(join(worktreeRoot, ".git"), "gitdir: fixture");
    mkdirSync(join(parentRoot, ".dysflow"));
    mkdirSync(join(worktreeRoot, ".dysflow"));
    writeFileSync(
      join(parentRoot, ".dysflow", "project.json"),
      JSON.stringify({
        projectId: "parent-legacy",
        accessPath: "/tmp/parent.accdb",
        destinationRoot: "src",
      }),
    );
    writeFileSync(
      join(worktreeRoot, ".dysflow", "project.json"),
      JSON.stringify({
        id: "worktree-canonical",
        accessPath: "app.accdb",
        destinationRoot: "src",
      }),
    );
    mkdirSync(join(worktreeRoot, "src"));
    writeFileSync(join(worktreeRoot, "app.accdb"), "");
    try {
      const result = diagnoseProjectConfig(worktreeRoot, {
        projectId: "worktree-canonical",
      });
      expect(result).toMatchObject({
        status: "valid",
        writeReady: true,
        projectId: "worktree-canonical",
      });
    } finally {
      rmSync(parentRoot, { recursive: true, force: true });
      rmSync(worktreeRoot, { recursive: true, force: true });
    }
  });
});
