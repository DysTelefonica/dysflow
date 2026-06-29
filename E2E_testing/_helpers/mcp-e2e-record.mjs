// E2E_testing/_helpers/mcp-e2e-record.mjs
//
// Extracted from E2E_testing/mcp-e2e.mjs:122-202 (the per-tool `record()`
// function) so vitest can exercise the real driver against injected
// fakes. The body's behavior is byte-for-byte identical to the in-suite
// version; only the dependency surface becomes explicit.
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
    ctx.normalize ?? ((text) => String(text ?? "").replace(/\s+/g, " ").slice(0, 260));

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