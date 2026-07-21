import { describe, expect, it } from "vitest";
import { resolveStartupWriteExecutionPolicy } from "../../../src/adapters/mcp/stdio.js";
import type { DysflowConfig } from "../../../src/core/config/dysflow-config.js";

describe("MCP startup write policy propagation (#1037)", () => {
  it("propagates an explicit developer policy", () => {
    const config = { writeExecutionPolicy: "developer" } as DysflowConfig;
    expect(resolveStartupWriteExecutionPolicy(config)).toBe("developer");
  });

  it("preserves an explicit safe-by-default policy", () => {
    const config = { writeExecutionPolicy: "safe-by-default" } as DysflowConfig;
    expect(resolveStartupWriteExecutionPolicy(config)).toBe("safe-by-default");
  });

  it("falls back safely when no config is available", () => {
    expect(resolveStartupWriteExecutionPolicy()).toBe("safe-by-default");
  });
});
