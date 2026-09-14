import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  capturePiIntegration,
  reconcilePiIntegration,
  restorePiIntegration,
} from "../../../../src/cli/commands/install/mcp-configurator";

const roots: string[] = [];

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "dysflow-pi-integration-"));
  roots.push(root);
  return {
    root,
    mcpConfigPath: join(root, "home", ".pi", "agent", "mcp.json"),
    commandPath: join(root, "runtime", "bin", "dysflow.cmd"),
  };
}

async function json(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Pi MCP reconciliation (#1723)", () => {
  it("routes install, upgrade, and uninstall through shared MCP and package reconcilers", async () => {
    const sourceRoot = join(process.cwd(), "src", "cli", "commands");
    const installer = await readFile(join(sourceRoot, "install.ts"), "utf8");
    const updater = await readFile(join(sourceRoot, "install", "updater.ts"), "utf8");
    const uninstaller = await readFile(join(sourceRoot, "uninstall.ts"), "utf8");

    for (const source of [installer, updater, uninstaller]) {
      expect(source).toContain("reconcilePiIntegration({");
      expect(source).toContain("reconcilePiPackage({");
    }
    for (const transactionalSource of [installer, updater]) {
      expect(transactionalSource).toContain("capturePiIntegration(");
      expect(transactionalSource).toContain("restorePiIntegration(");
    }
  });

  it("creates only the global absolute-launcher MCP entry", async () => {
    const input = await fixture();
    const result = await reconcilePiIntegration(input);

    expect(result).toEqual({ status: "added", active: true });
    expect((await json(input.mcpConfigPath)).mcpServers).toEqual({
      dysflow: {
        command: input.commandPath,
        args: ["mcp"],
        directTools: false,
        type: "local",
        lifecycle: "lazy",
      },
    });
  });

  it("is byte-identical and reports unchanged on repeated reconciliation", async () => {
    const input = await fixture();
    await reconcilePiIntegration(input);
    const before = await readFile(input.mcpConfigPath);

    expect(await reconcilePiIntegration(input)).toEqual({ status: "unchanged", active: true });
    expect(await readFile(input.mcpConfigPath)).toEqual(before);
  });

  it("preserves compatible user MCP options and unrelated servers", async () => {
    const input = await fixture();
    await mkdir(join(input.root, "home", ".pi", "agent"), { recursive: true });
    await writeFile(
      input.mcpConfigPath,
      `${JSON.stringify(
        {
          mcpServers: {
            other: { command: "other" },
            dysflow: {
              command: "dysflow",
              args: ["mcp"],
              directTools: false,
              requestTimeoutMs: 1234,
            },
          },
          settings: { collapsedResultLines: 2 },
        },
        null,
        2,
      )}\n`,
    );

    expect(await reconcilePiIntegration(input)).toEqual({ status: "changed", active: true });
    const reconciled = await json(input.mcpConfigPath);
    const servers = reconciled.mcpServers as Record<string, Record<string, unknown>>;
    expect(servers.other).toEqual({ command: "other" });
    expect(servers.dysflow).toMatchObject({
      command: input.commandPath,
      requestTimeoutMs: 1234,
      directTools: false,
    });
    expect(reconciled.settings).toEqual({ collapsedResultLines: 2 });
  });

  it("restores the exact prior MCP bytes after a later package step fails", async () => {
    const input = await fixture();
    await mkdir(join(input.root, "home", ".pi", "agent"), { recursive: true });
    const before = `\r\n{ "mcpServers": { "dysflow": { "command": "dysflow", "args": ["mcp"] } } }\r\n`;
    await writeFile(input.mcpConfigPath, before);

    const snapshot = await capturePiIntegration(input.mcpConfigPath);
    expect(await reconcilePiIntegration(input)).toEqual({ status: "changed", active: true });
    await restorePiIntegration(input.mcpConfigPath, snapshot);

    expect(await readFile(input.mcpConfigPath, "utf8")).toBe(before);
  });

  it("removes a newly created MCP file when a later package step fails", async () => {
    const input = await fixture();
    const snapshot = await capturePiIntegration(input.mcpConfigPath);
    await reconcilePiIntegration(input);
    await restorePiIntegration(input.mcpConfigPath, snapshot);

    await expect(access(input.mcpConfigPath)).rejects.toThrow();
  });

  it("fails safely when a foreign executable lives inside a dysflow directory", async () => {
    const input = await fixture();
    await mkdir(join(input.root, "home", ".pi", "agent"), { recursive: true });
    const foreign = `\n{ "mcpServers": { "dysflow": { "command": "C:/work/dysflow/foreign-tool.exe" } } }\n`;
    await writeFile(input.mcpConfigPath, foreign);

    await expect(reconcilePiIntegration(input)).rejects.toThrow(/foreign MCP entry/i);
    expect(await readFile(input.mcpConfigPath, "utf8")).toBe(foreign);
  });

  it("removes only an installer-managed MCP entry", async () => {
    const input = await fixture();
    await reconcilePiIntegration(input);

    expect(await reconcilePiIntegration({ ...input, mode: "remove" })).toEqual({
      status: "changed",
      active: false,
    });
    expect((await json(input.mcpConfigPath)).mcpServers).toEqual({});

    const foreign = `\n{ "mcpServers": { "dysflow": { "command": "foreign-tool" } } }\n`;
    await writeFile(input.mcpConfigPath, foreign);
    expect(await reconcilePiIntegration({ ...input, mode: "remove" })).toEqual({
      status: "unchanged",
      active: true,
    });
    expect(await readFile(input.mcpConfigPath, "utf8")).toBe(foreign);
  });

  it("does not create package settings as a substitute for Pi install", async () => {
    const input = await fixture();
    await reconcilePiIntegration(input);
    await expect(
      access(join(input.root, "home", ".pi", "agent", "settings.json")),
    ).rejects.toThrow();
  });
});
