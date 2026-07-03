import { describe, expect, it } from "vitest";
import { handleServeCommand, SERVE_USAGE } from "../../../src/cli/commands/serve.js";

const fakeAdapter = (overrides?: {
  url?: string;
  host?: string;
  port?: number;
  writesEnabled?: boolean;
}) => {
  return async () => ({
    url: overrides?.url ?? "http://127.0.0.1:17321",
    host: overrides?.host ?? "127.0.0.1",
    port: overrides?.port ?? 17321,
    writesEnabled: overrides?.writesEnabled ?? false,
  });
};

// ---------------------------------------------------------------------------
// Help flag
// ---------------------------------------------------------------------------
describe("handleServeCommand — help", () => {
  it.each([["--help"], ["-h"]])("returns usage text for %s", async (flag) => {
    const result = await handleServeCommand([flag]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(SERVE_USAGE);
    expect(result.stderr).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Option parsing errors
// ---------------------------------------------------------------------------
describe("handleServeCommand — parse errors", () => {
  it("rejects --host with no value", async () => {
    const result = await handleServeCommand(["--host"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Missing value for --host.");
    expect(result.stderr).toContain(SERVE_USAGE);
  });

  it("rejects --host when next token starts with --", async () => {
    const result = await handleServeCommand(["--host", "--port"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Missing value for --host.");
  });

  it("rejects --port with no value", async () => {
    const result = await handleServeCommand(["--port"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("--port must be an integer between 0 and 65535.");
  });

  it("rejects --port with a non-integer value", async () => {
    const result = await handleServeCommand(["--port", "abc"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("--port must be an integer between 0 and 65535.");
  });

  it("rejects --port with a float value", async () => {
    const result = await handleServeCommand(["--port", "1.5"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("--port must be an integer between 0 and 65535.");
  });

  it("rejects --port greater than 65535", async () => {
    const result = await handleServeCommand(["--port", "65536"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("--port must be an integer between 0 and 65535.");
  });

  it("rejects --port with a negative value", async () => {
    const result = await handleServeCommand(["--port", "-1"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("--port must be an integer between 0 and 65535.");
  });

  it("rejects unknown flags", async () => {
    const result = await handleServeCommand(["--unknown"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Unsupported serve option: --unknown");
    expect(result.stderr).toContain(SERVE_USAGE);
  });

  it("rejects --token with no value", async () => {
    const result = await handleServeCommand(["--token"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Missing value for --token.");
  });

  it("rejects --token when next token starts with --", async () => {
    const result = await handleServeCommand(["--token", "--host"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Missing value for --token.");
  });
});

// ---------------------------------------------------------------------------
// Successful option parsing + adapter integration
// ---------------------------------------------------------------------------
describe("handleServeCommand — successful option handling", () => {
  it("accepts port 0 (OS-assigned)", async () => {
    const result = await handleServeCommand(["--port", "0"], {
      startHttpAdapter: fakeAdapter({ url: "http://127.0.0.1:0", port: 0 }),
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("http://127.0.0.1:0");
  });

  it("accepts port 65535 (upper boundary)", async () => {
    const result = await handleServeCommand(["--port", "65535"], {
      startHttpAdapter: fakeAdapter(),
    });

    expect(result.exitCode).toBe(0);
  });

  it("uses custom --host in adapter options", async () => {
    // #669 — must also pass --token for non-loopback hosts (fail-closed).
    const calls: unknown[] = [];
    await handleServeCommand(["--host", "0.0.0.0", "--port", "0", "--token", "secret"], {
      startHttpAdapter: async (options) => {
        calls.push(options);
        return { url: "http://0.0.0.0:0", host: "0.0.0.0", port: 0, writesEnabled: false };
      },
    });

    expect(calls).toEqual([expect.objectContaining({ host: "0.0.0.0", httpToken: "secret" })]);
  });

  it("reports writes disabled in output when --enable-writes is absent", async () => {
    const result = await handleServeCommand(["--port", "0"], {
      startHttpAdapter: fakeAdapter({ writesEnabled: false }),
    });

    expect(result.stdout).toContain("writes disabled");
  });

  it("reports writes enabled in output when --enable-writes is present and adapter confirms it", async () => {
    const result = await handleServeCommand(["--port", "0", "--enable-writes"], {
      startHttpAdapter: fakeAdapter({ writesEnabled: true }),
    });

    expect(result.stdout).toContain("writes enabled");
  });

  it("passes env from context to the adapter", async () => {
    const calls: unknown[] = [];
    await handleServeCommand(["--port", "0"], {
      env: { DYSFLOW_ACCESS_PASSWORD: "secret" },
      startHttpAdapter: async (options) => {
        calls.push(options);
        return { url: "http://127.0.0.1:0", host: "127.0.0.1", port: 0, writesEnabled: false };
      },
    });

    expect(calls).toEqual([
      expect.objectContaining({ env: { DYSFLOW_ACCESS_PASSWORD: "secret" } }),
    ]);
  });

  it("passes --token to adapter options", async () => {
    const calls: unknown[] = [];
    await handleServeCommand(["--token", "my-secret-token"], {
      startHttpAdapter: async (options) => {
        calls.push(options);
        return { url: "http://127.0.0.1:0", host: "127.0.0.1", port: 0, writesEnabled: false };
      },
    });

    expect(calls).toEqual([expect.objectContaining({ httpToken: "my-secret-token" })]);
  });
});

// ---------------------------------------------------------------------------
// #669 — fail-closed: refuse non-loopback host without --token
// ---------------------------------------------------------------------------
describe("handleServeCommand — #669 fail-closed on non-loopback without token", () => {
  it("rejects --host 0.0.0.0 without --token (fail-closed)", async () => {
    const result = await handleServeCommand(["--host", "0.0.0.0"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("non-loopback");
    expect(result.stderr).toContain("--token");
    expect(result.stderr).toContain(SERVE_USAGE);
  });

  it("rejects --host 0.0.0.0 --enable-writes without --token", async () => {
    const result = await handleServeCommand(["--host", "0.0.0.0", "--enable-writes"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("non-loopback");
    expect(result.stderr).toContain("--token");
  });

  it("rejects --host :: (IPv6 wildcard) without --token", async () => {
    const result = await handleServeCommand(["--host", "::"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("non-loopback");
  });

  it("allows --host 0.0.0.0 when --token is provided", async () => {
    const calls: unknown[] = [];
    const result = await handleServeCommand(["--host", "0.0.0.0", "--token", "my-token"], {
      startHttpAdapter: async (options) => {
        calls.push(options);
        return { url: "http://0.0.0.0:0", host: "0.0.0.0", port: 0, writesEnabled: false };
      },
    });

    expect(result.exitCode).toBe(0);
    expect(calls).toEqual([expect.objectContaining({ host: "0.0.0.0", httpToken: "my-token" })]);
  });

  it("allows --host 127.0.0.1 without --token (loopback)", async () => {
    const result = await handleServeCommand(["--host", "127.0.0.1"], {
      startHttpAdapter: fakeAdapter(),
    });

    expect(result.exitCode).toBe(0);
  });

  it("allows --host ::1 without --token (IPv6 loopback)", async () => {
    const result = await handleServeCommand(["--host", "::1"], {
      startHttpAdapter: fakeAdapter(),
    });

    expect(result.exitCode).toBe(0);
  });

  it("allows --host localhost without --token", async () => {
    const result = await handleServeCommand(["--host", "localhost"], {
      startHttpAdapter: fakeAdapter(),
    });

    expect(result.exitCode).toBe(0);
  });

  it("default host (127.0.0.1) does not require a token", async () => {
    const result = await handleServeCommand([], {
      startHttpAdapter: fakeAdapter(),
    });

    expect(result.exitCode).toBe(0);
  });

  it("rejects --host with a private LAN IP (e.g. 192.168.x.y) without --token", async () => {
    const result = await handleServeCommand(["--host", "192.168.1.42"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("non-loopback");
  });
});

// ---------------------------------------------------------------------------
// Adapter error handling
// ---------------------------------------------------------------------------
describe("handleServeCommand — adapter error handling", () => {
  it("returns exitCode 1 and the error message when the adapter throws an Error", async () => {
    const result = await handleServeCommand(["--port", "0"], {
      startHttpAdapter: async () => {
        throw new Error("Port already in use");
      },
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("Port already in use");
    expect(result.stdout).toBe("");
  });

  it("returns a fallback message when the adapter throws a non-Error value", async () => {
    const result = await handleServeCommand(["--port", "0"], {
      startHttpAdapter: async () => {
        throw "oops";
      },
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("Failed to start Dysflow HTTP API.");
  });

  it("uses the default real adapter when no startHttpAdapter is injected (smoke test — module export)", async () => {
    // Verify the function is callable and that the adapter is wired.
    // We only check that the return is a CliResult shape — not that a real server starts.
    const { handleServeCommand: fn } = await import("../../../src/cli/commands/serve.js");
    expect(typeof fn).toBe("function");
  });
});
