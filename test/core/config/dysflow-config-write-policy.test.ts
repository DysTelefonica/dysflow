/**
 * Issue #779 — `capabilities.writeExecutionPolicy` parsing contract.
 *
 * Locks down the v2.1.0 schema:
 *
 * - Omitting the field keeps the historical `safe-by-default` behavior.
 *   The resolved `DysflowConfig.writeExecutionPolicy` is `undefined` so
 *   consumers that don't care about the new field see no behavioral change.
 * - Setting `"safe-by-default"` resolves to that mode explicitly
 *   (a no-op surface, but observable for tests).
 * - Setting `"developer"` resolves to the developer mode.
 * - Setting anything else is REJECTED with `CONFIG_UNKNOWN_WRITE_EXECUTION_POLICY`
 *   so a typo cannot silently fall back to `safe-by-default`.
 * - The legacy top-level `allowWrites`/`allowedProcedures` alias path
 *   (T18) is unaffected; `writeExecutionPolicy` lives only inside
 *   `capabilities`.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type DysflowProjectConfig,
  loadProjectConfigCore,
} from "../../../src/core/config/dysflow-config";

function createTempWorkspace(): { root: string; cleanup(): void } {
  const root = mkdtempSync(join(tmpdir(), "dysflow-779-policy-"));
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function makeAccessTarget(root: string): void {
  writeFileSync(join(root, "app.accdb"), "", "utf8");
}

function buildConfig(raw: Record<string, unknown>): ReturnType<typeof loadProjectConfigCore> {
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

describe("DysflowProjectConfig — capabilities.writeExecutionPolicy (#779)", () => {
  it("omitting capabilities.writeExecutionPolicy resolves to undefined (back-compat)", () => {
    const result = buildConfig({
      accessPath: "app.accdb",
      capabilities: { allowWrites: true },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`expected success, got ${result.error.code}`);
    expect(result.data.writeExecutionPolicy).toBeUndefined();
  });

  it("accepts explicit 'safe-by-default' and resolves that mode", () => {
    const result = buildConfig({
      accessPath: "app.accdb",
      capabilities: { writeExecutionPolicy: "safe-by-default" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`expected success, got ${result.error.code}`);
    expect(result.data.writeExecutionPolicy).toBe("safe-by-default");
    expect(result.data.allowWrites).toBe(false); // safe-by-default does NOT auto-enable writes
  });

  it("accepts explicit 'developer' and resolves the developer mode", () => {
    const result = buildConfig({
      accessPath: "app.accdb",
      capabilities: { writeExecutionPolicy: "developer" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`expected success, got ${result.error.code}`);
    expect(result.data.writeExecutionPolicy).toBe("developer");
  });

  it("accepts 'developer' alongside allowWrites + procedures allow", () => {
    const result = buildConfig({
      accessPath: "app.accdb",
      capabilities: {
        allowWrites: true,
        procedures: { allow: ["Test_A"] },
        writeExecutionPolicy: "developer",
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`expected success, got ${result.error.code}`);
    expect(result.data.allowWrites).toBe(true);
    expect(result.data.allowedProcedures).toEqual(["Test_A"]);
    expect(result.data.writeExecutionPolicy).toBe("developer");
  });

  it("rejects unknown policy values with a typed error (no silent fallback)", () => {
    const result = buildConfig({
      accessPath: "app.accdb",
      capabilities: { writeExecutionPolicy: "developer-mode" },
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure, got success");
    expect(result.error.code).toBe("CONFIG_UNKNOWN_WRITE_EXECUTION_POLICY");
    expect(result.error.message).toMatch(/writeExecutionPolicy/i);
    expect(result.error.message).toMatch(/developer-mode/);
    expect(result.error.message).toMatch(/"safe-by-default"|"developer"/);
    expect(result.error.retryable).toBe(false);
  });

  it("rejects non-string writeExecutionPolicy with the same typed code", () => {
    const result = buildConfig({
      accessPath: "app.accdb",
      capabilities: { writeExecutionPolicy: 123 },
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure, got success");
    expect(result.error.code).toBe("CONFIG_UNKNOWN_WRITE_EXECUTION_POLICY");
  });

  it("rejects case-mismatched policy values (enum is exact)", () => {
    const result = buildConfig({
      accessPath: "app.accdb",
      capabilities: { writeExecutionPolicy: "DEVELOPER" },
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure, got success");
    expect(result.error.code).toBe("CONFIG_UNKNOWN_WRITE_EXECUTION_POLICY");
  });

  it("does not bleed the writeExecutionPolicy into the top-level legacy aliases (T18)", () => {
    // Setting the top-level `allowWrites` is REJECTED (T18). The new
    // writeExecutionPolicy field MUST live under `capabilities` so this
    // assertion also pins the structural placement.
    const result = buildConfig({
      accessPath: "app.accdb",
      writeExecutionPolicy: "developer", // NOT under capabilities — must NOT be silently honored
    });
    // Top-level `writeExecutionPolicy` is unknown to the schema, so the
    // result is either ignored OR the loader returns success with the
    // resolved mode undefined. Either is acceptable; what we forbid is a
    // SILENT FLIP to the developer mode.
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`unexpected error: ${result.error.code}`);
    expect(result.data.writeExecutionPolicy).toBeUndefined();
  });

  it("coexists with the existing capabilities fields (lint, procedures, allowWrites)", () => {
    const result = buildConfig({
      accessPath: "app.accdb",
      capabilities: {
        allowWrites: true,
        procedures: { allow: ["Test_A"], deny: ["Test_B"] },
        lint: { rules: { "forbidden-name": { enabled: false, reason: "legacy" } } },
        writeExecutionPolicy: "developer",
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`expected success, got ${result.error.code}`);
    expect(result.data.writeExecutionPolicy).toBe("developer");
    expect(result.data.allowWrites).toBe(true);
    expect(result.data.allowedProcedures).toEqual(["Test_A"]);
    expect(result.data.lintRulesOverride).toEqual({
      "forbidden-name": { enabled: false, reason: "legacy" },
    });
  });
});
