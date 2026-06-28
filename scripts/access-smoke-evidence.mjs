import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export function summarizeAccessSmokeEvidence(report, options = {}) {
  const total = Number(report?.numTotalTests ?? 0);
  const passed = Number(report?.numPassedTests ?? 0);
  const failed = Number(report?.numFailedTests ?? 0);
  const skipped = Number(report?.numPendingTests ?? 0);
  const executed = Math.max(0, total - skipped);
  const releaseMode = options.releaseMode === true;
  const accessEvidence = summarizeAccessDependentTests(report);
  const accessSuffix = accessEvidence.hasAccessSuites
    ? ` accessExecuted=${accessEvidence.executed} accessSkipped=${accessEvidence.skipped}.`
    : "";
  const base = `Windows Access smoke evidence: executed=${executed} skipped=${skipped} failed=${failed} total=${total}.${accessSuffix}`;

  if (failed > 0 || report?.success === false) {
    return {
      status: "failed",
      exitCode: 1,
      message: `${base} Access smoke attempted and failed; see Vitest output above.`,
    };
  }

  if (accessEvidence.hasAccessSuites && accessEvidence.executed === 0 && accessEvidence.skipped > 0) {
    return {
      status: "access-skipped",
      exitCode: releaseMode ? 1 : 0,
      message: `${base} Required Access-dependent fixture suites were skipped; this is not release-grade Access smoke evidence. Run the release-grade Access gate on a machine with Access COM, fixture databases, and passwords before release promotion.`,
    };
  }

  if (executed === 0 && skipped > 0) {
    return {
      status: "skipped",
      exitCode: 0,
      message: `${base} All Access-dependent tests were skipped; this is not release-grade Access smoke evidence. Run the release-grade Access gate on a machine with Access COM, fixture databases, and passwords before release promotion.`,
    };
  }

  return {
    status: "executed",
    exitCode: 0,
    message: `${base} This is release-grade Access smoke evidence for the included Windows Access suites.`,
  };
}

function summarizeAccessDependentTests(report) {
  let executed = 0;
  let skipped = 0;
  let hasAccessSuites = false;

  for (const result of report?.testResults ?? []) {
    if (!isAccessDependentSuite(result?.name)) continue;
    hasAccessSuites = true;
    for (const assertion of result?.assertionResults ?? []) {
      if (assertion?.status === "pending" || assertion?.status === "skipped" || assertion?.status === "todo") {
        skipped += 1;
      } else {
        executed += 1;
      }
    }
  }

  return { hasAccessSuites, executed, skipped };
}

function isAccessDependentSuite(name) {
  return /(?:^|[\\/])test[\\/]e2e[\\/]access-(?:fixture\.e2e|relink-directory|relink-directory-apply)\.test\.ts$/.test(
    String(name ?? ""),
  );
}

async function main(argv) {
  const reportPath = argv[2];
  if (!reportPath) {
    console.error("Usage: node scripts/access-smoke-evidence.mjs <vitest-json-report>");
    return 1;
  }
  const raw = await readFile(reportPath, "utf8");
  const summary = summarizeAccessSmokeEvidence(JSON.parse(raw), {
    releaseMode: process.env.CI === "true" || process.env.DYSFLOW_ACCESS_SMOKE_RELEASE === "1",
  });
  const annotation = summary.exitCode !== 0 ? "error" : summary.status.includes("skipped") ? "warning" : "notice";
  console.log(`::${annotation} title=Windows Access smoke evidence::${summary.message}`);
  console.log(summary.message);
  return summary.exitCode;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await main(process.argv);
}
