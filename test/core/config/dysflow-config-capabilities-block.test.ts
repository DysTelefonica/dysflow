// PR #657 / #655 — `.dysflow/project.json` `capabilities` consolidated block.
//
// The `capabilities` block is the only home for the write gate and
// procedure allowlist/denylist. The top-level `allowWrites` /
// `allowedProcedures` aliases were marked deprecated and removed in v1.15.0;
// we are on v1.22.0 and the read-through fallback is gone (T18).
// Setting either top-level field now surfaces a typed
// `CONFIG_TOP_LEVEL_FIELDS_REMOVED` error at config-load time so the
// operator migrates the project.json to the `capabilities` block.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { DysflowProjectConfig } from "../../../src/core/config/dysflow-config";
import { loadProjectConfigCore } from "../../../src/core/config/dysflow-config";

function createTempWorkspace(): { root: string; cleanup(): void } {
  const root = mkdtempSync(join(tmpdir(), "dysflow-capabilities-"));
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function makeAccessTarget(root: string): void {
  writeFileSync(join(root, "app.accdb"), "", "utf8");
}

function buildConfigWithCapabilities(
  raw: Record<string, unknown>,
): ReturnType<typeof loadProjectConfigCore> {
  const ws = createTempWorkspace();
  try {
    makeAccessTarget(ws.root);
    const resolvedPath = join(ws.root, ".dysflow", "project.json");
    mkdirSync(join(ws.root, ".dysflow"), { recursive: true });

    return loadProjectConfigCore(
      resolvedPath,
      raw as DysflowProjectConfig,
      { cwd: ws.root, env: {} },
      {},
      "repo-config",
      undefined,
    );
  } finally {
    ws.cleanup();
  }
}

describe("DysflowProjectConfig — capabilities consolidated block (#657, #655, T18)", () => {
  describe("case 1: capabilities block only (canonical form)", () => {
    it("uses capabilities.allowWrites when only capabilities block is present", () => {
      const result = buildConfigWithCapabilities({
        accessPath: "app.accdb",
        capabilities: { allowWrites: true },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(`expected success, got ${result.error.code}`);
      expect(result.data.allowWrites).toBe(true);
      expect(result.data.allowedProcedures).toBeUndefined();
      expect(result.diagnostics).toEqual([]);
    });

    it("uses capabilities.procedures.allow as the procedure allowlist", () => {
      const result = buildConfigWithCapabilities({
        accessPath: "app.accdb",
        capabilities: {
          allowWrites: true,
          procedures: { allow: ["Test_A", "Test_B"] },
        },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(`expected success, got ${result.error.code}`);
      expect(result.data.allowWrites).toBe(true);
      expect(result.data.allowedProcedures).toEqual(["Test_A", "Test_B"]);
      expect(result.diagnostics).toEqual([]);
    });

    it("treats an empty capabilities.procedures.allow as an empty allowlist (dryrun-only)", () => {
      const result = buildConfigWithCapabilities({
        accessPath: "app.accdb",
        capabilities: {
          allowWrites: true,
          procedures: { allow: [] },
        },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(`expected success, got ${result.error.code}`);
      expect(result.data.allowWrites).toBe(true);
      // Empty array is distinct from undefined: it is the default-deny
      // allowlist signal (see design.md Layer 4 / #658).
      expect(result.data.allowedProcedures).toEqual([]);
      expect(result.diagnostics).toEqual([]);
    });
  });

  describe("case 2: neither (defaults unchanged)", () => {
    it("defaults allowWrites to false and allowedProcedures to undefined when neither is set", () => {
      const result = buildConfigWithCapabilities({
        accessPath: "app.accdb",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(`expected success, got ${result.error.code}`);
      expect(result.data.allowWrites).toBe(false);
      expect(result.data.allowedProcedures).toBeUndefined();
      expect(result.diagnostics).toEqual([]);
    });

    it("does NOT warn for an empty capabilities block (no fields inside)", () => {
      const result = buildConfigWithCapabilities({
        accessPath: "app.accdb",
        capabilities: {},
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(`expected success, got ${result.error.code}`);
      expect(result.data.allowWrites).toBe(false);
      expect(result.data.allowedProcedures).toBeUndefined();
      // Empty capabilities block is a no-op, not a conflict.
      expect(result.diagnostics).toEqual([]);
    });
  });

  describe("capabilities.procedures.deny (advisory, not a runtime gate)", () => {
    // Per design.md the `deny` list is exposed as a project-level advisory
    // signal. It does NOT change the runtime allowlist — the runtime truth
    // is `allow` only. The shape is preserved so a future PR can wire it
    // without a breaking change to `.dysflow/project.json`.
    it("does not affect the resolved allowedProcedures (runtime gate)", () => {
      const result = buildConfigWithCapabilities({
        accessPath: "app.accdb",
        capabilities: {
          allowWrites: true,
          procedures: { allow: ["Test_A"], deny: ["Test_B"] },
        },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(`expected success, got ${result.error.code}`);
      // deny is advisory only — runtime allowlist stays `allow`.
      expect(result.data.allowedProcedures).toEqual(["Test_A"]);
      expect(result.diagnostics).toEqual([]);
    });
  });

  // T18 (legacy deprecation finally removed): the top-level `allowWrites`
  // and `allowedProcedures` fields were marked deprecated and removed in
  // v1.15.0. We are on v1.22.0 and the read-through alias path was still
  // alive in `buildProjectConfig`. After this fix the top-level fields
  // produce a typed `CONFIG_TOP_LEVEL_FIELDS_REMOVED` error so the operator
  // migrates the project.json to the `capabilities` block.
  describe("top-level allowWrites/allowedProcedures (REMOVED in v1.15.0, surfaced in v1.22.0)", () => {
    it("rejects top-level allowWrites:true with CONFIG_TOP_LEVEL_FIELDS_REMOVED", () => {
      const result = buildConfigWithCapabilities({
        accessPath: "app.accdb",
        allowWrites: true,
      });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error(`expected failure, got success`);
      expect(result.error.code).toBe("CONFIG_TOP_LEVEL_FIELDS_REMOVED");
      expect(result.error.message).toMatch(/allowWrites/i);
      expect(result.error.message).toMatch(/deprecated.*removed|use.*capabilities/i);
      expect(result.error.retryable).toBe(false);
    });

    it("rejects top-level allowedProcedures with CONFIG_TOP_LEVEL_FIELDS_REMOVED", () => {
      const result = buildConfigWithCapabilities({
        accessPath: "app.accdb",
        allowedProcedures: ["Test_A"],
      });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error(`expected failure, got success`);
      expect(result.error.code).toBe("CONFIG_TOP_LEVEL_FIELDS_REMOVED");
      expect(result.error.message).toMatch(/allowedProcedures/i);
      expect(result.error.message).toMatch(/deprecated.*removed|use.*capabilities/i);
    });
  });
});
