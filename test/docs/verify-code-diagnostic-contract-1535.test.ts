import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { VBA_SYNC_TOOL_SCHEMAS } from "../../src/adapters/mcp/schemas/vba-sync-schemas.js";
import { TOOL_DESCRIPTIONS } from "../../src/adapters/mcp/tool-parity-registry.js";
import { shapeVerifyCodeResponse } from "../../src/adapters/mcp/verify-code-response-shaping.js";

const rawComparison = {
  operation: "verify_code",
  ok: false,
  actionableOk: true,
  recommendedAction: "no_action",
  summary: { caseOnly: 1 },
  summaryStructured: {
    matched: 1,
    actionable: { sourceNewer: 0, binaryNewer: 0, bothChanged: 0, total: 0 },
    nonActionable: { total: 1 },
  },
  different: [{ moduleName: "Noise" }],
  nonActionableDifferent: [{ moduleName: "Noise", classification: "caseOnly" }],
  bulkImportable: [],
  bulkExportable: [],
  warnings: [],
};

describe("verify_code diagnostic documentation contract (#1535)", () => {
  it("anchors the documented compact/diagnostic split to the live schema and shaper", async () => {
    const reference = await readFile("docs/api/mcp-tools.md", "utf8");
    const skillExample = await readFile(
      "skills/dysflow-usage/assets/examples/verify-code.md",
      "utf8",
    );
    const diagnosticSchema = VBA_SYNC_TOOL_SCHEMAS.verify_code.properties.diagnostic;

    expect(reference).toContain("The MCP response is compact by default");
    expect(reference).toContain("`diagnostic:true` restores");
    expect(skillExample).toContain('"diagnostic": true');
    expect(diagnosticSchema).toMatchObject({ type: "boolean" });

    const compact = shapeVerifyCodeResponse(rawComparison, { diagnostic: false });
    const diagnostic = shapeVerifyCodeResponse(rawComparison, { diagnostic: true });

    expect(compact).not.toHaveProperty("different");
    expect(compact).not.toHaveProperty("nonActionableDifferent");
    expect(compact).toMatchObject({
      ok: false,
      actionableOk: true,
      recommendedAction: "no_action",
      summaryStructured: { matched: 1, actionableTotal: 0, nonActionableTotal: 1 },
    });
    expect(diagnostic).toMatchObject({
      different: rawComparison.different,
      nonActionableDifferent: rawComparison.nonActionableDifferent,
      summaryStructured: rawComparison.summaryStructured,
    });
  });

  it("warns consumers that compact category counts do not identify module membership", async () => {
    const reference = await readFile("docs/api/mcp-tools.md", "utf8");
    const examples = await readFile("docs/mcp-examples.md", "utf8");
    const skillExample = await readFile(
      "skills/dysflow-usage/assets/examples/verify-code.md",
      "utf8",
    );
    const usageSkill = await readFile("skills/dysflow-usage/SKILL.md", "utf8");
    const harnessSkill = await readFile("skills/dysflow-arnes/SKILL.md", "utf8");

    for (const surface of [
      reference,
      examples,
      skillExample,
      usageSkill,
      harnessSkill,
      TOOL_DESCRIPTIONS.verify_code,
    ]) {
      expect(surface).toContain("aggregate counts");
      expect(surface).toContain("diagnostic:true");
      expect(surface).toContain("actionableDifferent[]");
      expect(surface).toContain("nonActionableDifferent[]");
    }

    expect(reference).toContain("`.cls` and `.form.txt`");
    expect(skillExample).toContain("`.cls` and `.form.txt`");
    expect(usageSkill).toContain("`.cls` and `.form.txt`");
    expect(harnessSkill).toContain("`.cls` and `.form.txt`");
  });

  it("keeps the compact response example internally consistent", async () => {
    const examples = await readFile("docs/mcp-examples.md", "utf8");
    const compactExample = examples.match(
      /Compact response shape \(excerpt\):\s*```json\s*([\s\S]*?)\s*```/,
    );

    const compactJson = compactExample?.[1];
    expect(compactJson).toBeDefined();
    if (compactJson === undefined) throw new Error("compact verify_code example is missing");
    const payload = JSON.parse(compactJson) as {
      ok: boolean;
      summaryStructured: { actionableTotal: number; nonActionableTotal: number };
      summaryByCategory: Record<string, number>;
      nonActionableByCategory: Record<string, number>;
    };

    expect(payload.summaryStructured.actionableTotal).toBeGreaterThan(0);
    expect(payload.ok).toBe(false);
    expect(payload.summaryStructured.actionableTotal).toBe(
      Object.values(payload.summaryByCategory).reduce((total, count) => total + count, 0),
    );
    expect(payload.summaryStructured.nonActionableTotal).toBe(
      Object.values(payload.nonActionableByCategory).reduce((total, count) => total + count, 0),
    );
  });
});
