// E2E_testing/_helpers/mcp-e2e-record.mjs
//
// Extracted from E2E_testing/mcp-e2e.mjs:122-202 (the per-tool `record()`
// function) so vitest can exercise the real driver against injected
// fakes. The body's behavior is byte-for-byte identical to the in-suite
// version; only the dependency surface becomes explicit.

import { execSync, spawnSync } from "node:child_process";
import { resolveMcpE2eToolName } from "./mcp-e2e-tool-aliases.mjs";
import {
  classifyChildLiveness,
  formatTerminationLine,
  isSameProcess,
  SPAWN_IDENTITY_SLACK_MS,
  summarizeLiveness,
  zombieVerdict,
} from "./zombie-liveness.mjs";
import { formatZombieReport } from "./zombie-process-dump.mjs";
//
// The hard rules pinned here:
//   1. REFUSE-START before every tool — refuse to start a new tool when
//      a suite-owned MSACCESS.EXE child survived the previous step.
//   2. Per-tool PASS/FAIL row (expected vs isError/timedOut).
//   3. Per-tool zombie check (this tool's childPid must exit cleanly).
//   4. Ordinary expectation mismatches aggregate; unsafe process state
//      remains fail-fast so later evidence cannot be contaminated.

/**
 * @typedef {Object} RecordRow
 * @property {string} area
 * @property {string} tool
 * @property {boolean} pass
 * @property {string} expected
 * @property {number} ms
 * @property {string} summary
 */

/**
 * @typedef {Object} CallMcpResult
 * @property {number} [childPid]
 * @property {number} [spawnedAtMs] - Date.now() taken right after spawn() returned (#1899)
 * @property {boolean} timedOut
 * @property {boolean} isError
 * @property {string} [text]
 * @property {string} [stderr]
 * @property {unknown} [exit]
 */

/**
 * @typedef {Object} RecordCtx
 * @property {(method: string, params: Record<string, unknown>, options: Record<string, unknown>) => Promise<CallMcpResult>} callMcp
 * @property {Set<number>} suiteOwnPids
 * @property {RecordRow[]} rows
 * @property {(timeoutMs?: number, pollMs?: number) => Promise<{found: boolean, pids?: number[], elapsed: number}>} waitForNoOwnPids
 * @property {(pid: number, options?: { spawnedAtMs?: number, verifyIdentity?: boolean }) => boolean} isOwnPidAlive
 * @property {(text: unknown) => string} [normalize]
 * @property {{exitCode: number | null}} [processObj]
 * @property {(...args: unknown[]) => void} [consoleLog]
 * @property {(...args: unknown[]) => void} [consoleError]
 * @property {() => number} [DateNow]
 */

/**
 * @typedef {Object} RecordCall
 * @property {string} area
 * @property {string} tool
 * @property {Record<string, unknown>} [args]
 * @property {{expected?: "success" | "error", timeoutMs?: number, closeWatchdogMs?: number}} [options]
 */

/**
 * Run one MCP tool through the E2E suite's record() loop. Returns the
 * harness result after ordinary mismatches; throws only when process state
 * makes continuation unsafe (REFUSE-START or a post-tool zombie).
 *
 * @param {RecordCtx} ctx
 * @param {RecordCall} call
 * @returns {Promise<CallMcpResult>}
 */
export async function record(ctx, { area, tool, args = {}, options = {} }) {
  const consoleLog = ctx.consoleLog ?? console.log;
  const consoleError = ctx.consoleError ?? console.error;
  const processObj = ctx.processObj ?? process;
  const DateNow = ctx.DateNow ?? Date.now;
  const normalize =
    ctx.normalize ??
    ((text) =>
      String(text ?? "")
        .replace(/\s+/g, " ")
        .slice(0, 260));

  // Stop-on-fail gate: refuse to start a new tool if a suite-owned
  // MSACCESS.EXE child survived the previous step. A leftover zombie
  // means the previous tool already broke the suite; continuing would
  // just orphan more processes. Only this suite's PIDs matter — other
  // Dysflow consumers' MSACCESS.EXE instances on the same host are
  // out of scope. Total preflight budget: 500ms (4 polls at 100ms).
  const preFlight = await ctx.waitForNoOwnPids(500, 100);
  if (preFlight.found) {
    const failRow = {
      area,
      tool: `${tool}:preflight`,
      pass: false,
      expected: "no leftover suite-owned MSACCESS.EXE before tool start",
      ms: preFlight.elapsed,
      summary: `Refusing to start: suite-owned MSACCESS.EXE pids=${preFlight.pids.join(",")} still alive`,
      failureClass: "safety-critical",
    };
    ctx.rows.push(failRow);
    consoleLog(`FAIL\t${failRow.tool}\t${failRow.ms}ms\t${failRow.summary}`);
    consoleError(
      `mcp-e2e: REFUSE-START — suite-owned MSACCESS.EXE pids=${preFlight.pids.join(",")} detected before ${tool}; aborting battery. ` +
        `Do NOT continue running tools. Fix the tool that orphaned it and re-run.`,
    );
    processObj.exitCode = 1;
    throw new Error(`mcp-e2e: REFUSE-START before ${tool}`);
  }

  const started = DateNow();
  const method = tool === "tools/list" ? "tools/list" : "tools/call";
  // Regression records use `tool:scenario` labels so multiple assertions for
  // one MCP tool remain distinguishable in the report. Dispatch only the
  // canonical tool-name prefix while preserving the full label in result rows.
  const dispatchTool = resolveMcpE2eToolName(tool);
  const params = tool === "tools/list" ? {} : { name: dispatchTool, arguments: args };
  const result = await ctx.callMcp(method, params, options);
  const ms = DateNow() - started;
  // Track the child PID as suite-owned. The harness may spawn MSACCESS.EXE
  // through it; we want to watch this specific PID for the next preflight.
  if (result.childPid && result.childPid > 0) {
    ctx.suiteOwnPids.add(result.childPid);
  }
  const expectedError = options.expected === "error";
  const pass = result.timedOut ? false : expectedError ? result.isError : !result.isError;
  ctx.rows.push({
    area,
    tool,
    pass,
    expected: options.expected ?? "success",
    ms,
    summary: normalize(result.text || result.stderr || JSON.stringify(result.exit)),
    ...(!pass ? { failureClass: "ordinary" } : {}),
  });
  consoleLog(`${pass ? "PASS" : "FAIL"}\t${tool}\t${ms}ms\t${ctx.rows.at(-1).summary}`);

  // Post-tool zombie check: short (1s), only against THIS tool's childPid.
  // We do NOT scan global MSACCESS.EXE — other consumers' instances are
  // out of scope. Once the child exits, remove it from the watchlist so
  // the next preflight does not wait on a dead PID.
  const postToolZombie = await ctx.waitForNoOwnPids(1000, 100);
  // Filter the result to the child of THIS tool only (so we don't keep
  // pre-existing watch entries alive forever).
  const toolChildAlive = result.childPid
    ? await childStillOwned(ctx, result.childPid, result.spawnedAtMs)
    : false;
  // #1899: a child that answers at the check but stops within the bounded window is a late
  // exit, not a leak. The verdict waits for that window before it fails the battery.
  let liveness = null;
  // Sample with the same identity-aware predicate as the check, so neither a lingering
  // descendant is read as a late exit nor a reused PID as a lingering child.
  if (toolChildAlive && result.childPid) {
    liveness = await sampleLiveness(() =>
      ctx.isOwnPidAlive(result.childPid, { spawnedAtMs: result.spawnedAtMs, verifyIdentity: true }),
    );
  }
  const verdict = zombieVerdict({ aliveAtCheck: toolChildAlive, liveness });
  const zombiePass = verdict !== "zombie";
  if (toolChildAlive && result.childPid) {
    consoleLog(
      formatTerminationLine({
        tool,
        childPid: result.childPid,
        taskkillExit: result.termination?.taskkillExit ?? null,
        guardExpired: result.termination?.guardExpired ?? false,
        terminationMs: result.termination?.terminationMs ?? 0,
        liveness,
      }),
    );
  }
  const zombieTool = `${tool}:zombie-check`;
  ctx.rows.push({
    area,
    tool: zombieTool,
    pass: zombiePass,
    expected: "no suite-owned MSACCESS.EXE child after tool",
    ms: postToolZombie.elapsed,
    summary:
      verdict === "zombie"
        ? `Suite-owned MSACCESS.EXE pid=${result.childPid} lingered after ${tool}`
        : verdict === "late-exit"
          ? `child pid=${result.childPid} exited within the window after ${tool}`
          : "clean",
    ...(!zombiePass ? { failureClass: "safety-critical" } : {}),
  });
  consoleLog(
    `${zombiePass ? "PASS" : "FAIL"}\t${zombieTool}\t${postToolZombie.elapsed}ms\t${ctx.rows.at(-1).summary}`,
  );

  if (verdict !== "zombie" && result.childPid) {
    ctx.suiteOwnPids.delete(result.childPid);
  }

  if (!pass) {
    consoleError(
      `mcp-e2e: continuing after ordinary failure for ${tool}; final exit will remain non-zero.`,
    );
    processObj.exitCode = 1;
  }

  // A live harness-owned child is NOT an ordinary assertion failure. Later
  // records would be unsafe and could multiply leaked Access processes.
  if (!zombiePass) {
    // Zombie attribution (#1899): on a failing zombie-check, dump the Access,
    // shell and node processes with parent PID and command line so the owning
    // process of each suite-owned Access instance can be identified. Failure path only.
    dumpZombieDiagnostics(tool, result.childPid);
    consoleError(
      `mcp-e2e: UNSAFE-STOP after ${tool} (zombie.pass=${zombiePass}). ` +
        `Aborting battery because the harness-owned child did not exit.`,
    );
    processObj.exitCode = 1;
    throw new Error(`mcp-e2e: UNSAFE-STOP after ${tool}`);
  }

  return result;
}

// ---------------------------------------------------------------------------
// H5 descendant walk (WU-F). Windows-only: enumerates descendant PIDs of a
// given root from the live process table, then BFS over the parent → children
// map. Returns an empty array on any error (timeout, missing probe, malformed
// output) — fail-open so the suite's preflight/post-tool checks degrade to
// "parent-only" detection rather than crash. Exports here are public so the
// test suite (`vitest`) and `mcp-e2e.mjs` share the same walker.
//
// #1690: the probe used to be `wmic`, which Microsoft removed from Windows 11
// 24H2 onward. On a 24H2+ runner every call threw, fail-open returned [], and
// the suite reported `clean` for grandchild zombies it could no longer see —
// while `execSync` forwarded the probe's stderr to the parent, burying real
// failures under hundreds of "wmic is not recognized" lines. Two consequences
// are load-bearing here: the probe is PowerShell/CIM (which exists on every
// supported build), and an unavailable probe is RECORDED rather than swallowed,
// so a `clean` verdict can be distinguished from a verdict nobody could take.
// ---------------------------------------------------------------------------

/**
 * PowerShell/CIM replacement for `wmic process get ...`. `-NonInteractive`
 * keeps it from ever blocking on a prompt; stderr is piped rather than
 * inherited so a failing probe cannot pollute the suite log.
 */
// #1899: the projection also carries Name and the creation time (Unix ms), so the same
// snapshot tells a reused PID and a stale ParentProcessId link from the call's own processes.
const DESCENDANT_PROBE_COMMAND =
  "powershell -NoProfile -NonInteractive -Command " +
  '"Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,' +
  "@{n='CreationMs';e={if ($_.CreationDate) {([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds()}}}" +
  ' | ConvertTo-Csv -NoTypeInformation"';

/**
 * How long one process-table snapshot may serve consecutive walks.
 *
 * #1692: `isPidOrDescendantAlive` reaches the walker on the HEALTHY branch —
 * the tool's child exited, so `process.kill` throws — and `waitForNoOwnPids`
 * polls that check every 100ms, twice per tool, across the whole advertised
 * surface. At ~0.55s per PowerShell/CIM probe that added ~17 minutes and blew
 * the E2E job's 30-minute cap. The volume was always there; the broken `wmic`
 * probe merely answered in milliseconds because "command not found" is cheap.
 *
 * 750ms covers a full 100ms poll burst with one probe. Staleness is bounded and
 * safe in the direction that matters: the snapshot supplies CANDIDATE pids and
 * `isPidOrDescendantAlive` still confirms each one with a live
 * `process.kill(d, 0)`, so a stale row can never manufacture a zombie. The only
 * exposure is a descendant spawned inside the window — a far smaller gap than
 * the pre-#1690 state, where no descendant was ever detected at all.
 */
const PROCESS_TABLE_SNAPSHOT_TTL_MS = 750;

/** @type {{ table: string, takenAt: number } | null} */
let processTableSnapshot = null;

// #1899: drop the cached process table so the zombie verdict reads the current one.
export function resetProcessTableSnapshot() {
  processTableSnapshot = null;
}

/** @type {string | null} First reason the probe was unavailable this run. */
let descendantWalkUnavailableReason = null;

/**
 * Report whether the descendant walk could actually inspect the process table.
 * A caller that sees `available: false` must not read an empty descendant list
 * as proof that nothing leaked — nobody looked.
 *
 * @returns {{ available: boolean, reason: string | null }}
 */
export function getDescendantWalkDiagnostics() {
  return {
    available: descendantWalkUnavailableReason === null,
    reason: descendantWalkUnavailableReason,
  };
}

/**
 * Clears the recorded unavailability AND the cached snapshot. Exposed for tests
 * and per-run resets: a reset must not leave a stale table behind, or the next
 * assertion would answer from the previous scenario's process world.
 */
export function resetDescendantWalkDiagnostics() {
  descendantWalkUnavailableReason = null;
  processTableSnapshot = null;
}

/** Default probe: returns the raw CSV process table, or throws. */
function probeProcessTable() {
  return execSync(DESCENDANT_PROBE_COMMAND, {
    encoding: "utf8",
    timeout: 15000,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** Splits one `ConvertTo-Csv` row, stripping the surrounding quotes. */
function parseCsvRow(line) {
  return line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
}

/**
 * Collect all descendant PIDs of `rootPid` from the live process table.
 * Returns an empty array if the probe is unavailable or returns no parseable
 * data; the reason is recorded in `getDescendantWalkDiagnostics()`. The
 * returned list does NOT include `rootPid` itself.
 *
 * @param {number} rootPid
 * @param {() => string} [probeFn] - injection point so tests can supply a
 *   fixed process table or force the unavailable path.
 * @param {{ spawnedAtMs?: number }} [options] - when the root's spawn time is
 *   known, links that cannot belong to the spawned root are dropped (#1899).
 * @returns {number[]}
 */
export function walkDescendantsPids(rootPid, probeFn = probeProcessTable, options = {}) {
  if (!rootPid || rootPid <= 0) return [];
  const table = readProcessTable(probeFn);
  if (table === null) return [];
  return descendantsFromTable(parseProcessTable(table), rootPid, options.spawnedAtMs);
}

/**
 * Read the process table through the shared snapshot. Returns null when the
 * probe is unavailable; the reason is recorded in `getDescendantWalkDiagnostics()`.
 *
 * @param {() => string} probeFn
 * @returns {string | null}
 */
function readProcessTable(probeFn) {
  const now = Date.now();
  if (
    processTableSnapshot !== null &&
    now - processTableSnapshot.takenAt < PROCESS_TABLE_SNAPSHOT_TTL_MS
  ) {
    return processTableSnapshot.table;
  }
  try {
    const table = String(probeFn());
    processTableSnapshot = { table, takenAt: now };
    return table;
  } catch (error) {
    // Record the FIRST reason only: the suite reports the degradation once per
    // run, and a later identical failure must not churn the message.
    if (descendantWalkUnavailableReason === null) {
      descendantWalkUnavailableReason =
        error instanceof Error ? error.message : String(error ?? "unknown probe failure");
    }
    return null;
  }
}

/**
 * Parse one raw process-table snapshot into rows keyed by pid. Pure.
 *
 * `ConvertTo-Csv -NoTypeInformation` emits a quoted header row followed by
 * one row per process. Resolve the columns BY NAME: the previous wmic parser
 * hard-coded positional indexes and would have inverted parent and child if
 * the projection ever changed. Name and CreationMs are optional columns; a
 * missing or empty cell reads as unknown.
 *
 * @param {string} table - raw `ConvertTo-Csv` output.
 * @returns {Map<number, { pid: number, parent: number, name: string | null, creationMs: number | null }>}
 */
function parseProcessTable(table) {
  const rows = new Map();
  const lines = String(table).trim().split(/\r?\n/).filter(Boolean);
  const header = lines.length > 0 ? parseCsvRow(lines[0]) : [];
  const pidColumn = header.indexOf("ProcessId");
  const parentColumn = header.indexOf("ParentProcessId");
  const nameColumn = header.indexOf("Name");
  const creationColumn = header.indexOf("CreationMs");
  if (pidColumn === -1 || parentColumn === -1) return rows;

  for (const line of lines.slice(1)) {
    const cells = parseCsvRow(line);
    const pid = Number.parseInt(cells[pidColumn] ?? "", 10);
    const parent = Number.parseInt(cells[parentColumn] ?? "", 10);
    if (!Number.isFinite(parent) || !Number.isFinite(pid)) continue;
    const name = nameColumn === -1 ? "" : (cells[nameColumn] ?? "");
    const creationMs =
      creationColumn === -1 ? Number.NaN : Number.parseInt(cells[creationColumn] ?? "", 10);
    rows.set(pid, {
      pid,
      parent,
      name: name.length > 0 ? name : null,
      creationMs: Number.isFinite(creationMs) ? creationMs : null,
    });
  }
  return rows;
}

/**
 * BFS the descendants of `rootPid` out of parsed process rows. Pure: the same
 * table always yields the same answer, which is what makes the snapshot
 * shareable across a poll burst.
 *
 * #1899: Windows never clears ParentProcessId, so a row naming a parent is a
 * candidate link, not proof. A link is kept only when the child was created no
 * earlier than its parent (for the root: no earlier than the spawn minus the
 * slack) and, when the root PID is now held by a later process, before that
 * holder was created. A row without a creation time is kept (fail closed).
 *
 * @param {Map<number, { pid: number, parent: number, creationMs: number | null }>} rows
 * @param {number} rootPid
 * @param {number | undefined} spawnedAtMs
 * @returns {number[]}
 */
function descendantsFromTable(rows, rootPid, spawnedAtMs) {
  const childrenOf = new Map();
  for (const row of rows.values()) {
    if (!childrenOf.has(row.parent)) childrenOf.set(row.parent, []);
    childrenOf.get(row.parent).push(row);
  }
  const rootRow = rows.get(rootPid);
  const rootReused = isSameProcess({ spawnedAtMs, row: rootRow }) === "reused";
  const rootWindow = {
    from: Number.isFinite(spawnedAtMs) ? spawnedAtMs - SPAWN_IDENTITY_SLACK_MS : -Infinity,
    until: rootReused ? rootRow.creationMs : Infinity,
  };
  const descendants = [];
  const queue = [{ pid: rootPid, window: rootWindow }];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    const children = childrenOf.get(current.pid);
    if (children === undefined) continue;
    for (const child of children) {
      const created = child.creationMs;
      if (created !== null && (created < current.window.from || created >= current.window.until)) {
        continue;
      }
      descendants.push(child.pid);
      queue.push({ pid: child.pid, window: { from: created ?? -Infinity, until: Infinity } });
    }
  }
  return descendants;
}

/**
 * Return true if `pid` itself OR any of its descendants is alive.
 * Fast path: `process.kill(pid, 0)` succeeds → return true (no probe at all).
 * Slow path: parent is gone → walk descendants and `process.kill` each.
 *
 * #1899: with `spawnedAtMs` or `verifyIdentity`, an answering PID is first
 * matched against the process table. A process created after the spawn, or one
 * whose image the harness never spawns, took the PID over after the child
 * exited, so only the descendants are checked. An identity that cannot be read
 * keeps the PID counted as alive: the unknown case keeps the pre-#1899
 * behaviour, because a missed leak is worse than a false stop.
 *
 * @param {number} pid
 * @param {(rootPid: number, probeFn?: () => string, options?: { spawnedAtMs?: number }) => number[]} [walkDescendantsFn] -
 *   injection point so tests can replace the process-table walk with a fake.
 * @param {{ spawnedAtMs?: number, verifyIdentity?: boolean, probeFn?: () => string }} [options]
 * @returns {boolean}
 */
export function isPidOrDescendantAlive(pid, walkDescendantsFn = walkDescendantsPids, options = {}) {
  if (!pid || pid <= 0) return false;
  const { spawnedAtMs, verifyIdentity = false, probeFn = probeProcessTable } = options;
  let answers = true;
  try {
    process.kill(pid, 0);
  } catch {
    answers = false;
  }
  if (answers) {
    if (!verifyIdentity && !Number.isFinite(spawnedAtMs)) return true;
    const table = readProcessTable(probeFn);
    const row = table === null ? undefined : parseProcessTable(table).get(pid);
    const reused =
      isSameProcess({ spawnedAtMs, row }) === "reused" ||
      classifyChildLiveness({ alive: true, imageName: row?.name }) === "reused";
    if (!reused) return true;
  }
  const descendants = walkDescendantsFn(pid, probeFn, { spawnedAtMs });
  for (const d of descendants) {
    try {
      process.kill(d, 0);
      return true;
    } catch {
      /* descendant also gone — keep checking */
    }
  }
  return false;
}
// Prints the zombie-owner report (#1899). Reads the full process table so the
// formatter sees the child's ancestors; the formatter selects what to print.
// Never kills anything.
function dumpZombieDiagnostics(tool, childPid) {
  const ps = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CreationDate,CommandLine | ConvertTo-Json -Compress -Depth 2",
    ],
    { encoding: "utf8", windowsHide: true, timeout: 20000, maxBuffer: 64 * 1024 * 1024 },
  );
  if (ps.status !== 0 || !ps.stdout) {
    console.log(
      `ZOMBIE tool=${tool} childPid=${childPid} process-table-unavailable status=${ps.status} error=${ps.error?.code ?? ps.stderr?.trim() ?? "none"}`,
    );
    return;
  }
  const parsed = JSON.parse(ps.stdout);
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  console.log(`ZOMBIE tool=${tool} childPid=${childPid} rows=${rows.length}`);
  for (const line of formatZombieReport({ rows, childPid })) console.log(line);
}

// Samples the child's liveness with the zombie-check's own predicate every 50 ms for
// at most 3 s, and stops at the first death (#1899).
const LIVENESS_WINDOW_MS = 3000;
const LIVENESS_STEP_MS = 50;
async function sampleLiveness(isAlive) {
  const samples = [];
  const started = Date.now();
  for (;;) {
    const atMs = Date.now() - started;
    const alive = isAlive();
    samples.push({ atMs, alive });
    if (!alive || atMs >= LIVENESS_WINDOW_MS) break;
    await new Promise((resolve) => setTimeout(resolve, LIVENESS_STEP_MS));
  }
  return summarizeLiveness(samples);
}

// #1899: the zombie-check reads a fresh process table and judges an answering PID by
// its identity (creation time against the spawn, image name), not by the answer alone.
// The table is read only when the PID answers or is gone, so the healthy path pays one
// probe as before.
async function childStillOwned(ctx, pid, spawnedAtMs) {
  resetProcessTableSnapshot();
  return ctx.isOwnPidAlive(pid, { spawnedAtMs, verifyIdentity: true });
}
