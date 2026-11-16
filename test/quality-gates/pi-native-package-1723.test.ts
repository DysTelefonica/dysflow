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

  it("preserves bounded typed diagnostics through Pi's public tool-error path (#2000)", async () => {
    const failures = Array.from({ length: 20 }, (_, index) => ({
      procedure: `Test_${index}`,
      error: "expected [today] obtained []",
    }));
    const tool = createDysflowNativeTool({
      callTool: async () => ({
        content: [{ type: "text", text: "fallback must not replace the envelope" }],
        structuredContent: {
          schemaVersion: "dysflow.result/v1",
          isError: true,
          ok: false,
          error: {
            code: "VBA_TESTS_FAILED",
            message: "20 VBA tests failed password=supersecret C:/private/frontend.accdb",
            remediation: "Fix the assertion and rerun test_vba.",
            details: { failures, rawSecret: "must-not-leak" },
          },
        },
        isError: true,
      }),
    });
    const error = await tool.execute("call-error", { tool: "test_vba" }).catch((value) => value);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain("VBA_TESTS_FAILED");
    expect(error.message).toContain("20 VBA tests failed");
    expect(error.message).toContain("Fix the assertion and rerun test_vba.");
    expect(error.message).toContain("Test_0");
    expect(error.message).toContain("expected [today] obtained []");
    expect(error.message).not.toContain("Test_19");
    expect(error.message).not.toContain("supersecret");
    expect(error.message).not.toContain("C:/private");
    expect(error.message).not.toContain("must-not-leak");
    expect(error.message.length).toBeLessThan(8_000);
    const result = { content: [{ type: "text", text: error.message }] };
    expect(renderDysflowResultText("test_vba", result, { isError: true })).toBe(
      "↳ ✗ Dysflow failed · VBA_TESTS_FAILED",
    );
  });

  it("recovers a text-only typed envelope and identifies the rejected parameter (#2000)", async () => {
    const envelope = {
      schemaVersion: "dysflow.result/v1",
      ok: false,
      error: {
        code: "MCP_INPUT_INVALID",
        message: "Invalid input",
        remediation: "Pass destinationRoot.",
        missingParam: "destinationRoot",
      },
    };
    const tool = createDysflowNativeTool({
      callTool: async () => ({
        isError: true,
        content: [{ type: "text", text: JSON.stringify(envelope) }],
      }),
    });
    await expect(tool.execute("call-input", { tool: "test_vba" })).rejects.toThrow(
      /MCP_INPUT_INVALID.*destinationRoot/,
    );
    expect(
      renderDysflowResultText("test_vba", {
        details: { mcpResult: { structuredContent: envelope } },
      }),
    ).toBe("↳ ✗ Dysflow failed · MCP_INPUT_INVALID");
  });

  it.each([
    ["bearer header", "Authorization: Bearer SYNTHETIC_BEARER_SECRET", "SYNTHETIC_BEARER_SECRET"],
    ["JSON credential", '{"token":"SYNTHETIC_JSON_SECRET"}', "SYNTHETIC_JSON_SECRET"],
    ["POSIX path", "/opt/company-private/frontend.accdb", "company-private"],
    [
      "spaced Windows path",
      "C:\\Users\\Jane Doe\\PrivateProject\\frontend.accdb",
      "PrivateProject",
    ],
  ])(
    "redacts %s from public typed errors and assertion details (#2000)",
    async (_, sensitive, sentinel) => {
      const message = `Cannot use ${sensitive}; expected [today] obtained [].`;
      const tool = createDysflowNativeTool({
        callTool: async () => ({
          isError: true,
          content: [{ type: "text", text: "fallback" }],
          structuredContent: {
            schemaVersion: "dysflow.result/v1",
            ok: false,
            error: {
              code: "VBA_TESTS_FAILED",
              message,
              remediation: "Fix Test_X and rerun test_vba.",
              details: { failures: [{ procedure: "Test_X", error: message }] },
            },
          },
        }),
      });
      const failure = await tool
        .execute("private-error", { tool: "test_vba" })
        .catch((error) => error);
      expect(failure).toBeInstanceOf(Error);
      expect(failure.message).not.toContain(sentinel);
      expect(failure.message).not.toContain("Doe\\PrivateProject");
      const envelope = JSON.parse(failure.message);
      expect(envelope.error.message).toContain("expected [today] obtained []");
      expect(envelope.error.details.failures[0].error).toContain("expected [today] obtained []");
      expect(envelope.error.details.failures[0].procedure).toBe("Test_X");
      expect(envelope.error.remediation).toBe("Fix Test_X and rerun test_vba.");
      expect(failure.message.length).toBeLessThan(8_000);
      expect(
        renderDysflowResultText(
          "test_vba",
          { content: [{ type: "text", text: failure.message }] },
          { isError: true },
        ),
      ).toBe("↳ ✗ Dysflow failed · VBA_TESTS_FAILED");
    },
  );

  it("keeps successful facade content and details unchanged (#2000)", async () => {
    const result = { content: [{ type: "text", text: "ok" }], structuredContent: { ok: true } };
    const tool = createDysflowNativeTool({ callTool: async () => result });
    await expect(tool.execute("call-success", { tool: "bootstrap" })).resolves.toEqual({
      content: result.content,
      details: { mcpResult: result },
    });
    expect(
      renderDysflowResultText("test_vba", {
        content: [{ type: "text", text: '{"ok":true,"passed":3}' }],
      }),
    ).toBe("↳ ✓ done");
  });

  it("keeps untyped backend failures private", async () => {
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
