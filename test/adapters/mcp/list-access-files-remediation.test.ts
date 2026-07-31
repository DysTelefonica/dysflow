import { describe, expect, it } from "vitest";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import {
  createDysflowError,
  failureResult,
  successResult,
} from "../../../src/core/contracts/index.js";

describe("list_access_files remediation is actionable", () => {
  it("suggests a parameter that its schema accepts", async () => {
    const tools = createDysflowMcpTools({
      services: {
        vbaService: { execute: async () => successResult({}) },
        diagnosticsService: { run: async () => successResult({ checks: [] }) },
        queryService: {
          execute: async () =>
            failureResult(
              createDysflowError("PROJECT_NOT_FOUND", "Project is ambiguous.", {
                remediation: "Pass accessPath to disambiguate the target.",
              }),
            ),
        },
      },
    });
    const tool = tools.find((candidate) => candidate.name === "list_access_files");
    if (tool === undefined) throw new Error("list_access_files is not registered");

    const result = await tool.handler({ projectId: "non-existent" });
    const suggestion = String(result.error?.remediation).match(/pass (\w+)/i)?.[1];

    expect(result.ok).toBe(false);
    expect(suggestion).toBeDefined();
    expect(tool.inputSchema?.properties).toHaveProperty(String(suggestion));
  });
});
