/**
 * Regression pin for `feat-759-no-compile` (#759, v1.19.0) — error taxonomy,
 * narrowed by #1911.
 *
 * `compile_vba` and the import-time compile are gone: Dysflow never compiles
 * the user's binary. Since #1911 `VBA_COMPILE_ERROR` has exactly one
 * producer — test_vba compiling its temporary sandbox copy before it runs any
 * test (scripts/dysflow-vba-manager.ps1, Invoke-TestSandboxCompile). The
 * TypeScript side only forwards the runner's envelope and carries its
 * canonical remediation.
 *
 * Lock the contract on two surfaces:
 *   1. The capability surface / parity registry does not advertise a
 *      compile_vba tool.
 *   2. The only TS source naming `VBA_COMPILE_ERROR` is the remediation
 *      table in the core contracts; no adapter builds the error itself.
 *
 * Note: CHANGELOG historical entries and `docs/archive/**` keep the
 * reference as record — they are out of scope per design.
 */

import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { TOOL_DESCRIPTIONS } from "../../../src/adapters/mcp/tool-parity-registry.js";

describe("feat-759-no-compile — VBA_COMPILE_ERROR is reserved for the test_vba sandbox", () => {
  it("compile_vba is gone from TOOL_DESCRIPTIONS so no consumer-facing tool compiles", () => {
    expect(TOOL_DESCRIPTIONS).not.toHaveProperty("compile_vba");
  });

  it("only the core remediation table in src/ names VBA_COMPILE_ERROR", () => {
    function walk(dir: string): string[] {
      const out: string[] = [];
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) {
          out.push(...walk(full));
        } else if (entry.isFile() && full.endsWith(".ts")) {
          out.push(full);
        }
      }
      return out;
    }

    const root = process.cwd();
    const mentions = walk(resolve(root, "src"))
      .filter((file) => readFileSync(file, "utf8").includes("VBA_COMPILE_ERROR"))
      .map((file) => relative(root, file).replaceAll("\\", "/"));
    expect(mentions).toEqual(["src/core/contracts/index.ts"]);
  });
});
