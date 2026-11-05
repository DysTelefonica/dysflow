import { describe, expect, it } from "vitest";
import {
  parseTestVbaProgress,
  pendingTestVbaNotifications,
} from "../../../src/core/services/test-vba-progress.js";

describe("test_vba progress parsing (#1990)", () => {
  it("reports each result under the caller's plan name, not the name Access received (#1823)", () => {
    const progress = parseTestVbaProgress(
      {
        total: 2,
        completed: 1,
        currentTest: "Module1.Test_Two",
        results: [{ procedure: "Module1.Test_One", ok: true, durationMs: 5 }],
      },
      ["Test_One", "Test_Two"],
    );

    expect(progress).toEqual({
      total: 2,
      completed: 1,
      passed: 1,
      failed: 0,
      currentTest: "Test_Two",
      results: [{ procedure: "Test_One", ok: true, durationMs: 5 }],
    });
  });

  it("ignores a marker without a well-formed progress block", () => {
    expect(parseTestVbaProgress(undefined)).toBeUndefined();
    expect(parseTestVbaProgress({ completed: 1 })).toBeUndefined();
    expect(parseTestVbaProgress({ total: -1, completed: 0 })).toBeUndefined();
  });

  it("owes one notification per test finished since the last report", () => {
    const progress = parseTestVbaProgress({
      total: 3,
      completed: 3,
      results: [
        { procedure: "Test_One", ok: true },
        { procedure: "Test_Two", ok: false, error: "boom" },
        { procedure: "Test_Three", ok: true },
      ],
    });
    if (progress === undefined) throw new Error("expected progress");

    expect(pendingTestVbaNotifications(progress, 1)).toEqual([
      { progress: 2, total: 3, message: "Test_Two failed" },
      { progress: 3, total: 3, message: "Test_Three passed" },
    ]);
    expect(pendingTestVbaNotifications(progress, 3)).toEqual([]);
  });
});
