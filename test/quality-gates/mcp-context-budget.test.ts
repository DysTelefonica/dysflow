import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  compareBudget,
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

  it("wires the built-runtime shrink-only command into the Node 20 CI leg", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    const workflow = await readFile(".github/workflows/ci.yml", "utf8");
    expect(packageJson.scripts?.["mcp:context-budget"]).toBe(
      "node scripts/mcp-context-budget.mjs --baseline scripts/baselines/mcp-context-budget.json",
    );
    expect(workflow).toMatch(
      /name: MCP context budget \(shrink-only\)[\s\S]*?if: matrix\.node-version == 20[\s\S]*?run: pnpm mcp:context-budget/,
    );
  });
});
