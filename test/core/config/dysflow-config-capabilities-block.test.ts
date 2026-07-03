// PR #657 / #655 — `.dysflow/project.json` `capabilities` consolidated block.
//
// Test the four-case precedence table for the new `capabilities` config block
// in `DysflowProjectConfig`. The `capabilities` block is the new home for the
// write gate + procedure allowlist/denylist. The top-level `allowWrites` and
// `allowedProcedures` fields are kept as DEPRECATED aliases (read-through
// fallback) and emit a single WARNING when both are present.
//
// Precedence table (tested below):
//
//   | top-level fields | capabilities block | effective allowWrites | effective allowedProcedures | warnings |
//   |------------------|--------------------|------------------------|------------------------------|----------|
//   | none             | none               | false                  | undefined                    | none     |
//   | present          | absent             | top-level              | top-level                    | none     |
//   | absent           | present            | capabilities           | capabilities                 | none     |
//   | present          | present            | capabilities           | capabilities                 | 1        |
//
// Reference: `src/core/config/dysflow-config.ts:33-49` (DysflowProjectConfig)
// and `src/core/config/dysflow-config.ts:247-342` (buildProjectConfig).
// Removal of the top-level aliases is reserved for v1.15.0 (see proposal §
// "Backward Compatibility").

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

describe("DysflowProjectConfig — capabilities consolidated block (#657, #655)", () => {
  describe("case 1: top-level only (backward compatibility)", () => {
    it("uses top-level allowWrites when capabilities block is absent", () => {
      const result = buildConfigWithCapabilities({
        accessPath: "app.accdb",
        allowWrites: true,
        allowedProcedures: ["Test_A"],
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(`expected success, got ${result.error.code}`);
      expect(result.data.allowWrites).toBe(true);
      expect(result.data.allowedProcedures).toEqual(["Test_A"]);
      // No warning expected when only top-level fields are set.
      expect(result.diagnostics).toEqual([]);
    });

    it("treats top-level allowWrites:false as the closed gate", () => {
      const result = buildConfigWithCapabilities({
        accessPath: "app.accdb",
        allowWrites: false,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(`expected success, got ${result.error.code}`);
      expect(result.data.allowWrites).toBe(false);
      expect(result.data.allowedProcedures).toBeUndefined();
      expect(result.diagnostics).toEqual([]);
    });
  });

  describe("case 2: capabilities block only (new canonical form)", () => {
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

  describe("case 3: both top-level AND capabilities block (capabilities wins, single warning)", () => {
    it("capabilities.allowWrites wins over top-level allowWrites and logs one warning", () => {
      const result = buildConfigWithCapabilities({
        accessPath: "app.accdb",
        allowWrites: false, // deprecated
        allowedProcedures: ["Legacy"], // deprecated
        capabilities: {
          allowWrites: true,
          procedures: { allow: ["Test_A"] },
        },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(`expected success, got ${result.error.code}`);
      expect(result.data.allowWrites).toBe(true); // capabilities wins
      expect(result.data.allowedProcedures).toEqual(["Test_A"]); // capabilities wins

      // Exactly one warning, level=warning, source=project-config.
      const warnings = result.diagnostics.filter((d) => d.level === "warning");
      expect(warnings).toHaveLength(1);
      expect(warnings[0]?.source).toBe("project-config");
      expect(warnings[0]?.message).toMatch(/capabilities/i);
      expect(warnings[0]?.message).toMatch(/deprecat/i);
    });

    it("emits one combined warning even when both top-level allowWrites AND allowedProcedures are set", () => {
      const result = buildConfigWithCapabilities({
        accessPath: "app.accdb",
        allowWrites: false,
        allowedProcedures: ["Legacy_1"],
        capabilities: {
          allowWrites: true,
          procedures: { allow: ["Test_A"] },
        },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(`expected success, got ${result.error.code}`);
      const warnings = result.diagnostics.filter((d) => d.level === "warning");
      // Single warning — not two — so the user is not pummeled.
      expect(warnings).toHaveLength(1);
    });
  });

  describe("case 4: neither (defaults unchanged)", () => {
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
});
