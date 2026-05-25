import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  applyIntegrationSelection,
  createGitHubReleaseRequestHeaders,
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
    expect(opencodeDysflow.command).toEqual([expectedCmd, "mcp"]);
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
    const env = {
      [RUNTIME_MARKER_PATH_ENV]: markerPath,
      LOCALAPPDATA: join(root, "AppData", "Local"),
      USERPROFILE: root,
      SystemDrive: "C:",
      ProgramData: join(root, "ProgramData"),
    };
    // markerPath does NOT exist — so resolveRuntimeDir should fall back to LOCALAPPDATA\dysflow
    // We test this indirectly: install without --runtime-dir should land in LOCALAPPDATA\dysflow
    const pkgRoot = await createPackageRoot(root, "0.0.1-test", "CLI_INDEX");
    const expectedFallback = join(env.LOCALAPPDATA!, "dysflow");
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
