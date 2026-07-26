import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync } from "node:fs";
import { delimiter, join } from "node:path";

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
  const execution = runAuditCommand(command);
  if (execution.error !== undefined) {
    // The process never started, so there is no audit evidence and no registry
    // involvement to report. Saying so explicitly matters: with both streams
    // undefined the classifier below would otherwise settle on
    // "malformed-response" and accuse the registry of returning bad data for a
    // command that never ran. Retrying cannot make a command executable.
    finalStatus = "unavailable";
    reason = "audit-command-not-executable";
    break;
  }
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

/**
 * Run the audit command, tolerating how package managers are exposed on Windows.
 *
 * `pnpm` reaches CI as `pnpm.CMD` (actions/setup-pnpm publishes no `.exe`), and
 * since the CVE-2024-27980 fix Node refuses to spawn `.cmd`/`.bat` without a
 * shell — `spawnSync` returns `EINVAL` with both streams undefined.
 *
 * The command is resolved on disk first rather than handed to a shell blind. A
 * shell reports a missing command by exiting nonzero with a message of its own,
 * which is localized ("no se reconoce como un comando interno o externo" on a
 * Spanish Windows), so recognizing it by text would make the gate depend on the
 * machine's display language. Resolving first keeps "not found" a structural
 * fact, and the shell is then used only where it is actually required.
 */
function runAuditCommand(parts) {
  const resolved = resolveExecutable(parts[0]);
  if (resolved === undefined) {
    return { error: new Error(`audit command not found on PATH: ${parts[0]}`) };
  }
  const options = {
    encoding: "utf8",
    timeout: 60_000,
    windowsHide: true,
    env: process.env,
  };
  const needsShell = process.platform === "win32" && /\.(cmd|bat)$/i.test(resolved);
  return spawnSync(
    needsShell ? quoteForShell(resolved) : resolved,
    needsShell ? parts.slice(1).map(quoteForShell) : parts.slice(1),
    needsShell ? { ...options, shell: true } : options,
  );
}

function quoteForShell(part) {
  return /[\s&|<>^"]/.test(part) ? `"${part.replace(/"/g, '""')}"` : part;
}

/** Locate `name` on disk, honoring PATH and (on Windows) PATHEXT. */
function resolveExecutable(name) {
  if (name.includes("/") || name.includes("\\")) return existsSync(name) ? name : undefined;
  const extensions =
    process.platform === "win32"
      ? ["", ...(process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)]
      : [""];
  for (const directory of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = join(directory, `${name}${extension}`);
      if (existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

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
