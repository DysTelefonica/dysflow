// Vitest integration test for the MCP harness watchdog (#583).
// Drives runMcpHarness with a fake child EventEmitter that:
//   - Accepts stdin writes (records them)
//   - Emits a tools/call response on stdout
//   - NEVER emits 'close' and never exits
//
// The harness MUST resolve within closeWatchdogMs + slack with the captured
// response and closeWatchdogFired: true. Without the watchdog, the harness
// hangs forever (the previous bug).

import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { runMcpHarness, runMcpSession } from "../../E2E_testing/_helpers/mcp-harness.mjs";

class FakeChild extends EventEmitter {
  stdin = new EventEmitter() as EventEmitter & { end: () => void; write: (s: string) => void };
  stdout = new EventEmitter() as EventEmitter;
  stderr = new EventEmitter() as EventEmitter;
  // Deliberately omit a real PID: these atoms exercise watchdog settlement,
  // while the Windows integration test owns the real process-tree contract.
  pid: number | undefined;
  killCalls = 0;
  stdinEndCalls = 0;
  stdinWrites: string[] = [];

  constructor() {
    super();
    this.stdin.write = (s: string) => {
      this.stdinWrites.push(s);
      return true;
    };
    this.stdin.end = () => {
      this.stdinEndCalls += 1;
    };
  }

  kill(): boolean {
    this.killCalls += 1;
    return true;
  }
}

const RESPONSE = {
  jsonrpc: "2.0",
  id: 2,
  result: { content: [{ type: "text", text: "ok" }], isError: false },
};

describe("MCP harness watchdog (#583)", () => {
  it("settles within closeWatchdogMs when the response is captured but the child never emits 'close'", async () => {
    const child = new FakeChild();
    // Emit the response on stdout but NEVER emit 'close'. The watchdog must
    // settle the promise.
    queueMicrotask(() => {
      child.stdout.emit("data", `${JSON.stringify(RESPONSE)}\n`);
    });
    const start = Date.now();
    const result = await runMcpHarness({
      child: child as unknown as Parameters<typeof runMcpHarness>[0]["child"],
      requestId: 2,
      method: "tools/call",
      params: { name: "fake", arguments: {} },
      timeoutMs: 30_000,
      closeWatchdogMs: 200,
    });
    const elapsed = Date.now() - start;

    // The promise must resolve within the watchdog window + a small slack.
    expect(elapsed).toBeLessThan(2000);

    // The response was captured.
    expect((result.response as { id: number }).id).toBe(2);
    expect(result.timedOut).toBe(false);
    expect(result.isError).toBe(false);
    expect(result.text).toBe("ok");

    // The watchdog fired, not the close event.
    expect(result.closeWatchdogFired).toBe(true);

    // child.kill() ran (best-effort cleanup).
    expect(child.killCalls).toBeGreaterThanOrEqual(1);
    // child.stdin.end() ran (best-effort cleanup).
    expect(child.stdinEndCalls).toBeGreaterThanOrEqual(1);
  });

  it("does not double-resolve when 'close' arrives AFTER the watchdog has fired", async () => {
    const child = new FakeChild();
    queueMicrotask(() => {
      child.stdout.emit("data", `${JSON.stringify(RESPONSE)}\n`);
    });
    const result = await runMcpHarness({
      child: child as unknown as Parameters<typeof runMcpHarness>[0]["child"],
      requestId: 2,
      method: "tools/call",
      params: { name: "fake", arguments: {} },
      timeoutMs: 30_000,
      closeWatchdogMs: 150,
    });

    expect(result.closeWatchdogFired).toBe(true);

    // Now emit 'close' AFTER the watchdog has already settled the promise.
    // The close handler must be a no-op — no second resolve, no error.
    const beforeKillCalls = child.killCalls;
    child.emit("close", 0, null);

    // A small wait so any erroneous async work would have run.
    await new Promise((r) => setTimeout(r, 50));

    // closeWatchdogFired stays true; the resolve happened exactly once.
    expect(result.closeWatchdogFired).toBe(true);
    // The close path's clearTimeout prevents kill from being called again
    // by the (no-op) close handler.
    expect(child.killCalls).toBe(beforeKillCalls);
  });

  it("resolves via the 'close' event when the child closes naturally (no watchdog needed)", async () => {
    const child = new FakeChild();
    const harnessPromise = runMcpHarness({
      child: child as unknown as Parameters<typeof runMcpHarness>[0]["child"],
      requestId: 2,
      method: "tools/call",
      params: { name: "fake", arguments: {} },
      timeoutMs: 30_000,
      closeWatchdogMs: 10_000, // long enough to never fire in this test
    });

    // Emit the response on stdout, then close the child.
    queueMicrotask(() => {
      child.stdout.emit("data", `${JSON.stringify(RESPONSE)}\n`);
      child.emit("close", 0, null);
    });

    const result = await harnessPromise;
    expect(result.timedOut).toBe(false);
    expect(result.closeWatchdogFired).toBeUndefined();
    expect((result.response as { id: number }).id).toBe(2);
    // exit was filled in by the close handler
    expect(result.exit.code).toBe(0);
  });

  it("settles with timedOut: true when no response arrives before timeoutMs", async () => {
    const child = new FakeChild();
    const result = await runMcpHarness({
      child: child as unknown as Parameters<typeof runMcpHarness>[0]["child"],
      requestId: 2,
      method: "tools/call",
      params: { name: "fake", arguments: {} },
      timeoutMs: 100,
      closeWatchdogMs: 10_000,
    });
    expect(result.timedOut).toBe(true);
    expect(result.isError).toBe(true);
    expect(result.text).toContain("Timed out");
  });
});

describe("MCP persistent session harness", () => {
  it("keeps dependent calls in one child process", async () => {
    const child = new FakeChild();
    child.stdin.write = (serialized: string) => {
      child.stdinWrites.push(serialized);
      const request = JSON.parse(serialized) as {
        id?: number;
        method: string;
        params?: { name?: string };
      };
      if (request.id === undefined) return true;
      const text =
        request.method === "initialize"
          ? undefined
          : request.params?.name === "issue-token"
            ? JSON.stringify({ recoveryToken: "fresh-token" })
            : JSON.stringify({ consumed: true });
      queueMicrotask(() => {
        child.stdout.emit(
          "data",
          `${JSON.stringify({
            jsonrpc: "2.0",
            id: request.id,
            result:
              text === undefined
                ? { protocolVersion: "2024-11-05", capabilities: {}, serverInfo: {} }
                : { content: [{ type: "text", text }], isError: false },
          })}\n`,
        );
      });
      return true;
    };

    const result = await runMcpSession({
      child: child as unknown as Parameters<typeof runMcpSession>[0]["child"],
      timeoutMs: 1_000,
      run: async ({ callTool }) => {
        const issued = await callTool("issue-token");
        const token = (JSON.parse(issued.text) as { recoveryToken: string }).recoveryToken;
        const consumed = await callTool("consume-token", { recoveryToken: token });
        return JSON.parse(consumed.text) as { consumed: boolean };
      },
    });

    expect(result).toEqual({ consumed: true });
    expect(child.stdinWrites.filter((line) => line.includes('"method":"tools/call"'))).toHaveLength(
      2,
    );
    expect(child.killCalls).toBeGreaterThanOrEqual(1);
  });
});
