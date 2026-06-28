import { describe, expect, it } from "vitest";
import { summarizeAccessSmokeEvidence } from "../../scripts/access-smoke-evidence.mjs";

describe("Windows Access smoke evidence", () => {
  it("reports executed Access tests as release-grade smoke evidence", () => {
    const summary = summarizeAccessSmokeEvidence({
      numTotalTests: 3,
      numPassedTests: 3,
      numPendingTests: 0,
      success: true,
      testResults: [
        {
          name: "test/e2e/access-fixture.e2e.test.ts",
          assertionResults: [{ status: "passed" }, { status: "passed" }, { status: "passed" }],
        },
      ],
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
      testResults: [
        {
          name: "test/e2e/access-fixture.e2e.test.ts",
          assertionResults: [{ status: "pending" }, { status: "pending" }, { status: "pending" }],
        },
      ],
    });

    expect(summary.status).toBe("access-skipped");
    expect(summary.exitCode).toBe(0);
    expect(summary.message).toContain("executed=0");
    expect(summary.message).toContain("skipped=3");
    expect(summary.message).toContain("not release-grade Access smoke evidence");
  });

  it("reports fake tests plus skipped Access fixture suites as non-release-grade in advisory mode", () => {
    const summary = summarizeAccessSmokeEvidence({
      numTotalTests: 17,
      numPassedTests: 2,
      numPendingTests: 15,
      numFailedTests: 0,
      success: true,
      testResults: [
        {
          name: "test/e2e/access-relink-directory.test.ts",
          assertionResults: [
            { status: "passed" },
            ...Array.from({ length: 6 }, () => ({ status: "pending" })),
          ],
        },
        {
          name: "test/e2e/access-relink-directory-apply.test.ts",
          assertionResults: [
            { status: "passed" },
            ...Array.from({ length: 3 }, () => ({ status: "pending" })),
          ],
        },
        {
          name: "test/e2e/access-fixture.e2e.test.ts",
          assertionResults: Array.from({ length: 6 }, () => ({ status: "pending" })),
        },
      ],
    });

    expect(summary.status).toBe("access-skipped");
    expect(summary.exitCode).toBe(0);
    expect(summary.message).toContain("accessExecuted=2");
    expect(summary.message).toContain("accessSkipped=15");
    expect(summary.message).toContain("not release-grade Access smoke evidence");
    expect(summary.message).not.toContain("This is release-grade Access smoke evidence");
  });

  it("fails release mode when any required Access fixture suites are skipped", () => {
    const summary = summarizeAccessSmokeEvidence(
      {
        numTotalTests: 17,
        numPassedTests: 2,
        numPendingTests: 15,
        numFailedTests: 0,
        success: true,
        testResults: [
          {
            name: "test/e2e/access-relink-directory.test.ts",
            assertionResults: [
              { status: "passed" },
              ...Array.from({ length: 6 }, () => ({ status: "pending" })),
            ],
          },
          {
            name: "test/e2e/access-relink-directory-apply.test.ts",
            assertionResults: [
              { status: "passed" },
              ...Array.from({ length: 3 }, () => ({ status: "pending" })),
            ],
          },
          {
            name: "test/e2e/access-fixture.e2e.test.ts",
            assertionResults: Array.from({ length: 6 }, () => ({ status: "pending" })),
          },
        ],
      },
      { releaseMode: true },
    );

    expect(summary.status).toBe("access-skipped");
    expect(summary.exitCode).toBe(1);
    expect(summary.message).toContain("accessExecuted=2");
    expect(summary.message).toContain("accessSkipped=15");
    expect(summary.message).toContain("not release-grade Access smoke evidence");
    expect(summary.message).not.toContain("This is release-grade Access smoke evidence");
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
