import { describe, expect, it } from "vitest";
import { validateVbaTestManifest } from "../../../src/core/services/vba-test-manifest-service";

describe("vba-test-manifest-service", () => {
  const modules = {
    TestModule: [
      "Option Explicit",
      "",
      "Public Sub Test_NoArgs()",
      "End Sub",
      "",
      "Public Sub Test_WithArgs(ByVal name As String, ByVal count As Long, ByVal enabled As Boolean)",
      "End Sub",
    ].join("\r\n"),
  };

  it("accepts a manifest whose procedures exist and whose argument types match", () => {
    const report = validateVbaTestManifest(
      {
        tests: [
          { procedure: "Test_NoArgs", tags: ["smoke"] },
          { procedure: "Test_WithArgs", args: ["fixture", 2, true], tags: ["regression"] },
        ],
      },
      modules,
    );

    expect(report.valid).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.summary).toMatchObject({ totalTests: 2, validTests: 2, errorCount: 0 });
  });

  it("reports a typed error when a manifest references a missing procedure", () => {
    const report = validateVbaTestManifest([{ procedure: "Test_Missing", args: [] }], modules);

    expect(report.valid).toBe(false);
    expect(report.errors).toContainEqual(
      expect.objectContaining({ code: "PROCEDURE_NOT_FOUND", procedure: "Test_Missing" }),
    );
  });

  it("reports a typed error when manifest args do not match the VBA signature", () => {
    const report = validateVbaTestManifest(
      [{ procedure: "Test_WithArgs", args: ["fixture", "not-a-number", true] }],
      modules,
    );

    expect(report.valid).toBe(false);
    expect(report.errors).toContainEqual(
      expect.objectContaining({
        code: "ARG_TYPE_MISMATCH",
        procedure: "Test_WithArgs",
        index: 2,
      }),
    );
  });

  it("reports malformed tags without coercing them", () => {
    const report = validateVbaTestManifest(
      [{ procedure: "Test_NoArgs", tags: ["smoke", 42] }],
      modules,
    );

    expect(report.valid).toBe(false);
    expect(report.errors).toContainEqual(
      expect.objectContaining({ code: "INVALID_TAG", procedure: "Test_NoArgs", index: 2 }),
    );
  });

  it("counts malformed raw manifest entries in the summary", () => {
    const report = validateVbaTestManifest({ tests: [42] }, modules);

    expect(report.valid).toBe(false);
    expect(report.errors).toContainEqual(expect.objectContaining({ code: "INVALID_MANIFEST" }));
    expect(report.summary).toMatchObject({ totalTests: 1, validTests: 0, errorCount: 1 });
  });
});
