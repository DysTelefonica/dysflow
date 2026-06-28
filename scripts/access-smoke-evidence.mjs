import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export function summarizeAccessSmokeEvidence(report) {
  const total = Number(report?.numTotalTests ?? 0);
  const passed = Number(report?.numPassedTests ?? 0);
  const failed = Number(report?.numFailedTests ?? 0);
  const skipped = Number(report?.numPendingTests ?? 0);
  const executed = Math.max(0, total - skipped);
  const base = `Windows Access smoke evidence: executed=${executed} skipped=${skipped} failed=${failed} total=${total}.`;

  if (failed > 0 || report?.success === false) {
    return {
      status: "failed",
      exitCode: 1,
      message: `${base} Access smoke attempted and failed; see Vitest output above.`,
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

async function main(argv) {
  const reportPath = argv[2];
  if (!reportPath) {
    console.error("Usage: node scripts/access-smoke-evidence.mjs <vitest-json-report>");
    return 1;
  }
  const raw = await readFile(reportPath, "utf8");
  const summary = summarizeAccessSmokeEvidence(JSON.parse(raw));
  const annotation = summary.status === "skipped" ? "warning" : summary.status === "failed" ? "error" : "notice";
  console.log(`::${annotation} title=Windows Access smoke evidence::${summary.message}`);
  console.log(summary.message);
  return summary.exitCode;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await main(process.argv);
}
