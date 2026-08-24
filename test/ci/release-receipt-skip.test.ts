import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CI_RECEIPT_JOB_NAME,
  evaluateCiReceipt,
  verifyCiReceiptFromGitHub,
} from "../../.github/scripts/verify-ci-receipt.mjs";

const SHA = "a".repeat(40);
const NOW = "2026-08-02T12:00:00.000Z";

function workflowJobBlock(workflow: string, job: string): string {
  const lines = workflow.split(/\r?\n/);
  const start = lines.indexOf(`  ${job}:`);
  if (start < 0) throw new Error(`release.yml declares no "${job}" job`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^ {2}\S/.test(line));
  return (end < 0 ? rest : rest.slice(0, end)).join("\n");
}

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

function ciResultJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 84,
    run_id: 42,
    name: "CI result",
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
  jobsByRunId: ReadonlyMap<number, unknown[]> = new Map([[42, [ciResultJob()]]]),
) {
  return evaluateCiReceipt({
    workflowRuns,
    jobsByRunId,
    expectedRepository: "DysTelefonica/dysflow",
    expectedSha: SHA,
    expectedBranch: "main",
    expectedWorkflowName: "CI",
    expectedWorkflowPath: ".github/workflows/ci.yml",
    expectedJobName: CI_RECEIPT_JOB_NAME,
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
    ["wrong identity", [ciResultJob({ name: "Quality gates (26)" })]],
    ["wrong SHA", [ciResultJob({ head_sha: "b".repeat(40) })]],
    ["failed", [ciResultJob({ conclusion: "failure" })]],
    ["incomplete", [ciResultJob({ status: "in_progress", completed_at: null })]],
    ["exactly 24 hours old", [ciResultJob({ completed_at: "2026-08-01T12:00:00.000Z" })]],
    ["older than 24 hours", [ciResultJob({ completed_at: "2026-08-01T11:59:59.000Z" })]],
    ["future-dated", [ciResultJob({ completed_at: "2026-08-02T12:00:01.000Z" })]],
  ])("falls through for a %s CI result job", (_label, jobs) => {
    expect(evaluate([run()], new Map([[42, jobs]])).decision).toBe("full-validation");
  });

  it("fails safe when multiple receipts have the same newest completion time", () => {
    const duplicate = ciResultJob({ id: 85 });
    const result = evaluate([run()], new Map([[42, [ciResultJob(), duplicate]]]));
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
            total_count: 2,
            jobs: [
              ciResultJob({ completed_at: new Date(current - 1_000).toISOString() }),
              ciResultJob({
                id: 85,
                name: "Quality gates (26)",
                completed_at: new Date(current - 2_000).toISOString(),
              }),
            ],
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

  it("requires exact-SHA quality authority while preserving build and release E2E", async () => {
    const [ci, release, weekly, docs] = await Promise.all([
      readFile(".github/workflows/ci.yml", "utf8"),
      readFile(".github/workflows/release.yml", "utf8"),
      readFile(".github/workflows/verify-receipt-skip.yml", "utf8"),
      readFile("docs/ci/release-receipt-skip.md", "utf8"),
    ]);
    const authority = workflowJobBlock(release, "quality-authority");
    const publication = workflowJobBlock(release, "release");
    const ciResult = workflowJobBlock(ci, "ci-result");

    expect(ciResult).toContain(`name: ${CI_RECEIPT_JOB_NAME}`);

    expect(ci).toMatch(
      /quality:[\s\S]*?if: github\.event_name == 'push' \|\| needs\.changes\.outputs\.code_required == 'true'/,
    );
    expect(ci).toMatch(
      /windows-integration-smoke:[\s\S]*?needs\.changes\.outputs\.code_required == 'true'[\s\S]*?runs-on: windows-latest/,
    );
    expect(ci).toMatch(
      /name: Audit dependencies[\s\S]*?if: github\.event_name == 'push'[\s\S]*?AUDIT_UNAVAILABLE_POLICY: fail/,
    );
    expect(authority).toContain("needs: build");
    expect(authority).toContain("actions: read");
    expect(authority).toContain("EXPECTED_RELEASE_SHA: $" + "{{ needs.build.outputs.commit_sha }}");
    expect(authority).toContain("node .github/scripts/verify-ci-receipt.mjs");
    expect(authority).toContain("steps.receipt.outputs.decision != 'skip'");
    expect(authority).toContain("run: pnpm lint");
    expect(authority).toContain("run: pnpm build");
    expect(authority).toContain("run: pnpm test");
    expect(authority).toContain("run: pnpm coverage");
    const directCommands = ["pnpm lint", "pnpm build", "pnpm test", "pnpm coverage"].map(
      (command) => authority.indexOf(`run: ${command}`),
    );
    expect(directCommands.every((index) => index >= 0)).toBe(true);
    expect(directCommands).toEqual([...directCommands].sort((left, right) => left - right));
    expect(authority).toContain(
      "AUTHORITY_TYPE: $" +
        "{{ steps.receipt.outputs.decision == 'skip' && 'ci-receipt' || 'direct-gates' }}",
    );
    expect(authority).toContain('echo "authority_type=$AUTHORITY_TYPE" >> "$GITHUB_OUTPUT"');
    expect(publication).toContain("needs: [build, quality-authority, e2e-validation]");
    expect(publication).toContain("needs.quality-authority.outputs.authority_type");
    expect(publication).toContain("needs.quality-authority.outputs.run_id");
    expect(publication).toContain("needs.quality-authority.outputs.job_id");
    expect(release).toContain("git rev-parse HEAD");
    expect(release).toContain("actions/upload-artifact@v4");
    expect(release).toContain("actions/download-artifact@v4");
    expect(release).toContain("EXPECTED_DIST_SHA256");
    expect(release).toContain("sha256sum --check -");
    expect(release).toContain("Sign checksums (Ed25519)");
    expect(release).toContain("Assert release name == tag (#668)");
    expect(weekly).toContain("cron:");
    expect(weekly).toContain("run: pnpm test");

    const engine = JSON.parse(await readFile("package.json", "utf8")) as {
      engines?: { node?: string };
    };
    const supportedMajor = /\u003e=(\d+)\./.exec(engine.engines?.node ?? "")?.[1];
    expect(supportedMajor).toBeDefined();
    for (const [name, workflow] of [
      ["release", release],
      ["weekly receipt verification", weekly],
    ] as const) {
      const configured = [...workflow.matchAll(/^\s*node-version:\s*(\d+)\s*$/gm)].map(
        (match) => match[1],
      );
      expect(configured.length, `${name} configures no literal Node version`).toBeGreaterThan(0);
      expect(new Set(configured), `${name} drifts from package.json engines.node`).toEqual(
        new Set([supportedMajor]),
      );
    }

    const weeklyCommands = ["pnpm lint", "pnpm build", "pnpm test", "pnpm coverage"];
    for (const command of weeklyCommands) expect(weekly).toContain(`run: ${command}`);
    expect(weeklyCommands.map((command) => weekly.indexOf(`run: ${command}`))).toEqual(
      weeklyCommands
        .map((command) => weekly.indexOf(`run: ${command}`))
        .sort((left, right) => left - right),
    );
    expect(docs).toContain("unambiguous `CI result` job");
    expect(docs).toContain(
      "`pnpm lint`, `pnpm build`, `pnpm test`, and `pnpm coverage` in that order",
    );
    expect(docs).toContain("scripts/release-prepare.ps1 -Bump patch");
    expect(docs).not.toContain("`Quality gates (20)`");
  });
});
