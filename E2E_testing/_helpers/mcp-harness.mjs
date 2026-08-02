// E2E_testing/_helpers/mcp-harness.mjs
//
// Per-call MCP harness used by the E2E suite. Runs the JSON-RPC handshake
// against a spawned child process and settles the call on the FIRST of:
//
//   1. Response captured AND child emits 'close' (normal path).
//   2. Response captured but the child does NOT emit 'close' within
//      `closeWatchdogMs` — the harness forces resolution with the captured
//      response and `closeWatchdogFired: true` (#583). This prevents the
//      indefinite hang the previous version had when a child process
//      failed to exit after a response.
//   3. No response within `timeoutMs` — primary timeout.
//   4. Child emits 'error' (spawn failed).
//   5. Child emits 'close' before any response — early settle.
//
// `finish` is settle-guarded so any combination of timers and events
// collapsing together is a no-op. The harness extracts the per-call
// logic so the integration test in test/e2e/ can drive it with a
// fake child that never emits 'close'.

import { spawn } from "node:child_process";

const PROCESS_TREE_KILL_BOUND_MS = 3_000;

async function terminateHarnessChild(child) {
  if (process.platform !== "win32" || !Number.isSafeInteger(child.pid) || child.pid <= 0) {
    try {
      child.kill();
    } catch {
      /* best-effort */
    }
    return;
  }

  const taskkill = spawn("taskkill", ["/T", "/F", "/PID", String(child.pid)], {
    stdio: "ignore",
    windowsHide: true,
  });
  await new Promise((resolve) => {
    const guard = setTimeout(resolve, PROCESS_TREE_KILL_BOUND_MS);
    const settle = () => {
      clearTimeout(guard);
      resolve();
    };
    taskkill.once("close", settle);
    taskkill.once("error", settle);
  });
}

/**
 * @typedef {{
 *   pid?: number;
 *   stdout: { on: (event: 'data', cb: (chunk: Buffer | string) => void) => void };
 *   stderr: { on: (event: 'data', cb: (chunk: Buffer | string) => void) => void };
 *   stdin: { write: (s: string) => void; end: () => void };
 *   on: (event: 'close' | 'error', cb: (...args: any[]) => void) => void;
 *   kill: () => void;
 * }} HarnessChild
 */

/**
 * @typedef {Object} HarnessOptions
 * @property {HarnessChild} child
 * @property {number} requestId
 * @property {string} method
 * @property {Record<string, unknown>} params
 * @property {number} timeoutMs
 * @property {number} closeWatchdogMs
 * @property {string} [clientName]
 * @property {string} [clientVersion]
 */

const PROTOCOL_VERSION = "2024-11-05";

/**
 * @param {HarnessOptions} options
 */
export function runMcpHarness(options) {
  const {
    child,
    requestId,
    method,
    params,
    timeoutMs,
    closeWatchdogMs,
    clientName = "dysflow-mcp-e2e",
    clientVersion = "1",
  } = options;

  return new Promise((resolve) => {
    let settled = false;
    let finishing = false;
    let response = null;
    let resultPending = null;
    let stdout = "";
    let stderr = "";
    let buffer = "";
    /** @type {NodeJS.Timeout | null} */
    let primaryTimer = null;
    /** @type {NodeJS.Timeout | null} */
    let closeWatchdog = null;
    /** @type {Promise<void> | null} */
    let terminationPromise = null;

    const startTermination = () => {
      terminationPromise ??= terminateHarnessChild(child);
      return terminationPromise;
    };

    const finish = async (result) => {
      if (settled || finishing) return;
      finishing = true;
      if (primaryTimer !== null) {
        clearTimeout(primaryTimer);
        primaryTimer = null;
      }
      if (closeWatchdog !== null) {
        clearTimeout(closeWatchdog);
        closeWatchdog = null;
      }
      try {
        child.stdin.end();
      } catch {
        /* best-effort */
      }
      await startTermination();
      settled = true;
      resolve({ ...result, childPid: child.pid });
    };

    primaryTimer = setTimeout(() => {
      void finish({
        response,
        exit: { code: null, signal: "TIMEOUT" },
        stdout,
        stderr,
        timedOut: true,
        isError: true,
        text: "Timed out waiting for MCP response",
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      if (settled) return;
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      stdout += text;
      buffer += text;
      for (;;) {
        const newline = buffer.indexOf("\n");
        if (newline < 0) break;
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        /** @type {any} */
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          continue;
        }
        if (message.id !== requestId) continue;
        response = message;
        const isError = Boolean(response?.error || response?.result?.isError);
        resultPending = {
          response,
          exit: { code: null, signal: null },
          stdout,
          stderr,
          timedOut: false,
          isError,
          text: toolText(response),
        };
        if (primaryTimer !== null) {
          clearTimeout(primaryTimer);
          primaryTimer = null;
        }
        try {
          child.stdin.end();
        } catch {
          /* best-effort */
        }
        void startTermination();
        // #583: if the child never emits 'close' (some hosts do not when the
        // process is killed by signal), force a settle after a bounded
        // watchdog window. The close handler clears this timer first, so
        // a natural close is a no-op.
        closeWatchdog = setTimeout(() => {
          void finish({ ...resultPending, closeWatchdogFired: true });
        }, closeWatchdogMs);
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    });

    child.on("error", (error) => {
      void finish({
        response,
        exit: { code: null, signal: "SPAWN_ERROR" },
        stdout,
        stderr,
        timedOut: false,
        isError: true,
        text: error?.message ?? String(error),
      });
    });

    child.on("close", async (code, signal) => {
      if (closeWatchdog !== null) {
        clearTimeout(closeWatchdog);
        closeWatchdog = null;
      }
      if (settled || finishing) return;
      finishing = true;
      if (terminationPromise !== null) await terminationPromise;
      settled = true;
      if (primaryTimer !== null) {
        clearTimeout(primaryTimer);
        primaryTimer = null;
      }
      if (resultPending) {
        resultPending.exit = { code, signal };
        resolve({ ...resultPending, childPid: child.pid });
        return;
      }
      resolve({
        response,
        exit: { code, signal },
        stdout,
        stderr,
        timedOut: false,
        isError: true,
        text: response ? toolText(response) : "MCP process closed before response",
        childPid: child.pid,
      });
    });

    child.stdin.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: clientName, version: clientVersion },
        },
      }) + "\n",
    );
    child.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n",
    );
    child.stdin.write(
      JSON.stringify(
        method === "tools/list"
          ? { jsonrpc: "2.0", id: requestId, method: "tools/list", params: {} }
          : { jsonrpc: "2.0", id: requestId, method: "tools/call", params },
      ) + "\n",
    );
  });
}

/**
 * Run multiple dependent MCP calls against one child process. This is reserved
 * for stateful contracts (for example one-shot recovery tokens); ordinary E2E
 * rows should keep using runMcpHarness's process-per-call isolation.
 *
 * @param {{child: HarnessChild, timeoutMs: number, run: (session: {callTool: (name: string, args?: Record<string, unknown>) => Promise<any>}) => Promise<any>}} options
 */
export async function runMcpSession(options) {
  const { child, timeoutMs, run } = options;
  let nextId = 1;
  let buffer = "";
  let stderr = "";
  let closed = false;
  /** @type {Map<number, {resolve: (value: any) => void, reject: (error: Error) => void, timer: NodeJS.Timeout}>} */
  const pending = new Map();

  const rejectPending = (error) => {
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    pending.clear();
  };
  child.stdout.on("data", (chunk) => {
    buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    for (;;) {
      const newline = buffer.indexOf("\n");
      if (newline < 0) break;
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      const waiter = pending.get(message.id);
      if (waiter === undefined) continue;
      pending.delete(message.id);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr += typeof chunk === "string" ? chunk : chunk.toString("utf8");
  });
  child.on("error", (error) => rejectPending(error));
  child.on("close", (code, signal) => {
    closed = true;
    rejectPending(
      new Error(`MCP session closed before response (code=${code}, signal=${signal}): ${stderr}`),
    );
  });

  const request = (method, params) => {
    if (closed) return Promise.reject(new Error("MCP session is closed"));
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timed out waiting for MCP session response to ${method}`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  };

  try {
    await request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "dysflow-mcp-e2e-session", version: "1" },
    });
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })}\n`,
    );
    return await run({
      callTool: async (name, args = {}) => {
        const response = await request("tools/call", { name, arguments: args });
        return {
          response,
          isError: Boolean(response?.error || response?.result?.isError),
          text: toolText(response),
        };
      },
    });
  } finally {
    try {
      child.stdin.end();
    } catch {
      /* best-effort */
    }
    await terminateHarnessChild(child);
  }
}

/**
 * @param {any} message
 */
function toolText(message) {
  return (
    message?.result?.content?.map((item) => item.text ?? "").join("\n") ??
    message?.error?.message ??
    ""
  );
}
