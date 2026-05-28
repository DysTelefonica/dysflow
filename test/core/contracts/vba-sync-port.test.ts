import { describe, expect, it } from "vitest";
import type { DysflowMcpServices } from "../../../src/adapters/mcp/tools";
import type { VbaSyncPort } from "../../../src/core/contracts/index";

describe("VbaSyncPort contract", () => {
  it("a mock conforming to VbaSyncPort is assignable to DysflowMcpServices.vbaSyncToolService", () => {
    // Compile-time: a value typed as VbaSyncPort must satisfy the
    // optional vbaSyncToolService slot in DysflowMcpServices.
    // If this test file compiles, the type contract is met.
    const mock: VbaSyncPort = {
      execute: async (_toolName: string, _input: unknown) =>
        Promise.resolve({ ok: true, data: null, diagnostics: [], durationMs: 0 }),
    };

    // Runtime: the object we built satisfies the duck-type slot.
    const services: Pick<DysflowMcpServices, "vbaSyncToolService"> = {
      vbaSyncToolService: mock,
    };

    expect(services.vbaSyncToolService).toBe(mock);
    expect(typeof services.vbaSyncToolService?.execute).toBe("function");
  });
});
