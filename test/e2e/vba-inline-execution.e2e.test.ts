import { execFileSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cliCommand =
  process.env.DYSFLOW_E2E_COMMAND ?? join(repoRoot, "test-runtime", "bin", "dysflow.cmd");
const fixtureFront = join(repoRoot, "E2E_testing", "NoConformidades.accdb");
const fixtureBackend = join(repoRoot, "E2E_testing", "NoConformidades_Datos.accdb");

const canRunE2e =
  existsSync(cliCommand) &&
  existsSync(fixtureFront) &&
  existsSync(fixtureBackend) &&
  hasAccessCom() &&
  (process.env.ACCESS_VBA_PASSWORD ?? process.env.DYSFLOW_ACCESS_PASSWORD) !== undefined;

function hasAccessCom(): boolean {
  try {
    const output = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "try { $a = New-Object -ComObject Access.Application; $a.Quit(); 'ok' } catch { 'missing' }",
      ],
      { encoding: "utf8", windowsHide: true, timeout: 20_000 },
    );
    return output.includes("ok");
  } catch {
    return false;
  }
}

const workspaceRoot = join(tmpdir(), `dysflow-inline-e2e-${process.pid}-${Date.now()}`);

function setupWorkspace(): void {
  mkdirSync(join(workspaceRoot, ".dysflow"), { recursive: true });
  mkdirSync(join(workspaceRoot, "src", "modules"), { recursive: true });
  cpSync(fixtureFront, join(workspaceRoot, "NoConformidades.accdb"));
  cpSync(fixtureBackend, join(workspaceRoot, "NoConformidades_Datos.accdb"));
  writeFileSync(
    join(workspaceRoot, ".dysflow", "project.json"),
    `${JSON.stringify(
      {
        id: "dysflow-inline-e2e",
        accessPath: "NoConformidades.accdb",
        backendPath: "NoConformidades_Datos.accdb",
        destinationRoot: "src",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

interface McpToolResponse {
  ok: boolean;
  isError: boolean;
  text: string;
  timedOut: boolean;
}

async function callMcp(
  toolName: string,
  args: Record<string, unknown>,
  options: { timeoutMs?: number; cwd?: string } = {},
): Promise<McpToolResponse> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const cwd = options.cwd ?? workspaceRoot;
  return await new Promise((resolveCall) => {
    const child = spawn(cliCommand, ["mcp", "--enable-writes"], {
      cwd,
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        ACCESS_VBA_PASSWORD: process.env.ACCESS_VBA_PASSWORD ?? process.env.DYSFLOW_ACCESS_PASSWORD,
        DYSFLOW_ACCESS_PASSWORD:
          process.env.ACCESS_VBA_PASSWORD ?? process.env.DYSFLOW_ACCESS_PASSWORD,
        DYSFLOW_BACKEND_PASSWORD:
          process.env.ACCESS_VBA_PASSWORD ?? process.env.DYSFLOW_BACKEND_PASSWORD,
      },
    });
    let buf = "";
    let settled = false;
    const finish = (r: McpToolResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.stdin.end();
      } catch {
        /* ignore */
      }
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      resolveCall(r);
    };
    const timer = setTimeout(() => {
      finish({ ok: false, isError: true, text: "MCP timeout", timedOut: true });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      buf += chunk.toString();
      const nl = buf.lastIndexOf("\n");
      if (nl < 0) return;
      for (const l of buf.slice(0, nl).split("\n")) {
        const s = l.trim();
        if (!s) continue;
        try {
          const m = JSON.parse(s) as {
            id: number;
            result?: { content: Array<{ type: string; text?: string }>; isError?: boolean };
            error?: unknown;
          };
          if (m.id !== 3) continue;
          const text = m.result?.content?.map((c) => c.text ?? "").join("\n") ?? "";
          const isError = Boolean(m.error ?? m.result?.isError);
          finish({ ok: !isError, isError, text, timedOut: false });
          return;
        } catch {
          /* keep reading */
        }
      }
    });
    child.on("error", (e) =>
      finish({ ok: false, isError: true, text: e.message, timedOut: false }),
    );
    child.on("close", () => {
      if (!settled) finish({ ok: false, isError: true, text: "MCP closed", timedOut: false });
    });
    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "inline-e2e", version: "1" },
        },
      })}\n`,
    );
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })}\n`,
    );
    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: toolName, arguments: args },
      })}\n`,
    );
  });
}

describe.skipIf(!canRunE2e)("vba_inline_execution E2E Integration", () => {
  beforeAll(() => {
    setupWorkspace();
  });
  afterAll(() => {
    try {
      rmSync(workspaceRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("compiles and runs temporary VBA snippet and cleans up files", async () => {
    // 1. Run inline execution with a simple VBA math print statement
    const result = await callMcp(
      "vba_inline_execution",
      {
        projectId: "dysflow-inline-e2e",
        code: "Debug.Print 2 + 2",
      },
      { timeoutMs: 120_000 },
    );

    console.log("MCP Call Result:", JSON.stringify(result, null, 2));
    expect(result.ok).toBe(true);

    // 2. Check that the modules/ folder inside src has no files matching _inline_
    const modulesDir = join(workspaceRoot, "src", "modules");
    if (existsSync(modulesDir)) {
      const files = readdirSync(modulesDir);
      const inlineFiles = files.filter((f) => f.startsWith("_inline_"));
      expect(inlineFiles.length).toBe(0);
    }
  }, 150_000);
});
