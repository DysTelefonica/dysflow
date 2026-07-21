/**
 * Issue #1044 — `run_vba` rejects legitimate Windows aliases.
 *
 * Bug repro: passing `accessPath` (frontend) together with `backendPath`
 * (a different file — the data backend) was rejected as a "Conflicting
 * Access target aliases" error because the alias resolver lumped
 * `backendPath` into the same equivalence class as `accessPath`. Path
 * normalization between `/`, `\\`, case, `./..`, and trailing separators
 * was already correct; the actual surface defect was the alias set itself.
 *
 * The error also fell back to the legacy `PROJECT_CONFIG_NOT_WRITE_READY`
 * code with no structured fields. Tests pin both behaviors.
 *
 * Tests are RED → GREEN → REFACTOR. Round-11 fix preserves no-regression
 * for round-5/#1040 (FORM_VBNAME_PREFIX_MISMATCH) and #962/#970/#1037.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ProjectConfigDiagnostic } from "../../../src/adapters/config/project-config-diagnostic.js";
import { diagnoseProjectConfig } from "../../../src/adapters/config/project-config-diagnostic.js";
import { projectConfigNotWriteReady } from "../../../src/adapters/mcp/dispatch-common.js";

function worktreeFixture(prefix: string): string {
  const r = mkdtempSync(join(tmpdir(), prefix));
  writeFileSync(join(r, ".git"), "gitdir: fixture");
  mkdirSync(join(r, ".dysflow"));
  mkdirSync(join(r, "src"));
  return r;
}

function writeProjectConfig(root: string, body: Record<string, unknown>): void {
  writeFileSync(join(root, ".dysflow", "project.json"), JSON.stringify(body));
}

function gateEnvelope(
  diagnostic: ProjectConfigDiagnostic,
): ReturnType<typeof projectConfigNotWriteReady> {
  return projectConfigNotWriteReady("run_vba", diagnostic);
}

describe("alias resolution under run_vba (#1044)", () => {
  it("test 1 — equivalent aliases normalize and pass the resolver", () => {
    const root = worktreeFixture("dysflow-1044-norm-");
    try {
      const target = join(root, "Expedientes.accdb");
      writeFileSync(target, "");
      writeProjectConfig(root, {
        id: "expedientes",
        accessPath: "Expedientes.accdb",
        destinationRoot: "src",
      });
      // Same target expressed with mixed separators, trailing slash, and ./.
      const slashy = target.replaceAll("\\", "/");
      const backslashed = target.replaceAll("/", "\\");
      const withDot = `${slashy.replace(/Expedientes\.accdb$/, "./Expedientes.accdb")}`;
      const withTrailing = `${slashy}/`;
      const expectValid = (input: Record<string, string>): void => {
        expect(diagnoseProjectConfig(root, input)).toMatchObject({
          status: "valid",
          writeReady: true,
        });
      };
      expectValid({ accessPath: slashy, databasePath: backslashed });
      expectValid({ accessPath: slashy, databasePath: withDot });
      expectValid({ accessPath: slashy, databasePath: withTrailing });
      // Case difference must NOT collide on Windows either.
      expectValid({
        accessPath: slashy,
        databasePath: slashy.toUpperCase(),
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("test 2 — genuinely different frontend aliases still fail closed", () => {
    const root = worktreeFixture("dysflow-1044-conflict-");
    try {
      const frontend = join(root, "Expedientes.accdb");
      writeFileSync(frontend, "");
      writeFileSync(join(root, "Other.accdb"), "");
      writeProjectConfig(root, {
        id: "expedientes",
        accessPath: "Expedientes.accdb",
        destinationRoot: "src",
      });
      const result = diagnoseProjectConfig(root, {
        accessPath: frontend,
        sourcePath: join(root, "Other.accdb"),
      });
      expect(result.status).toBe("ambiguous");
      expect(result.writeReady).toBe(false);
      expect(result.diagnostics[0]?.message).toContain("Conflicting Access target aliases");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("test 3 — alias conflict returns a structured typed envelope (CONFLICTING_TARGET_ALIASES)", () => {
    const root = worktreeFixture("dysflow-1044-structured-");
    try {
      const frontend = join(root, "Expedientes.accdb");
      writeFileSync(frontend, "");
      writeFileSync(join(root, "Other.accdb"), "");
      writeProjectConfig(root, {
        id: "expedientes",
        accessPath: "Expedientes.accdb",
        destinationRoot: "src",
      });
      const result = diagnoseProjectConfig(root, {
        accessPath: frontend,
        sourcePath: join(root, "Other.accdb"),
      });
      expect(result.status).toBe("ambiguous");
      expect(result.writeReady).toBe(false);
      const envelope = gateEnvelope(result);
      // Issue #1044 — specific typed code, NOT the legacy
      // PROJECT_CONFIG_NOT_WRITE_READY fallback.
      expect(envelope.error?.code).toBe("CONFLICTING_TARGET_ALIASES");
      // Canonical envelope fields stay populated.
      expect(typeof envelope.error?.message).toBe("string");
      expect(envelope.error?.message.length ?? 0).toBeGreaterThan(0);
      expect(envelope.error?.remediation).toContain(
        "accessPath, accessDbPath, databasePath, or sourcePath",
      );
      expect(envelope.error?.code).not.toBe("PROJECT_CONFIG_NOT_WRITE_READY");
      // The legacy substring is preserved for backward compat (#962 contract).
      expect(envelope.error?.message).toContain("PROJECT_CONFIG_NOT_WRITE_READY");
      // diagnostics[] carries the structured code on the first entry.
      expect(envelope.error?.diagnostics?.[0]?.code).toBe("CONFLICTING_TARGET_ALIASES");
      // ok:false on the typed envelope.
      expect(envelope.ok).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("test 4 — no-regression: run_vba with legitimate frontend + backend aliases stays valid", () => {
    const root = worktreeFixture("dysflow-1044-noregress-");
    try {
      const frontend = join(root, "Expedientes.accdb");
      const backend = join(root, "Expedientes_datos.accdb");
      writeFileSync(frontend, "");
      writeFileSync(backend, "");
      writeProjectConfig(root, {
        id: "expedientes",
        accessPath: "Expedientes.accdb",
        backendPath: "Expedientes_datos.accdb",
        destinationRoot: "src",
      });
      // Bug repro: passing both accessPath AND backendPath together was
      // falsely rejected as "Conflicting Access target aliases" because
      // backendPath was incorrectly lumped into the same alias set as
      // accessPath. They are legitimately different files.
      const result = diagnoseProjectConfig(root, {
        accessPath: frontend,
        backendPath: backend,
      });
      expect(result.status).toBe("valid");
      expect(result.writeReady).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
