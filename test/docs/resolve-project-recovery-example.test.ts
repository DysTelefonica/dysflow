import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { inputSchemaForTool } from "../../src/adapters/mcp/schema-tool.js";
import { validateInput } from "../../src/adapters/mcp/validator.js";

const EXAMPLE_PATTERN = /<!--\s*dysflow-example tool="([^"]+)"\s*-->\s*```json\s*([\s\S]*?)```/g;

describe("resolve_project recovery example", () => {
  it("parses every marked request and validates it against the live tool schema", async () => {
    const markdown = await readFile("assets/examples/resolve-project-recovery.md", "utf8");
    const examples = [...markdown.matchAll(EXAMPLE_PATTERN)];

    expect(examples.length).toBeGreaterThanOrEqual(5);
    for (const match of examples) {
      const toolName = match[1];
      const source = match[2];
      expect(toolName).toBeDefined();
      expect(source).toBeDefined();

      const input = JSON.parse(source ?? "{}") as unknown;
      const validation = validateInput(input, inputSchemaForTool(toolName ?? ""));

      expect(validation, `${toolName} example must match its live input schema`).toBeUndefined();
    }
  });
});
