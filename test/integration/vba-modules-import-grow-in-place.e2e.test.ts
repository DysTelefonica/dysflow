/**
 * Integration tests for F16 import_modules grow-in-place behavior.
 *
 * The scenario pins the port contract: updating an existing VBA module with a
 * larger source file must succeed without surfacing IMPORT_TRUNCATED. The test
 * uses a throwaway copy of the shared Access fixture and skips when Access/DAO
 * prerequisites are unavailable.
 */

import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const REPO_ROOT = resolve(__dirname, "..", "..");
const SCRIPT_PATH = join(REPO_ROOT, "scripts", "dysflow-vba-manager.ps1");
const FIXTURE_SOURCE = join(REPO_ROOT, "E2E_testing", "NoConformidades.accdb");

interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runPwsh(args: readonly string[]): Promise<SpawnResult> {
  return new Promise((resolvePromise) => {
    const child = spawn("pwsh", ["-NoProfile", "-NonInteractive", "-File", SCRIPT_PATH, ...args], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("close", (code: number | null) => {
      resolvePromise({ stdout, stderr, exitCode: code ?? -1 });
    });
  });
}

function parseDysflowResult(stdout: string): unknown | null {
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith("DYSFLOW_RESULT ")) continue;
    try {
      return JSON.parse(line.slice("DYSFLOW_RESULT ".length));
    } catch {
      return null;
    }
  }
  return null;
}

function getFirstModuleEntry(payload: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(payload)) return payload[0] as Record<string, unknown> | undefined;
  if (payload === null || typeof payload !== "object") return undefined;

  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.modules)) {
    return record.modules[0] as Record<string, unknown> | undefined;
  }
  return typeof record.module === "string" ? record : undefined;
}

function makeModule(name: string, lineCount: number): string {
  const filler = Array.from(
    { length: lineCount },
    (_, index) => `    Debug.Print "line ${index + 1}"`,
  );
  return [
    `Attribute VB_Name = "${name}"`,
    "Option Explicit",
    "Public Sub Sanity()",
    ...filler,
    "End Sub",
  ].join("\r\n");
}

const canRunOnWindows = process.platform === "win32";
const HAS_PWSH = (() => {
  if (!canRunOnWindows) return false;
  try {
    const out = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "if (Get-Command pwsh -ErrorAction SilentlyContinue) { 'pwsh-ok' } else { 'pwsh-missing' }",
      ],
      { encoding: "utf8", timeout: 15_000, windowsHide: true },
    ).trim();
    return out.includes("pwsh-ok");
  } catch {
    return false;
  }
})();

const HAS_DAO = (() => {
  if (!canRunOnWindows) return false;
  try {
    const out = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "try { $e = New-Object -ComObject DAO.DBEngine.120; [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($e) | Out-Null; 'dao-ok' } catch { 'dao-missing' }",
      ],
      { encoding: "utf8", timeout: 15_000, windowsHide: true },
    ).trim();
    return out.includes("dao-ok");
  } catch {
    return false;
  }
})();

const HAS_FIXTURE = existsSync(FIXTURE_SOURCE);

const skipReason = !canRunOnWindows
  ? "F16 grow-in-place import tests require Windows"
  : !HAS_PWSH
    ? "pwsh 7+ not available on this host"
    : !HAS_DAO
      ? "DAO.DBEngine.120 not registered — real Access fixtures unavailable"
      : !HAS_FIXTURE
        ? `Fixture .accdb missing: ${FIXTURE_SOURCE}`
        : undefined;

describe.skipIf(skipReason !== undefined)(
  "F16 — import_modules replaces larger source in place",
  { timeout: 240_000 },
  () => {
    let sandboxRoot: string;
    let modulesRoot: string;
    let accessPath: string;
    const moduleName = "Test_F16GrowImport";

    beforeEach(() => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      sandboxRoot = join(tmpdir(), `dysflow-f16-grow-${id}`);
      modulesRoot = join(sandboxRoot, "modules");
      mkdirSync(modulesRoot, { recursive: true });
      accessPath = join(sandboxRoot, "NoConformidades.accdb");
      copyFileSync(FIXTURE_SOURCE, accessPath);
    });

    afterEach(() => {
      rmSync(sandboxRoot, { recursive: true, force: true });
    });

    it("imports a larger source over an existing module without IMPORT_TRUNCATED", async () => {
      const modulePath = join(modulesRoot, `${moduleName}.bas`);
      writeFileSync(modulePath, makeModule(moduleName, 2));

      const initial = await runPwsh([
        "-Action",
        "Import",
        "-AccessPath",
        accessPath,
        "-DestinationRoot",
        modulesRoot,
        "-ModuleNamesJson",
        JSON.stringify([moduleName]),
        "-Json",
      ]);
      expect(initial.exitCode).toBe(0);
      expect(getFirstModuleEntry(parseDysflowResult(initial.stdout))?.status).toBe("ok");

      writeFileSync(modulePath, makeModule(moduleName, 40));
      const grown = await runPwsh([
        "-Action",
        "Import",
        "-AccessPath",
        accessPath,
        "-DestinationRoot",
        modulesRoot,
        "-ModuleNamesJson",
        JSON.stringify([moduleName]),
        "-Json",
        "-VerboseContract",
      ]);

      const entry = getFirstModuleEntry(parseDysflowResult(grown.stdout));
      expect(grown.exitCode).toBe(0);
      expect(entry?.status).toBe("ok");
      expect((entry?.error as { code?: string } | null)?.code).not.toBe("IMPORT_TRUNCATED");
      const verbose = (entry?.verbose ?? entry?.Verbose) as { truncated?: boolean } | undefined;
      expect(verbose?.truncated).toBe(false);
    });
  },
);
