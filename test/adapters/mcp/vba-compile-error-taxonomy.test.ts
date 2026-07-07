/**
 * Regression pin for `feat-759-no-compile` (#759, v1.19.0) — error taxonomy.
 *
 * `VBA_COMPILE_ERROR` leaves the error taxonomy entirely. The runtime no
 * longer compiles; the error code becomes unreachable by construction
 * (no PowerShell path can emit it; the New-CompileFailureResult envelope
 * is removed; the dispatch no longer routes -Action "Compile").
 *
 * Lock the contract on two surfaces:
 *   1. No adapter emit path names `VBA_COMPILE_ERROR` (TS source).
 *   2. The capability surface / parity registry does not advertise a
 *      compile_vba description that mentions `VBA_COMPILE_ERROR`.
 *
 * Note: CHANGELOG historical entries and `docs/archive/**` keep the
 * reference as record — they are out of scope per design.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TOOL_DESCRIPTIONS } from "../../../src/adapters/mcp/tool-parity-registry.js";

describe("feat-759-no-compile — VBA_COMPILE_ERROR is unreachable", () => {
  it("compile_vba is gone from TOOL_DESCRIPTIONS so no consumer-facing string mentions VBA_COMPILE_ERROR", () => {
    expect(TOOL_DESCRIPTIONS).not.toHaveProperty("compile_vba");
  });

  it("the live source files in src/ do not mention VBA_COMPILE_ERROR", () => {
    // Read every src/.ts file (cheap; the codebase is small) and assert none
    // contains the string. Tests, scripts, docs, archive, CHANGELOG, and
    // the apply-progress-slice-1.md (historical record) are out of scope.
    const { readdirSync } = require("node:fs") as typeof import("node:fs");
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

    const srcFiles = walk(resolve(process.cwd(), "src"));
    const offenders: string[] = [];
    for (const file of srcFiles) {
      const text = readFileSync(file, "utf8");
      if (text.includes("VBA_COMPILE_ERROR")) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
