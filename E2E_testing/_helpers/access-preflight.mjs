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
 * Every MSACCESS.EXE alive right now. A probe failure is reported, never read as "none alive".
 * @param {{ probe?: () => string }} [input]
 */
export function snapshotAccessProcesses({ probe = probeAccessProcesses } = {}) {
  try {
    return { available: true, processes: parseAccessProcessTable(probe()), reason: null };
  } catch (error) {
    return {
      available: false,
      processes: [],
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

// A PID can be reused, so a process is the same one only when its start time matches too.
function processIdentity(process) {
  return `${process.pid}@${process.creationMs ?? "unknown"}`;
}

const LEAK_REMEDIATION =
  "Remediation: confirm each PID is not owned by a running dysflow operation (list_access_operations) " +
  "and is headless, then remove it with dysflow access_force_cleanup_orphaned { confirmPid: <pid> }. " +
  "Never kill MSACCESS.EXE by name; this harness never kills it either.";

/**
 * Global leak verdict (#1978): headless MSACCESS.EXE alive at the end that were not alive at the
 * start snapshot. Processes alive before the run are the preflight's concern, never a leak; a
 * new interactive session is a human's window, listed but not counted. Pure.
 * @param {{ start: ReturnType<typeof snapshotAccessProcesses>, end: ReturnType<typeof snapshotAccessProcesses> }} input
 */
export function computeAccessLeak({ start, end }) {
  if (!start?.available || !end?.available) {
    const reason = !start?.available
      ? `start snapshot unavailable: ${start?.reason ?? "not taken"}`
      : `end snapshot unavailable: ${end.reason}`;
    return {
      verified: false,
      startCount: start?.available ? start.processes.length : null,
      endCount: end?.available ? end.processes.length : null,
      leakDelta: 0,
      leaked: [],
      newInteractive: [],
      summary: `WARNING: global MSACCESS.EXE leak check unverified for this run (${reason}).`,
    };
  }
  const alive = new Set(start.processes.map(processIdentity));
  const fresh = end.processes.filter((p) => !alive.has(processIdentity(p)));
  const leaked = fresh.filter((p) => isHeadless(p.commandLine));
  const newInteractive = fresh.filter((p) => !isHeadless(p.commandLine));
  const counts = `start=${start.processes.length} end=${end.processes.length} leakDelta=${leaked.length}`;
  const interactiveNote =
    newInteractive.length > 0
      ? ` Interactive Access sessions opened during the run, not counted: ${newInteractive.map(describeProcess).join("; ")}.`
      : "";
  return {
    verified: true,
    startCount: start.processes.length,
    endCount: end.processes.length,
    leakDelta: leaked.length,
    leaked,
    newInteractive,
    summary:
      leaked.length > 0
        ? `${leaked.length} headless MSACCESS.EXE alive at the end were not alive before the first ` +
          `scenario (${counts}): ${leaked.map(describeProcess).join("; ")}.${interactiveNote} ${LEAK_REMEDIATION}`
        : `No headless MSACCESS.EXE left behind by the battery (${counts}).${interactiveNote}`,
  };
}

/**
 * Typed preflight verdict. Processes whose parent is this run are not foreign.
 * @param {{ probe?: () => string, ownPid?: number, env?: Record<string, string | undefined> }} [input]
 */
export function runAccessPreflight({
  probe = probeAccessProcesses,
  ownPid = process.pid,
  env = process.env,
} = {}) {
  // #1978: this read is also the start snapshot of the global leak check.
  const snapshot = snapshotAccessProcesses({ probe });
  if (!snapshot.available) {
    return {
      kind: "access-preflight",
      status: "probe-unavailable",
      pass: true,
      foreignHeadless: [],
      foreignInteractive: [],
      snapshot,
      summary:
        `WARNING: foreign Access preflight could not read the process table (${snapshot.reason}); ` +
        "pre-existing MSACCESS.EXE processes are unverified for this run.",
    };
  }
  const processes = snapshot.processes;
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
      snapshot,
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
    snapshot,
    summary: allowed
      ? `WARNING: ${foreignHeadless.length} foreign headless MSACCESS.EXE alive before the first scenario ` +
        `(${ALLOW_FOREIGN_ACCESS_ENV}=1, battery continues): ${listed}.${interactiveNote} ${REMEDIATION}`
      : `Refusing to start: ${foreignHeadless.length} foreign headless MSACCESS.EXE alive before the ` +
        `first scenario: ${listed}.${interactiveNote} ${REMEDIATION}`,
  };
}
