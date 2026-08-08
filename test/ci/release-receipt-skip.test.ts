import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  evaluateCiReceipt,
  verifyCiReceiptFromGitHub,
} from "../../.github/scripts/verify-ci-receipt.mjs";

const SHA = "a".repeat(40);
const NOW = "2026-08-02T12:00:00.000Z";

function run(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    name: "CI",
    path: ".github/workflows/ci.yml",
    event: "push",
    status: "completed",
    conclusion: "success",
    head_sha: SHA,
    head_branch: "main",
    updated_at: "2026-08-02T11:30:00.000Z",
    repository: { full_name: "DysTelefonica/dysflow" },
    head_repository: { full_name: "DysTelefonica/dysflow" },
    ...overrides,
  };
}

function qualityJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 84,
    run_id: 42,
    name: "Quality gates (20)",
    status: "completed",
    conclusion: "success",
    head_sha: SHA,
    started_at: "2026-08-02T11:00:00.000Z",
    completed_at: "2026-08-02T11:29:00.000Z",
    ...overrides,
  };
}

function evaluate(
  workflowRuns: unknown[] = [run()],
  jobsByRunId: ReadonlyMap<number, unknown[]> = new Map([[42, [qualityJob()]]]),
) {
  return evaluateCiReceipt({
    workflowRuns,
    jobsByRunId,
    expectedRepository: "DysTelefonica/dysflow",
    expectedSha: SHA,
    expectedBranch: "main",
    expectedWorkflowName: "CI",
    expectedWorkflowPath: ".github/workflows/ci.yml",
    expectedJobName: "Quality gates (20)",
    now: NOW,
    maxAgeHours: 24,
  });
}

describe("release CI receipt", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("skips only for an exact, authoritative, successful and fresh main-push receipt", () => {
    expect(evaluate()).toEqual({
      decision: "skip",
      reason: "fresh-authoritative-receipt",
      runId: 42,
      jobId: 84,
      completedAt: "2026-08-02T11:29:00.000Z",
    });
  });

  it.each([
    ["missing", []],
    ["different SHA", [run({ head_sha: "b".repeat(40) })]],
    ["pull request", [run({ event: "pull_request" })]],
    ["different branch", [run({ head_branch: "feature/x" })]],
    ["different workflow", [run({ path: ".github/workflows/fake.yml" })]],
    ["different repository", [run({ repository: { full_name: "attacker/fork" } })]],
    ["failed run", [run({ conclusion: "failure" })]],
  ])("falls through for a %s workflow run", (_label, workflowRuns) => {
    expect(evaluate(workflowRuns).decision).toBe("full-validation");
  });

  it.each([
    ["missing", []],
    ["wrong identity", [qualityJob({ name: "Quality gates (26)" })]],
    ["wrong SHA", [qualityJob({ head_sha: "b".repeat(40) })]],
    ["failed", [qualityJob({ conclusion: "failure" })]],
    ["incomplete", [qualityJob({ status: "in_progress", completed_at: null })]],
    ["exactly 24 hours old", [qualityJob({ completed_at: "2026-08-01T12:00:00.000Z" })]],
    ["older than 24 hours", [qualityJob({ completed_at: "2026-08-01T11:59:59.000Z" })]],
    ["future-dated", [qualityJob({ completed_at: "2026-08-02T12:00:01.000Z" })]],
  ])("falls through for a %s quality job", (_label, jobs) => {
    expect(evaluate([run()], new Map([[42, jobs]])).decision).toBe("full-validation");
  });

  it("fails safe when multiple receipts have the same newest completion time", () => {
    const duplicate = qualityJob({ id: 85 });
    const result = evaluate([run()], new Map([[42, [qualityJob(), duplicate]]]));
    expect(result).toMatchObject({ decision: "full-validation", reason: "ambiguous-receipt" });
  });

  it("fails safe when the GitHub API is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(
      verifyCiReceiptFromGitHub({
        GITHUB_REPOSITORY: "DysTelefonica/dysflow",
        GITHUB_SHA: SHA,
        GITHUB_TOKEN: "test-token",
      }),
    ).resolves.toEqual({ decision: "full-validation", reason: "verification-unavailable" });
  });

  it("accepts the complete GitHub API evidence path for the checked-out tag commit", async () => {
    const current = Date.now();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            total_count: 1,
            workflow_runs: [run({ updated_at: new Date(current).toISOString() })],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            total_count: 1,
            jobs: [qualityJob({ completed_at: new Date(current - 1_000).toISOString() })],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      verifyCiReceiptFromGitHub({
        GITHUB_REPOSITORY: "DysTelefonica/dysflow",
        GITHUB_SHA: "b".repeat(40),
        EXPECTED_RELEASE_SHA: SHA,
        GITHUB_TOKEN: "test-token",
      }),
    ).resolves.toMatchObject({ decision: "skip", runId: 42, jobId: 84 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls through when a paginated API response is incomplete", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ total_count: 2, workflow_runs: [run()] }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      verifyCiReceiptFromGitHub({
        GITHUB_REPOSITORY: "DysTelefonica/dysflow",
        EXPECTED_RELEASE_SHA: SHA,
        GITHUB_TOKEN: "test-token",
      }),
    ).resolves.toEqual({ decision: "full-validation", reason: "malformed-runs-response" });
  });

  it("honors the explicit one-run full-validation override without querying GitHub", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(verifyCiReceiptFromGitHub({ FORCE_FULL_VALIDATION: "true" })).resolves.toEqual({
      decision: "full-validation",
      reason: "manual-override",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("wires the four optimizations and weekly drift check without weakening release guards", async () => {
    const [ci, release, weekly] = await Promise.all([
      readFile(".github/workflows/ci.yml", "utf8"),
      readFile(".github/workflows/release.yml", "utf8"),
      readFile(".github/workflows/verify-receipt-skip.yml", "utf8"),
    ]);

    expect(ci).toMatch(
      /quality:[\s\S]*?if: github\.event_name == 'push' \|\| needs\.changes\.outputs\.code_required == 'true'/,
    );
    expect(ci).toMatch(
      /windows-integration-smoke:[\s\S]*?needs\.changes\.outputs\.code_required == 'true'[\s\S]*?runs-on: windows-latest/,
    );
    expect(ci).toMatch(
      /name: Audit dependencies[\s\S]*?if: github\.event_name == 'push'[\s\S]*?AUDIT_UNAVAILABLE_POLICY: fail/,
    );
    expect(release).toContain("verify-ci-receipt.mjs");
    expect(release).toContain("EXPECTED_RELEASE_SHA");
    expect(release).toContain("git rev-parse HEAD");
    expect(release).toContain("steps.receipt.outputs.decision != 'skip'");
    expect(release).toContain("actions/upload-artifact@v4");
    expect(release).toContain("actions/download-artifact@v4");
    expect(release).toContain("EXPECTED_DIST_SHA256");
    expect(release).toContain("sha256sum --check -");
    expect(release).toContain("Sign checksums (Ed25519)");
    expect(release).toContain("Assert release name == tag (#668)");
    expect(weekly).toContain("cron:");
    expect(weekly).toContain("test/ci/release-receipt-skip.test.ts");
  });
});
