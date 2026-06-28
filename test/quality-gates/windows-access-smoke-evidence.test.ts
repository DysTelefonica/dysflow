import { describe, expect, it } from "vitest";
import { summarizeAccessSmokeEvidence } from "../../scripts/access-smoke-evidence.mjs";

describe("Windows Access smoke evidence", () => {
  it("reports executed Access tests as release-grade smoke evidence", () => {
    const summary = summarizeAccessSmokeEvidence({
      numTotalTests: 3,
      numPassedTests: 3,
      numPendingTests: 0,
      success: true,
    });

    expect(summary.status).toBe("executed");
    expect(summary.exitCode).toBe(0);
    expect(summary.message).toContain("executed=3");
    expect(summary.message).toContain("release-grade Access smoke evidence");
  });

  it("reports skipped Access tests explicitly without claiming release evidence", () => {
    const summary = summarizeAccessSmokeEvidence({
      numTotalTests: 3,
      numPassedTests: 0,
      numPendingTests: 3,
      success: true,
    });

    expect(summary.status).toBe("skipped");
    expect(summary.exitCode).toBe(0);
    expect(summary.message).toContain("executed=0");
    expect(summary.message).toContain("skipped=3");
    expect(summary.message).toContain("not release-grade Access smoke evidence");
  });

  it("keeps a failed Access run failed while still producing evidence", () => {
    const summary = summarizeAccessSmokeEvidence({
      numTotalTests: 3,
      numPassedTests: 1,
      numFailedTests: 1,
      numPendingTests: 1,
      success: false,
    });

    expect(summary.status).toBe("failed");
    expect(summary.exitCode).toBe(1);
    expect(summary.message).toContain("failed=1");
  });
});
