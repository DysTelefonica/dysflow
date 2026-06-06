import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";

const mockCreateInterface = vi.fn();
vi.mock("node:readline/promises", () => ({
  createInterface: (...args: unknown[]) => mockCreateInterface(...args),
}));

const execFileMock = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

execFileMock.mockImplementation((_file, _args, options, callback) => {
  const cb = typeof options === "function" ? options : callback;
  if (cb) {
    queueMicrotask(() => cb(null, { stdout: "", stderr: "" }));
  }
});

import {
  applyIntegrationSelection,
  createGitHubReleaseRequestHeaders,
  createGitHubReleaseUpdateProvider,
  formatAgentsLine,
  handleInstallCommand,
  handleUpdateCommand,
  hasDysflowMcpConfig,
  MAX_PACKAGE_ROOT_DEPTH,
  MAX_SUBPROCESS_BUFFER_BYTES,
  parseAgentList,
  parseInstallArgs,
  parseUpdateArgs,
  removeDysflowMcpConfig,
  replaceCodexMcpSection,
  resolvePackageRoot,
  validateReleaseTagName,
  writeRuntimeLaunchers,
} from "../../src/cli/commands/install";
import { compareVersions } from "../../src/core/utils/version";

const readJson = async (path: string): Promise<Record<string, unknown>> => {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
};

const expectedOpenCodeCommand = (runtimeDir: string): string[] => [
  join(runtimeDir, "bin", "dysflow.cmd").replaceAll("\\", "/"),
  "mcp",
];

const expectRuntimeLauncherCommand = (command: unknown): void => {
  expect(command).toEqual(expect.any(Array));
  expect((command as string[])[0].toLowerCase()).toMatch(/dysflow\.cmd$/);
};

const getLocalDysflowVersion = async (): Promise<string> => {
  const sourcePackage = await readFile(join(process.cwd(), "package.json"), "utf8");
  const parsed = JSON.parse(sourcePackage) as { version?: string };
  return parsed.version ?? "0.1.0";
};

async function createPackageRoot(root: string, version: string, marker: string): Promise<string> {
  const packageRoot = join(root, `package-${version}`);
  const distCli = join(packageRoot, "dist", "cli");
  const scriptsDir = join(packageRoot, "scripts");
  await mkdir(distCli, { recursive: true });
  await mkdir(scriptsDir, { recursive: true });
  await writeFile(join(distCli, "index.js"), marker, "utf8");
  await writeFile(join(scriptsDir, "dysflow-vba-manager.ps1"), `${marker}_VBA_MANAGER`, "utf8");
  await writeFile(join(scriptsDir, "dysflow-access-runner.ps1"), `${marker}_ACCESS_RUNNER`, "utf8");
  await writeFile(
    join(packageRoot, "package.json"),
    JSON.stringify({ name: "dysflow", version, type: "module" }, null, 2),
    "utf8",
  );
  return packageRoot;
}

describe("install arg parsing", () => {
  it("rejects release tags that are not exact semantic version tags", () => {
    expect(validateReleaseTagName("v1.2.3")).toBe("v1.2.3");
    expect(() => validateReleaseTagName("v1.2.3;calc")).toThrow("Invalid Dysflow release tag");
    expect(() => validateReleaseTagName("main")).toThrow("Invalid Dysflow release tag");
  });

  it("adds GitHub authorization headers for release lookup when a token is available", () => {
    expect(createGitHubReleaseRequestHeaders({ GH_TOKEN: "secret-token" })).toEqual({
      Accept: "application/vnd.github+json",
      Authorization: "Bearer secret-token",
      "User-Agent": "dysflow-updater",
    });
  });

  it("parses known agents from --agents", () => {
    expect(parseAgentList("codex,opencode")).toEqual({
      ok: true,
      agents: ["codex", "opencode"],
    });
  });

  it("deduplicates requested agents", () => {
    expect(parseAgentList("codex,codex,pi")).toEqual({
      ok: true,
      agents: ["codex", "pi"],
    });
  });

  it("rejects unknown agents", () => {
    expect(parseAgentList("codex,unknown")).toEqual({
      ok: false,
      message: "Unknown agent(s): unknown.",
    });
  });

  it("parses install arguments", () => {
    expect(
      parseInstallArgs(["--runtime-dir", "C:/tmp/runtime", "--agent-all", "--no-tui"]),
    ).toEqual({
      ok: true,
      options: {
        runtimeDir: "C:/tmp/runtime",
        agentNames: ["codex", "opencode", "claude", "pi"],
        interactive: false,
      },
    });
  });

  it("parses update arguments", () => {
    expect(parseUpdateArgs(["--runtime-dir", "C:/tmp/runtime", "--force"])).toEqual({
      ok: true,
      options: {
        runtimeDir: "C:/tmp/runtime",
        force: true,
        skipChecksum: false,
      },
    });
  });

  it("compares semantic versions", () => {
    expect(compareVersions("0.1.0", "0.0.9")).toBe(1);
    expect(compareVersions("0.0.9", "0.1.0")).toBe(-1);
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
  });

  it("names package-root traversal and subprocess buffer limits", () => {
    expect(MAX_PACKAGE_ROOT_DEPTH).toBe(12);
    expect(MAX_SUBPROCESS_BUFFER_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe("codex toml serialization", () => {
  it("adds dysflow MCP section when missing", () => {
    const original = '[other]\ncommand = "echo"\n';
    const updated = replaceCodexMcpSection(original, "C:/dysflow/bin/dysflow.cmd");

    expect(updated).toContain("[mcp_servers.dysflow]");
    expect(updated).toContain("command = 'C:/dysflow/bin/dysflow.cmd'");
    expect(updated).toContain('args = ["mcp"]');
  });

  it("replaces existing dysflow section", () => {
    const original = [
      "[mcp_servers.dysflow]",
      "command = 'old'",
      'args = ["old"]',
      "startup_timeout_sec = 10.0",
      "",
      "[mcp_servers.other]",
      "command = 'x'",
      "",
    ].join("\n");

    const updated = replaceCodexMcpSection(original, "C:/dysflow/bin/dysflow.cmd");

    expect(updated).toContain("[mcp_servers.other]");
    expect(updated).toContain("command = 'C:/dysflow/bin/dysflow.cmd'");
    expect(updated).not.toContain("command = 'old'");
  });
});

describe("Dysflow MCP config state", () => {
  it("detects and removes only Dysflow MCP entries while preserving unrelated config", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-config-state-"));
    try {
      const codexConfig = join(root, "codex.toml");
      await writeFile(
        codexConfig,
        [
          "[mcp_servers.other]",
          "command = 'other'",
          "",
          "[mcp_servers.dysflow]",
          "command = 'C:/dysflow/bin/dysflow.cmd'",
          'args = ["mcp"]',
          "startup_timeout_sec = 60.0",
          "",
        ].join("\n"),
        "utf8",
      );

      const jsonConfig = join(root, "opencode.json");
      await writeFile(
        jsonConfig,
        `${JSON.stringify({ mcp: { other: { type: "remote", url: "https://example.test" }, dysflow: { enabled: true, type: "local", command: ["C:/dysflow/bin/dysflow.cmd", "mcp"] } } }, null, 2)}\n`,
        "utf8",
      );

      expect(await hasDysflowMcpConfig("codex", codexConfig)).toBe(true);
      expect(await hasDysflowMcpConfig("opencode", jsonConfig)).toBe(true);

      await removeDysflowMcpConfig("codex", codexConfig);
      await removeDysflowMcpConfig("opencode", jsonConfig);

      expect(await hasDysflowMcpConfig("codex", codexConfig)).toBe(false);
      expect(await readFile(codexConfig, "utf8")).toContain("[mcp_servers.other]");

      const updatedJson = await readJson(jsonConfig);
      expect((updatedJson.mcp as Record<string, unknown>).other).toEqual({
        type: "remote",
        url: "https://example.test",
      });
      expect((updatedJson.mcp as Record<string, unknown>).dysflow).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not create config files when removing absent Dysflow entries", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-config-absent-"));
    try {
      const missingCodex = join(root, "missing-codex.toml");
      const missingOpenCode = join(root, "missing-opencode.json");

      await removeDysflowMcpConfig("codex", missingCodex);
      await removeDysflowMcpConfig("opencode", missingOpenCode);

      await expect(access(missingCodex)).rejects.toThrow();
      await expect(access(missingOpenCode)).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("removes nested Codex Dysflow tables with the parent section", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-codex-nested-"));
    try {
      const codexConfig = join(root, "config.toml");
      await writeFile(
        codexConfig,
        [
          "[mcp_servers.dysflow]",
          "command = 'C:/dysflow/bin/dysflow.cmd'",
          "[mcp_servers.dysflow.env]",
          "DYSFLOW_HOME = 'C:/Users/me/AppData/Local/dysflow'",
          "[mcp_servers.other]",
          "command = 'other'",
          "",
        ].join("\n"),
        "utf8",
      );

      await removeDysflowMcpConfig("codex", codexConfig);

      const updated = await readFile(codexConfig, "utf8");
      expect(updated).not.toContain("mcp_servers.dysflow");
      expect(updated).toContain("[mcp_servers.other]");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("applies selected integrations and removes unselected Dysflow entries", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-apply-selection-"));
    const home = join(root, "home");
    const runtimeDir = join(root, "runtime");
    const packageRoot = join(root, "package");
    const distCli = join(packageRoot, "dist", "cli");
    const codexConfig = join(home, ".codex", "config.toml");
    const opencodeConfig = join(home, ".config", "opencode", "opencode.json");
    const claudeDesktopConfig = join(
      home,
      "AppData",
      "Roaming",
      "Claude",
      "claude_desktop_config.json",
    );

    try {
      await mkdir(distCli, { recursive: true });
      await writeFile(join(distCli, "index.js"), "runCli", "utf8");
      await writeFile(
        join(packageRoot, "package.json"),
        '{"name":"dysflow","version":"0.2.0"}\n',
        "utf8",
      );
      await mkdir(join(home, ".codex"), { recursive: true });
      await writeFile(codexConfig, "[mcp_servers.dysflow]\ncommand = 'old'\n", "utf8");
      await mkdir(join(home, ".config", "opencode"), { recursive: true });
      await writeFile(
        opencodeConfig,
        `${JSON.stringify({ mcp: { other: { type: "remote", url: "https://example.test" } } }, null, 2)}\n`,
        "utf8",
      );
      await mkdir(join(home, "AppData", "Roaming", "Claude"), {
        recursive: true,
      });
      await writeFile(
        claudeDesktopConfig,
        `${JSON.stringify({ mcpServers: { other: { command: "other" }, dysflow: { command: "old", args: ["mcp"] } } }, null, 2)}\n`,
        "utf8",
      );

      const result = await applyIntegrationSelection(["opencode"], {
        env: { USERPROFILE: home },
        runtimeDir,
        packageRoot,
      });

      expect(result.exitCode).toBe(0);
      expect(await hasDysflowMcpConfig("codex", codexConfig)).toBe(false);
      expect(await hasDysflowMcpConfig("opencode", opencodeConfig)).toBe(true);
      expect(await hasDysflowMcpConfig("claude", claudeDesktopConfig)).toBe(false);
      const updatedClaude = await readJson(claudeDesktopConfig);
      expect((updatedClaude.mcpServers as Record<string, unknown>).other).toEqual({
        command: "other",
      });
      const updatedOpenCode = await readJson(opencodeConfig);
      expect((updatedOpenCode.mcp as Record<string, unknown>).other).toEqual({
        type: "remote",
        url: "https://example.test",
      });
      const updatedOpenCodeDysflow = (updatedOpenCode.mcp as Record<string, unknown>)
        .dysflow as Record<string, unknown>;
      expect(updatedOpenCodeDysflow.command).toEqual(expectedOpenCodeCommand(runtimeDir));
      expectRuntimeLauncherCommand(updatedOpenCodeDysflow.command);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("resolvePackageRoot", () => {
  it("uses the installed package app root even when cwd is a project subfolder", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-package-root-"));
    const installedApp = join(root, "installed", "app");
    const installedCliDir = join(installedApp, "dist", "cli", "commands");
    const projectSubfolder = join(root, "project", "E2E_testing");

    try {
      await mkdir(installedCliDir, { recursive: true });
      await mkdir(projectSubfolder, { recursive: true });
      await writeFile(join(installedApp, "package.json"), '{"name":"dysflow"}\n', "utf8");

      expect(
        resolvePackageRoot({
          moduleUrl: pathToFileURL(join(installedCliDir, "install.js")).href,
          cwd: projectSubfolder,
        }),
      ).toBe(installedApp);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("handleInstallCommand end-to-end", () => {
  it("reinstalling from the installed runtime app refreshes integrations without self-copy failure", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-self-install-"));
    const home = join(root, "home");
    const runtimeDir = join(root, "runtime");
    const appDir = join(runtimeDir, "app");
    const appDist = join(appDir, "dist");
    const appCli = join(appDist, "cli");
    const appScripts = join(appDir, "scripts");

    try {
      await mkdir(appCli, { recursive: true });
      await mkdir(appScripts, { recursive: true });
      await writeFile(join(appCli, "index.js"), "SELF_RUNTIME", "utf8");
      await writeFile(join(appScripts, "runner.ps1"), "SELF_SCRIPT", "utf8");
      await writeFile(
        join(appDir, "package.json"),
        '{"name":"dysflow","version":"0.1.3"}\n',
        "utf8",
      );

      const result = await handleInstallCommand(
        ["--runtime-dir", runtimeDir, "--agents", "opencode", "--no-tui"],
        { env: { USERPROFILE: home }, packageRoot: appDir },
      );

      expect(result.stderr).toBe("");
      expect(result.exitCode).toBe(0);
      expect(await readFile(join(appCli, "index.js"), "utf8")).toBe("SELF_RUNTIME");
      const opencode = await readJson(join(home, ".config", "opencode", "opencode.json"));
      expect(
        ((opencode.mcp as Record<string, unknown>).dysflow as Record<string, unknown>).type,
      ).toBe("local");
      expect(await readFile(join(runtimeDir, "bin", "dysflow.cmd"), "utf8")).toContain(
        "%DYSFLOW_HOME%\\app\\dist\\cli\\index.js",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("installs runtime to requested path and configures selected agents", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-install-"));
    const home = join(root, "home");
    const runtimeDir = join(root, "runtime");
    const codexConfig = join(home, ".codex", "config.toml");
    const opencodeConfig = join(home, ".config", "opencode", "opencode.json");
    const claudeSettings = join(home, ".claude", "settings.json");
    const piConfig = join(home, ".pi", "agent", "mcp.json");

    const result = await handleInstallCommand(
      ["--runtime-dir", runtimeDir, "--agents", "codex,opencode,claude,pi", "--no-tui"],
      {
        env: {
          USERPROFILE: home,
        },
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`Dysflow runtime installed at: ${runtimeDir}`);
    expect(result.stdout).toContain("Configured agents: codex, opencode, claude, pi");

    expect(await readFile(join(runtimeDir, "app", "dist", "cli", "index.js"), "utf8")).toContain(
      "runCli",
    );
    expect(await readFile(join(runtimeDir, "README.md"), "utf8")).toContain("Dysflow");
    expect(await readFile(join(runtimeDir, "CHANGELOG.md"), "utf8")).toContain("# Changelog");
    const sourceVbaManager = await readFile(
      join(process.cwd(), "scripts", "dysflow-vba-manager.ps1"),
      "utf8",
    );
    const sourceAccessRunner = await readFile(
      join(process.cwd(), "scripts", "dysflow-access-runner.ps1"),
      "utf8",
    );
    expect(
      await readFile(join(runtimeDir, "app", "scripts", "dysflow-vba-manager.ps1"), "utf8"),
    ).toBe(sourceVbaManager);
    expect(
      await readFile(join(runtimeDir, "app", "scripts", "dysflow-access-runner.ps1"), "utf8"),
    ).toBe(sourceAccessRunner);

    const codexContent = await readFile(codexConfig, "utf8");
    const expectedCmd = join(runtimeDir, "bin", "dysflow.cmd").replaceAll("\\", "/");
    expect(codexContent).toContain("[mcp_servers.dysflow]");
    expect(codexContent).toContain(`command = '${expectedCmd}'`);

    const opencode = await readJson(opencodeConfig);
    const opencodeMcp = opencode.mcp as Record<string, unknown>;
    const opencodeDysflow = opencodeMcp.dysflow as Record<string, unknown>;
    expect(opencodeDysflow.enabled).toBe(true);
    expect(opencodeDysflow.type).toBe("local");
    expect(opencodeDysflow.command).toEqual(expectedOpenCodeCommand(runtimeDir));
    expectRuntimeLauncherCommand(opencodeDysflow.command);
    expect(opencodeDysflow).not.toHaveProperty("args");

    const claude = await readJson(claudeSettings);
    const claudeMcpServers = claude.mcpServers as Record<string, unknown>;
    const claudeDysflow = claudeMcpServers.dysflow as Record<string, unknown>;
    expect(claudeDysflow.command).toBe(expectedCmd);
    expect(claudeDysflow.args).toEqual(["mcp"]);

    const pi = await readJson(piConfig);
    const piMcpServers = pi.mcpServers as Record<string, unknown>;
    const piDysflow = piMcpServers.dysflow as Record<string, unknown>;
    expect(piDysflow.command).toBe(expectedCmd);
    expect(piDysflow.args).toEqual(["mcp"]);

    const cmdLauncher = await readFile(join(runtimeDir, "bin", "dysflow.cmd"), "utf8");
    expect(cmdLauncher).toContain("%DYSFLOW_HOME%\\app\\dist\\cli\\index.js");
    // Verify Node pnpm path is prepended so pnpm install works during update
    expect(cmdLauncher).toContain("%ProgramFiles%\\nodejs;%PATH%");
    const ps1Launcher = await readFile(join(runtimeDir, "bin", "dysflow.ps1"), "utf8");
    expect(ps1Launcher).toContain(`$env:DYSFLOW_HOME = "${runtimeDir.replaceAll("\\", "\\\\")}"`);
    expect(ps1Launcher).toContain("$env:ProgramFiles\\nodejs;$env:PATH");
    expect(ps1Launcher).not.toContain("$env:LOCALAPPDATA\\dysflow");

    await rm(root, { recursive: true, force: true });
  });

  it("escapes launcher paths for cmd and PowerShell string contexts", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-launcher-"));
    const binDir = join(root, "bin");
    try {
      await mkdir(binDir, { recursive: true });
      await writeRuntimeLaunchers(binDir, 'C:\\foo"&calc\\$home`dir%TMP%');

      const cmdLauncher = await readFile(join(binDir, "dysflow.cmd"), "utf8");
      const ps1Launcher = await readFile(join(binDir, "dysflow.ps1"), "utf8");

      expect(cmdLauncher).toContain('set "DYSFLOW_HOME=C:\\\\foo^"&calc\\\\$home`dir%%TMP%%"');
      expect(ps1Launcher).toContain('$env:DYSFLOW_HOME = "C:\\\\foo`"&calc\\\\`$home``dir%TMP%"');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("handleUpdateCommand end-to-end", () => {
  it("updates runtime from a newer GitHub release package provider", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-update-release-"));
    const runtimeDir = join(root, "runtime");
    const appDir = join(runtimeDir, "app");
    const installedPackageJson = join(appDir, "package.json");
    const releasePackageRoot = await createPackageRoot(root, "9.9.9", "RELEASE_RUNTIME");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      installedPackageJson,
      JSON.stringify({ name: "dysflow", version: "1.0.0", type: "module" }, null, 2),
      "utf8",
    );

    const result = await handleUpdateCommand(["--runtime-dir", runtimeDir], {
      releaseUpdateProvider: {
        resolveLatestRelease: async () => ({ version: "9.9.9" }),
        preparePackage: async () => ({
          packageRoot: releasePackageRoot,
          commitSha: "0123456789abcdef0123456789abcdef01234567",
        }),
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Dysflow runtime update:");
    expect(result.stdout).toContain("1.0.0 -> 9.9.9");
    expect(result.stdout).toContain(
      "Installed release commit: 0123456789abcdef0123456789abcdef01234567",
    );
    expect(await readFile(installedPackageJson, "utf8")).toContain(`"version": "9.9.9"`);
    expect(await readFile(join(appDir, "dist", "cli", "index.js"), "utf8")).toBe("RELEASE_RUNTIME");
    expect(await readFile(join(appDir, "scripts", "dysflow-vba-manager.ps1"), "utf8")).toBe(
      "RELEASE_RUNTIME_VBA_MANAGER",
    );
    expect(await readFile(join(appDir, "scripts", "dysflow-access-runner.ps1"), "utf8")).toBe(
      "RELEASE_RUNTIME_ACCESS_RUNNER",
    );

    await rm(root, { recursive: true, force: true });
  });

  it("skips GitHub release reinstall when installed runtime matches latest", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-update-current-"));
    const runtimeDir = join(root, "runtime");
    const appDir = join(runtimeDir, "app");
    const appCli = join(appDir, "dist", "cli");
    const installedPackageJson = join(appDir, "package.json");
    const releasePackageRoot = await createPackageRoot(root, "9.9.9", "NEW_RUNTIME");
    await mkdir(appCli, { recursive: true });
    await writeFile(
      installedPackageJson,
      JSON.stringify({ name: "dysflow", version: "9.9.9", type: "module" }, null, 2),
      "utf8",
    );
    await writeFile(join(appCli, "index.js"), "OLD_RUNTIME", "utf8");

    const result = await handleUpdateCommand(["--runtime-dir", runtimeDir], {
      releaseUpdateProvider: {
        resolveLatestRelease: async () => ({ version: "9.9.9" }),
        preparePackage: async () => ({
          packageRoot: releasePackageRoot,
        }),
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Dysflow runtime is up to date");
    expect(await readFile(join(appCli, "index.js"), "utf8")).toBe("OLD_RUNTIME");

    await rm(root, { recursive: true, force: true });
  });

  it("forces GitHub release reinstall when latest version is already installed", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-update-force-release-"));
    const runtimeDir = join(root, "runtime");
    const appDir = join(runtimeDir, "app");
    const appCli = join(appDir, "dist", "cli");
    const installedPackageJson = join(appDir, "package.json");
    const releasePackageRoot = await createPackageRoot(root, "9.9.9", "REINSTALLED_RUNTIME");
    await mkdir(appCli, { recursive: true });
    await writeFile(
      installedPackageJson,
      JSON.stringify({ name: "dysflow", version: "9.9.9", type: "module" }, null, 2),
      "utf8",
    );
    await writeFile(join(appCli, "index.js"), "OLD_RUNTIME", "utf8");

    const result = await handleUpdateCommand(["--runtime-dir", runtimeDir, "--force"], {
      releaseUpdateProvider: {
        resolveLatestRelease: async () => ({ version: "9.9.9" }),
        preparePackage: async () => ({
          packageRoot: releasePackageRoot,
        }),
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("9.9.9 -> 9.9.9");
    expect(await readFile(join(appCli, "index.js"), "utf8")).toBe("REINSTALLED_RUNTIME");

    await rm(root, { recursive: true, force: true });
  });

  it("returns an actionable error when GitHub release update resolution fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-update-fail-"));
    const runtimeDir = join(root, "runtime");

    const result = await handleUpdateCommand(["--runtime-dir", runtimeDir], {
      releaseUpdateProvider: {
        resolveLatestRelease: async () => {
          throw new Error("GitHub release lookup failed");
        },
        preparePackage: async () => ({ packageRoot: root }),
      },
    });

    expect(result).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: "Failed to update Dysflow runtime: GitHub release lookup failed",
    });

    await rm(root, { recursive: true, force: true });
  });

  it("updates runtime when local version is newer", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-update-"));
    const runtimeDir = join(root, "runtime");
    const appDir = join(runtimeDir, "app");
    const installedPackageJson = join(appDir, "package.json");
    const oldPackageJson = {
      name: "dysflow",
      version: "0.0.1",
      type: "module",
    };
    await mkdir(appDir, { recursive: true });
    await writeFile(installedPackageJson, JSON.stringify(oldPackageJson, null, 2), "utf8");

    const localVersion = await getLocalDysflowVersion();
    const result = await handleUpdateCommand(["--runtime-dir", runtimeDir], {
      releaseUpdateProvider: {
        resolveLatestRelease: async () => ({ version: localVersion }),
        preparePackage: async () => ({ packageRoot: process.cwd() }),
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Dysflow runtime update:");
    expect(result.stdout).toContain(`0.0.1 -> ${localVersion}`);
    expect(await readFile(installedPackageJson, "utf8")).toContain(`"version": "${localVersion}"`);

    await rm(root, { recursive: true, force: true });
  });

  it("skips reinstall when runtime is up to date", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-update-"));
    const runtimeDir = join(root, "runtime");
    const appDir = join(runtimeDir, "app");
    const appCli = join(appDir, "dist", "cli");
    const installedPackageJson = join(appDir, "package.json");
    const installedMarker = join(appCli, "index.js");
    const localVersion = await getLocalDysflowVersion();
    await mkdir(appCli, { recursive: true });
    await writeFile(
      installedPackageJson,
      JSON.stringify({ name: "dysflow", version: localVersion, type: "module" }, null, 2),
      "utf8",
    );
    await writeFile(installedMarker, "OLD_RUNTIME", "utf8");

    const result = await handleUpdateCommand(["--runtime-dir", runtimeDir], {
      releaseUpdateProvider: {
        resolveLatestRelease: async () => ({ version: localVersion }),
        preparePackage: async () => ({ packageRoot: process.cwd() }),
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Dysflow runtime is up to date");
    expect(await readFile(installedMarker, "utf8")).toBe("OLD_RUNTIME");

    await rm(root, { recursive: true, force: true });
  });

  it("forces reinstall when --force is used", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-update-"));
    const runtimeDir = join(root, "runtime");
    const appDir = join(runtimeDir, "app");
    const appCli = join(appDir, "dist", "cli");
    const installedPackageJson = join(appDir, "package.json");
    const installedMarker = join(appCli, "index.js");

    const localVersion = await getLocalDysflowVersion();
    await mkdir(appCli, { recursive: true });
    await writeFile(
      installedPackageJson,
      JSON.stringify({ name: "dysflow", version: localVersion, type: "module" }, null, 2),
      "utf8",
    );
    await writeFile(installedMarker, "OLD_RUNTIME", "utf8");

    const result = await handleUpdateCommand(["--runtime-dir", runtimeDir, "--force"], {
      releaseUpdateProvider: {
        resolveLatestRelease: async () => ({ version: localVersion }),
        preparePackage: async () => ({ packageRoot: process.cwd() }),
      },
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Dysflow runtime update:");
    expect(result.stdout).toContain(`${localVersion} -> ${localVersion}`);
    expect(await readFile(installedPackageJson, "utf8")).toContain(`"version": "${localVersion}"`);
    expect(await readFile(installedMarker, "utf8")).not.toBe("OLD_RUNTIME");

    await rm(root, { recursive: true, force: true });
  });
});

describe("runtime marker — persistent runtime dir across Windows users", () => {
  const RUNTIME_MARKER_VERSION = "1";
  const RUNTIME_MARKER_FILE = ".dysflow-marker";
  const RUNTIME_MARKER_PATH_ENV = "DYSFLOW_RUNTIME_MARKER_PATH";

  it("install with --runtime-dir writes marker at the system marker path", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-marker-install-"));
    const runtimeDir = join(root, "runtime");
    // Use a custom marker path (simulates DYSFLOW_RUNTIME_MARKER_PATH override)
    const markerDir = join(root, "marker");
    const markerPath = join(markerDir, RUNTIME_MARKER_FILE);

    // Prepare a fake release package so installRuntime doesn't throw "dist not found"
    const pkgRoot = await createPackageRoot(root, "0.0.1-test", "CLI_INDEX");
    await mkdir(join(runtimeDir, "app", "dist", "cli"), { recursive: true });
    await writeFile(
      join(runtimeDir, "app", "package.json"),
      JSON.stringify({ name: "dysflow", version: "0.0.1-test", type: "module" }),
    );

    const env = {
      [RUNTIME_MARKER_PATH_ENV]: markerPath,
      LOCALAPPDATA: join(root, "AppData", "Local"),
      USERPROFILE: root,
      SystemDrive: "C:",
      ProgramData: join(root, "ProgramData"),
    };

    const result = await handleInstallCommand(["--runtime-dir", runtimeDir, "--no-tui"], {
      env,
      packageRoot: pkgRoot,
    });

    expect(result.exitCode).toBe(0);
    // Marker must be written at the custom marker path
    await expect(access(markerPath)).resolves.not.toThrow();
    const markerContent = await readFile(markerPath, "utf8");
    // Marker must contain version prefix + runtime dir
    expect(markerContent).toContain(RUNTIME_MARKER_VERSION);
    expect(markerContent).toContain(runtimeDir);

    await rm(root, { recursive: true, force: true });
  });

  it("update without --runtime-dir or DYSFLOW_HOME reuses the marker-persisted runtime dir", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-marker-update-"));
    const persistedRuntime = join(root, "persisted-runtime");
    const markerDir = join(root, "marker");
    const markerPath = join(markerDir, RUNTIME_MARKER_FILE);

    // Pre-write the marker pointing to persistedRuntime
    await mkdir(markerDir, { recursive: true });
    await writeFile(markerPath, `${RUNTIME_MARKER_VERSION}\n${persistedRuntime}\n`, "utf8");

    // Set a conflicting LOCALAPPDATA to prove marker wins
    const conflictingLocalAppData = join(root, "wrong-user", "AppData", "Local");
    const env = {
      [RUNTIME_MARKER_PATH_ENV]: markerPath,
      LOCALAPPDATA: conflictingLocalAppData,
      USERPROFILE: root,
      SystemDrive: "C:",
      ProgramData: join(root, "ProgramData"),
      // NO DYSFLOW_HOME
      // NO --runtime-dir (simulated by empty runtimeOverride)
    };

    // Build a fake newer release to trigger the update path
    const releaseRoot = await createPackageRoot(root, "9.9.9", "NEW_RUNTIME");
    const localVersion = await getLocalDysflowVersion();

    const result = await handleUpdateCommand([], {
      env,
      releaseUpdateProvider: {
        resolveLatestRelease: async () => ({ version: localVersion }),
        preparePackage: async () => ({
          packageRoot: releaseRoot,
          commitSha: "deadbeef",
        }),
      },
    });

    expect(result.exitCode).toBe(0);
    // The update MUST have written to persistedRuntime, NOT conflictingLocalAppData
    const updatedCli = join(persistedRuntime, "app", "dist", "cli", "index.js");
    await expect(access(updatedCli)).resolves.not.toThrow();
    const updatedContent = await readFile(updatedCli, "utf8");
    expect(updatedContent).toBe("NEW_RUNTIME");

    // Confirm it did NOT touch the conflicting path
    const wrongPath = join(conflictingLocalAppData, "dysflow");
    await expect(access(wrongPath)).rejects.toThrow();

    await rm(root, { recursive: true, force: true });
  });

  it("DYSFLOW_HOME takes precedence over marker", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-home-override-"));
    const markerRuntime = join(root, "marker-runtime");
    const explicitHome = join(root, "explicit-home");
    const markerDir = join(root, "marker");
    const markerPath = join(markerDir, RUNTIME_MARKER_FILE);

    await mkdir(markerDir, { recursive: true });
    await writeFile(markerPath, `${RUNTIME_MARKER_VERSION}\n${markerRuntime}\n`, "utf8");

    const env = {
      [RUNTIME_MARKER_PATH_ENV]: markerPath,
      DYSFLOW_HOME: explicitHome,
      LOCALAPPDATA: join(root, "AppData", "Local"),
      USERPROFILE: root,
      SystemDrive: "C:",
      ProgramData: join(root, "ProgramData"),
    };

    // handleInstallCommand calls resolveRuntimeDir which should pick DYSFLOW_HOME
    // We test this by checking install lands at explicitHome, not markerRuntime
    const pkgRoot = await createPackageRoot(root, "0.0.1-test", "CLI_INDEX");
    await mkdir(join(explicitHome, "app", "dist", "cli"), { recursive: true });
    await writeFile(
      join(explicitHome, "app", "package.json"),
      JSON.stringify({ name: "dysflow", version: "0.0.1-test", type: "module" }),
    );

    const result = await handleInstallCommand(["--no-tui"], { env, packageRoot: pkgRoot });

    expect(result.exitCode).toBe(0);
    // Marker runtime should NOT have been used
    await expect(access(join(markerRuntime, "app", "package.json"))).rejects.toThrow();
    // ExplicitHome should have the runtime
    await expect(access(join(explicitHome, "app", "package.json"))).resolves.not.toThrow();

    await rm(root, { recursive: true, force: true });
  });

  it("--runtime-dir takes precedence over both DYSFLOW_HOME and marker", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-flag-override-"));
    const explicitRuntime = join(root, "explicit-runtime");
    const env = {
      DYSFLOW_HOME: join(root, "wrong-home"),
      LOCALAPPDATA: join(root, "AppData", "Local"),
      USERPROFILE: root,
      SystemDrive: "C:",
      ProgramData: join(root, "ProgramData"),
    };
    const pkgRoot = await createPackageRoot(root, "0.0.1-test", "CLI_INDEX");
    await mkdir(join(explicitRuntime, "app", "dist", "cli"), { recursive: true });
    await writeFile(
      join(explicitRuntime, "app", "package.json"),
      JSON.stringify({ name: "dysflow", version: "0.0.1-test", type: "module" }),
    );

    const result = await handleInstallCommand(["--runtime-dir", explicitRuntime, "--no-tui"], {
      env,
      packageRoot: pkgRoot,
    });

    expect(result.exitCode).toBe(0);
    await expect(access(join(explicitRuntime, "app", "package.json"))).resolves.not.toThrow();
    await expect(access(join(root, "wrong-home", "app", "package.json"))).rejects.toThrow();

    await rm(root, { recursive: true, force: true });
  });

  it("missing/unreadable marker falls back to LOCALAPPDATA\\dysflow", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-marker-fallback-"));
    const markerPath = join(root, "nonexistent", ".dysflow-marker");
    const localAppData = join(root, "AppData", "Local");
    const env = {
      [RUNTIME_MARKER_PATH_ENV]: markerPath,
      LOCALAPPDATA: localAppData,
      USERPROFILE: root,
      SystemDrive: "C:",
      ProgramData: join(root, "ProgramData"),
    };
    // markerPath does NOT exist — so resolveRuntimeDir should fall back to LOCALAPPDATA\dysflow
    // We test this indirectly: install without --runtime-dir should land in LOCALAPPDATA\dysflow
    const pkgRoot = await createPackageRoot(root, "0.0.1-test", "CLI_INDEX");
    const expectedFallback = join(localAppData, "dysflow");
    await mkdir(join(expectedFallback, "app", "dist", "cli"), { recursive: true });
    await writeFile(
      join(expectedFallback, "app", "package.json"),
      JSON.stringify({ name: "dysflow", version: "0.0.1-test", type: "module" }),
    );

    const result = await handleInstallCommand(["--no-tui"], { env, packageRoot: pkgRoot });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(expectedFallback);

    await rm(root, { recursive: true, force: true });
  });

  it("up-to-date update still writes marker so future calls reuse the same runtime", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-noop-marker-"));
    const runtimeDir = join(root, "runtime");
    const markerDir = join(root, "marker");
    const markerPath = join(markerDir, RUNTIME_MARKER_FILE);
    const markerProvider = {
      resolveLatestRelease: async () => ({ version: "0.0.1-test" }),
      preparePackage: async () => ({ packageRoot: root }),
    };

    const env = {
      [RUNTIME_MARKER_PATH_ENV]: markerPath,
      LOCALAPPDATA: join(root, "AppData", "Local"),
      USERPROFILE: root,
      SystemDrive: "C:",
      ProgramData: join(root, "ProgramData"),
    };

    // Pre-write an up-to-date package.json so update detects no newer release
    await mkdir(join(runtimeDir, "app", "dist", "cli"), { recursive: true });
    await writeFile(
      join(runtimeDir, "app", "package.json"),
      JSON.stringify({ name: "dysflow", version: "0.0.1-test", type: "module" }),
    );

    const result = await handleUpdateCommand(["--runtime-dir", runtimeDir], {
      env,
      releaseUpdateProvider: markerProvider,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("up to date");
    // Even on no-op, marker must be written so future update calls find it
    await expect(access(markerPath)).resolves.not.toThrow();
    const markerContent = await readFile(markerPath, "utf8");
    expect(markerContent).toContain(runtimeDir);

    await rm(root, { recursive: true, force: true });
  });
});

describe("parseAgentList edge cases", () => {
  it("returns empty agents when raw is undefined", () => {
    expect(parseAgentList(undefined)).toEqual({ ok: true, agents: [] });
  });
});

describe("parseInstallArgs error branches", () => {
  it("rejects --runtime-dir with missing value", () => {
    expect(parseInstallArgs(["--runtime-dir"])).toEqual({
      ok: false,
      message: "Missing value for --runtime-dir.",
    });
  });

  it("rejects --runtime-dir when next arg looks like a flag", () => {
    expect(parseInstallArgs(["--runtime-dir", "--agents"])).toEqual({
      ok: false,
      message: "Missing value for --runtime-dir.",
    });
  });

  it("rejects unknown install option", () => {
    expect(parseInstallArgs(["--unknown-flag"])).toEqual({
      ok: false,
      message: "Unsupported install option: --unknown-flag",
    });
  });

  it("rejects --agents with unknown agent name", () => {
    expect(parseInstallArgs(["--agents", "unknown-agent"])).toEqual({
      ok: false,
      message: "Unknown agent(s): unknown-agent.",
    });
  });

  it("returns usage message on --help", () => {
    const result = parseInstallArgs(["--help"]);
    expect(result.ok).toBe(false);
    expect((result as { ok: false; message: string }).message).toContain("Usage: dysflow install");
  });
});

describe("parseUpdateArgs error branches", () => {
  it("rejects --runtime-dir with missing value", () => {
    expect(parseUpdateArgs(["--runtime-dir"])).toEqual({
      ok: false,
      message: "Missing value for --runtime-dir.",
    });
  });

  it("rejects --runtime-dir when next arg looks like a flag", () => {
    expect(parseUpdateArgs(["--runtime-dir", "--force"])).toEqual({
      ok: false,
      message: "Missing value for --runtime-dir.",
    });
  });

  it("rejects unknown update option", () => {
    expect(parseUpdateArgs(["--unknown-flag"])).toEqual({
      ok: false,
      message: "Unsupported update option: --unknown-flag",
    });
  });

  it("returns usage message on --help", () => {
    const result = parseUpdateArgs(["--help"]);
    expect(result.ok).toBe(false);
    expect((result as { ok: false; message: string }).message).toContain("Usage: dysflow update");
  });
});

describe("formatAgentsLine", () => {
  it("returns (none) for empty agents array", () => {
    expect(formatAgentsLine([])).toBe("(none)");
  });

  it("joins agent names with comma for non-empty arrays", () => {
    expect(formatAgentsLine(["codex", "opencode"])).toBe("codex, opencode");
  });
});

describe("handleInstallCommand error catch", () => {
  it("returns an actionable error when the OpenCode runtime entrypoint is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-opencode-entrypoint-error-"));
    const badPackageRoot = join(root, "bad-package");

    try {
      await mkdir(join(badPackageRoot, "dist"), { recursive: true });
      await writeFile(join(badPackageRoot, "dist", "placeholder.js"), "missing cli", "utf8");
      await writeFile(join(badPackageRoot, "package.json"), '{"name":"dysflow","version":"0.1.0"}');

      const runtimeDir = join(root, "runtime");
      const result = await handleInstallCommand(
        ["--runtime-dir", runtimeDir, "--agents", "opencode", "--no-tui"],
        { env: { USERPROFILE: root }, packageRoot: badPackageRoot },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("Cannot configure OpenCode MCP");
      expect(result.stderr).toContain(
        join(runtimeDir, "app", "dist", "cli", "index.js").replaceAll("\\", "/"),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("returns exitCode 1 when installRuntime throws an Error", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-install-error-"));
    try {
      // missing distSource so copyRuntime throws
      const badPackageRoot = join(root, "bad-package");
      await mkdir(badPackageRoot, { recursive: true });
      await writeFile(join(badPackageRoot, "package.json"), '{"name":"dysflow","version":"0.1.0"}');

      const result = await handleInstallCommand(
        ["--runtime-dir", join(root, "runtime"), "--agents", "codex", "--no-tui"],
        { env: { USERPROFILE: root }, packageRoot: badPackageRoot },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("Cannot install: runtime distribution not found");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("handleUpdateCommand error catch — preparePackage failure", () => {
  it("returns exitCode 1 when preparePackage throws an Error", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-update-prepare-error-"));
    const runtimeDir = join(root, "runtime");
    const appDir = join(runtimeDir, "app");

    try {
      await mkdir(appDir, { recursive: true });
      await writeFile(
        join(appDir, "package.json"),
        JSON.stringify({ name: "dysflow", version: "0.0.1" }),
      );

      const result = await handleUpdateCommand(["--runtime-dir", runtimeDir], {
        releaseUpdateProvider: {
          resolveLatestRelease: async () => ({ version: "9.9.9" }),
          preparePackage: async () => {
            throw new Error("git clone failed");
          },
        },
      });

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("Failed to update Dysflow runtime: git clone failed");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("returns generic message when preparePackage throws a non-Error", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-update-nonerrorthrow-"));
    const runtimeDir = join(root, "runtime");
    const appDir = join(runtimeDir, "app");

    try {
      await mkdir(appDir, { recursive: true });
      await writeFile(
        join(appDir, "package.json"),
        JSON.stringify({ name: "dysflow", version: "0.0.1" }),
      );

      const result = await handleUpdateCommand(["--runtime-dir", runtimeDir], {
        releaseUpdateProvider: {
          resolveLatestRelease: async () => ({ version: "9.9.9" }),
          preparePackage: async () => {
            throw "unexpected string error";
          },
        },
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe(
        "Failed to update Dysflow runtime: Failed to update Dysflow runtime.",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("applyIntegrationSelection error catch", () => {
  it("returns exitCode 1 when installRuntime throws inside applyIntegrationSelection", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-apply-error-"));
    try {
      const badPackageRoot = join(root, "no-dist");
      await mkdir(badPackageRoot, { recursive: true });
      await writeFile(join(badPackageRoot, "package.json"), '{"name":"dysflow","version":"0.1.0"}');

      const result = await applyIntegrationSelection(["codex"], {
        env: { USERPROFILE: root },
        runtimeDir: join(root, "runtime"),
        packageRoot: badPackageRoot,
      });

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("Cannot install: runtime distribution not found");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("handleInstallCommand argument validation errors", () => {
  it("returns exitCode 1 on invalid arguments", async () => {
    const result = await handleInstallCommand(["--agents", "unknown-agent"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Unknown agent(s): unknown-agent.");
  });

  it("returns exitCode 0 and usage on --help", async () => {
    const result = await handleInstallCommand(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage: dysflow install");
    expect(result.stderr).toBe("");
  });
});

describe("handleUpdateCommand argument validation errors", () => {
  it("returns exitCode 1 on invalid arguments", async () => {
    const result = await handleUpdateCommand(["--unknown-flag"]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Unsupported update option: --unknown-flag");
  });

  it("returns exitCode 0 and usage on --help", async () => {
    const result = await handleUpdateCommand(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage: dysflow update");
    expect(result.stderr).toBe("");
  });
});

describe("handleInstallCommand interactive agent selection", () => {
  it("selects agents interactively when agents is empty, interactive is true, and stdin is TTY", async () => {
    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", {
      value: true,
      configurable: true,
      writable: true,
    });

    const mockQuestion = vi
      .fn()
      .mockResolvedValueOnce("y") // codex -> selected
      .mockResolvedValueOnce("n") // opencode -> skipped
      .mockResolvedValueOnce("yes") // claude -> selected
      .mockResolvedValueOnce("no"); // pi -> skipped
    const mockClose = vi.fn();
    mockCreateInterface.mockReturnValue({
      question: mockQuestion,
      close: mockClose,
    });

    const root = await mkdtemp(join(tmpdir(), "dysflow-install-interactive-"));
    const runtimeDir = join(root, "runtime");
    const packageRoot = await createPackageRoot(root, "0.1.0", "DUMMY_RUNTIME");

    try {
      const result = await handleInstallCommand(["--runtime-dir", runtimeDir], {
        env: { USERPROFILE: root },
        packageRoot,
      });
      expect(result.exitCode).toBe(0);
      expect(mockCreateInterface).toHaveBeenCalled();
      expect(mockQuestion).toHaveBeenCalledTimes(4); // codex, opencode, claude, pi
      expect(mockClose).toHaveBeenCalled();

      // codex and claude should be configured (stdout report lists configured agents)
      expect(result.stdout).toContain("Configured agents: codex, claude");
      expect(result.stdout).not.toMatch(/Configured agents:.*opencode/);
      expect(result.stdout).not.toMatch(/Configured agents:.*pi/);
    } finally {
      mockCreateInterface.mockReset();
      Object.defineProperty(process.stdin, "isTTY", {
        value: originalIsTTY,
        configurable: true,
        writable: true,
      });
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("update arg parsing with skip-checksum", () => {
  it("parses --skip-checksum flag correctly", () => {
    expect(parseUpdateArgs(["--runtime-dir", "C:/tmp/runtime", "--skip-checksum"])).toEqual({
      ok: true,
      options: {
        runtimeDir: "C:/tmp/runtime",
        force: false,
        skipChecksum: true,
      },
    });
  });
});

describe("checksum verification during update", () => {
  it("passes --skip-checksum down to provider.preparePackage", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-update-skip-checksum-"));
    const runtimeDir = join(root, "runtime");
    const appDir = join(runtimeDir, "app");
    const installedPackageJson = join(appDir, "package.json");
    const releasePackageRoot = await createPackageRoot(root, "9.9.9", "RELEASE_RUNTIME");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      installedPackageJson,
      JSON.stringify({ name: "dysflow", version: "1.0.0", type: "module" }, null, 2),
      "utf8",
    );

    const preparePackageSpy = vi.fn().mockResolvedValue({
      packageRoot: releasePackageRoot,
      commitSha: "0123456789abcdef0123456789abcdef01234567",
    });

    const result = await handleUpdateCommand(["--runtime-dir", runtimeDir, "--skip-checksum"], {
      releaseUpdateProvider: {
        resolveLatestRelease: async () => ({ version: "9.9.9" }),
        preparePackage: preparePackageSpy,
      },
    });

    expect(result.exitCode).toBe(0);
    expect(preparePackageSpy).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ skipChecksum: true }),
    );

    await rm(root, { recursive: true, force: true });
  });

  it("verifies downloaded release package using SHA-256 hash checksums file", async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    try {
      // Fake release archive file bytes
      const archiveBytes = Buffer.from("FAKE_TAR_GZ_BINARY_CONTENT");
      const expectedHash = "007278306256488645a7921e99fbd3e7075e499d4d157b121a88f75965ca4200"; // sha256 of "FAKE_TAR_GZ_BINARY_CONTENT"

      // Mock fetch responses for preparePackage:
      // 1st request: Archive download
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new Uint8Array(archiveBytes).slice().buffer,
      });
      // 2nd request: Checksums download
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `${expectedHash}  dysflow-v1.2.3.tar.gz\n`,
      });

      const provider = createGitHubReleaseUpdateProvider();
      const prep = await provider.preparePackage({ version: "1.2.3", tagName: "v1.2.3" });

      expect(prep.packageRoot).toBeDefined();
      expect(mockFetch).toHaveBeenCalledTimes(2);

      await prep.cleanup?.();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws error when downloaded release package checksum does not match", async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    try {
      // Fake release archive file bytes
      const archiveBytes = Buffer.from("FAKE_TAR_GZ_BINARY_CONTENT");
      const badHash = "0000000000000000000000000000000000000000000000000000000000000000";

      // Mock fetch responses:
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new Uint8Array(archiveBytes).slice().buffer,
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `${badHash}  dysflow-v1.2.3.tar.gz\n`,
      });

      const provider = createGitHubReleaseUpdateProvider();

      await expect(
        provider.preparePackage({ version: "1.2.3", tagName: "v1.2.3" }),
      ).rejects.toThrow("Checksum mismatch");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws immediately on HTTP 500 archive response — does NOT fall back to git clone", async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    execFileMock.mockClear();

    try {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const provider = createGitHubReleaseUpdateProvider();
      await expect(
        provider.preparePackage({ version: "1.2.3", tagName: "v1.2.3" }),
      ).rejects.toThrow("HTTP 500");

      // fetch must have been called exactly once — no git clone attempt
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const cloneCalls = execFileMock.mock.calls.filter(
        (call) => Array.isArray(call[1]) && (call[1] as string[]).includes("clone"),
      );
      expect(cloneCalls).toHaveLength(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws immediately on HTTP 403 archive response — does NOT fall back to git clone", async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    execFileMock.mockClear();

    try {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      });

      const provider = createGitHubReleaseUpdateProvider();
      await expect(
        provider.preparePackage({ version: "1.2.3", tagName: "v1.2.3" }),
      ).rejects.toThrow("HTTP 403");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const cloneCalls = execFileMock.mock.calls.filter(
        (call) => Array.isArray(call[1]) && (call[1] as string[]).includes("clone"),
      );
      expect(cloneCalls).toHaveLength(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws immediately on network-style fetch rejection — does NOT fall back to git clone", async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    execFileMock.mockClear();

    try {
      mockFetch.mockRejectedValueOnce(new TypeError("fetch failed: network timeout"));

      const provider = createGitHubReleaseUpdateProvider();
      await expect(
        provider.preparePackage({ version: "1.2.3", tagName: "v1.2.3" }),
      ).rejects.toThrow("network timeout");

      const cloneCalls = execFileMock.mock.calls.filter(
        (call) => Array.isArray(call[1]) && (call[1] as string[]).includes("clone"),
      );
      expect(cloneCalls).toHaveLength(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws immediately on checksum mismatch — does NOT fall back to git clone", async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    execFileMock.mockClear();

    try {
      const archiveBytes = Buffer.from("FAKE_TAR_GZ_BINARY_CONTENT");
      const badHash = "0000000000000000000000000000000000000000000000000000000000000000";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => new Uint8Array(archiveBytes).slice().buffer,
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `${badHash}  dysflow-v1.2.3.tar.gz\n`,
      });

      const provider = createGitHubReleaseUpdateProvider();
      await expect(
        provider.preparePackage({ version: "1.2.3", tagName: "v1.2.3" }),
      ).rejects.toThrow("Checksum mismatch");

      // After a checksum mismatch the only subprocess call allowed is tar (for extraction)
      // that never happened. No git clone must have been attempted.
      const cloneCalls = execFileMock.mock.calls.filter(
        (call) => Array.isArray(call[1]) && (call[1] as string[]).includes("clone"),
      );
      expect(cloneCalls).toHaveLength(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("throws immediately on HTTP 404 archive response — does NOT fall back to git clone", async () => {
    const originalFetch = globalThis.fetch;
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    try {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const provider = createGitHubReleaseUpdateProvider();
      await expect(
        provider.preparePackage({ version: "1.2.3", tagName: "v1.2.3" }),
      ).rejects.toThrow("Release archive not available for version v1.2.3 (HTTP 404)");

      // fetch must have been called exactly once — no git clone attempt
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const cloneCalls = execFileMock.mock.calls.filter(
        (call) => Array.isArray(call[1]) && (call[1] as string[]).includes("clone"),
      );
      expect(cloneCalls).toHaveLength(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
