import { describe, expect, it } from "vitest";
import { createStateTool } from "../../../src/adapters/mcp/state-tool.js";
import { createInMemoryAccessOperationRegistry } from "../../../src/core/operations/access-operation-registry.js";

describe("state.orphans.msaccess reports actual orphans, not 0", () => {
  it("with 2 stubbed MSACCESS orphans, state.orphans.msaccess.length === 2", async () => {
    const tool = createStateTool({
      cwd: process.cwd(),
      registry: createInMemoryAccessOperationRegistry(),
      orphanProvider: async () => [
        { pid: 20_824, ageSeconds: 600 },
        { pid: 31_444, ageSeconds: 600 },
      ],
    });

    const result = await tool.handler({});
    const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
      orphans: { msaccess: Array<{ pid: number; ageSeconds: number }> };
    };

    expect(payload.orphans.msaccess).toEqual([
      { pid: 20_824, ageSeconds: 600 },
      { pid: 31_444, ageSeconds: 600 },
    ]);
  });
});
