import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Source-code assertion for DELTA-003 (#578). The fix replaces the
 * `Object.fromEntries(...) as Record<...>` construction with a typed literal
 * using `satisfies Record<QueryToolName, AccessQueryAction>`, so a missing
 * `QUERY_TOOL_NAMES` entry becomes a TS2322/TS2741 compile error instead of
 * silently hiding drift behind a cast.
 *
 * This test catches regressions to the `as Record<...>` pattern, which would
 * re-introduce the original bug.
 */
describe("MCP_TOOL_QUERY_ACTIONS — source code construction (#578)", () => {
  const sourcePath = join(process.cwd(), "src/adapters/mcp/dispatch-routes.ts");
  const source = readFileSync(sourcePath, "utf8");

  it("does NOT use 'as Record<QueryToolName, AccessQueryAction>' cast", () => {
    expect(source).not.toMatch(/as\s+Record<QueryToolName,\s*AccessQueryAction>/);
  });

  it("uses 'satisfies Record<QueryToolName, AccessQueryAction>' for compile-time safety", () => {
    // The literal must declare the `satisfies` operator (typed validation)
    // — not a stand-alone `Record<...>` annotation, which is equivalent to
    // the disallowed `as Record<...>` cast (widens the inferred type).
    expect(source).toMatch(/satisfies\s+Record<QueryToolName,\s*AccessQueryAction>/);
  });
});
