import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const HOUR_MS = 60 * 60 * 1000;

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveInteger(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function timestamp(value) {
  if (typeof value !== "string" || value.length === 0) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function repositoryMatches(value, expectedRepository) {
  return isRecord(value) && value.full_name === expectedRepository;
}

/**
 * Select a release-validation receipt from already-fetched GitHub API data.
 * Any missing, malformed, stale, or ambiguous evidence falls through to the
 * full validation path. The function never turns uncertainty into a skip.
 */
export function evaluateCiReceipt(options) {
  const {
    workflowRuns,
    jobsByRunId,
    expectedRepository,
    expectedSha,
    expectedBranch,
    expectedWorkflowName,
    expectedWorkflowPath,
    expectedJobName,
    now,
    maxAgeHours,
  } = options;

  const nowMs = timestamp(now);
  if (
    !Array.isArray(workflowRuns) ||
    !(jobsByRunId instanceof Map) ||
    typeof expectedRepository !== "string" ||
    !/^[0-9a-f]{40}$/i.test(expectedSha ?? "") ||
    typeof expectedBranch !== "string" ||
    typeof expectedWorkflowName !== "string" ||
    typeof expectedWorkflowPath !== "string" ||
    typeof expectedJobName !== "string" ||
    nowMs === null ||
    typeof maxAgeHours !== "number" ||
    !Number.isFinite(maxAgeHours) ||
    maxAgeHours <= 0
  ) {
    return { decision: "full-validation", reason: "invalid-verification-input" };
  }

  const receipts = [];
  for (const candidate of workflowRuns) {
    if (!isRecord(candidate)) continue;
    const runId = positiveInteger(candidate.id);
    const runUpdatedAt = timestamp(candidate.updated_at);
    if (
      runId === null ||
      candidate.name !== expectedWorkflowName ||
      candidate.path !== expectedWorkflowPath ||
      candidate.event !== "push" ||
      candidate.status !== "completed" ||
      candidate.conclusion !== "success" ||
      candidate.head_sha !== expectedSha ||
      candidate.head_branch !== expectedBranch ||
      !repositoryMatches(candidate.repository, expectedRepository) ||
      !repositoryMatches(candidate.head_repository, expectedRepository) ||
      runUpdatedAt === null ||
      runUpdatedAt > nowMs
    ) {
      continue;
    }

    const jobs = jobsByRunId.get(runId);
    if (!Array.isArray(jobs)) continue;
    for (const job of jobs) {
      if (!isRecord(job)) continue;
      const jobId = positiveInteger(job.id);
      const completedAt = timestamp(job.completed_at);
      const ageMs = completedAt === null ? Number.POSITIVE_INFINITY : nowMs - completedAt;
      if (
        jobId === null ||
        job.run_id !== runId ||
        job.name !== expectedJobName ||
        job.status !== "completed" ||
        job.conclusion !== "success" ||
        job.head_sha !== expectedSha ||
        completedAt === null ||
        ageMs < 0 ||
        ageMs >= maxAgeHours * HOUR_MS ||
        completedAt > runUpdatedAt
      ) {
        continue;
      }
      receipts.push({
        decision: "skip",
        reason: "fresh-authoritative-receipt",
        runId,
        jobId,
        completedAt: job.completed_at,
        completedAtMs: completedAt,
      });
    }
  }

  if (receipts.length === 0) {
    return { decision: "full-validation", reason: "no-authoritative-receipt" };
  }
  receipts.sort((left, right) => right.completedAtMs - left.completedAtMs);
  if (receipts.length > 1 && receipts[0].completedAtMs === receipts[1].completedAtMs) {
    return { decision: "full-validation", reason: "ambiguous-receipt" };
  }
  const { completedAtMs: _completedAtMs, ...receipt } = receipts[0];
  return receipt;
}

async function githubJson(path, token, apiUrl) {
  const response = await fetch(`${apiUrl}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status} for ${path}`);
  return response.json();
}

async function writeOutputs(result, outputPath) {
  if (!outputPath) throw new Error("GITHUB_OUTPUT is missing");
  const lines = [
    `decision=${result.decision}`,
    `reason=${result.reason}`,
    `run_id=${result.runId ?? ""}`,
    `job_id=${result.jobId ?? ""}`,
    `completed_at=${result.completedAt ?? ""}`,
  ];
  await appendFile(outputPath, `${lines.join("\n")}\n`, "utf8");
}

export async function verifyCiReceiptFromGitHub(env = process.env) {
  if (env.FORCE_FULL_VALIDATION === "true") {
    return { decision: "full-validation", reason: "manual-override" };
  }
  const repository = env.GITHUB_REPOSITORY ?? "";
  const sha = env.EXPECTED_RELEASE_SHA ?? env.GITHUB_SHA ?? "";
  const token = env.GITHUB_TOKEN ?? "";
  const apiUrl = (env.GITHUB_API_URL ?? "https://api.github.com").replace(/\/$/, "");
  if (!/^[^/]+\/[^/]+$/.test(repository) || !/^[0-9a-f]{40}$/i.test(sha) || !token) {
    return { decision: "full-validation", reason: "missing-runtime-input" };
  }

  try {
    const query = new URLSearchParams({
      branch: "main",
      event: "push",
      head_sha: sha,
      status: "success",
      per_page: "20",
    });
    const runsPayload = await githubJson(
      `/repos/${repository}/actions/workflows/ci.yml/runs?${query}`,
      token,
      apiUrl,
    );
    const workflowRuns = isRecord(runsPayload) ? runsPayload.workflow_runs : null;
    if (
      !Array.isArray(workflowRuns) ||
      !isRecord(runsPayload) ||
      !Number.isSafeInteger(runsPayload.total_count) ||
      runsPayload.total_count !== workflowRuns.length
    ) {
      return { decision: "full-validation", reason: "malformed-runs-response" };
    }

    const jobsByRunId = new Map();
    for (const candidate of workflowRuns) {
      const runId = isRecord(candidate) ? positiveInteger(candidate.id) : null;
      if (runId === null) continue;
      const jobsPayload = await githubJson(
        `/repos/${repository}/actions/runs/${runId}/jobs?filter=latest&per_page=100`,
        token,
        apiUrl,
      );
      if (
        !isRecord(jobsPayload) ||
        !Array.isArray(jobsPayload.jobs) ||
        !Number.isSafeInteger(jobsPayload.total_count) ||
        jobsPayload.total_count !== jobsPayload.jobs.length
      ) {
        return { decision: "full-validation", reason: "malformed-jobs-response" };
      }
      jobsByRunId.set(runId, jobsPayload.jobs);
    }

    return evaluateCiReceipt({
      workflowRuns,
      jobsByRunId,
      expectedRepository: repository,
      expectedSha: sha,
      expectedBranch: "main",
      expectedWorkflowName: "CI",
      expectedWorkflowPath: ".github/workflows/ci.yml",
      expectedJobName: "Quality gates (20)",
      now: new Date().toISOString(),
      maxAgeHours: 24,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`CI receipt verification unavailable (${message}); running full validation.`);
    return { decision: "full-validation", reason: "verification-unavailable" };
  }
}

async function main() {
  const result = await verifyCiReceiptFromGitHub();
  await writeOutputs(result, process.env.GITHUB_OUTPUT);
  if (result.decision === "skip") {
    console.log(
      `Authoritative CI receipt accepted: run ${result.runId}, job ${result.jobId}, completed ${result.completedAt}.`,
    );
  } else {
    console.log(`No authoritative CI receipt accepted (${result.reason}); running full validation.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
