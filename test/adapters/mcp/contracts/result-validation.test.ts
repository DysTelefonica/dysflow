import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineResultContract } from "../../../../src/adapters/mcp/contracts/result-contract.js";
import {
  resolveResultValidationPolicy,
  validateToolResult,
} from "../../../../src/adapters/mcp/contracts/result-validation.js";
import { getCapabilitiesAll } from "../../../../src/adapters/mcp/get-capabilities-tool.js";

const contract = defineResultContract({
  schema: z
    .object({
      kind: z.literal("summary"),
      count: z.number(),
    })
    .strict(),
});

describe("validateToolResult", () => {
  it.each([
    ["missing required field", { kind: "summary" }],
    ["wrong discriminator", { kind: "full", count: 1 }],
    ["unknown field", { kind: "summary", count: 1, password: "secret-password" }],
    ["wrong value type", { kind: "summary", count: "one" }],
  ])("reports %s without returning payload values", (_case, payload) => {
    const result = validateToolResult({
      toolName: "synthetic",
      contract,
      payload,
      policy: "report",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected validation failure");
    expect(result.diagnostic.code).toBe("RESULT_CONTRACT_VIOLATION");
    expect(result.diagnostic.toolName).toBe("synthetic");
    expect(result.diagnostic.issues.length).toBeGreaterThan(0);
    expect(JSON.stringify(result.diagnostic)).not.toContain("secret-password");
    expect(JSON.stringify(result.diagnostic)).not.toContain(JSON.stringify(payload));
  });

  it("accepts valid payloads and off mode bypasses validation", () => {
    expect(
      validateToolResult({
        toolName: "synthetic",
        contract,
        payload: { kind: "summary", count: 1 },
        policy: "enforce",
      }),
    ).toEqual({ ok: true });
    expect(
      validateToolResult({
        toolName: "synthetic",
        contract,
        payload: "legacy",
        policy: "off",
      }),
    ).toEqual({ ok: true });
  });

  it("reports union mismatches with schema paths but no branch values", () => {
    const unionContract = defineResultContract({
      schema: z
        .object({
          result: z.union([
            z.object({ mode: z.literal("plan"), planned: z.boolean() }).strict(),
            z.object({ mode: z.literal("apply"), applied: z.boolean() }).strict(),
          ]),
        })
        .strict(),
    });
    const result = validateToolResult({
      toolName: "union_tool",
      contract: unionContract,
      payload: { result: { mode: "apply", applied: "TOP-SECRET" } },
      policy: "enforce",
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected validation failure");
    expect(result.diagnostic.issues.map((issue) => issue.path)).toContain("$.result");
    expect(JSON.stringify(result.diagnostic)).not.toContain("TOP-SECRET");
  });

  it("emits one redacted diagnostic in report mode", () => {
    const report = vi.fn();
    const result = validateToolResult({
      toolName: "synthetic",
      contract,
      payload: { kind: "summary", count: "credential=secret" },
      policy: "report",
      report,
    });
    expect(result.ok).toBe(false);
    expect(report).toHaveBeenCalledOnce();
    expect(JSON.stringify(report.mock.calls)).not.toContain("credential=secret");
  });
});

describe("result validation policy", () => {
  it("defaults every runtime to enforce while retaining explicit diagnostic modes", () => {
    expect(resolveResultValidationPolicy()).toBe("enforce");
    expect(resolveResultValidationPolicy("off")).toBe("off");
    expect(resolveResultValidationPolicy("report")).toBe("report");
    expect(resolveResultValidationPolicy("enforce")).toBe("enforce");
  });

  it("is introspectable through get_capabilities", () => {
    const common = {
      writesEnabled: false,
      writeAccessResolver: undefined,
      allowedProcedures: undefined,
      projectId: undefined,
      allowWrites: false,
    };
    expect(getCapabilitiesAll(common).resultValidationPolicy).toBe("enforce");
    expect(
      getCapabilitiesAll({ ...common, resultValidationPolicy: "report" }).resultValidationPolicy,
    ).toBe("report");
  });
});
