/**
 * Issue #1867 — one context contract for every advertised tool. A tool takes the
 * project from `cwd` (or from the project resolve_project fixed). It may not require
 * a second project path such as accessPath, destinationRoot or sourcePath, because
 * the config already provides those. A tool that needs a path the caller cannot
 * derive must say so in its schema, not fail with a misleading error.
 */

import { describe, expect, it } from "vitest";
import { MCP_TOOL_CONTRACTS } from "../../../src/adapters/mcp/mcp-tool-contracts.js";
import { inputSchemaForTool } from "../../../src/adapters/mcp/schema-tool.js";

const CONFIG_PATHS = new Set(["accessPath", "backendPath", "destinationRoot", "projectRoot"]);

/**
 * Tools that still require a config path. Each entry is a known gap tracked for
 * follow-up; a new entry needs a reason. The list must shrink, never grow.
 */
const KNOWN_PATH_REQUIREMENTS: Readonly<Record<string, readonly string[]>> = {
  cleanup_access_operation: ["accessPath"],
};

describe("context contract across advertised tools (#1867)", () => {
  const names = Object.keys(MCP_TOOL_CONTRACTS);

  it("no tool requires a config path that the project config already provides", () => {
    const violations: string[] = [];
    for (const name of names) {
      const schema = inputSchemaForTool(name) as { required?: string[] };
      for (const key of schema.required ?? []) {
        if (!CONFIG_PATHS.has(key)) continue;
        if (KNOWN_PATH_REQUIREMENTS[name]?.includes(key)) continue;
        violations.push(`${name}.${key}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("the known-gap list only names tools that still require the path", () => {
    for (const [name, keys] of Object.entries(KNOWN_PATH_REQUIREMENTS)) {
      const schema = inputSchemaForTool(name) as { required?: string[] };
      for (const key of keys) expect(schema.required ?? [], `${name}.${key}`).toContain(key);
    }
  });
});
