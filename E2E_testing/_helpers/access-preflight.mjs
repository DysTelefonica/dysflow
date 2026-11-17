// Host inventory is diagnostic, not proof that another project's Access is an orphan.
// Only positively attributed suite processes affect the owned-leak verdict. This helper
// never closes processes; operation-owned cleanup remains in the canonical runtime.

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

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

const OWNERSHIP_NOTE =
  "Other projects' processes are left untouched. Never kill MSACCESS.EXE by name. " +
  "Owned cleanup remains with the runtime's operation-scoped cleanup function.";

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

/** Retained failed/cleanup-pending operations are positive evidence, not complete history. */
export async function readSuiteAccessOwnership({ projectRoot, accessPath, read = readFile }) {
  const samePath = (left, right) => {
    if (typeof left !== "string" || left.length === 0) return false;
    const canonical = (value) =>
      process.platform === "win32" ? resolve(value).toLowerCase() : resolve(value);
    return canonical(left) === canonical(right);
  };
  try {
    const parsed = JSON.parse(
      String(
        await read(join(projectRoot, ".dysflow", "runtime", "operations.json"), "utf8"),
      ).replace(/^\uFEFF/, ""),
    );
    const records = Array.isArray(parsed) ? parsed : parsed.records;
    if (!Array.isArray(records)) throw new Error("invalid operation registry");
    const identities = records.flatMap((record) => {
      if (!record || typeof record !== "object") return [];
      const creationMs =
        typeof record.processStartTime === "string" ? Date.parse(record.processStartTime) : NaN;
      return Number.isInteger(record.accessPid) &&
        record.accessPid > 0 &&
        Number.isFinite(creationMs) &&
        samePath(record.projectRootAbs, projectRoot) &&
        samePath(record.accessPath, accessPath)
        ? [{ pid: record.accessPid, creationMs }]
        : [];
    });
    return { available: true, identities, reason: null };
  } catch (error) {
    return {
      available: false,
      identities: [],
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Attribute survivors only with exact PID + creation-time evidence.
 * Unattributed global changes are not suite leaks and do not authorize cleanup.
 * Retained operation records are partial evidence; completed records are purged.
 */
export function computeAccessLeak({
  start,
  end,
  ownership = { available: false, identities: [], reason: "not supplied" },
}) {
  if (!end?.available) {
    const reason = `end snapshot unavailable: ${end?.reason ?? "not taken"}`;
    return {
      verified: false,
      startCount: start?.available ? start.processes.length : null,
      endCount: end?.available ? end.processes.length : null,
      leakDelta: 0,
      leaked: [],
      unattributed: [],
      newInteractive: [],
      summary: `WARNING: global MSACCESS.EXE leak check unverified for this run (${reason}).`,
    };
  }
  const alive = new Set(start?.available ? start.processes.map(processIdentity) : []);
  const fresh = end.processes.filter((p) => !alive.has(processIdentity(p)));
  const owned = new Set(
    ownership.available
      ? ownership.identities
          .filter((p) => Number.isInteger(p.pid) && p.pid > 0 && Number.isFinite(p.creationMs))
          .map(processIdentity)
      : [],
  );
  const headless = fresh.filter((p) => isHeadless(p.commandLine));
  const leaked = end.processes.filter(
    (p) => p.creationMs !== null && owned.has(processIdentity(p)),
  );
  const unattributed = headless.filter((p) => !leaked.includes(p));
  const newInteractive = fresh.filter((p) => !isHeadless(p.commandLine) && !leaked.includes(p));
  const startCount = start?.available ? start.processes.length : null;
  const counts = `start=${startCount ?? "unavailable"} end=${end.processes.length} leakDelta=${leaked.length}`;
  const interactiveNote =
    newInteractive.length > 0
      ? ` Interactive Access sessions opened during the run, not counted: ${newInteractive.map(describeProcess).join("; ")}.`
      : "";
  return {
    verified: Boolean(start?.available && ownership.available && unattributed.length === 0),
    startCount,
    endCount: end.processes.length,
    leakDelta: leaked.length,
    leaked,
    unattributed,
    newInteractive,
    summary:
      `${leaked.length} positively owned Access survivors (${counts}): ${leaked.map(describeProcess).join("; ") || "none"}.` +
      `${interactiveNote} Unattributed headless delta=${unattributed.length}: ${unattributed.map(describeProcess).join("; ") || "none"}. ` +
      `Ownership coverage is partial (retained suite operation records only); global absence of suite leaks is unverified. ` +
      `${ownership.available ? "" : `Registry unavailable: ${ownership.reason}. `}${OWNERSHIP_NOTE}`,
  };
}

/**
 * Typed preflight verdict. Processes whose parent is this run are not foreign.
 * @param {{ probe?: () => string, ownPid?: number, env?: Record<string, string | undefined> }} [input]
 */
export function runAccessPreflight({ probe = probeAccessProcesses, ownPid = process.pid } = {}) {
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
  return {
    kind: "access-preflight",
    status: "observed",
    pass: true,
    foreignHeadless,
    foreignInteractive,
    snapshot,
    summary:
      `WARNING: ${foreignHeadless.length} foreign headless Access processes observed before the first scenario: ` +
      `${listed}.${interactiveNote} ${OWNERSHIP_NOTE}`,
  };
}
