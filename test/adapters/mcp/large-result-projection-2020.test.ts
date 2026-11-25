import { describe, expect, it } from "vitest";
import {
  LARGE_RESULT_TEXT_THRESHOLD_BYTES,
  withWireResponseEnvelope,
} from "../../../src/adapters/mcp/response-envelope.js";

type Summary = {
  kind: string;
  fields: string[];
  message: string;
  projection?: Record<string, unknown>;
  truncated?: Record<string, number>;
};

function textOf(payload: Record<string, unknown>): Record<string, unknown> {
  const result = withWireResponseEnvelope({
    content: [{ type: "text", text: JSON.stringify(payload) }],
    isError: false,
    ok: true,
  });
  const text = result.content[0]?.text ?? "";
  return JSON.parse(text) as Record<string, unknown>;
}

function summaryOf(payload: Record<string, unknown>): Summary {
  return textOf(payload).summary as Summary;
}

function largeVerifyPayload(): Record<string, unknown> {
  const matched = Array.from({ length: 400 }, (_, index) => ({
    moduleName: `Module_${index}`,
    fileType: "bas",
    sourcePath: `C:\\repo\\src\\modules\\Module_${index}.bas`,
    binaryPath: `C:\\tmp\\export\\Module_${index}.bas`,
  }));
  return {
    operation: "verify_code",
    ok: false,
    actionableOk: false,
    recommendedAction: "manual_merge",
    recommendation: "Review the actionable differences before syncing.",
    summaryStructured: {
      matched: 400,
      different: 2,
      missingInSource: 0,
      missingInBinary: 0,
      actionable: { sourceNewer: 1, binaryNewer: 1, bothChanged: 0, total: 2 },
      nonActionable: { caseOnly: 0, whitespaceOnly: 0, total: 0 },
    },
    matched,
    actionableDifferent: [
      {
        moduleName: "Form_FormMenuPrincipalAdmin",
        fileType: "form.txt",
        classification: "binaryNewer",
        reason: "binary has functional lines",
        sourcePath: "C:\\repo\\src\\forms\\Form_FormMenuPrincipalAdmin.form.txt",
      },
      { moduleName: "ModuloX", fileType: "bas", classification: "sourceNewer" },
    ],
    bulkImportable: ["ModuloX"],
    diffs: Array.from({ length: 2 }, () => ({ sourceSnippet: "x".repeat(4_000) })),
  };
}

describe("large result text fallback carries a bounded projection (#2020)", () => {
  it("shows the verify_code verdict and the actionable modules inline", () => {
    const payload = largeVerifyPayload();
    expect(JSON.stringify(payload).length).toBeGreaterThan(LARGE_RESULT_TEXT_THRESHOLD_BYTES);

    const summary = summaryOf(payload);
    const projection = summary.projection ?? {};

    expect(projection.actionableOk).toBe(false);
    expect(projection.recommendedAction).toBe("manual_merge");
    expect(projection.summaryStructured).toEqual(payload.summaryStructured);
    expect(projection.actionableDifferent).toEqual([
      expect.objectContaining({
        moduleName: "Form_FormMenuPrincipalAdmin",
        classification: "binaryNewer",
      }),
      expect.objectContaining({ moduleName: "ModuloX", classification: "sourceNewer" }),
    ]);
    expect(projection.bulkImportable).toEqual(["ModuloX"]);
  });

  it("keeps the text fallback bounded and reports what it cut", () => {
    const result = withWireResponseEnvelope({
      content: [{ type: "text", text: JSON.stringify(largeVerifyPayload()) }],
      isError: false,
      ok: true,
    });
    const text = result.content[0]?.text ?? "";
    const summary = (JSON.parse(text) as { summary: Summary }).summary;

    expect(Buffer.byteLength(text, "utf8")).toBeLessThanOrEqual(LARGE_RESULT_TEXT_THRESHOLD_BYTES);
    expect(summary.truncated?.matched).toBe(400);
    expect(summary.message).toContain("structuredContent");
    // The canonical payload is still complete in structuredContent.
    expect(
      ((result as { structuredContent?: { matched?: unknown[] } }).structuredContent?.matched ?? [])
        .length,
    ).toBe(400);
  });

  it("shows a finished get_test_run outcome with the failing tests first", () => {
    const tests = Array.from({ length: 57 }, (_, index) => ({
      name: `Test_${String(index).padStart(2, "0")}`,
      passed: index !== 55,
      ...(index === 55 ? { error: "esperado [1] obtenido [2]" } : {}),
      output: "y".repeat(400),
    }));
    const summary = summaryOf({
      operationId: "op-1",
      status: "failed",
      progress: { completed: 57, planned: 57, passed: 56, failed: 1 },
      result: { passed: 56, failed: 1, tests },
    });
    const projection = summary.projection ?? {};
    const result = projection.result as { passed: number; failed: number; tests: unknown[] };

    expect(projection.status).toBe("failed");
    expect(projection.progress).toEqual({ completed: 57, planned: 57, passed: 56, failed: 1 });
    expect(result.passed).toBe(56);
    expect(result.failed).toBe(1);
    expect(result.tests[0]).toEqual(
      expect.objectContaining({
        name: "Test_55",
        passed: false,
        error: "esperado [1] obtenido [2]",
      }),
    );
  });

  it("leaves small results untouched", () => {
    const result = withWireResponseEnvelope({
      content: [{ type: "text", text: JSON.stringify({ actionableOk: true }) }],
      isError: false,
      ok: true,
    });
    expect(result.content[0]?.text).toBe(JSON.stringify({ actionableOk: true }));
  });
});
