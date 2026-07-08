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

  // Parse the inner tool envelope out of the MCP text content. The transport
  // `result.ok` only says the JSON-RPC call did not error — the inline tool
  // reports its own success as an `ok` field inside the JSON payload. #786: the
  // pre-fix bug returned transport-ok with an inner `ok:false` + "no encuentra
  // el procedimiento", so a test that only checks `result.ok` misses it.
  function parseInner(text: string): {
    ok: boolean;
    returnValue: unknown;
    error: unknown;
  } {
    const parsed = JSON.parse(text) as {
      ok?: boolean;
      returnValue?: unknown;
      error?: unknown;
    };
    return {
      ok: parsed.ok === true,
      returnValue: parsed.returnValue,
      error: parsed.error,
    };
  }

  it("runs a trivial snippet and returns its `result` value (#786)", async () => {
    const result = await callMcp(
      "vba_inline_execution",
      { projectId: "dysflow-inline-e2e", code: 'result = "ok"' },
      { timeoutMs: 120_000 },
    );

    expect(result.ok).toBe(true);
    const inner = parseInner(result.text);
    expect(inner.error).toBeNull();
    expect(inner.ok).toBe(true);
    expect(inner.returnValue).toBe("ok");

    // Temp module is cleaned up from disk.
    const modulesDir = join(workspaceRoot, "src", "modules");
    if (existsSync(modulesDir)) {
      const files = readdirSync(modulesDir);
      expect(files.filter((f) => f.startsWith("__dysflow_inline__")).length).toBe(0);
    }
  }, 150_000);

  it("introspects DAO field Attributes via an inline snippet (#786)", async () => {
    // The motivating use case: read runtime-only DAO metadata (Attributes)
    // without opening Access. Reads the first field of the first non-system
    // table so the test is fixture-agnostic.
    const code = [
      "Dim db As DAO.Database",
      "Set db = CurrentDb()",
      "Dim tbl As DAO.TableDef",
      "For Each tbl In db.TableDefs",
      'If Left(tbl.Name, 4) <> "MSys" Then',
      'result = "Attrs=" & tbl.Fields(0).Attributes',
      "Exit For",
      "End If",
      "Next tbl",
    ].join("\n");

    const result = await callMcp(
      "vba_inline_execution",
      { projectId: "dysflow-inline-e2e", code },
      { timeoutMs: 120_000 },
    );

    expect(result.ok).toBe(true);
    const inner = parseInner(result.text);
    expect(inner.error).toBeNull();
    expect(inner.ok).toBe(true);
    expect(String(inner.returnValue)).toMatch(/^Attrs=\d+$/);
  }, 150_000);
});
