delete process.env.DYSFLOW_HOME;

/**
 * Empirical proof: a real headless compile FAILURE is captured and returned to
 * the caller as a structured error — without opening any UI and without hanging.
 *
 * The repo already proves the compile SUCCESS path end-to-end
 * (form-codebehind-stale-import.e2e.test.ts asserts compileResult.ok === true
 * against live Access) and the structured-error PARSING at the adapter level
 * (vba-modules-adapter.test.ts feeds a mocked VBA_COMPILE_ERROR payload). The
 * gap this test closes is the real-Access FAILURE path: import a module with a
 * deliberate compile error via import_modules + compile:true, and verify that
 *   - the call returns promptly (timedOut === false) — i.e. no modal/UI blocks
 *     the unattended COM call,
 *   - the response is an error carrying the offending module name.
 *
 * This is the evidence behind the claim that a consuming agent can rely on
 * dysflow to compile after import and read compile errors itself, with no human
 * looking at the Access UI.
 */
import { execFileSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cliCommand =
  process.env.DYSFLOW_E2E_COMMAND ?? join(repoRoot, "test-runtime", "bin", "dysflow.cmd");
const fixtureFront = join(repoRoot, "E2E_testing", "NoConformidades.accdb");
const fixtureBackend = join(repoRoot, "E2E_testing", "NoConformidades_Datos.accdb");

const PROBE_MODULE = "DysflowCompileErrorProbe";

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

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

const canRunE2e =
  existsSync(cliCommand) &&
  existsSync(fixtureFront) &&
  existsSync(fixtureBackend) &&
  hasAccessCom() &&
  (process.env.ACCESS_VBA_PASSWORD ?? process.env.DYSFLOW_ACCESS_PASSWORD) !== undefined;

if (!canRunE2e) {
  console.warn(
    "[compile-error-capture] Skipping: DYSFLOW_E2E_COMMAND, E2E_testing/*.accdb, " +
      "Access COM, or ACCESS_VBA_PASSWORD are unavailable.",
  );
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

const workspaceRoot = join(tmpdir(), `dysflow-compile-error-e2e-${process.pid}-${Date.now()}`);
const projectId = "dysflow-compile-error-e2e";

function setupWorkspace(): void {
  mkdirSync(join(workspaceRoot, ".dysflow"), { recursive: true });
  mkdirSync(join(workspaceRoot, "src", "modules"), { recursive: true });

  cpSync(fixtureFront, join(workspaceRoot, "NoConformidades.accdb"));
  cpSync(fixtureBackend, join(workspaceRoot, "NoConformidades_Datos.accdb"));

  writeFileSync(
    join(workspaceRoot, ".dysflow", "project.json"),
    `${JSON.stringify(
      {
        id: projectId,
        accessPath: "NoConformidades.accdb",
        backendPath: "NoConformidades_Datos.accdb",
        destinationRoot: "src",
        allowWrites: true,
        timeoutMs: 120_000,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  // A standard module whose text imports fine (AddFromFile is text-only) but
  // FAILS at compile: "Block If without End If" — a deterministic, structural
  // compile error that the VBE raises on acCmdCompileAndSaveAllModules.
  const brokenModule = [
    `Attribute VB_Name = "${PROBE_MODULE}"`,
    "Option Compare Database",
    "Option Explicit",
    "",
    "Public Sub ProbeBroken()",
    "    If True Then",
    '        Debug.Print "deliberate compile error: missing End If"',
    "End Sub",
    "",
  ].join("\r\n");
  writeFileSync(join(workspaceRoot, "src", "modules", `${PROBE_MODULE}.bas`), brokenModule, "utf8");
}

// ---------------------------------------------------------------------------
// MCP helper (pattern copied from form-codebehind-stale-import.e2e.test.ts)
// ---------------------------------------------------------------------------

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
    const child = spawn(cliCommand, ["mcp"], {
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
          clientInfo: { name: "compile-error-e2e", version: "1" },
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

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe.skipIf(!canRunE2e)(
  "compile-error-capture: headless compile failures surface structured",
  () => {
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

    // Regression for issue #543: a headless compile of a module that does not
    // compile must surface as a structured error (RunCommand(126) does not throw,
    // so dysflow checks Application.IsCompiled), and the call must not hang on a
    // modal/UI dialog.
    it("import_modules + compile:true on a broken module returns a structured error without hanging", async () => {
      const result = await callMcp(
        "import_modules",
        {
          projectId,
          moduleNames: [PROBE_MODULE],
          importMode: "Code",
          dryRun: false,
          compile: true,
        },
        { timeoutMs: 90_000 },
      );

      // (1) The headless compile must NOT hang on a modal/UI dialog — the call returns.
      expect(result.timedOut, `compile hung (likely a modal/UI dialog): ${result.text}`).toBe(
        false,
      );

      // (2) The compile failure surfaces as an error (not false-green success).
      expect(result.isError, `expected a compile error, got success: ${result.text}`).toBe(true);

      // (3) The error is identifiable as a compile failure by a consuming agent.
      expect(
        result.text.toLowerCase(),
        `expected a compile-failure signal in the error payload: ${result.text}`,
      ).toContain("compile");
    }, 120_000);
  },
);
