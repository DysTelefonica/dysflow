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
    let response = null;
    let resultPending = null;
    let stdout = "";
    let stderr = "";
    let buffer = "";
    /** @type {NodeJS.Timeout | null} */
    let primaryTimer = null;
    /** @type {NodeJS.Timeout | null} */
    let closeWatchdog = null;

    const finish = (result) => {
      if (settled) return;
      settled = true;
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
      try {
        child.kill();
      } catch {
        /* best-effort */
      }
      resolve({ ...result, childPid: child.pid });
    };

    primaryTimer = setTimeout(() => {
      finish({
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
        try {
          child.kill();
        } catch {
          /* best-effort */
        }
        // #583: if the child never emits 'close' (some hosts do not when the
        // process is killed by signal), force a settle after a bounded
        // watchdog window. The close handler clears this timer first, so
        // a natural close is a no-op.
        closeWatchdog = setTimeout(() => {
          finish({ ...resultPending, closeWatchdogFired: true });
        }, closeWatchdogMs);
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    });

    child.on("error", (error) => {
      finish({
        response,
        exit: { code: null, signal: "SPAWN_ERROR" },
        stdout,
        stderr,
        timedOut: false,
        isError: true,
        text: error?.message ?? String(error),
      });
    });

    child.on("close", (code, signal) => {
      if (closeWatchdog !== null) {
        clearTimeout(closeWatchdog);
        closeWatchdog = null;
      }
      if (settled) return;
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
 * @param {any} message
 */
function toolText(message) {
  return (
    message?.result?.content?.map((item) => item.text ?? "").join("\n") ??
    message?.error?.message ??
    ""
  );
}
