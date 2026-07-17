/**
 * Integration tests for the issue #752 verbose contract.
 *
 * Verifies that the `verbose` flag (PowerShell `-VerboseContract`,
 * JSON `verbose: true`) round-trips through dysflow_import_modules and
 * produces the per-module `{source, destination, truncated, mismatchReason}`
 * shape on the success path. The test seeds a real Access binary from the
 * shared `E2E_testing/NoConformidades.accdb` fixture via DAO so it runs in
 * the project's normal Access sandbox.
 *
 * The integration harness skips when:
 *   - the host platform is not Windows,
 *   - PowerShell 7 (`pwsh`) is not on PATH,
 *   - the DAO DBEngine COM component is not registered (a real-Access
 *     pre-requisite that the runner shares with `dysflow-access-runner-*
 *     tests`).
 *
 * Tests covered: issue #752 — opt-in verbose contract.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
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
    const child = require("node:child_process").spawn(
      "pwsh",
      ["-NoProfile", "-NonInteractive", "-File", SCRIPT_PATH, ...args],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
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
  const lines = stdout.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("DYSFLOW_RESULT ")) {
      try {
        return JSON.parse(line.slice("DYSFLOW_RESULT ".length));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function getModuleEntries(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) return payload as Array<Record<string, unknown>>;
  if (payload === null || typeof payload !== "object") return [];

  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.modules)) {
    return record.modules as Array<Record<string, unknown>>;
  }
  return typeof record.module === "string" ? [record] : [];
}

function makeMinimalModuleFile(name: string, body = "' sanity"): string {
  return [
    `Attribute VB_Name = "${name}"`,
    "Option Explicit",
    "Public Sub Sanity()",
    body,
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
  ? "issue #752 verbose contract tests require Windows"
  : !HAS_PWSH
    ? "pwsh 7+ not available on this host"
    : !HAS_DAO
      ? "DAO.DBEngine.120 not registered — real Access fixtures unavailable"
      : !HAS_FIXTURE
        ? `Fixture .accdb missing: ${FIXTURE_SOURCE}`
        : undefined;

describe.skipIf(skipReason !== undefined)(
  "issue #752 — verbose contract (per-module source/destination snapshot)",
  { timeout: 240_000 },
  () => {
    let sandboxRoot: string;
    let moduleSourcePath: string;

    beforeEach(() => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      sandboxRoot = join(tmpdir(), `dysflow-752-verbose-${id}`);
      mkdirSync(sandboxRoot, { recursive: true });
      // Seed a minimal source file. The file's content is irrelevant — the
      // goal of this test is the shape of the verbose envelope, not the
      // import itself succeeding. We give VB_Name = "Test_Foo" and a tiny
      // body so the import stays cheap.
      moduleSourcePath = join(sandboxRoot, "Test_Foo.bas");
      writeFileSync(moduleSourcePath, makeMinimalModuleFile("Test_Foo"));
    });

    afterEach(() => {
      rmSync(sandboxRoot, { recursive: true, force: true });
    });

    it("verbose:true adds a per-module `verbose` field with source/destination snapshots", async () => {
      const result = await runPwsh([
        "-Action",
        "Import",
        "-AccessPath",
        FIXTURE_SOURCE,
        "-DestinationRoot",
        sandboxRoot,
        "-ModuleNamesJson",
        JSON.stringify(["Test_Foo"]),
        "-Json",
        "-VerboseContract",
      ]);
      // The actual import may succeed (status:ok) or fail (status:error).
      // Either way the verbose envelope must be present on the result
      // record when -VerboseContract was passed.
      const payload = parseDysflowResult(result.stdout);
      expect(payload).toBeDefined();
      // The payload can be a per-module array OR a top-level { ok:false, modules:[...] } wrapper.
      const modules = getModuleEntries(payload);
      expect(Array.isArray(modules)).toBe(true);
      expect((modules as unknown[]).length).toBeGreaterThan(0);

      const entry = (modules as Array<Record<string, unknown>>)[0];
      expect(entry).toBeDefined();
      expect(entry?.module).toBe("Test_Foo");
      // Verbose was requested; the per-module entry MUST carry the
      // verbose field with source + destination snapshots.
      const verbose = (entry?.verbose ?? entry?.Verbose) as
        | { source?: unknown; destination?: unknown; truncated?: boolean; mismatchReason?: string }
        | undefined;
      expect(verbose).toBeDefined();
      expect(verbose?.source).toBeDefined();
      expect(verbose?.destination).toBeDefined();
      const source = verbose?.source as { lines?: number; bytes?: number; sha256?: string };
      const destination = verbose?.destination as {
        lines?: number;
        bytes?: number;
        sha256?: string;
      };
      expect(typeof source.lines).toBe("number");
      expect(typeof source.sha256).toBe("string");
      expect(source.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(typeof destination.lines).toBe("number");
      expect(typeof destination.sha256).toBe("string");
      expect(destination.sha256).toMatch(/^[a-f0-9]{64}$/);
    });

    it("verbose:false (or omitted) preserves backward compatibility — `verbose` key is absent from the result", async () => {
      const result = await runPwsh([
        "-Action",
        "Import",
        "-AccessPath",
        FIXTURE_SOURCE,
        "-DestinationRoot",
        sandboxRoot,
        "-ModuleNamesJson",
        JSON.stringify(["Test_Foo"]),
        "-Json",
      ]);
      const payload = parseDysflowResult(result.stdout);
      expect(payload).toBeDefined();
      const modules = getModuleEntries(payload);
      const entry = (modules as Array<Record<string, unknown>>)[0];
      expect(entry).toBeDefined();
      expect(entry?.module).toBe("Test_Foo");
      // Backward compat: when the caller does NOT pass -VerboseContract, the
      // per-module entry MUST NOT carry the verbose field. Existing
      // consumers parse the response by enumerating known keys; an absent
      // field is the simplest possible backward-compat surface.
      expect(entry).not.toHaveProperty("verbose");
      expect(entry).not.toHaveProperty("Verbose");
    });

    it("a source file whose Attribute VB_Name disagrees with the resolved component surfaces VB_NAME_MISMATCH", async () => {
      // Write a source file whose declared VB_Name ("MismatchedName")
      // disagrees with the moduleName parameter ("Test_Foo"). Import-VbaModule
      // resolves Test_Foo to (potentially) the existing component and
      // compares against the source's declared VB_Name. When the two
      // disagree, the per-module error.code MUST be VB_NAME_MISMATCH.
      writeFileSync(moduleSourcePath, makeMinimalModuleFile("MismatchedName"));

      const result = await runPwsh([
        "-Action",
        "Import",
        "-AccessPath",
        FIXTURE_SOURCE,
        "-DestinationRoot",
        sandboxRoot,
        "-ModuleNamesJson",
        JSON.stringify(["Test_Foo"]), // moduleName parameter
        "-Json",
      ]);
      // Even on the error path, the per-module structure must surface the
      // typed signal. The DYSFLOW_RESULT payload itself may be the
      // top-level { ok:false, modules:[...] } shape — assert on whichever
      // shape the runner produced.
      const payload = parseDysflowResult(result.stdout) as Record<string, unknown> | unknown[];
      expect(payload).toBeDefined();

      const topHasVbNameMismatch =
        !Array.isArray(payload) &&
        payload?.error !== null &&
        typeof payload?.error === "object" &&
        ((payload.error as Record<string, unknown>).code as string) === "VB_NAME_MISMATCH";
      const modules = getModuleEntries(payload);
      const entry = (modules as Array<Record<string, unknown>>)[0];
      const errorCode = (entry?.error as { code?: string } | undefined)?.code;
      expect(topHasVbNameMismatch || errorCode === "VB_NAME_MISMATCH").toBe(true);
      expect(entry).toBeDefined();
    });
  },
);
