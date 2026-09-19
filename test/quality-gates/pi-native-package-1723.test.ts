import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { dysflowChildEnvironment, resolveDysflowCommand } from "../../plugin/pi/dysflow-mcp-client";
import {
  renderDysflowCallText,
  renderDysflowResultText,
} from "../../plugin/pi/dysflow-tool-chrome";
import { createDysflowNativeTool } from "../../plugin/pi/native-tool";

const packageRoot = resolve("plugin/pi");

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(resolve(packageRoot, path), "utf8")) as Record<string, unknown>;
}

describe("Dysflow Pi-native package (#1723)", () => {
  it("renders characteristic calls without dumping parameters", () => {
    expect(renderDysflowCallText("bootstrap", { secret: "must-not-render" })).toBe(
      "⚡ Dysflow · bootstrap…",
    );
    expect(
      renderDysflowCallText("import_modules", {
        moduleNames: ["One", "Two", "Three"],
        accessPath: "C:/private/frontend.accdb",
      }),
    ).toBe("⚡ Dysflow · importing 3 modules…");
    expect(renderDysflowCallText("internal_secret_operation", {})).toBe("⚡ Dysflow · operation…");
    expect(renderDysflowCallText("C:/private/token=abc", {})).toBe("⚡ Dysflow · operation…");
  });

  it("keeps collapsed results to one status line and expands full details", () => {
    const success = {
      content: [{ type: "text", text: "full details\nwith more content" }],
      details: { mcpResult: { structuredContent: { ok: true, imported: ["One", "Two"] } } },
    };

    expect(renderDysflowResultText("import_modules", success, { expanded: false })).toBe(
      "↳ ✓ imported 2 modules",
    );
    expect(renderDysflowResultText("import_modules", success, { expanded: true })).toBe(
      '↳ ✓ imported 2 modules\n\n{\n  "ok": true,\n  "imported": [\n    "One",\n    "Two"\n  ]\n}',
    );
    expect(renderDysflowResultText("bootstrap", {}, { isPartial: true })).toBe("↳ ⚠ bootstrap…");
    expect(
      renderDysflowResultText(
        "verify_code",
        {
          content: [
            {
              type: "text",
              text: "failed password=supersecret accessPath=C:/private/frontend.accdb",
            },
          ],
        },
        { isError: true },
      ),
    ).toBe("↳ ✗ Dysflow failed");
  });

  it("ships a public Pi package without a package-scoped duplicate MCP", async () => {
    const manifest = await readJson("package.json");
    const repositoryManifest = JSON.parse(await readFile(resolve("package.json"), "utf8")) as {
      version: string;
    };
    const pi = manifest.pi as Record<string, unknown>;
    expect(manifest.name).toBe("@aroman22/dysflow-pi");
    expect(manifest.version).toBe(repositoryManifest.version);
    expect(manifest.keywords).toContain("pi-package");
    expect(pi.image).toMatch(/^https:\/\/.*\.(?:png|jpe?g|gif|webp)$/i);
    expect(pi.extensions).toEqual(["./index.ts"]);
    expect(pi.mcp).toBeUndefined();
    expect((manifest.dependencies as Record<string, unknown>).typebox).toBeUndefined();
    expect((manifest.peerDependencies as Record<string, unknown>).typebox).toBe("*");
    await expect(readFile(resolve(packageRoot, "mcp.json"), "utf8")).rejects.toThrow();
  });

  it("keeps the canonical Pi guide aligned with package and repository contracts", async () => {
    const repositoryManifest = JSON.parse(await readFile(resolve("package.json"), "utf8")) as {
      private?: boolean;
    };
    const guide = await readFile(resolve("docs/pi-native-integration.md"), "utf8");
    const setup = await readFile(resolve("docs/SETUP.md"), "utf8");

    expect(repositoryManifest.private).toBe(true);
    expect(setup).not.toContain("npm install --global dysflow");
    expect(guide).toContain("dysflow install --agents pi --no-tui");
    // #1754 — the facade is activated from the runtime by local path, never from a registry.
    expect(guide).toContain("pi install <runtime>/app/plugin/pi");
    expect(guide).not.toContain("Trusted Publishing");
    expect(guide).toContain("directTools: false");
  });

  it("pins the native MCP child to the installer-managed absolute launcher", () => {
    const moduleUrl = new URL("file:///C:/pi/agent/npm/dysflow-pi/index.ts").href;
    expect(
      resolveDysflowCommand(moduleUrl, {
        LOCALAPPDATA: "C:/runtime-home",
        DYSFLOW_RUNTIME_MARKER_PATH: "C:/runtime-home/missing-marker",
      }),
    ).toMatch(/^C:[\\/]runtime-home[\\/]dysflow[\\/]bin[\\/]dysflow\.cmd$/);
    expect(() => resolveDysflowCommand(moduleUrl, { DYSFLOW_BIN: "dysflow" })).toThrow(
      /absolute path/i,
    );
    expect(resolveDysflowCommand(moduleUrl, { DYSFLOW_BIN: "C:/trusted/dysflow.cmd" })).toBe(
      "C:/trusted/dysflow.cmd",
    );
    expect(
      dysflowChildEnvironment({ ACCESS_VBA_PASSWORD: "inherited", OMITTED: undefined }),
    ).toEqual({ ACCESS_VBA_PASSWORD: "inherited" });
  });

  it("registers one unique native facade and delegates over the injected MCP port", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const tool = createDysflowNativeTool({
      callTool: async (name, args) => {
        calls.push({ name, args });
        return {
          content: [{ type: "text", text: "ok" }],
          structuredContent: { ok: true },
        };
      },
    });

    expect(tool.name).toBe("dysflow");
    expect(tool.name).not.toBe("mcp");
    expect(tool.name).not.toBe("mcp__dysflow");
    await tool.execute("call-1", { tool: "bootstrap", args: {} });
    expect(calls).toEqual([{ name: "bootstrap", args: {} }]);
  });

  it("throws only a bounded error through Pi's public tool-error path", async () => {
    const tool = createDysflowNativeTool({
      callTool: async () => ({
        content: [
          {
            type: "text",
            text: "password=supersecret accessPath=C:/private/frontend.accdb",
          },
        ],
        isError: true,
      }),
    });

    await expect(tool.execute("call-error", { tool: "verify_code", args: {} })).rejects.toThrow(
      "Dysflow operation failed.",
    );
  });

  it("packs every runtime artifact required by a clean Pi installation", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "dysflow-pi-pack-"));
    const env = {
      ...process.env,
      HOME: sandbox,
      USERPROFILE: sandbox,
      npm_config_cache: join(sandbox, "npm-cache"),
      npm_config_prefix: join(sandbox, "npm-prefix"),
    };
    try {
      const output =
        process.platform === "win32"
          ? execFileSync("cmd.exe", ["/d", "/s", "/c", "npm pack --dry-run --json"], {
              cwd: packageRoot,
              encoding: "utf8",
              env,
            })
          : execFileSync("npm", ["pack", "--dry-run", "--json"], {
              cwd: packageRoot,
              encoding: "utf8",
              env,
            });
      const parsed = JSON.parse(output) as
        | Array<{ files: Array<{ path: string }> }>
        | Record<string, { files: Array<{ path: string }> }>;
      const pack = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0];
      const paths = pack?.files.map((entry) => entry.path) ?? [];
      expect(paths).toEqual(
        expect.arrayContaining([
          "index.ts",
          "native-tool.ts",
          "dysflow-mcp-client.ts",
          "dysflow-tool-chrome.ts",
          "README.md",
        ]),
      );
      expect(paths).not.toContain("mcp.json");
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  }, 60_000);
});
