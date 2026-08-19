/**
 * #1440 — End-to-end regression for `run_vba` procedure-not-found after
 * `import_modules`. The consumer reproduction (v2.37.2) shows the
 * preflight returning `PROCEDURE_NOT_FOUND` for a procedure that
 * `list_procedures` already accepts. The cheap unit tests in
 * `test/core/services/run-vba-procedure-not-found-after-import-1448.test.ts`
 * and the disk-backed resolver tests in
 * `test/adapters/services/node-vba-source-resolver-after-import-1448.test.ts`
 * pin the layered contracts; this E2E proves the full import-to-run_vba
 * chain works against a real Access binary.
 *
 * The test is gated by `canRunE2e` (the same gates as the rest of the
 * E2E suite: DYSFLOW_E2E_COMMAND, an Access COM runtime, and an
 * ACCESS_VBA_PASSWORD env var). When the prerequisites are absent the
 * test no-ops with a warning — the cheap tests still pin the contract.
 *
 * Bloom level: real Access COM + real PowerShell + real import. Cost:
 * ~30–90 s per test (one import + one run_vba per case). This is the
 * price of confidence in the cross-MCP wiring.
 */

import { execFileSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createGitOwnedE2eWorkspace,
  type GitOwnedE2eWorkspace,
} from "../integration/_helpers/git-owned-e2e-workspace";

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
    "[#1440-e2e] Skipping: DYSFLOW_E2E_COMMAND, E2E_testing/*.accdb, Access COM, " +
      "or ACCESS_VBA_PASSWORD are unavailable.",
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
          process.env.ACCESS_VBA_PASSWORD ?? process.env.DYSFLOW_ACCESS_PASSWORD,
        DYSFLOW_BACKEND_PASSWORD:
          process.env.ACCESS_VBA_PASSWORD ?? process.env.DYSFLOW_ACCESS_PASSWORD,
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
    // Per the Anthropic MCP SDK, the initialize handshake is mandatory
    // before any tool call. Emit the bare minimum that the stdio adapter
    // accepts (initialize → notifications/initialized → tools/call).
    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "dysflow-1448-e2e", version: "0.0.0" },
        },
      })}\n` +
        `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n` +
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: toolName, arguments: args },
        })}\n`,
    );
  });
}

function assertUniversalContract(r: McpToolResponse): void {
  if (r.timedOut) throw new Error("MCP timeout");
  expect(r.text).not.toContain("VBA_MANAGER_SERIALIZATION_FAILED");
  // JSON-parseable body — every well-formed response is a JSON object.
  expect(() => JSON.parse(r.text)).not.toThrow();
}

const projectId = "dysflow-1448-e2e";
const moduleName = "modDiagnosticoMigracionTbCambiosParaPublicacion";
const procedureName = `${moduleName}.DumpSchema`;

let workspaceRoot: string;
let sandbox: GitOwnedE2eWorkspace;

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
        capabilities: {
          allowWrites: true,
          procedures: {
            // #1440 reproduction ask: the consumer added the procedure to
            // the allowlist; the bug is that `run_vba` rejects the
            // invocation AFTER the allowlist gate, on the source-scan
            // gate. Mirror the consumer's allowedProcedures config so the
            // preflight path is reached.
            allow: [procedureName],
          },
        },
        timeoutMs: 120_000,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  // The reproduction's `import_modules` step reads this file from disk
  // and the preflight's source-resolver reads the same file. Keeping the
  // two paths pointed at the same bytes is the structural part of the
  // test — a divergence between them is exactly the bug.
  const source = [
    `Attribute VB_Name = "${moduleName}"`,
    "Option Compare Database",
    "Option Explicit",
    "",
    "Public Function DumpSchema() As String",
    '    DumpSchema = "ok"',
    "End Function",
    "",
  ].join("\r\n");
  writeFileSync(join(workspaceRoot, "src", "modules", `${moduleName}.bas`), source, "utf8");
}

describe.skipIf(!canRunE2e)(
  "#1440 — run_vba procedure-not-found after import (real Access)",
  () => {
    beforeAll(() => {
      sandbox = createGitOwnedE2eWorkspace(repoRoot, "1448-run-vba-after-import");
      workspaceRoot = sandbox.root;
      setupWorkspace();
    }, 180_000);

    afterAll(() => {
      try {
        sandbox?.cleanup();
      } catch {
        /* ignore */
      }
    });

    it("import_modules + run_vba must succeed without PROCEDURE_NOT_FOUND on a freshly-imported module", async () => {
      // Step 1 — import the module on disk. Mirrors the consumer's
      // `import_modules({moduleNames: [moduleName], importMode: "Code", apply: true})`.
      const importResult = await callMcp(
        "import_modules",
        {
          projectId,
          moduleNames: [moduleName],
          importMode: "Code",
          apply: true,
        },
        { timeoutMs: 60_000 },
      );
      assertUniversalContract(importResult);
      expect(importResult.ok).toBe(true);

      // Step 2 — list_procedures MUST accept the procedure. The consumer
      // proves this step succeeds; we mirror it here so a regression
      // that breaks both paths is still caught.
      const list = await callMcp(
        "list_procedures",
        {
          projectId,
          module: moduleName,
        },
        { timeoutMs: 60_000 },
      );
      assertUniversalContract(list);
      expect(list.text).toContain("DumpSchema");

      // Step 3 — run_vba MUST NOT return PROCEDURE_NOT_FOUND. The bug
      // report quotes the exact error envelope; we assert the negative
      // so a future regression matching the consumer's pattern fails
      // this test.
      const run = await callMcp(
        "run_vba",
        {
          projectId,
          procedureName,
          apply: true,
        },
        { timeoutMs: 60_000 },
      );
      assertUniversalContract(run);
      expect(run.ok).toBe(true);
      expect(run.text).not.toContain("PROCEDURE_NOT_FOUND");
      expect(run.text).toContain("ok");
    }, 180_000);
  },
);
