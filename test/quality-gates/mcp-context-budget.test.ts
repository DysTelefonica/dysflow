import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  compareBudget,
  extractPayload,
  measureLogicalBytes,
  summarizeContributors,
} from "../../scripts/mcp-context-budget.mjs";

describe("MCP context budget helpers", () => {
  it("canonicalizes object key order and measures UTF-8 logical bytes", () => {
    expect(canonicalJson({ z: 1, a: "á" })).toBe('{"a":"á","z":1}');
    expect(measureLogicalBytes({ z: 1, a: "á" })).toBe(
      Buffer.byteLength('{"a":"á","z":1}', "utf8"),
    );
  });

  it("sorts contributors deterministically and reports their byte share", () => {
    expect(
      summarizeContributors([
        { name: "small", logicalBytes: 2 },
        { name: "large", logicalBytes: 8 },
        { name: "large", logicalBytes: 1 },
      ]),
    ).toEqual([
      { name: "large", logicalBytes: 9, share: 0.818182 },
      { name: "small", logicalBytes: 2, share: 0.181818 },
    ]);
  });

  it("fails growth and allows shrinkage or an unchanged baseline", () => {
    const baseline = { toolsList: { logicalBytes: 10, wireBytes: 12 } };
    expect(compareBudget({ toolsList: { logicalBytes: 10, wireBytes: 12 } }, baseline)).toEqual([]);
    expect(compareBudget({ toolsList: { logicalBytes: 9, wireBytes: 11 } }, baseline)).toEqual([]);
    expect(compareBudget({ toolsList: { logicalBytes: 11, wireBytes: 12 } }, baseline)).toEqual([
      { metric: "toolsList.logicalBytes", baseline: 10, current: 11 },
    ]);
  });

  it("measures canonical structured payloads once when text is summary-only", () => {
    expect(
      extractPayload({
        content: [{ type: "text", text: '{"summary":"structuredContent"}' }],
        structuredContent: {
          schemaVersion: "dysflow.result/v1",
          isError: false,
          ok: true,
          tools: [{ name: "large_tool" }],
        },
      }),
    ).toEqual({ tools: [{ name: "large_tool" }] });
  });

  it("wires the built-runtime shrink-only command into the single CI leg", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    const workflow = await readFile(".github/workflows/ci.yml", "utf8");
    expect(packageJson.scripts?.["mcp:context-budget"]).toBe(
      "node scripts/mcp-context-budget.mjs --baseline scripts/baselines/mcp-context-budget.json",
    );
    const budgetStep =
      /name: MCP context budget \(shrink-only\)([\s\S]*?)(?=\n\s*- name:|\n\s{0,4}\S)/.exec(
        workflow,
      )?.[1];
    expect(budgetStep).toContain("run: pnpm mcp:context-budget");
    expect(budgetStep).not.toMatch(/^\s*if:/m);
  });
});

/**
 * #1531 — the committed baseline is the gate's own record of what it measured, so
 * these invariants read it back and assert the metrics still describe the views
 * they are named after.
 *
 * The defect this pins: #1483 inverted `get_capabilities`' default view and #1485
 * made `schema`'s view mandatory, but the measurement script still called both
 * without a view. `getCapabilities` silently began measuring the compact snapshot
 * and `schemaFull` began measuring a `SCHEMA_VIEW_REQUIRED` error envelope. The
 * shrink-only comparison then guarded nothing for the full surface, and the
 * regenerated baseline cemented the wrong numbers.
 *
 * A view-name assertion would only prove the script's arguments. These assert the
 * measured bytes, so any future default-view change that blinds a metric fails here
 * the moment the baseline is regenerated.
 */
describe("MCP context budget baseline invariants (#1531)", () => {
  /** The exact metrics these invariants depend on; a literal key union keeps them required. */
  type MeasuredView =
    | "getCapabilities"
    | "getCapabilitiesCompact"
    | "schemaFull"
    | "schemaCompact"
    | "schemaIndex";

  const readBaseline = async () =>
    JSON.parse(await readFile("scripts/baselines/mcp-context-budget.json", "utf8")) as {
      metrics: Record<MeasuredView, { logicalBytes: number; wireBytes: number }>;
    };

  it("measures the full capabilities snapshot, not the compact one", async () => {
    const { metrics } = await readBaseline();
    expect(metrics.getCapabilities.logicalBytes).toBeGreaterThan(
      metrics.getCapabilitiesCompact.logicalBytes,
    );
  });

  it("measures the full schema catalog, never smaller than its compact projection", async () => {
    const { metrics } = await readBaseline();
    expect(metrics.schemaFull.logicalBytes).toBeGreaterThanOrEqual(
      metrics.schemaCompact.logicalBytes,
    );
  });

  it("keeps the index view the cheapest schema route", async () => {
    const { metrics } = await readBaseline();
    expect(metrics.schemaIndex.logicalBytes).toBeLessThan(metrics.schemaCompact.logicalBytes);
    expect(metrics.schemaIndex.logicalBytes).toBeLessThan(metrics.schemaFull.logicalBytes);
  });
});
