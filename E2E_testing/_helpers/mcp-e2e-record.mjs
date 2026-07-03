// E2E_testing/_helpers/mcp-e2e-record.mjs
//
// Extracted from E2E_testing/mcp-e2e.mjs:122-202 (the per-tool `record()`
// function) so vitest can exercise the real driver against injected
// fakes. The body's behavior is byte-for-byte identical to the in-suite
// version; only the dependency surface becomes explicit.

import { execSync } from "node:child_process";
//
// The hard rules pinned here:
//   1. REFUSE-START before every tool — refuse to start a new tool when
//      a suite-owned MSACCESS.EXE child survived the previous step.
//   2. Per-tool PASS/FAIL row (expected vs isError/timedOut).
//   3. Per-tool zombie check (this tool's childPid must exit cleanly).
//   4. STOP-ON-FAIL — any FAIL row aborts the battery immediately with
//      process.exitCode=1 + a thrown error. The user established this as
//      a hard rule on 2026-06-29: "que no empiece un test nuevo si se
//      queda un huerfano".

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
 * @property {(pid: number) => boolean} isOwnPidAlive
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
 * harness result on success; throws on REFUSE-START or STOP-ON-FAIL.
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
  const params = tool === "tools/list" ? {} : { name: tool, arguments: args };
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
  });
  consoleLog(`${pass ? "PASS" : "FAIL"}\t${tool}\t${ms}ms\t${ctx.rows.at(-1).summary}`);

  // Post-tool zombie check: short (1s), only against THIS tool's childPid.
  // We do NOT scan global MSACCESS.EXE — other consumers' instances are
  // out of scope. Once the child exits, remove it from the watchlist so
  // the next preflight does not wait on a dead PID.
  const postToolZombie = await ctx.waitForNoOwnPids(1000, 100);
  // Filter the result to the child of THIS tool only (so we don't keep
  // pre-existing watch entries alive forever).
  const toolChildAlive = result.childPid ? ctx.isOwnPidAlive(result.childPid) : false;
  const zombiePass = !toolChildAlive;
  const zombieTool = `${tool}:zombie-check`;
  ctx.rows.push({
    area,
    tool: zombieTool,
    pass: zombiePass,
    expected: "no suite-owned MSACCESS.EXE child after tool",
    ms: postToolZombie.elapsed,
    summary: toolChildAlive
      ? `Suite-owned MSACCESS.EXE pid=${result.childPid} lingered after ${tool}`
      : "clean",
  });
  consoleLog(
    `${zombiePass ? "PASS" : "FAIL"}\t${zombieTool}\t${postToolZombie.elapsed}ms\t${ctx.rows.at(-1).summary}`,
  );

  if (!toolChildAlive && result.childPid) {
    ctx.suiteOwnPids.delete(result.childPid);
  }

  // Stop-on-fail: a FAIL row aborts the suite immediately. The user
  // established this as a hard rule: "que no empiece un test nuevo si
  // se queda un huerfano". Do NOT let later tools run; they will only
  // orphan more MSACCESS.EXE.
  if (!pass || !zombiePass) {
    consoleError(
      `mcp-e2e: STOP-ON-FAIL after ${tool} (tool.pass=${pass}, zombie.pass=${zombiePass}). ` +
        `Aborting battery. Fix the root cause before re-running.`,
    );
    processObj.exitCode = 1;
    throw new Error(`mcp-e2e: STOP-ON-FAIL after ${tool}`);
  }

  return result;
}

// ---------------------------------------------------------------------------
// H5 descendant walk (WU-F). Windows-only: enumerates descendant PIDs of a
// given root via `wmic process get ProcessId,ParentProcessId /format:csv`.
// BFS over the parent → children map. Returns an empty array on any error
// (timeout, missing wmic, malformed output) — fail-open so the suite's
// preflight/post-tool checks degrade to "parent-only" detection rather
// than crash. Exports here are public so the test suite (`vitest`) and
// `mcp-e2e.mjs` share the same walker implementation.
// ---------------------------------------------------------------------------

/**
 * Collect all descendant PIDs of `rootPid` via the Windows `wmic` tool.
 * Returns an empty array if `wmic` is unavailable or returns no parseable
 * data. The returned list does NOT include `rootPid` itself.
 *
 * @param {number} rootPid
 * @returns {number[]}
 */
export function walkDescendantsPids(rootPid) {
  if (!rootPid || rootPid <= 0) return [];
  let stdout;
  try {
    stdout = execSync("wmic process get ProcessId,ParentProcessId /format:csv", {
      encoding: "utf8",
      timeout: 5000,
    });
  } catch {
    return [];
  }
  // CSV format: "Node,<ParentProcessId>,<ProcessId>" - one header line first.
  // Build a parent → [children] map, then BFS from rootPid.
  const childrenOf = new Map();
  for (const line of stdout.trim().split(/\r?\n/).filter(Boolean)) {
    const parts = line.split(",");
    if (parts.length < 3) continue;
    if (parts[0] === "Node") continue;
    const parent = Number.parseInt(parts[1], 10);
    const pid = Number.parseInt(parts[2], 10);
    if (!Number.isFinite(parent) || !Number.isFinite(pid)) continue;
    if (!childrenOf.has(parent)) childrenOf.set(parent, []);
    childrenOf.get(parent).push(pid);
  }
  const descendants = [];
  const queue = [rootPid];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    const children = childrenOf.get(current);
    if (children === undefined) continue;
    for (const child of children) {
      descendants.push(child);
      queue.push(child);
    }
  }
  return descendants;
}

/**
 * Return true if `pid` itself OR any of its descendants is alive.
 * Fast path: `process.kill(pid, 0)` succeeds → return true (no wmic call).
 * Slow path: parent is gone → walk descendants and `process.kill` each.
 *
 * @param {number} pid
 * @param {(rootPid: number) => number[]} [walkDescendantsFn] - injection
 *   point so tests can replace the wmic-backed walk with a fake.
 * @returns {boolean}
 */
export function isPidOrDescendantAlive(pid, walkDescendantsFn = walkDescendantsPids) {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    const descendants = walkDescendantsFn(pid);
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
}
