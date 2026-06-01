import { describe, expect, it } from "vitest";
import { handleTuiCommand } from "../../../src/cli/commands/tui";

describe("handleTuiCommand", () => {
  it("applies integration selection when tuiSelectedAgents context is provided", async () => {
    const result = await handleTuiCommand([], {
      tuiSelectedAgents: ["opencode"],
      tuiApplyIntegrationSelection: async () => ({ exitCode: 0, stdout: "FAKE_APPLY", stderr: "" }),
    });
    expect(result.stdout).toBe("FAKE_APPLY");
  });

  it("delegates to handleInstallCommand when arguments are provided", async () => {
    const result = await handleTuiCommand(["--runtime-dir", "/tmp"], {
      tuiHandleInstall: async () => ({ exitCode: 0, stdout: "FAKE_INSTALL", stderr: "" }),
    });
    expect(result.stdout).toBe("FAKE_INSTALL");
  });

  it("renders dashboard and exits directly when interactive is false", async () => {
    const result = await handleTuiCommand([], {
      tuiInteractive: false,
      localVersion: "0.9.0",
      latestVersion: "0.9.0",
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("D Y S F L O W");
    expect(result.stdout).toContain("local: 0.9.0");
  });

  it("exits the dashboard loop immediately when 'q' key is pressed", async () => {
    const frames: string[] = [];
    const result = await handleTuiCommand([], {
      tuiInteractive: true,
      readTuiKey: async () => "q",
      writeTuiFrame: (frame) => frames.push(frame),
    });
    expect(result.exitCode).toBe(0);
    expect(frames).toHaveLength(1);
  });

  it("navigates the cursor with up/down arrows and exits on q in integration loop", async () => {
    const frames: string[] = [];
    const keys: Array<"enter" | "down" | "up" | "q"> = ["enter", "down", "up", "q"];
    const result = await handleTuiCommand([], {
      tuiInteractive: true,
      readTuiKey: async () => keys.shift() ?? "q",
      writeTuiFrame: (frame) => frames.push(frame),
    });
    expect(result.exitCode).toBe(0);
    expect(frames.some((frame) => frame.includes("Select Dysflow MCP integrations"))).toBe(true);
  });

  it("toggles and applies integration selection on Space and Enter in integration loop", async () => {
    const frames: string[] = [];
    const keys: Array<"enter" | "space" | "enter"> = ["enter", "space", "enter"];
    const result = await handleTuiCommand([], {
      tuiInteractive: true,
      readTuiKey: async () => keys.shift() ?? "enter",
      writeTuiFrame: (frame) => frames.push(frame),
      tuiApplyIntegrationSelection: async () => ({ exitCode: 0, stdout: "FAKE_APPLY", stderr: "" }),
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("FAKE_APPLY");
  });
});
