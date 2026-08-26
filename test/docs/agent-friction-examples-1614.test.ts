import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createDysflowMcpTools } from "../../src/adapters/mcp/tools.js";
import { successResult } from "../../src/core/contracts/index.js";

const repoRoot = process.cwd();
const usageRoot = path.join(repoRoot, "skills", "dysflow-usage");
const examplesRoot = path.join(usageRoot, "assets", "examples");

const contractExamples = [
  "count-rows",
  "distinct-values",
  "exists",
  "detect-dead-code",
  "find-references",
  "vba-orphan-audit",
] as const;

const frictionFamilies = {
  "Start and route": ["bootstrap", "schema", "describe-tool", "resolve-project"],
  "Query and schema reads": ["get-schema", "count-rows", "distinct-values", "export-queries"],
  "Source and binary investigation": [
    "exists",
    "list-vba-modules",
    "verify-code",
    "vba-orphan-audit",
  ],
  "VBA reference analysis": ["find-references", "detect-dead-code", "lint-module"],
  "Forms and UI validation": ["validate-form-spec", "render-form-preview", "lint-form-code"],
  "Configuration and diagnostics": ["migrate-project-config", "doctor", "logs"],
} as const;

function section(markdown: string, heading: string): string {
  const marker = `## ${heading}`;
  const start = markdown.indexOf(marker);
  if (start === -1) return "";
  const body = markdown.slice(start + marker.length).replace(/^\r?\n/, "");
  const nextHeading = body.search(/^## /m);
  return (nextHeading === -1 ? body : body.slice(0, nextHeading)).trim();
}

const liveTools = new Set(
  createDysflowMcpTools({
    services: {
      vbaService: { execute: async () => successResult({}) },
      queryService: { execute: async () => successResult({ rows: [] }) },
      diagnosticsService: { run: async () => successResult({ checks: [] }) },
    },
  }).map((tool) => tool.name),
);

describe("agent friction documentation (#1614)", () => {
  it.each(contractExamples)("keeps %s as a navigable runtime contract", async (name) => {
    const file = path.join(examplesRoot, `${name}.md`);
    const markdown = await readFile(file, "utf8");
    const tool = name.replaceAll("-", "_");

    expect(markdown, file).not.toContain("TODO:");
    for (const heading of [
      "Result shape",
      "Anti-patterns",
      "Live verification",
      "Cross-reference",
    ]) {
      expect(section(markdown, heading), `${file}: missing or empty ${heading}`).not.toBe("");
    }

    const invocations = [...markdown.matchAll(/```json\s*\r?\n([\s\S]*?)\r?\n```/g)].map(
      (match) => JSON.parse(match[1] ?? "") as { tool?: string },
    );
    expect(
      invocations.some((invocation) => invocation.tool === tool),
      file,
    ).toBe(true);

    const crossReferences = [
      ...section(markdown, "Cross-reference").matchAll(/\[[^\]]+\]\(([^)]+\.md)\)/g),
    ].map((match) => match[1] as string);
    expect(
      crossReferences.length,
      `${file}: cross-reference must contain a Markdown link`,
    ).toBeGreaterThan(0);
    for (const reference of crossReferences) {
      expect((await stat(path.resolve(path.dirname(file), reference))).isFile(), reference).toBe(
        true,
      );
    }
  });

  it("maps every friction family to concrete live tools and examples", async () => {
    const file = path.join(usageRoot, "references", "agent-friction-map.md");
    const markdown = await readFile(file, "utf8");
    for (const [family, examples] of Object.entries(frictionFamilies)) {
      const familySection = section(markdown, family);
      expect(familySection, `${file}: missing or empty ${family}`).not.toBe("");
      for (const example of examples) {
        const tool = example.replaceAll("-", "_");
        expect(liveTools.has(tool), `${tool} must remain in the live MCP registry`).toBe(true);
        expect(familySection, `${family} must link ${tool}`).toContain(
          `../assets/examples/${example}.md`,
        );
      }
    }
  });
});
