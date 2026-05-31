import { describe, expect, it } from "vitest";
import {
  checkOpencodeWiring,
  type OpencodeMcpWiringOptions,
} from "../../../src/cli/commands/opencode-mcp-wiring.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOptions(overrides: Partial<OpencodeMcpWiringOptions> = {}): OpencodeMcpWiringOptions {
  return {
    globalConfigPath: "/home/user/.config/opencode/opencode.json",
    projectConfigPath: "/project/opencode.json",
    readJsonFile: async () => ({}),
    existsSync: () => true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Absent dysflow block — silent pass
// ---------------------------------------------------------------------------

describe("checkOpencodeWiring — absent dysflow block", () => {
  it("returns no warning when global config has no mcp.dysflow entry", async () => {
    const result = await checkOpencodeWiring(
      makeOptions({
        readJsonFile: async () => ({ mcp: { other: { command: ["node", "other.js"] } } }),
      }),
    );

    expect(result).toBeNull();
  });

  it("returns no warning when both configs are missing", async () => {
    const result = await checkOpencodeWiring(
      makeOptions({
        readJsonFile: async () => ({}),
      }),
    );

    expect(result).toBeNull();
  });

  it("returns no warning when project config has no mcp section", async () => {
    const result = await checkOpencodeWiring(
      makeOptions({
        readJsonFile: async (filePath) => {
          if (filePath.endsWith("opencode.json") && filePath.startsWith("/project")) {
            return {};
          }
          return {};
        },
      }),
    );

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Healthy wiring — no warning
// ---------------------------------------------------------------------------

describe("checkOpencodeWiring — healthy command", () => {
  it("returns no warning when node command script exists", async () => {
    const result = await checkOpencodeWiring(
      makeOptions({
        readJsonFile: async () => ({
          mcp: { dysflow: { command: ["node", "/runtime/app/dist/cli/index.js", "mcp"] } },
        }),
        existsSync: (p) => p === "/runtime/app/dist/cli/index.js",
      }),
    );

    expect(result).toBeNull();
  });

  it("returns no warning when .cmd shim exists", async () => {
    const result = await checkOpencodeWiring(
      makeOptions({
        readJsonFile: async () => ({
          mcp: {
            dysflow: { command: ["C:/Users/user/AppData/Local/dysflow/bin/dysflow.cmd", "mcp"] },
          },
        }),
        existsSync: (p) => p === "C:/Users/user/AppData/Local/dysflow/bin/dysflow.cmd",
      }),
    );

    expect(result).toBeNull();
  });

  it("returns no warning when node.exe is used and the script exists", async () => {
    const result = await checkOpencodeWiring(
      makeOptions({
        readJsonFile: async () => ({
          mcp: { dysflow: { command: ["node.exe", "/runtime/app/dist/cli/index.js", "mcp"] } },
        }),
        existsSync: (p) => p === "/runtime/app/dist/cli/index.js",
      }),
    );

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Dead entrypoint — warning
// ---------------------------------------------------------------------------

describe("checkOpencodeWiring — dead entrypoint", () => {
  it("returns a warning when node command script does NOT exist (global config)", async () => {
    const result = await checkOpencodeWiring(
      makeOptions({
        globalConfigPath: "/home/user/.config/opencode/opencode.json",
        projectConfigPath: "/project/opencode.json",
        readJsonFile: async (filePath) => {
          if (filePath === "/home/user/.config/opencode/opencode.json") {
            return {
              mcp: { dysflow: { command: ["node", "/old/path/mcp.js", "mcp"] } },
            };
          }
          return {};
        },
        existsSync: () => false,
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.ok).toBe(false);
    expect(result?.message).toContain("/old/path/mcp.js");
    expect(result?.message).toContain("/home/user/.config/opencode/opencode.json");
  });

  it("returns a warning when .cmd shim does NOT exist (project config)", async () => {
    const result = await checkOpencodeWiring(
      makeOptions({
        globalConfigPath: "/home/user/.config/opencode/opencode.json",
        projectConfigPath: "/project/opencode.json",
        readJsonFile: async (filePath) => {
          if (filePath === "/project/opencode.json") {
            return {
              mcp: {
                dysflow: {
                  command: ["C:/old/skills/dysflow/mcp.js"],
                },
              },
            };
          }
          return {};
        },
        existsSync: () => false,
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.ok).toBe(false);
    expect(result?.message).toContain("C:/old/skills/dysflow/mcp.js");
    expect(result?.message).toContain("/project/opencode.json");
  });

  it("project-local config wins over global when both define dysflow mcp", async () => {
    // Global has healthy config, project-local has dead config → warning from project-local
    const result = await checkOpencodeWiring(
      makeOptions({
        globalConfigPath: "/home/user/.config/opencode/opencode.json",
        projectConfigPath: "/project/opencode.json",
        readJsonFile: async (filePath) => {
          if (filePath === "/home/user/.config/opencode/opencode.json") {
            return {
              mcp: {
                dysflow: { command: ["node", "/runtime/dist/cli/index.js", "mcp"] },
              },
            };
          }
          if (filePath === "/project/opencode.json") {
            return {
              mcp: {
                dysflow: { command: ["node", "/dead/path/mcp.js", "mcp"] },
              },
            };
          }
          return {};
        },
        existsSync: (p) => p === "/runtime/dist/cli/index.js",
      }),
    );

    // Project-local overrides global, dead path found → warning
    expect(result).not.toBeNull();
    expect(result?.ok).toBe(false);
    expect(result?.message).toContain("/dead/path/mcp.js");
    expect(result?.message).toContain("/project/opencode.json");
  });

  it("uses global config when project-local does NOT define dysflow mcp", async () => {
    // Global has dead config, project-local has no dysflow block → warning from global
    const result = await checkOpencodeWiring(
      makeOptions({
        globalConfigPath: "/home/user/.config/opencode/opencode.json",
        projectConfigPath: "/project/opencode.json",
        readJsonFile: async (filePath) => {
          if (filePath === "/home/user/.config/opencode/opencode.json") {
            return {
              mcp: { dysflow: { command: ["node", "/dead/global/mcp.js", "mcp"] } },
            };
          }
          return {};
        },
        existsSync: () => false,
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.ok).toBe(false);
    expect(result?.message).toContain("/dead/global/mcp.js");
    expect(result?.message).toContain("/home/user/.config/opencode/opencode.json");
  });

  it("includes the name field for the check", async () => {
    const result = await checkOpencodeWiring(
      makeOptions({
        readJsonFile: async () => ({
          mcp: { dysflow: { command: ["node", "/missing/mcp.js"] } },
        }),
        existsSync: () => false,
      }),
    );

    expect(result?.name).toBe("opencode-mcp-wiring");
  });
});

// ---------------------------------------------------------------------------
// doctor integration — warn-only (exit code must NOT be flipped)
// ---------------------------------------------------------------------------

describe("checkOpencodeWiring — warn-only semantics", () => {
  it("warning check has ok: false but is annotated as warn-only", async () => {
    const result = await checkOpencodeWiring(
      makeOptions({
        readJsonFile: async () => ({
          mcp: { dysflow: { command: ["node", "/dead/path.js"] } },
        }),
        existsSync: () => false,
      }),
    );

    expect(result?.ok).toBe(false);
    expect(result?.warnOnly).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Drift detection — project-local command diverges from global
// ---------------------------------------------------------------------------

describe("checkOpencodeWiring — drift detection", () => {
  it("emits a drift warning when project-local command differs from global (both entrypoints exist)", async () => {
    const result = await checkOpencodeWiring(
      makeOptions({
        globalConfigPath: "/home/user/.config/opencode/opencode.json",
        projectConfigPath: "/project/opencode.json",
        readJsonFile: async (filePath) => {
          if (filePath === "/home/user/.config/opencode/opencode.json") {
            return {
              mcp: {
                dysflow: { command: ["node", "/runtime/dist/cli/index.js", "mcp"] },
              },
            };
          }
          if (filePath === "/project/opencode.json") {
            return {
              mcp: {
                dysflow: { command: ["node", "/old/path/index.js", "mcp"] },
              },
            };
          }
          return {};
        },
        // Both entrypoints exist so dead-path does NOT fire.
        existsSync: () => true,
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.ok).toBe(false);
    expect(result?.warnOnly).toBe(true);
    expect(result?.name).toBe("opencode-mcp-wiring");
    // Must mention both config file paths.
    expect(result?.message).toContain("/home/user/.config/opencode/opencode.json");
    expect(result?.message).toContain("/project/opencode.json");
    // Must show the global (expected) command.
    expect(result?.message).toContain("/runtime/dist/cli/index.js");
    // Must show the local (found) command.
    expect(result?.message).toContain("/old/path/index.js");
  });

  it("returns null when project-local command is identical to global (aligned — no warning)", async () => {
    const sharedCommand = ["node", "/runtime/dist/cli/index.js", "mcp"];
    const result = await checkOpencodeWiring(
      makeOptions({
        globalConfigPath: "/home/user/.config/opencode/opencode.json",
        projectConfigPath: "/project/opencode.json",
        readJsonFile: async () => ({
          mcp: { dysflow: { command: sharedCommand } },
        }),
        existsSync: () => true,
      }),
    );

    expect(result).toBeNull();
  });

  it("emits a drift warning when project-local defines a dysflow command but global has none", async () => {
    const result = await checkOpencodeWiring(
      makeOptions({
        globalConfigPath: "/home/user/.config/opencode/opencode.json",
        projectConfigPath: "/project/opencode.json",
        readJsonFile: async (filePath) => {
          if (filePath === "/project/opencode.json") {
            return {
              mcp: {
                dysflow: { command: ["node", "/local/only/index.js", "mcp"] },
              },
            };
          }
          // Global has no dysflow block.
          return {};
        },
        existsSync: () => true,
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.ok).toBe(false);
    expect(result?.warnOnly).toBe(true);
    expect(result?.message).toContain("/project/opencode.json");
    expect(result?.message).toContain("/local/only/index.js");
  });

  it("dead entrypoint takes precedence over drift (missing effective entrypoint → dead-path warning, not drift)", async () => {
    const result = await checkOpencodeWiring(
      makeOptions({
        globalConfigPath: "/home/user/.config/opencode/opencode.json",
        projectConfigPath: "/project/opencode.json",
        readJsonFile: async (filePath) => {
          if (filePath === "/home/user/.config/opencode/opencode.json") {
            return {
              mcp: {
                dysflow: { command: ["node", "/runtime/dist/cli/index.js", "mcp"] },
              },
            };
          }
          if (filePath === "/project/opencode.json") {
            return {
              mcp: {
                dysflow: { command: ["node", "/dead/local/index.js", "mcp"] },
              },
            };
          }
          return {};
        },
        // Effective entrypoint (project-local) does NOT exist → dead-path fires.
        existsSync: () => false,
      }),
    );

    expect(result).not.toBeNull();
    expect(result?.ok).toBe(false);
    // The message must reference the dead entrypoint — this is the existing dead-path warning.
    expect(result?.message).toContain("/dead/local/index.js");
    // Must NOT be a drift message (drift message references global command too).
    expect(result?.message).not.toContain("/runtime/dist/cli/index.js");
  });
});
