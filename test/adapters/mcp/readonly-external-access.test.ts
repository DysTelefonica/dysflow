/**
 * Issue #968 — `allowExternalAccessPath` opt-in flag for read-only-side tools.
 *
 * Background: consumers want to call `export_modules`, `list_objects`,
 * `list_vba_modules`, and `verify_code` against an `.accdb` binary that lives
 * OUTSIDE the active Git worktree (e.g. a release build in a downloads folder).
 * Today every tool that touches `accessPath` must trace the binary back to a
 * directory owned by the worktree, so external reads fail with
 * `OUTSIDE_PROJECT_ROOT`. The new flag is the explicit opt-in.
 *
 * The flag is opt-in only — default `false` preserves backward compat. Writes
 * to the binary (`import_modules`, `sync_binary src-to-binary`) IGNORE the
 * flag because mutation of a foreign `.accdb` is the risk the gate exists to
 * prevent; only reads (and `export_modules` which reads from binary + writes
 * to disk) honor it.
 *
 * The flag surfaces as `allowExternalAccessPath?: boolean` on the input schema
 * for the four read-only-side tools and is forwarded via
 * `ProjectConfigRequest.allowExternalAccessPath` to `diagnoseProjectConfig`,
 * which is the single source of truth for the `OUTSIDE_PROJECT_ROOT` verdict.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { diagnoseProjectConfig } from "../../../src/adapters/config/project-config-diagnostic.js";

describe("read-only tools with external accessPath (#968 allowExternalAccessPath)", () => {
  const worktree = (prefix: string): string => {
    const r = mkdtempSync(join(tmpdir(), prefix));
    writeFileSync(join(r, ".git"), "gitdir: fixture");
    mkdirSync(join(r, ".dysflow"));
    mkdirSync(join(r, "src"));
    return r;
  };
  // Build the project in the cwd worktree and place the .accdb target in a
  // completely separate tempdir — the foreign-folder case the flag is for.
  const projectWithExternalBinary = (cwd: string) => {
    const external = mkdtempSync(join(tmpdir(), "dysflow-external-"));
    const foreignAccess = join(external, "release.accdb");
    writeFileSync(foreignAccess, "");
    writeFileSync(
      join(cwd, ".dysflow", "project.json"),
      JSON.stringify({
        id: "release-read",
        accessPath: "app.accdb",
        destinationRoot: "src",
      }),
    );
    writeFileSync(join(cwd, "app.accdb"), "");
    return { external, foreignAccess };
  };

  it("export_modules with external accessPath + allowExternalAccessPath:true succeeds (status=valid)", () => {
    const cwd = worktree("dysflow-r968-emit-");
    const { external, foreignAccess } = projectWithExternalBinary(cwd);
    try {
      const result = diagnoseProjectConfig(cwd, {
        operation: "export_modules",
        projectId: "release-read",
        accessPath: foreignAccess,
        allowExternalAccessPath: true,
      });
      expect(result).toMatchObject({ status: "valid", writeReady: true });
    } finally {
      rmSync(external, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("export_modules with external accessPath + allowExternalAccessPath:false returns OUTSIDE_PROJECT_ROOT (backward compat)", () => {
    const cwd = worktree("dysflow-r968-emif-");
    const { external, foreignAccess } = projectWithExternalBinary(cwd);
    try {
      const result = diagnoseProjectConfig(cwd, {
        operation: "export_modules",
        projectId: "release-read",
        accessPath: foreignAccess,
        allowExternalAccessPath: false,
      });
      expect(result).toMatchObject({ status: "outside-project-root", writeReady: false });
      expect(result.diagnostics[0]?.code).toBe("OUTSIDE_PROJECT_ROOT");
    } finally {
      rmSync(external, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("export_modules with external accessPath + flag omitted returns OUTSIDE_PROJECT_ROOT (default false)", () => {
    const cwd = worktree("dysflow-r968-emio-");
    const { external, foreignAccess } = projectWithExternalBinary(cwd);
    try {
      const result = diagnoseProjectConfig(cwd, {
        operation: "export_modules",
        projectId: "release-read",
        accessPath: foreignAccess,
      });
      expect(result).toMatchObject({ status: "outside-project-root", writeReady: false });
      expect(result.diagnostics[0]?.code).toBe("OUTSIDE_PROJECT_ROOT");
    } finally {
      rmSync(external, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("list_vba_modules with external accessPath + allowExternalAccessPath:true succeeds", () => {
    const cwd = worktree("dysflow-r968-lvmit-");
    const { external, foreignAccess } = projectWithExternalBinary(cwd);
    try {
      const result = diagnoseProjectConfig(cwd, {
        operation: "list_vba_modules",
        projectId: "release-read",
        accessPath: foreignAccess,
        allowExternalAccessPath: true,
      });
      expect(result).toMatchObject({ status: "valid", writeReady: true });
    } finally {
      rmSync(external, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("list_vba_modules with external accessPath + flag omitted returns OUTSIDE_PROJECT_ROOT", () => {
    const cwd = worktree("dysflow-r968-lvmio-");
    const { external, foreignAccess } = projectWithExternalBinary(cwd);
    try {
      const result = diagnoseProjectConfig(cwd, {
        operation: "list_vba_modules",
        projectId: "release-read",
        accessPath: foreignAccess,
      });
      expect(result).toMatchObject({ status: "outside-project-root", writeReady: false });
    } finally {
      rmSync(external, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("list_objects with external accessPath + allowExternalAccessPath:true succeeds", () => {
    const cwd = worktree("dysflow-r968-loit-");
    const { external, foreignAccess } = projectWithExternalBinary(cwd);
    try {
      const result = diagnoseProjectConfig(cwd, {
        operation: "list_objects",
        projectId: "release-read",
        accessPath: foreignAccess,
        allowExternalAccessPath: true,
      });
      expect(result).toMatchObject({ status: "valid", writeReady: true });
    } finally {
      rmSync(external, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("list_objects with external accessPath + flag omitted returns OUTSIDE_PROJECT_ROOT", () => {
    const cwd = worktree("dysflow-r968-loio-");
    const { external, foreignAccess } = projectWithExternalBinary(cwd);
    try {
      const result = diagnoseProjectConfig(cwd, {
        operation: "list_objects",
        projectId: "release-read",
        accessPath: foreignAccess,
      });
      expect(result).toMatchObject({ status: "outside-project-root", writeReady: false });
    } finally {
      rmSync(external, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("verify_code with external accessPath + allowExternalAccessPath:true succeeds", () => {
    const cwd = worktree("dysflow-r968-vcit-");
    const { external, foreignAccess } = projectWithExternalBinary(cwd);
    try {
      const result = diagnoseProjectConfig(cwd, {
        operation: "verify_code",
        projectId: "release-read",
        accessPath: foreignAccess,
        allowExternalAccessPath: true,
      });
      expect(result).toMatchObject({ status: "valid", writeReady: true });
    } finally {
      rmSync(external, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("verify_code with external accessPath + flag omitted returns OUTSIDE_PROJECT_ROOT", () => {
    const cwd = worktree("dysflow-r968-vcio-");
    const { external, foreignAccess } = projectWithExternalBinary(cwd);
    try {
      const result = diagnoseProjectConfig(cwd, {
        operation: "verify_code",
        projectId: "release-read",
        accessPath: foreignAccess,
      });
      expect(result).toMatchObject({ status: "outside-project-root", writeReady: false });
    } finally {
      rmSync(external, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("import_modules IGNORES the flag — binary writes still require binary inside projectRoot", () => {
    const cwd = worktree("dysflow-r968-imig-");
    const { external, foreignAccess } = projectWithExternalBinary(cwd);
    try {
      const result = diagnoseProjectConfig(cwd, {
        operation: "import_modules",
        projectId: "release-read",
        accessPath: foreignAccess,
        allowExternalAccessPath: true,
      });
      expect(result).toMatchObject({ status: "outside-project-root", writeReady: false });
      expect(result.diagnostics[0]?.code).toBe("OUTSIDE_PROJECT_ROOT");
    } finally {
      rmSync(external, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("import_all IGNORES the flag — binary writes still require binary inside projectRoot", () => {
    const cwd = worktree("dysflow-r968-iaig-");
    const { external, foreignAccess } = projectWithExternalBinary(cwd);
    try {
      const result = diagnoseProjectConfig(cwd, {
        operation: "import_all",
        projectId: "release-read",
        accessPath: foreignAccess,
        allowExternalAccessPath: true,
      });
      expect(result).toMatchObject({ status: "outside-project-root", writeReady: false });
      expect(result.diagnostics[0]?.code).toBe("OUTSIDE_PROJECT_ROOT");
    } finally {
      rmSync(external, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("sync_binary src-to-binary IGNORES the flag — binary writes still require binary inside projectRoot", () => {
    const cwd = worktree("dysflow-r968-sbig-");
    const { external, foreignAccess } = projectWithExternalBinary(cwd);
    try {
      const result = diagnoseProjectConfig(cwd, {
        operation: "sync_binary",
        projectId: "release-read",
        accessPath: foreignAccess,
        direction: "src-to-binary",
        allowExternalAccessPath: true,
      });
      expect(result).toMatchObject({ status: "outside-project-root", writeReady: false });
      expect(result.diagnostics[0]?.code).toBe("OUTSIDE_PROJECT_ROOT");
    } finally {
      rmSync(external, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("sync_binary binary-to-src HONORS the flag — binary is read-only there", () => {
    const cwd = worktree("dysflow-r968-sbho-");
    const { external, foreignAccess } = projectWithExternalBinary(cwd);
    try {
      const result = diagnoseProjectConfig(cwd, {
        operation: "sync_binary",
        projectId: "release-read",
        accessPath: foreignAccess,
        direction: "binary-to-src",
        allowExternalAccessPath: true,
      });
      expect(result).toMatchObject({ status: "valid", writeReady: true });
    } finally {
      rmSync(external, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("flag defaults to false — backward compat is preserved for export_modules", () => {
    const cwd = worktree("dysflow-r968-fdef-");
    const { external, foreignAccess } = projectWithExternalBinary(cwd);
    try {
      const result = diagnoseProjectConfig(cwd, {
        operation: "export_modules",
        projectId: "release-read",
        accessPath: foreignAccess,
      });
      expect(result).toMatchObject({ status: "outside-project-root", writeReady: false });
    } finally {
      rmSync(external, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("flag set true with project-internal accessPath is a no-op (still valid)", () => {
    const cwd = worktree("dysflow-r968-fnoi-");
    const { external } = projectWithExternalBinary(cwd);
    try {
      const result = diagnoseProjectConfig(cwd, {
        operation: "export_modules",
        projectId: "release-read",
        accessPath: join(cwd, "app.accdb"),
        allowExternalAccessPath: true,
      });
      expect(result).toMatchObject({ status: "valid", writeReady: true });
    } finally {
      rmSync(external, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("flag is ignored for delete_module (binary mutation)", () => {
    const cwd = worktree("dysflow-r968-dmig-");
    const { external, foreignAccess } = projectWithExternalBinary(cwd);
    try {
      const result = diagnoseProjectConfig(cwd, {
        operation: "delete_module",
        projectId: "release-read",
        accessPath: foreignAccess,
        allowExternalAccessPath: true,
      });
      expect(result).toMatchObject({ status: "outside-project-root", writeReady: false });
    } finally {
      rmSync(external, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("flag set true with ext accessPath still requires backendPath to be inside projectRoot (backend is untouched)", () => {
    const cwd = worktree("dysflow-r968-bpkb-");
    const external = mkdtempSync(join(tmpdir(), "dysflow-r968-bpkb-"));
    const foreignAccess = join(external, "release.accdb");
    writeFileSync(foreignAccess, "");
    writeFileSync(join(cwd, "app.accdb"), "");
    writeFileSync(join(cwd, "data.accdb"), "");
    writeFileSync(
      join(cwd, ".dysflow", "project.json"),
      JSON.stringify({
        id: "release-read",
        accessPath: "app.accdb",
        backendPath: "data.accdb",
        destinationRoot: "src",
      }),
    );
    try {
      const valid = diagnoseProjectConfig(cwd, {
        operation: "export_modules",
        projectId: "release-read",
        accessPath: foreignAccess,
        allowExternalAccessPath: true,
      });
      expect(valid).toMatchObject({ status: "valid", writeReady: true });
      const stillGated = diagnoseProjectConfig(cwd, {
        operation: "export_modules",
        projectId: "release-read",
        accessPath: foreignAccess,
        backendPath: join(external, "other.accdb"),
        allowExternalAccessPath: true,
      });
      // The backend alias is a database-touching alias and external backend
      // is rejected unless the request alias targets the EXACT configured
      // backend. With a non-configured external backend the gate fires
      // normally — the flag does not extend to backendPath.
      expect(stillGated.status).not.toBe("valid");
    } finally {
      rmSync(external, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
