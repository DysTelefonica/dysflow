delete process.env.DYSFLOW_HOME;

/**
 * E2E suite for the Unicode round-trip behavior of dysflow import/export.
 *
 * Reproduces and locks down the EXPEDIENTES consumer bug report
 * (2026-06-27): mojibake (`SÃ­`, `â€"`, `Â§`) appears after a full
 * import/export cycle through Access COM when the source contains
 * Spanish-language Unicode characters.
 *
 * Root cause (verified by `scripts/tests/dysflow-vba-manager-unicode-roundtrip.Tests.ps1`):
 * `-split "<delim>", -1` returns a single-element array on PowerShell 7, so
 * `Normalize-VbaImportText` collapses the whole VBA module into one line and
 * the import temp file ends up empty.
 *
 * Strategy:
 *   - Create a UTF-8 source `.bas` module with the EXPEDIENTES Unicode
 *     characters: `EnumSiNo.Sí`, `"Sí"`, `"nº"`, `"§"`, comment with
 *     `—` and `Telefónica`.
 *   - Round-trip: import into Access COM, export back to disk.
 *   - Assert that the exported file is byte-identical (UTF-8) to the source —
 *     no `SÃ­` mojibake, no `?` substitutions for the chars that ARE in
 *     Windows-1252.
 *
 * Skip semantics:
 *   - The test suite requires real Access COM and `E2E_testing/*.accdb`
 *     fixtures. If any of those are missing, every case skips with a warning
 *     (same pattern as `import-modules-regression.e2e.test.ts`).
 *   - To run this suite locally: ensure Access COM is installed, set
 *     `ACCESS_VBA_PASSWORD` (or `DYSFLOW_ACCESS_PASSWORD`), and that the
 *     NoConformidades.accdb fixtures exist under `E2E_testing/`.
 */
import { execFileSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { createGitOwnedE2eWorkspace } from "../integration/_helpers/git-owned-e2e-workspace";

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

if (!canRunE2e) {
  console.warn(
    "[import-export-unicode.e2e] Skipping: DYSFLOW_E2E_COMMAND, E2E_testing/*.accdb, " +
      "Access COM, or ACCESS_VBA_PASSWORD are unavailable.",
  );
}

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
          process.env.DYSFLOW_ACCESS_PASSWORD ?? process.env.ACCESS_VBA_PASSWORD,
      },
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const settle = (value: McpToolResponse) => {
      if (settled) return;
      settled = true;
      resolveCall(value);
    };

    const timer = setTimeout(() => {
      child.kill();
      settle({
        ok: false,
        isError: true,
        text: `timeout after ${timeoutMs}ms (stderr tail: ${stderr.slice(-400)})`,
        timedOut: true,
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      const lineEnd = stdout.lastIndexOf("\n");
      if (lineEnd < 0) return;
      for (const line of stdout.slice(0, lineEnd).split("\n")) {
        const candidate = line.trim();
        if (!candidate) continue;
        try {
          const parsed = JSON.parse(candidate) as {
            id?: number;
            result?: {
              content?: Array<{ type: string; text?: string }>;
              isError?: boolean;
              ok?: boolean;
            };
            error?: unknown;
          };
          if (parsed.id !== 1) continue;
          clearTimeout(timer);
          const text = parsed.result?.content?.map((entry) => entry.text ?? "").join("\n") ?? "";
          const isError = Boolean(parsed.error ?? parsed.result?.isError);
          settle({
            ok: !isError && parsed.result?.ok !== false,
            isError,
            text,
            timedOut: false,
          });
          return;
        } catch {
          /* Keep reading until the JSON-RPC response arrives. */
        }
      }
      stdout = stdout.slice(lineEnd + 1);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      settle({ ok: false, isError: true, text: err.message, timedOut: false });
    });
    child.on("exit", () => {
      if (!settled) {
        clearTimeout(timer);
        settle({
          ok: false,
          isError: true,
          text: `process exited before JSON-RPC response (stdout tail: ${stdout.slice(-400)}, stderr tail: ${stderr.slice(-400)})`,
          timedOut: false,
        });
      }
    });

    const request = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    };
    child.stdin.write(`${JSON.stringify(request)}\n`);
    child.stdin.end();
  });
}

const ownedWorkspace = canRunE2e ? createGitOwnedE2eWorkspace(repoRoot, "unicode") : undefined;
const workspaceRoot = ownedWorkspace?.root ?? join(repoRoot, ".dysflow-e2e", "unicode-skipped");

function setupWorkspace(): void {
  mkdirSync(join(workspaceRoot, ".dysflow"), { recursive: true });
  mkdirSync(join(workspaceRoot, "src", "modules"), { recursive: true });
  cpSync(fixtureFront, join(workspaceRoot, "NoConformidades.accdb"));
  cpSync(fixtureBackend, join(workspaceRoot, "NoConformidades_Datos.accdb"));
  writeFileSync(
    join(workspaceRoot, ".dysflow", "project.json"),
    `${JSON.stringify(
      {
        id: "dysflow-unicode-e2e",
        accessPath: "NoConformidades.accdb",
        backendPath: "NoConformidades_Datos.accdb",
        destinationRoot: "src",
        capabilities: { allowWrites: true },
        timeoutMs: 120_000,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  // EXPEDIENTES fixture: Unicode identifier + strings + comment.
  // Written as a JS template literal so every codepoint round-trips
  // through UTF-8 to disk without mojibake in the test source itself.
  const unicodeModule = [
    'Attribute VB_Name = "TestUnicodeRoundTrip"',
    "Option Compare Database",
    "Option Explicit",
    "",
    "Public Enum EnumSiNo",
    "    [Sí] = 1",
    "    [No] = 0",
    "End Enum",
    "",
    "Public Function GreetSi() As String",
    '    GreetSi = "Sí"',
    "End Function",
    "",
    "Public Function GreetNumero() As String",
    '    GreetNumero = "nº " & CStr(42)',
    "End Function",
    "",
    "Public Function GreetSection() As String",
    '    GreetSection = "§"',
    "End Function",
    "",
    "Public Sub ShowEmDash()",
    "    ' comentario con dash — y Telefónica",
    "    Debug.Print GreetSi()",
    "End Sub",
  ].join("\r\n");
  writeFileSync(
    join(workspaceRoot, "src", "modules", "TestUnicodeRoundTrip.bas"),
    unicodeModule,
    "utf8",
  );
}

function cleanupWorkspace(): void {
  ownedWorkspace?.cleanup();
}

// Setup once at module load so the workspace is ready when each case runs.
if (canRunE2e) {
  setupWorkspace();
}

describe("import-export round-trip — Unicode (EXPEDIENTES bug)", () => {
  const itIfCanRun = canRunE2e ? it : it.skip;

  itIfCanRun(
    "import_modules followed by export_modules preserves Spanish-language Unicode without mojibake",
    async () => {
      // 1. Import the Unicode module into Access.
      const importResp = await callMcp("import_modules", {
        projectId: "dysflow-unicode-e2e",
        moduleNames: ["TestUnicodeRoundTrip"],
        importMode: "Code",
      });
      expect(importResp.timedOut).toBe(false);
      expect(importResp.ok, importResp.text).toBe(true);

      // 2. Export it back to disk.
      const exportResp = await callMcp("export_modules", {
        projectId: "dysflow-unicode-e2e",
        moduleNames: ["TestUnicodeRoundTrip"],
        destinationRoot: join(workspaceRoot, "src", "modules"),
      });
      expect(exportResp.timedOut).toBe(false);
      expect(exportResp.ok, exportResp.text).toBe(true);

      // 3. Read the exported file (written as UTF-8 no BOM by the export path).
      const exportedPath = join(workspaceRoot, "src", "modules", "TestUnicodeRoundTrip.bas");
      const exportedBytes = (await import("node:fs")).readFileSync(exportedPath, "utf8");

      // Mojibake sentinels: any of these appearing means the round-trip broke.
      expect(exportedBytes).not.toContain("SÃ­");
      expect(exportedBytes).not.toContain("Ã");
      expect(exportedBytes).not.toContain("Â§");
      expect(exportedBytes).not.toContain("â€");

      // Original codepoints must survive.
      expect(exportedBytes).toContain("Sí");
      expect(exportedBytes).toContain("EnumSiNo");
      expect(exportedBytes).toContain("§");
      expect(exportedBytes).toContain("nº");
    },
    120_000,
  );

  afterAll(cleanupWorkspace);
});
