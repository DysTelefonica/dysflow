import { describe, expect, it } from "vitest";
import type { DysflowMcpServices } from "../../../src/adapters/mcp/tools";
import type { LegacyVbaSyncPort } from "../../../src/core/contracts/index";

describe("LegacyVbaSyncPort contract", () => {
  it("a mock conforming to LegacyVbaSyncPort is assignable to DysflowMcpServices.legacyToolService", () => {
    // Compile-time: a value typed as LegacyVbaSyncPort must satisfy the
    // optional legacyToolService slot in DysflowMcpServices.
    // If this test file compiles, the type contract is met.
    const mock: LegacyVbaSyncPort = {
      execute: async (_toolName: string, _input: unknown) =>
        Promise.resolve({ ok: true, data: null, diagnostics: [], durationMs: 0 }),
    };

    // Runtime: the object we built satisfies the duck-type slot.
    const services: Pick<DysflowMcpServices, "legacyToolService"> = {
      legacyToolService: mock,
    };

    expect(services.legacyToolService).toBe(mock);
    expect(typeof services.legacyToolService?.execute).toBe("function");
  });
});
