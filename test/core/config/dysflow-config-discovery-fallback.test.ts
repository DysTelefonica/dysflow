/**
 * PR-3 (issue #658) — `allowedProcedures` falls back to the default-prefix
 * scan of the project's `destinationRoot` when BOTH:
 *   - the top-level `allowedProcedures` field is absent, AND
 *   - the new `capabilities.procedures.allow` slot is absent (PR-3 ships
 *     the wildcard-free canonical slot; legacy `allowedProcedures` is
 *     still the most common wire shape until v1.15.0).
 *
 * The discovery runs INSIDE `buildProjectConfig` (sync) so its result
 * already sits on the `DysflowConfig` by the time the async loader returns.
 * These tests pin the contract end-to-end:
 *
 *   - explicit `allowedProcedures: ["X"]` is honoured verbatim;
 *   - explicit `allowedProcedures: []` is treated as an explicit deny-all
 *     (it WINS over discovery);
 *   - explicit `capabilities.procedures.allow: ["X"]` wins over discovery;
 *   - absent both → discovery result, or `undefined` if the directory is
 *     empty / missing.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { DysflowConfig } from "../../../src/core/config/dysflow-config";
import { loadProjectConfigCore } from "../../../src/core/config/dysflow-config";

/** Build a config inside the SAME workspace the caller staged. */
function buildConfigIn(
  workspaceRoot: string,
  raw: Record<string, unknown>,
  discoverFromSrcRoot?: (root: string) => readonly string[],
): DysflowConfig {
  writeFileSync(join(workspaceRoot, "app.accdb"), "", "utf8");
  const resolvedPath = join(workspaceRoot, ".dysflow", "project.json");
  mkdirSync(join(workspaceRoot, ".dysflow"), { recursive: true });

  const result = loadProjectConfigCore(
    resolvedPath,
    // biome-ignore lint/suspicious/noExplicitAny: fixture raw config with optional fields
    raw as any,
    {
      cwd: workspaceRoot,
      env: {},
      ...(discoverFromSrcRoot !== undefined ? { discoverFromSrcRoot } : {}),
    },
    {},
    "repo-config",
    undefined,
  );
  if (!result.ok) {
    throw new Error(`loadProjectConfigCore failed: ${result.error.message} (${result.error.code})`);
  }
  return result.data;
}

function withWorkspace<T>(fn: (root: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), "dysflow-pr3-discovery-"));
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function writeTestModule(root: string, fileName: string, body: string): void {
  const srcDir = join(root, "src");
  mkdirSync(srcDir, { recursive: true });
  writeFileSync(join(srcDir, fileName), body, "utf8");
}

describe("PR-3 / #658 — allowedProcedures discovery fallback in buildProjectConfig", () => {
  it("uses the top-level `allowedProcedures` list as-is (discovery is skipped)", () => {
    withWorkspace((root) => {
      // Stage a matching module so discovery WOULD return something. If the
      // explicit list wins, the discovered set must NOT pollute the result.
      writeTestModule(root, "Test_FromSource.bas", ["Public Sub Test_X()", "End Sub"].join("\n"));

      const throwingDiscovery = vi.fn((): readonly string[] => {
        throw new Error("discovery must not run for explicit top-level allowedProcedures");
      });

      const built = buildConfigIn(
        root,
        {
          accessPath: "app.accdb",
          allowedProcedures: ["OnlyThis"],
        },
        throwingDiscovery,
      );

      expect(built.allowedProcedures).toEqual(["OnlyThis"]);
      expect(throwingDiscovery).not.toHaveBeenCalled();
    });
  });

  it("treats explicit `allowedProcedures: []` as a deny-all WINS over discovery", () => {
    withWorkspace((root) => {
      // Discovery would otherwise return ['Test_X'] — explicit empty list
      // must shadow it (the project author opted in to deny-all).
      writeTestModule(root, "Test_FromSource.bas", ["Public Sub Test_X()", "End Sub"].join("\n"));

      const throwingDiscovery = vi.fn((): readonly string[] => {
        throw new Error("discovery must not run for explicit empty top-level allowedProcedures");
      });

      const built = buildConfigIn(
        root,
        {
          accessPath: "app.accdb",
          allowedProcedures: [],
        },
        throwingDiscovery,
      );

      expect(built.allowedProcedures).toEqual([]);
      expect(throwingDiscovery).not.toHaveBeenCalled();
    });
  });

  it("uses `capabilities.procedures.allow` as-is (when the field is present) — discovery is skipped", () => {
    withWorkspace((root) => {
      writeTestModule(
        root,
        "Test_FromSource.bas",
        ["Public Sub Test_Discovered()", "End Sub"].join("\n"),
      );

      // The consolidated `capabilities` block (#657) wins over discovery.
      // This pins the precedence: explicit slot -> discovery never fires.
      const throwingDiscovery = vi.fn((): readonly string[] => {
        throw new Error("discovery must not run for explicit capabilities procedures allow");
      });

      const built = buildConfigIn(
        root,
        {
          accessPath: "app.accdb",
          // biome-ignore lint/suspicious/noExplicitAny: partial fixture config
          capabilities: { procedures: { allow: ["CapOnly"] } } as any,
          // biome-ignore lint/suspicious/noExplicitAny: partial fixture root
        } as any,
        throwingDiscovery,
      );

      expect(built.allowedProcedures).toEqual(["CapOnly"]);
      expect(throwingDiscovery).not.toHaveBeenCalled();
    });
  });

  it("treats explicit `capabilities.procedures.allow: []` as deny-all and skips discovery", () => {
    withWorkspace((root) => {
      writeTestModule(
        root,
        "Test_FromSource.bas",
        ["Public Sub Test_Discovered()", "End Sub"].join("\n"),
      );

      const throwingDiscovery = vi.fn((): readonly string[] => {
        throw new Error("discovery must not run for explicit empty capabilities procedures allow");
      });

      const built = buildConfigIn(
        root,
        {
          accessPath: "app.accdb",
          // biome-ignore lint/suspicious/noExplicitAny: partial fixture config
          capabilities: { procedures: { allow: [] } } as any,
          // biome-ignore lint/suspicious/noExplicitAny: partial fixture root
        } as any,
        throwingDiscovery,
      );

      expect(built.allowedProcedures).toEqual([]);
      expect(throwingDiscovery).not.toHaveBeenCalled();
    });
  });

  it("falls back to the supplied discovery function when both slots are absent", () => {
    withWorkspace((root) => {
      writeTestModule(
        root,
        "Test_Disc.bas",
        ["Public Sub Test_Discovered()", "End Sub"].join("\n"),
      );
      writeTestModule(
        root,
        "OperacionesDisc.bas",
        ["Public Function Refresh_Operaciones() As Long", "End Function"].join("\n"),
      );

      // Inject a discovery function that pretends to scan the project's
      // src/ tree; the function does NOT touch the filesystem (it just
      // lists two procedures from a hardcoded set).
      const fakeDiscover = vi.fn(() => ["Test_Discovered", "Refresh_Operaciones"] as const);

      const built = buildConfigIn(root, { accessPath: "app.accdb" }, fakeDiscover);

      expect(built.allowedProcedures).toEqual(["Refresh_Operaciones", "Test_Discovered"]);
      expect(fakeDiscover).toHaveBeenCalledWith(join(root, "src"));
    });
  });

  it("scans the resolved destinationRoot instead of the whole projectRoot", () => {
    withWorkspace((root) => {
      const fakeDiscover = vi.fn(() => ["Test_CustomRoot"] as const);

      const built = buildConfigIn(
        root,
        {
          accessPath: "app.accdb",
          destinationRoot: "vba-src",
        },
        fakeDiscover,
      );

      expect(built.allowedProcedures).toEqual(["Test_CustomRoot"]);
      expect(fakeDiscover).toHaveBeenCalledWith(join(root, "vba-src"));
    });
  });

  it("leaves `allowedProcedures` undefined when the discovery function returns []", () => {
    // Use a real (but unstyled) workspace so `writeFileSync` does not fail;
    // the injected discovery function ignores its argument entirely so the
    // empty `src/` does not matter.
    withWorkspace((root) => {
      const built = buildConfigIn(root, { accessPath: "app.accdb" }, () => []);
      expect(built.allowedProcedures).toBeUndefined();
    });
  });

  it("leaves `allowedProcedures` undefined when no `discoverFromSrcRoot` is supplied (I/O isolation)", () => {
    // No fake discovery function — the default no-op (NO_DISCOVERY) wins.
    // This is the property that keeps `buildProjectConfig` out of `src/core`'s
    // I/O debt list (core-boundary architecture test).
    withWorkspace((root) => {
      writeTestModule(
        root,
        "Test_FromSource.bas",
        ["Public Sub Test_Discovered()", "End Sub"].join("\n"),
      );

      const built = buildConfigIn(root, { accessPath: "app.accdb" });
      // No discovery function -> no procedures -> the field is `undefined`,
      // EVEN THOUGH the workspace has matching modules on disk.
      expect(built.allowedProcedures).toBeUndefined();
    });
  });

  it("preserves `allowWrites` independently of the discovery fallback", () => {
    withWorkspace((root) => {
      writeTestModule(root, "Test_Combo.bas", ["Public Sub Test_Combo()", "End Sub"].join("\n"));

      const built = buildConfigIn(
        root,
        {
          accessPath: "app.accdb",
          allowWrites: true,
        },
        () => ["Test_Combo"],
      );

      expect(built.allowedProcedures).toEqual(["Test_Combo"]);
      expect(built.allowWrites).toBe(true);
    });
  });
});
