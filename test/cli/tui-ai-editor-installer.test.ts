import { describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/index";
import { createMemoryFileSystem } from "../support/memory-file-system";

describe("dysflow TUI AI editor installer", () => {
  it("shows the MCP install option and supported editors", async () => {
    const result = await runCli(["tui"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Install Dysflow MCP into an AI editor");
    expect(result.stdout).toContain("opencode");
    expect(result.stdout).toContain("codex");
    expect(result.stdout).toContain("claude-code");
    expect(result.stdout).toContain("pi");
  });

  it("dry-runs OpenCode MCP config without writing files", async () => {
    const fs = createMemoryFileSystem();

    const result = await runCli([
      "tui",
      "install-mcp",
      "--editor",
      "opencode",
      "--home",
      "C:/Users/alice",
      "--command",
      "C:/Users/alice/AppData/Local/dysflow/bin/dysflow.cmd",
      "--dry-run",
    ], { fileSystem: fs });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("DRY-RUN");
    expect(result.stdout).toContain("C:/Users/alice/.config/opencode/opencode.json");
    expect(result.stdout).toContain('"dysflow"');
    expect(fs.files.size).toBe(0);
  });

  it("installs OpenCode MCP config idempotently", async () => {
    const fs = createMemoryFileSystem({
      "C:/Users/alice/.config/opencode/opencode.json": JSON.stringify({ mcp: { context7: { type: "remote", url: "https://mcp.context7.com/mcp" } } }, null, 2),
    });

    const args = [
      "tui",
      "install-mcp",
      "--editor",
      "opencode",
      "--home",
      "C:/Users/alice",
      "--command",
      "C:/Users/alice/AppData/Local/dysflow/bin/dysflow.cmd",
    ];

    const first = await runCli(args, { fileSystem: fs });
    const second = await runCli(args, { fileSystem: fs });

    expect(first.stdout).toContain("updated");
    expect(second.stdout).toContain("already configured");

    const config = JSON.parse(fs.files.get("C:/Users/alice/.config/opencode/opencode.json") ?? "{}");
    expect(config.mcp.context7.url).toBe("https://mcp.context7.com/mcp");
    expect(config.mcp.dysflow).toEqual({
      command: ["C:/Users/alice/AppData/Local/dysflow/bin/dysflow.cmd", "mcp"],
      type: "local",
    });
  });

  it("installs Codex MCP config into config.toml", async () => {
    const fs = createMemoryFileSystem({
      "C:/Users/alice/.codex/config.toml": "model = \"gpt-5.4\"\n",
    });

    const result = await runCli([
      "tui",
      "install-mcp",
      "--editor",
      "codex",
      "--home",
      "C:/Users/alice",
      "--command",
      "C:/Users/alice/AppData/Local/dysflow/bin/dysflow.cmd",
    ], { fileSystem: fs });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("updated");
    expect(fs.files.get("C:/Users/alice/.codex/config.toml")).toContain('[mcp_servers.dysflow]');
    expect(fs.files.get("C:/Users/alice/.codex/config.toml")).toContain('command = "C:/Users/alice/AppData/Local/dysflow/bin/dysflow.cmd"');
    expect(fs.files.get("C:/Users/alice/.codex/config.toml")).toContain('args = ["mcp"]');
  });

  it("returns planned/manual instructions for supported editors without safe writer yet", async () => {
    const fs = createMemoryFileSystem();

    const result = await runCli([
      "tui",
      "install-mcp",
      "--editor",
      "pi",
      "--home",
      "C:/Users/alice",
      "--command",
      "C:/Users/alice/AppData/Local/dysflow/bin/dysflow.cmd",
      "--dry-run",
    ], { fileSystem: fs });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Pi");
    expect(result.stdout).toContain("manual verification required");
    expect(result.stdout).toContain("C:/Users/alice/.pi/agent/mcp.json");
  });
});
