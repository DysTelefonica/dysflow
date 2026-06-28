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
import { runMcpHarness } from "../../E2E_testing/_helpers/mcp-harness.mjs";

class FakeChild extends EventEmitter {
  stdin = new EventEmitter() as EventEmitter & { end: () => void; write: (s: string) => void };
  stdout = new EventEmitter() as EventEmitter;
  stderr = new EventEmitter() as EventEmitter;
  pid = 4242;
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
