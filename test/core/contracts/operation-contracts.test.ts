import { describe, expect, it } from "vitest";
import {
  type AccessQueryRequest,
  type AccessVbaRequest,
  createDiagnostic,
  createDysflowError,
  failureResult,
  successResult,
} from "../../../src/core/contracts/index";

describe("core operation contracts", () => {
  it("creates protocol-neutral success results with diagnostics and duration", () => {
    const diagnostic = createDiagnostic("info", "query", "Read 2 rows");
    const result = successResult(
      { rows: [{ id: 1 }, { id: 2 }] },
      { diagnostics: [diagnostic], durationMs: 37 },
    );

    expect(result).toEqual({
      ok: true,
      data: { rows: [{ id: 1 }, { id: 2 }] },
      diagnostics: [{ level: "info", source: "query", message: "Read 2 rows" }],
      durationMs: 37,
    });
  });

  it("creates safe typed failures without protocol details", () => {
    const error = createDysflowError("RUNNER_TIMEOUT", "Access runner timed out", {
      retryable: true,
    });
    const result = failureResult(error, {
      diagnostics: [createDiagnostic("error", "runner", "Timeout after 1000ms")],
      durationMs: 1000,
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "RUNNER_TIMEOUT", message: "Access runner timed out", retryable: true },
      diagnostics: [{ level: "error", source: "runner", message: "Timeout after 1000ms" }],
      durationMs: 1000,
    });
  });

  it("defines VBA and query requests without MCP or HTTP concepts", () => {
    const vbaRequest: AccessVbaRequest = {
      moduleName: "modSmoke",
      procedureName: "RunSmoke",
      arguments: ["a"],
    };
    const queryRequest: AccessQueryRequest = { sql: "SELECT * FROM Customers", mode: "read" };

    expect(vbaRequest).toEqual({
      moduleName: "modSmoke",
      procedureName: "RunSmoke",
      arguments: ["a"],
    });
    expect(queryRequest).toEqual({ sql: "SELECT * FROM Customers", mode: "read" });
  });
});
