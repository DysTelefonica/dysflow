import { describe, expect, it } from "vitest";
import { loadDysflowConfig, redactDysflowConfig } from "../../../src/core/config/dysflow-config";

describe("dysflow configuration", () => {
  it("resolves Access path, timeout, and redacts password from explicit input", () => {
    const result = loadDysflowConfig({
      accessDbPath: "C:/data/app.accdb",
      accessPassword: "super-secret",
      timeoutMs: 45_000,
      env: {},
    });

    expect(result).toEqual({
      ok: true,
      data: {
        accessDbPath: "C:/data/app.accdb",
        timeoutMs: 45_000,
        accessPassword: "super-secret",
      },
      diagnostics: [],
      durationMs: 0,
    });

    expect(redactDysflowConfig(result.data)).toEqual({
      accessDbPath: "C:/data/app.accdb",
      timeoutMs: 45_000,
      accessPassword: "[REDACTED]",
    });
  });

  it("resolves config from environment with safe defaults", () => {
    const result = loadDysflowConfig({
      env: {
        DYSFLOW_ACCESS_DB_PATH: "D:/fixtures/demo.accdb",
        DYSFLOW_ACCESS_PASSWORD: "env-secret",
        DYSFLOW_TIMEOUT_MS: "120000",
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected config success");
    expect(result.data).toEqual({
      accessDbPath: "D:/fixtures/demo.accdb",
      timeoutMs: 120_000,
      accessPassword: "env-secret",
    });
    expect(redactDysflowConfig(result.data).accessPassword).toBe("[REDACTED]");
  });

  it("returns a typed configuration error when Access path is missing", () => {
    const result = loadDysflowConfig({ env: {} });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "CONFIG_MISSING_ACCESS_PATH",
        message: "Access database path is required. Set DYSFLOW_ACCESS_DB_PATH or pass accessDbPath.",
        retryable: false,
      },
      diagnostics: [],
      durationMs: 0,
    });
  });

  it("falls back to the default timeout when explicit timeout is invalid", () => {
    for (const timeoutMs of [0, -1, Number.NaN]) {
      const result = loadDysflowConfig({
        accessDbPath: "C:/data/app.accdb",
        timeoutMs,
        env: {},
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected config success");
      expect(result.data.timeoutMs).toBe(30_000);
    }
  });

});
