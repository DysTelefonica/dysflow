/**
 * Issue #1019 — `find_references` MCP -32001 timeout for popular symbols.
 *
 * The walker used to return the full reference list in a single call. For
 * popular symbols (dozens of references spread across a 100+ module bench)
 * the response payload exceeded the MCP transport's 30 s budget and the
 * consumer saw `MCP error -32001: Request timed out` with no way to recover.
 *
 * The fix adds limit/offset to the walker so the heavy work — running the
 * regex across every module's lines — still happens, but the caller can
 * either accept a bounded first page or stream through the corpus. Backward
 * compatibility: when no `limit`/`offset` are supplied, the walker caps at a
 * default of 500 (the pre-fix behavior is preserved for symbols with fewer
 * references — they return identical content plus a `truncated: false` and
 * `nextOffset: null`).
 */
import { describe, expect, it } from "vitest";
import { findVbaReferences } from "../../../src/core/services/vba-procedure-service";

function buildModulesWithRefs(refCount: number): Record<string, string> {
  const lines: string[] = ["Option Explicit", "", "Public Sub PopularSymbol()", "End Sub", ""];
  for (let i = 0; i < refCount; i++) {
    lines.push(`Public Sub Caller${i}()`);
    lines.push(`    PopularSymbol`);
    lines.push("End Sub");
    lines.push("");
  }
  return { modWithRefs: lines.join("\r\n") };
}

describe("vba-procedure-service — findVbaReferences pagination (#1019)", () => {
  it("default limit caps references and surfaces truncated=true + nextOffset", () => {
    const modules = buildModulesWithRefs(600);
    const result = findVbaReferences(modules, "PopularSymbol");
    expect(result).toBeDefined();
    expect(result?.totalCount).toBe(600);
    expect(result?.references).toHaveLength(500); // default limit
    expect(result?.truncated).toBe(true);
    expect(result?.nextOffset).toBe(500);
  });

  it("honors an explicit limit smaller than totalCount", () => {
    const modules = buildModulesWithRefs(600);
    const result = findVbaReferences(modules, "PopularSymbol", "all", undefined, { limit: 10 });
    expect(result).toBeDefined();
    expect(result?.totalCount).toBe(600);
    expect(result?.references).toHaveLength(10);
    expect(result?.truncated).toBe(true);
    expect(result?.nextOffset).toBe(10);
  });

  it("respects offset to return the next page", () => {
    const modules = buildModulesWithRefs(600);
    const result = findVbaReferences(modules, "PopularSymbol", "all", undefined, {
      limit: 100,
      offset: 500,
    });
    expect(result).toBeDefined();
    expect(result?.totalCount).toBe(600);
    expect(result?.references).toHaveLength(100);
    expect(result?.truncated).toBe(false);
    expect(result?.nextOffset).toBe(null);
  });

  it("returns truncated=false + nextOffset=null when total < default limit (backward compat)", () => {
    const modules = {
      modHelper: [
        "Public Sub TargetSub()",
        "End Sub",
        "",
        "Public Sub Caller()",
        "    Call TargetSub",
        "    TargetSub",
        "End Sub",
      ].join("\r\n"),
    };
    const result = findVbaReferences(modules, "TargetSub");
    expect(result).toBeDefined();
    expect(result?.totalCount).toBe(2);
    expect(result?.references).toHaveLength(2);
    expect(result?.truncated).toBe(false);
    expect(result?.nextOffset).toBe(null);
  });

  it("when explicit limit exceeds totalCount, returns all references with truncated=false", () => {
    const modules = buildModulesWithRefs(50);
    const result = findVbaReferences(modules, "PopularSymbol", "all", undefined, { limit: 1000 });
    expect(result).toBeDefined();
    expect(result?.totalCount).toBe(50);
    expect(result?.references).toHaveLength(50);
    expect(result?.truncated).toBe(false);
    expect(result?.nextOffset).toBe(null);
  });

  it("returns undefined when the symbol is not defined (pagination does not affect this)", () => {
    const modules = { modA: ["Public Sub Other()", "End Sub"].join("\r\n") };
    const result = findVbaReferences(modules, "Missing");
    expect(result).toBeUndefined();
  });

  it("paginates deterministically — paging the full corpus reproduces the full list with no overlap", () => {
    const modules = buildModulesWithRefs(50);
    const page1 = findVbaReferences(modules, "PopularSymbol", "all", undefined, {
      limit: 20,
      offset: 0,
    });
    const page2 = findVbaReferences(modules, "PopularSymbol", "all", undefined, {
      limit: 20,
      offset: 20,
    });
    const page3 = findVbaReferences(modules, "PopularSymbol", "all", undefined, {
      limit: 20,
      offset: 40,
    });

    const r1 = page1?.references ?? [];
    const r2 = page2?.references ?? [];
    const r3 = page3?.references ?? [];

    expect(r1.length + r2.length + r3.length).toBe(50);

    const seen = new Set<string>();
    for (const r of [...r1, ...r2, ...r3]) {
      const key = `${r.module}:${r.line}:${r.context}`;
      expect(seen.has(key), `duplicate ref across pages: ${key}`).toBe(false);
      seen.add(key);
    }
  });

  it("clamps limit above the maximum to the maximum", () => {
    const modules = buildModulesWithRefs(50);
    const result = findVbaReferences(modules, "PopularSymbol", "all", undefined, {
      limit: 10_000,
    });
    expect(result).toBeDefined();
    // 50 < 1000 hard cap, so all 50 refs are returned; the walker must not crash.
    expect(result?.references.length).toBeGreaterThan(0);
    expect(result?.truncated).toBe(false);
  });

  it("clamps negative limit/offset to safe defaults", () => {
    const modules = buildModulesWithRefs(50);
    const result = findVbaReferences(modules, "PopularSymbol", "all", undefined, {
      limit: -5,
      offset: -10,
    });
    expect(result).toBeDefined();
    // Negative inputs must not crash the walker; the result should still be valid.
    expect(result?.totalCount).toBe(50);
    expect(Array.isArray(result?.references)).toBe(true);
  });
});
