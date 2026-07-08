/**
 * Issue #789 — `capabilities.lint.identifierSafety.strictNonAscii` opt-in
 * for the historical strict (error) severity of the `identifier-safety`
 * non-ASCII check.
 *
 * Default behavior (no field) → `false` → non-ASCII identifiers emit
 * `warning`, not `error`. The `._` dot-underscore and reserved-word findings
 * are unaffected by this flag (they always stay at `error`).
 *
 * The full truth table for the lint rules lives in
 * `test/core/services/vba-module-lint-service.test.ts`. This file pins the
 * CONFIG-LEVEL surface only: parsing the new field from a project's
 * `.dysflow/project.json` into the resolved `DysflowConfig`.
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
  const root = mkdtempSync(join(tmpdir(), "dysflow-789-lint-"));
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

describe("DysflowProjectConfig — capabilities.lint.identifierSafety.strictNonAscii (#789)", () => {
  it("omitting the field resolves to false (default warning for non-ASCII)", () => {
    const result = buildConfig({
      accessPath: "app.accdb",
      capabilities: {
        allowWrites: true,
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`unexpected error: ${result.error.code}`);
    expect(result.data.lintIdentifierSafetyStrict).toBe(false);
  });

  it("omitting the identifierSafety block (only `rules` set) resolves to false", () => {
    const result = buildConfig({
      accessPath: "app.accdb",
      capabilities: {
        lint: {
          rules: { "forbidden-name": { enabled: false, reason: "legacy" } },
        },
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`unexpected error: ${result.error.code}`);
    expect(result.data.lintIdentifierSafetyStrict).toBe(false);
  });

  it("accepts explicit `strictNonAscii: true` and surfaces it on the resolved config", () => {
    const result = buildConfig({
      accessPath: "app.accdb",
      capabilities: {
        lint: {
          identifierSafety: { strictNonAscii: true },
        },
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`unexpected error: ${result.error.code}`);
    expect(result.data.lintIdentifierSafetyStrict).toBe(true);
  });

  it("accepts explicit `strictNonAscii: false` and surfaces it on the resolved config", () => {
    const result = buildConfig({
      accessPath: "app.accdb",
      capabilities: {
        lint: {
          identifierSafety: { strictNonAscii: false },
        },
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`unexpected error: ${result.error.code}`);
    expect(result.data.lintIdentifierSafetyStrict).toBe(false);
  });

  it("coexists with the existing capabilities fields (lint rules, procedures, allowWrites)", () => {
    const result = buildConfig({
      accessPath: "app.accdb",
      capabilities: {
        allowWrites: true,
        procedures: { allow: ["Test_A"] },
        lint: {
          rules: { "forbidden-name": { enabled: false, reason: "legacy" } },
          identifierSafety: { strictNonAscii: true },
        },
        writeExecutionPolicy: "developer",
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`expected success, got ${result.error.code}`);
    expect(result.data.lintIdentifierSafetyStrict).toBe(true);
    expect(result.data.allowWrites).toBe(true);
    expect(result.data.allowedProcedures).toEqual(["Test_A"]);
    expect(result.data.lintRulesOverride).toEqual({
      "forbidden-name": { enabled: false, reason: "legacy" },
    });
    expect(result.data.writeExecutionPolicy).toBe("developer");
  });
});
