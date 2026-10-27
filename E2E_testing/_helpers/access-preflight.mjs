// Battery preflight for foreign MSACCESS.EXE processes (#1974).
//
// Release run 40519155504 started with a headless `MSACCESS.EXE -Embedding` orphan that was
// hours old; a stale COM server can slow or hang the Access starts the battery depends on.
// This check only LISTS processes. It never kills one: removal goes through dysflow
// `access_force_cleanup_orphaned` with `confirmPid`, after a human verifies ownership.

import { spawnSync } from "node:child_process";

export const ALLOW_FOREIGN_ACCESS_ENV = "DYSFLOW_E2E_ALLOW_FOREIGN_ACCESS";

const ACCESS_PROBE_SCRIPT =
  "Get-CimInstance Win32_Process -Filter \"Name='MSACCESS.EXE'\" | Select-Object ProcessId,ParentProcessId," +
  "@{n='CreationMs';e={if ($_.CreationDate) {([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds()}}}," +
  "CommandLine | ConvertTo-Json -Compress -Depth 2";

/** Default probe: the MSACCESS.EXE rows of the process table as JSON, or throws. */
function probeAccessProcesses() {
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", ACCESS_PROBE_SCRIPT],
    { encoding: "utf8", windowsHide: true, timeout: 30000 },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`process probe exited ${result.status}: ${String(result.stderr ?? "").trim()}`);
  }
  return result.stdout ?? "";
}

/**
 * `ConvertTo-Json` emits nothing for no rows and a bare object for one row. Pure.
 * @param {string} json
 * @returns {Array<{ pid: number, parentPid: number | null, creationMs: number | null, commandLine: string | null }>}
 */
export function parseAccessProcessTable(json) {
  const text = String(json ?? "").trim();
  if (text === "") return [];
  const parsed = JSON.parse(text);
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return rows
    .filter((row) => Number.isFinite(Number(row?.ProcessId)))
    .map((row) => ({
      pid: Number(row.ProcessId),
      parentPid: Number.isFinite(Number(row.ParentProcessId)) ? Number(row.ParentProcessId) : null,
      creationMs:
        Number.isFinite(Number(row.CreationMs)) && row.CreationMs !== null
          ? Number(row.CreationMs)
          : null,
      commandLine: typeof row.CommandLine === "string" ? row.CommandLine : null,
    }));
}

// An automation server (`-Embedding` from DCOM, `/Automation`) has no user window. A command
// line the probe could not read cannot be proven interactive, so it counts as headless.
function isHeadless(commandLine) {
  if (commandLine === null) return true;
  return /(^|\s)[-/](Embedding|Automation)\b/i.test(commandLine);
}

function describeProcess(process) {
  const started =
    process.creationMs === null ? "unknown" : new Date(process.creationMs).toISOString();
  return (
    `pid=${process.pid} started=${started} parentPid=${process.parentPid ?? "unknown"} ` +
    `commandLine=${process.commandLine ?? "<unreadable>"}`
  );
}

const REMEDIATION =
  "Remediation: confirm each PID is not owned by a running dysflow operation (list_access_operations) " +
  "and is headless, then remove it with dysflow access_force_cleanup_orphaned { confirmPid: <pid> }. " +
  "Never kill MSACCESS.EXE by name; this harness never kills it either. " +
  `To run anyway, set ${ALLOW_FOREIGN_ACCESS_ENV}=1 (recorded as a warning).`;

/**
 * Typed preflight verdict. Processes whose parent is this run are not foreign.
 * @param {{ probe?: () => string, ownPid?: number, env?: Record<string, string | undefined> }} [input]
 */
export function runAccessPreflight({
  probe = probeAccessProcesses,
  ownPid = process.pid,
  env = process.env,
} = {}) {
  let processes;
  try {
    processes = parseAccessProcessTable(probe());
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      kind: "access-preflight",
      status: "probe-unavailable",
      pass: true,
      foreignHeadless: [],
      foreignInteractive: [],
      summary:
        `WARNING: foreign Access preflight could not read the process table (${reason}); ` +
        "pre-existing MSACCESS.EXE processes are unverified for this run.",
    };
  }
  const foreign = processes.filter((p) => p.parentPid !== ownPid);
  const foreignHeadless = foreign.filter((p) => isHeadless(p.commandLine));
  const foreignInteractive = foreign.filter((p) => !isHeadless(p.commandLine));
  const interactiveNote =
    foreignInteractive.length > 0
      ? ` Interactive Access sessions left alone: ${foreignInteractive.map(describeProcess).join("; ")}.`
      : "";

  if (foreignHeadless.length === 0) {
    return {
      kind: "access-preflight",
      status: "clean",
      pass: true,
      foreignHeadless,
      foreignInteractive,
      summary: `No foreign headless MSACCESS.EXE before the first scenario.${interactiveNote}`,
    };
  }
  const listed = foreignHeadless.map(describeProcess).join("; ");
  const allowed = env[ALLOW_FOREIGN_ACCESS_ENV] === "1";
  return {
    kind: "access-preflight",
    status: allowed ? "allowed" : "refused",
    pass: allowed,
    foreignHeadless,
    foreignInteractive,
    summary: allowed
      ? `WARNING: ${foreignHeadless.length} foreign headless MSACCESS.EXE alive before the first scenario ` +
        `(${ALLOW_FOREIGN_ACCESS_ENV}=1, battery continues): ${listed}.${interactiveNote} ${REMEDIATION}`
      : `Refusing to start: ${foreignHeadless.length} foreign headless MSACCESS.EXE alive before the ` +
        `first scenario: ${listed}.${interactiveNote} ${REMEDIATION}`,
  };
}
