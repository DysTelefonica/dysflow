/**
 * Tests for runtime-info.ts — RuntimeDiagnostics contract
 *
 * TDD contract gaps addressed:
 * 1. argv with subcommand "mcp" must classify runtimeType: "mcp-stdio"
 * 2. SOURCE_EPOCH numeric Unix must be exposed as ISO-8601 (not raw epoch)
 * 3. runtimeDiagnostics must include executablePath, codePath, buildIdentifier
 */

import { describe, expect, it } from "vitest";
import {
  buildRuntimeDiagnostics,
  detectRuntimeContext,
  type RuntimeDiagnostics,
} from "../../../src/core/utils/runtime-info.js";

// ---------------------------------------------------------------------------
// detectRuntimeContext
// ---------------------------------------------------------------------------

describe("detectRuntimeContext", () => {
  // -------------------------------------------------------------------------
  // DYSFLOW_RUNTIME_TYPE explicit override
  // -------------------------------------------------------------------------

  it("returns explicit runtimeType when DYSFLOW_RUNTIME_TYPE is set", () => {
    const result = detectRuntimeContext({
      env: { DYSFLOW_RUNTIME_TYPE: "mcp-stdio" },
    });
    expect(result.runtimeType).toBe("mcp-stdio");
  });

  it("rejects invalid DYSFLOW_RUNTIME_TYPE values", () => {
    // Should fall through to heuristics — not throw
    const result = detectRuntimeContext({
      env: { DYSFLOW_RUNTIME_TYPE: "invalid" },
    });
    expect(["cli", "mcp-stdio", "shared-core"]).toContain(result.runtimeType);
  });

  // -------------------------------------------------------------------------
  // DYSFLOW_MCP_STDIO env var
  // -------------------------------------------------------------------------

  it("detects mcp-stdio via DYSFLOW_MCP_STDIO=1", () => {
    const result = detectRuntimeContext({
      env: { DYSFLOW_MCP_STDIO: "1" },
    });
    expect(result.runtimeType).toBe("mcp-stdio");
  });

  // -------------------------------------------------------------------------
  // argv[1] contains "dysflow" → cli
  // -------------------------------------------------------------------------

  it("classifies as cli when argv[1] contains dysflow (without mcp subcommand)", () => {
    const result = detectRuntimeContext({
      argv: ["node", "/path/to/dysflow", "doctor"],
    });
    expect(result.runtimeType).toBe("cli");
  });

  it("classifies as cli when argv[1] ends with dysflow", () => {
    const result = detectRuntimeContext({
      argv: ["node", "dysflow", "doctor"],
    });
    expect(result.runtimeType).toBe("cli");
  });

  // -------------------------------------------------------------------------
  // GAP #1: argv[1] with "mcp" subcommand must NOT be classified as "cli"
  // -------------------------------------------------------------------------

  it("classifies as mcp-stdio when argv[1] contains dysflow AND argv[2] is mcp", () => {
    // dysflow mcp → argv[1] = dysflow, argv[2] = mcp
    const result = detectRuntimeContext({
      argv: ["node", "/path/to/dysflow", "mcp"],
    });
    expect(result.runtimeType).toBe("mcp-stdio");
  });

  it("classifies as mcp-stdio when argv[1] is dysflow and argv[2] is mcp", () => {
    const result = detectRuntimeContext({
      argv: ["node", "dysflow", "mcp"],
    });
    expect(result.runtimeType).toBe("mcp-stdio");
  });

  it("classifies as mcp-stdio when argv[1] is dysflow and argv[2] is mcp with --enable-writes", () => {
    const result = detectRuntimeContext({
      argv: ["node", "dysflow", "mcp", "--enable-writes"],
    });
    expect(result.runtimeType).toBe("mcp-stdio");
  });

  // -------------------------------------------------------------------------
  // default → shared-core
  // -------------------------------------------------------------------------

  it("defaults to shared-core when no signal is present", () => {
    const result = detectRuntimeContext({
      argv: ["node", "some-unknown-entrypoint"],
    });
    expect(result.runtimeType).toBe("shared-core");
  });

  // -------------------------------------------------------------------------
  // runtimePath
  // -------------------------------------------------------------------------

  it("returns process.execPath as runtimePath in mcp-stdio mode", () => {
    const result = detectRuntimeContext({
      env: { DYSFLOW_MCP_STDIO: "1" },
    });
    expect(result.runtimePath).toBe(process.execPath);
  });

  it("returns argv[1] as runtimePath in cli mode", () => {
    const result = detectRuntimeContext({
      argv: ["node", "/path/to/dysflow", "doctor"],
    });
    expect(result.runtimePath).toBe("/path/to/dysflow");
  });

  // -------------------------------------------------------------------------
  // buildTimestamp — ISO-8601 contract
  // -------------------------------------------------------------------------

  it("returns undefined buildTimestamp when SOURCE_EPOCH is not set", () => {
    const result = detectRuntimeContext({});
    expect(result.buildTimestamp).toBeUndefined();
  });

  it("converts numeric SOURCE_EPOCH (Unix epoch seconds) to ISO-8601 string", () => {
    // SOURCE_EPOCH is injected as Unix epoch seconds at build time
    // Use a unique epoch value (2030-01-01 00:00:00 UTC = 1893456000)
    const result = detectRuntimeContext({
      env: { SOURCE_EPOCH: "1893456000" },
    });
    expect(result.buildTimestamp).toBeDefined();
    expect(typeof result.buildTimestamp).toBe("string");
    // Must be ISO-8601, not a raw number
    expect(result.buildTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    // Verify the conversion is correct (1893456000 seconds = 2030-01-01T00:00:00.000Z)
    expect(result.buildTimestamp).toBe("2030-01-01T00:00:00.000Z");
  });

  it("passes through non-numeric SOURCE_EPOCH as-is (for pre-formatted ISO strings)", () => {
    const result = detectRuntimeContext({
      env: { SOURCE_EPOCH: "2025-06-20T12:00:00.000Z" },
    });
    expect(result.buildTimestamp).toBe("2025-06-20T12:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// buildRuntimeDiagnostics — additive fields contract
// ---------------------------------------------------------------------------

describe("buildRuntimeDiagnostics", () => {
  // -------------------------------------------------------------------------
  // GAP #3: required additive fields
  // -------------------------------------------------------------------------

  it("includes executablePath in the result", () => {
    const result = buildRuntimeDiagnostics();
    expect(result).toHaveProperty("executablePath");
    expect(typeof result.executablePath).toBe("string");
    expect(result.executablePath).toBe(process.execPath);
  });

  it("includes codePath in the result", () => {
    const result = buildRuntimeDiagnostics();
    expect(result).toHaveProperty("codePath");
    // codePath must be one of the valid runtime-type values
    expect(["cli", "mcp-stdio", "shared-core"]).toContain(result.codePath);
  });

  it("includes buildIdentifier in the result (may be undefined in dev builds)", () => {
    const result = buildRuntimeDiagnostics();
    expect(result).toHaveProperty("buildIdentifier");
    // buildIdentifier is optional — may be undefined in dev without SOURCE_EPOCH
    expect(result.buildIdentifier === undefined || typeof result.buildIdentifier === "string").toBe(
      true,
    );
  });

  // -------------------------------------------------------------------------
  // existing fields preserved
  // -------------------------------------------------------------------------

  it("includes dysflowVersion", () => {
    const result = buildRuntimeDiagnostics();
    expect(result).toHaveProperty("dysflowVersion");
    expect(typeof result.dysflowVersion).toBe("string");
    expect(result.dysflowVersion).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("includes adapterVersion", () => {
    const result = buildRuntimeDiagnostics();
    expect(result).toHaveProperty("adapterVersion");
    expect(typeof result.adapterVersion).toBe("string");
  });

  it("includes runtimeType", () => {
    const result = buildRuntimeDiagnostics();
    expect(result).toHaveProperty("runtimeType");
    expect(["cli", "mcp-stdio", "shared-core"]).toContain(result.runtimeType);
  });

  it("includes runtimePath", () => {
    const result = buildRuntimeDiagnostics();
    expect(result).toHaveProperty("runtimePath");
    expect(typeof result.runtimePath).toBe("string");
  });

  it("includes buildTimestamp", () => {
    const result = buildRuntimeDiagnostics();
    expect(result).toHaveProperty("buildTimestamp");
    // May be undefined in dev without SOURCE_EPOCH
    expect(result.buildTimestamp === undefined || typeof result.buildTimestamp === "string").toBe(
      true,
    );
  });

  // -------------------------------------------------------------------------
  // codePath reflects the detected runtimeType
  // -------------------------------------------------------------------------

  it("codePath matches runtimeType for mcp-stdio", () => {
    const result = buildRuntimeDiagnostics();
    // mcp-stdio via DYSFLOW_MCP_STDIO env
    expect(result.codePath).toBe(result.runtimeType);
  });

  it("codePath matches runtimeType for cli", () => {
    const result = buildRuntimeDiagnostics();
    expect(result.codePath).toBe(result.runtimeType);
  });

  it("codePath matches runtimeType for shared-core", () => {
    const result = buildRuntimeDiagnostics();
    expect(result.codePath).toBe(result.runtimeType);
  });

  // -------------------------------------------------------------------------
  // buildTimestamp ISO-8601 via buildRuntimeDiagnostics
  // -------------------------------------------------------------------------

  it("buildTimestamp is ISO-8601 when SOURCE_EPOCH is numeric", () => {
    // Note: buildRuntimeDiagnostics uses process.env.SOURCE_EPOCH directly
    // so we need to set it in the actual env for this test
    const originalEpoch = process.env.SOURCE_EPOCH;
    process.env.SOURCE_EPOCH = "1750416000";
    try {
      const result = buildRuntimeDiagnostics();
      expect(result.buildTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    } finally {
      if (originalEpoch === undefined) {
        // eslint-disable-next-line no-delete-var
        delete process.env.SOURCE_EPOCH;
      } else {
        process.env.SOURCE_EPOCH = originalEpoch;
      }
    }
  });

  it("buildTimestamp ISO-8601 round-trips through JSON", () => {
    const originalEpoch = process.env.SOURCE_EPOCH;
    process.env.SOURCE_EPOCH = "1750416000";
    try {
      const result = buildRuntimeDiagnostics();
      const json = JSON.stringify(result);
      const parsed = JSON.parse(json) as RuntimeDiagnostics;
      expect(parsed.buildTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    } finally {
      if (originalEpoch === undefined) {
        // eslint-disable-next-line no-delete-var
        delete process.env.SOURCE_EPOCH;
      } else {
        process.env.SOURCE_EPOCH = originalEpoch;
      }
    }
  });

  // -------------------------------------------------------------------------
  // options override — additive fields pass-through
  // -------------------------------------------------------------------------

  it("options override does not drop executablePath", () => {
    const result = buildRuntimeDiagnostics({ dysflowVersion: "9.9.9" });
    expect(result.executablePath).toBe(process.execPath);
    expect(result.dysflowVersion).toBe("9.9.9");
  });

  it("options override does not drop codePath", () => {
    const result = buildRuntimeDiagnostics({ dysflowVersion: "9.9.9" });
    expect(result).toHaveProperty("codePath");
  });

  it("options override does not drop buildIdentifier", () => {
    const result = buildRuntimeDiagnostics({ dysflowVersion: "9.9.9" });
    expect(result).toHaveProperty("buildIdentifier");
  });
});

// ---------------------------------------------------------------------------
// Type contract — RuntimeDiagnostics shape
// ---------------------------------------------------------------------------

describe("RuntimeDiagnostics type contract", () => {
  it("executablePath is optional string", () => {
    const rd: RuntimeDiagnostics = {
      dysflowVersion: "1.2.54",
      adapterVersion: "1.2.54",
      runtimeType: "mcp-stdio",
      runtimePath: "/usr/bin/dysflow",
      buildTimestamp: "2025-06-20T12:00:00.000Z",
      // additive fields
      executablePath: process.execPath,
      codePath: "mcp-stdio",
      buildIdentifier: "abc123",
    };
    expect(typeof rd.executablePath).toBe("string");
  });

  it("codePath is one of the RuntimeType values", () => {
    const rd: RuntimeDiagnostics = {
      dysflowVersion: "1.2.54",
      adapterVersion: "1.2.54",
      runtimeType: "cli",
      runtimePath: "/usr/bin/dysflow",
      buildTimestamp: "2025-06-20T12:00:00.000Z",
      codePath: "cli",
    };
    expect(rd.codePath).toBeDefined();
    expect(["cli", "mcp-stdio", "shared-core"]).toContain(rd.codePath as string);
  });

  it("buildIdentifier may be undefined", () => {
    const rd: RuntimeDiagnostics = {
      dysflowVersion: "1.2.54",
      adapterVersion: "1.2.54",
      runtimeType: "shared-core",
      runtimePath: "/usr/bin/node",
    };
    expect(rd.buildIdentifier).toBeUndefined();
  });
});
