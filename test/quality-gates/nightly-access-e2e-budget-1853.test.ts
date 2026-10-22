import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function jobTimeoutMinutes(workflowPath: string, jobId: string): number {
  const workflow = readFileSync(workflowPath, "utf8");
  const job = workflow.split(new RegExp(`\\r?\\n {2}${jobId}:\\r?\\n`))[1];
  expect(job, `${jobId} job in ${workflowPath}`).toBeDefined();
  const body = job?.split(/\r?\n {2}[A-Za-z0-9_-]+:\r?\n/)[0] ?? "";
  const match = body.match(/^ {4}timeout-minutes:\s*(\d+)\s*$/m);
  expect(match, `timeout-minutes on ${jobId}`).not.toBeNull();
  return Number(match?.[1]);
}

describe("nightly Access E2E budget (#1853)", () => {
  it("gives the nightly battery at least the release E2E validation budget", () => {
    const release = jobTimeoutMinutes(
      ".github/workflows/release.yml",
      "e2e-validation",
    );
    const nightly = jobTimeoutMinutes(
      ".github/workflows/nightly-access-e2e.yml",
      "e2e-validation",
    );
    expect(nightly).toBeGreaterThanOrEqual(release);
  });
});
