import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const MAX_ATTEMPTS = Math.min(3, Math.max(1, Number(process.env.AUDIT_MAX_ATTEMPTS ?? 3)));
const RETRY_DELAY_MS = Math.max(0, Number(process.env.AUDIT_RETRY_DELAY_MS ?? 2_000));
const unavailablePolicy = process.env.AUDIT_UNAVAILABLE_POLICY === "fail" ? "fail" : "warn";
const source = sanitizeSource(process.env.AUDIT_SOURCE ?? "https://registry.npmjs.org");
const command = readCommand(source);
let finalStatus = "unavailable";
let reason = "audit-command-failed";
let attempts = 0;

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
  attempts = attempt;
  const execution = spawnSync(command[0], command.slice(1), {
    encoding: "utf8",
    timeout: 60_000,
    windowsHide: true,
    env: process.env,
  });
  const parsed = parseAuditJson(execution.stdout);
  const highCount = vulnerabilityCount(parsed, "high") + vulnerabilityCount(parsed, "critical");
  if (parsed !== undefined && highCount > 0) {
    finalStatus = "vulnerable";
    reason = `${highCount} high-or-critical advisory finding(s)`;
    break;
  }
  if (parsed !== undefined) {
    finalStatus = "clean";
    reason = "audit completed with no high-or-critical advisories";
    break;
  }
  reason = parsed === undefined ? classifyUnavailable(execution.stderr) : "audit-command-failed";
  if (attempt < MAX_ATTEMPTS) sleep(RETRY_DELAY_MS * attempt);
}

const report = {
  status: finalStatus,
  source,
  freshness: new Date().toISOString(),
  attempts,
  reason,
  unavailablePolicy,
};
console.log(`DYSFLOW_AUDIT_RESULT=${JSON.stringify(report)}`);
writeGitHubOutput(report);
writeSummary(report);
if (finalStatus === "unavailable") {
  console.warn(`::warning::Dependency audit evidence unavailable after ${attempts} attempt(s).`);
  process.exit(unavailablePolicy === "fail" ? 2 : 0);
}
process.exit(finalStatus === "vulnerable" ? 1 : 0);

function readCommand(registrySource) {
  const configured = process.env.DYSFLOW_AUDIT_COMMAND_JSON;
  if (configured) {
    const value = JSON.parse(configured);
    if (
      !Array.isArray(value) ||
      value.length === 0 ||
      value.some((part) => typeof part !== "string")
    ) {
      throw new TypeError("DYSFLOW_AUDIT_COMMAND_JSON must be a non-empty JSON string array");
    }
    return value;
  }
  return ["pnpm", "audit", "--audit-level=high", "--json", "--registry", registrySource];
}

function parseAuditJson(stdout) {
  try {
    const parsed = JSON.parse(String(stdout ?? "").trim());
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const high = parsed?.metadata?.vulnerabilities?.high;
    const critical = parsed?.metadata?.vulnerabilities?.critical;
    return isValidCount(high) && isValidCount(critical) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isValidCount(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function vulnerabilityCount(report, severity) {
  const value = report?.metadata?.vulnerabilities?.[severity];
  return isValidCount(value) ? value : 0;
}

function classifyUnavailable(stderr) {
  const text = String(stderr ?? "");
  return /410|5\d\d|ERR_PNPM_AUDIT_BAD_RESPONSE|ENET|ETIMEDOUT|EAI_AGAIN|ECONN/i.test(text)
    ? "registry-or-network-error"
    : "malformed-response";
}

function sanitizeSource(raw) {
  try {
    const url = new URL(raw);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "configured-registry-redacted";
  }
}

function sleep(milliseconds) {
  if (milliseconds > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function writeGitHubOutput(report) {
  const path = process.env.GITHUB_OUTPUT;
  if (!path) return;
  appendFileSync(
    path,
    `audit-evidence=${report.status}\naudit-source=${report.source}\naudit-freshness=${report.freshness}\naudit-attempts=${report.attempts}\n`,
  );
}

function writeSummary(report) {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (!path) return;
  const policy =
    report.unavailablePolicy === "fail" ? "default-branch policy: fail" : "PR policy: warning";
  appendFileSync(
    path,
    `## Dependency audit evidence\n\n- Status: **${report.status}**\n- Source: \`${report.source}\`\n- Freshness: \`${report.freshness}\`\n- Attempts: ${report.attempts}/${MAX_ATTEMPTS}\n- Unavailable evidence policy: ${policy}\n- Detail: ${report.reason}\n`,
  );
}
