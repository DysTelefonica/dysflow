import { afterEach, describe, expect, it, vi } from "vitest";
import { setupProcessHandlers } from "../../src/cli/index.js";

describe("setupProcessHandlers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function captureHandlers() {
    const captured = new Map<string, (...args: unknown[]) => void>();
    vi.spyOn(process, "on").mockImplementation(
      (event: string | symbol, handler: (...args: unknown[]) => void) => {
        captured.set(String(event), handler);
        return process;
      },
    );
    setupProcessHandlers();
    return captured;
  }

  it("registers an unhandledRejection handler that writes to stderr and exits 1", () => {
    const chunks: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
      chunks.push(String(chunk));
      return true;
    });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    const handlers = captureHandlers();
    handlers.get("unhandledRejection")?.(new Error("boom"), Promise.resolve());

    expect(chunks.some((c) => c.includes("[dysflow]"))).toBe(true);
    expect(chunks.some((c) => c.includes("boom"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("registers an uncaughtException handler that writes to stderr and exits 1", () => {
    const chunks: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
      chunks.push(String(chunk));
      return true;
    });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    const handlers = captureHandlers();
    handlers.get("uncaughtException")?.(new Error("fatal error"));

    expect(chunks.some((c) => c.includes("[dysflow]"))).toBe(true);
    expect(chunks.some((c) => c.includes("fatal error"))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("handles non-Error rejection reason without throwing", () => {
    const chunks: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
      chunks.push(String(chunk));
      return true;
    });
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    const handlers = captureHandlers();
    handlers.get("unhandledRejection")?.("plain string reason", Promise.resolve());

    expect(chunks.some((c) => c.includes("plain string reason"))).toBe(true);
  });
});
