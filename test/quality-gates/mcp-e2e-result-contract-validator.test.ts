import { describe, expect, it } from "vitest";

import { validateMcpResultAgainstDescription } from "../../E2E_testing/_helpers/result-contract-validator.mjs";

function response(payload: unknown, isError = false) {
  return {
    response: {
      result: {
        content: [{ type: "text", text: JSON.stringify(payload) }],
        isError,
      },
    },
  };
}

const described = response({
  name: "probe",
  resultContract: {
    kind: "dataSchema",
    dataSchema: {
      type: "object",
      properties: { count: { type: "number" } },
      required: ["count"],
    },
    errorEnvelope: {
      shape: {
        code: { type: "string" },
        message: { type: "string" },
        remediation: { type: "string", optional: true },
      },
    },
  },
});

describe("real MCP result-contract validator (#1101)", () => {
  it("validates a success payload against the contract obtained from describe_tool", () => {
    expect(
      validateMcpResultAgainstDescription({
        tool: "probe",
        descriptionResult: described,
        executionResult: response({ count: 2 }),
      }),
    ).toMatchObject({ ok: true, contractKind: "dataSchema" });
  });

  it("fails closed when the real payload violates the described schema", () => {
    expect(() =>
      validateMcpResultAgainstDescription({
        tool: "probe",
        descriptionResult: described,
        executionResult: response({ count: "2" }),
      }),
    ).toThrow(/probe.*count.*number/i);
  });

  it("validates typed errors against the described error envelope", () => {
    expect(
      validateMcpResultAgainstDescription({
        tool: "probe",
        descriptionResult: described,
        executionResult: response(
          { ok: false, error: { code: "PROBE_FAILED", message: "failed" } },
          true,
        ),
        expectError: true,
      }),
    ).toMatchObject({ ok: true, contractKind: "errorEnvelope" });
  });

  it("normalizes the legacy plain-text alias error into the typed envelope", () => {
    expect(
      validateMcpResultAgainstDescription({
        tool: "probe",
        descriptionResult: described,
        executionResult: { text: "PROBE_FAILED: failed" },
        expectError: true,
      }),
    ).toMatchObject({ ok: true, contractKind: "errorEnvelope" });
  });

  it("rejects missing contracts instead of falling back silently", () => {
    expect(() =>
      validateMcpResultAgainstDescription({
        tool: "probe",
        descriptionResult: response({ name: "probe" }),
        executionResult: response({ count: 2 }),
      }),
    ).toThrow(/missing resultContract/i);
  });
});
