/**
 * Integration tests for password handling in dysflow-access-runner.ps1.
 *
 * These tests verify that compact_repair honors the password field (or
 * passwordEnv) from the payload and does not leak the password into any
 * output channel.
 *
 * Guard: DYSFLOW_MOCK_COM=1 is set so these tests run without Access installed.
 *
 * Tasks covered: issue #488
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Guard — must run on Windows (mock COM via DYSFLOW_MOCK_COM=1)
// ---------------------------------------------------------------------------

const isWindows = process.platform === "win32";

const canRun = isWindows; // runner script is Windows-only
if (!canRun) {
  console.warn("[dysflow] Skipping compact_repair password tests: requires Windows.");
}

/** Real DAO availability (for the apply-path test that actually compacts a protected DB). */
function hasDaoCom(): boolean {
  if (!isWindows) return false;
  try {
    const out = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "try { $e = New-Object -ComObject DAO.DBEngine.120; [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($e) | Out-Null; 'ok' } catch { 'missing' }",
      ],
      { encoding: "utf8", windowsHide: true, timeout: 15_000 },
    );
    return out.trim().includes("ok");
  } catch {
    return false;
  }
}
const hasDao = hasDaoCom();

// ---------------------------------------------------------------------------
// PowerShell executor
// ---------------------------------------------------------------------------

function runPs(
  script: string,
  timeoutMs = 30_000,
): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      {
        encoding: "utf8",
        windowsHide: true,
        timeout: timeoutMs,
      },
    );
    return { stdout, stderr: "", exitCode: 0 };
  } catch (error: unknown) {
    const err = error as { status?: number; stdout?: string; stderr?: string };
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      exitCode: err.status ?? 1,
    };
  }
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

describe("compact_repair password handling", { timeout: 60_000 }, () => {
  let tmpRoot: string;
  let scriptPath: string;

  beforeEach(() => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    tmpRoot = join("C:\\Users\\adm1\\AppData\\Local\\Temp", `dysflow-crpw-${id}`);
    mkdirSync(tmpRoot, { recursive: true });
    scriptPath = join(process.cwd(), "scripts", "dysflow-access-runner.ps1");
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  // ------------------------------------------------------------------
  // Test: password from payload.backendPassword — dry-run
  // ------------------------------------------------------------------
  it.skipIf(!canRun)(
    "dry-run: password from payload.backendPassword is not leaked in output",
    () => {
      const testDb = join(tmpRoot, "test.accdb");
      // Create a minimal .accdb using DAO via PowerShell
      runPs(`
        $e = New-Object -ComObject DAO.DBEngine.120
        try {
          $db = $e.CreateDatabase('${testDb}', ';LANGID=0x0409;CP=1252;COUNTRY=0')
          $td = $db.CreateTableDef('Products')
          $f = $td.CreateField('ID', 4)
          $td.Fields.Append($f)
          $db.TableDefs.Append($td)
          $db.Close()
        } finally { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($e) | Out-Null }
      `);

      const secret = "MySecret123";
      const payload = JSON.stringify({
        action: "compact_repair",
        databasePath: testDb,
        backendPassword: secret,
        dryRun: true,
      });

      const result = runPs(`
        $env:DYSFLOW_MOCK_COM = '1'
& '${scriptPath}' -AccessDbPath '${testDb}' -Operation 'query' -PayloadJson '${payload}'
      `);

      // Exit code should be 0
      expect(result.exitCode).toBe(0);

      // Password must NOT appear in stdout, stderr, or DYSFLOW_RESULT line
      const output = result.stdout + result.stderr;
      expect(output).not.toContain(secret);
      expect(output.toLowerCase()).not.toContain("mysecret123");
    },
  );

  // ------------------------------------------------------------------
  // Test: password from payload.password (alias) — dry-run
  // ------------------------------------------------------------------
  it.skipIf(!canRun)(
    "dry-run: password from payload.password (alias) is not leaked in output",
    () => {
      const testDb = join(tmpRoot, "test2.accdb");
      runPs(`
        $e = New-Object -ComObject DAO.DBEngine.120
        try {
          $db = $e.CreateDatabase('${testDb}', ';LANGID=0x0409;CP=1252;COUNTRY=0')
          $td = $db.CreateTableDef('Products')
          $f = $td.CreateField('ID', 4)
          $td.Fields.Append($f)
          $db.TableDefs.Append($td)
          $db.Close()
        } finally { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($e) | Out-Null }
      `);

      const secret = "AliasPwd456";
      const payload = JSON.stringify({
        action: "compact_repair",
        databasePath: testDb,
        password: secret,
        dryRun: true,
      });

      const result = runPs(`
        $env:DYSFLOW_MOCK_COM = '1'
& '${scriptPath}' -AccessDbPath '${testDb}' -Operation 'query' -PayloadJson '${payload}'
      `);

      expect(result.exitCode).toBe(0);
      const output = result.stdout + result.stderr;
      expect(output).not.toContain(secret);
    },
  );

  // ------------------------------------------------------------------
  // Test: password from payload.passwordEnv — dry-run
  // ------------------------------------------------------------------
  it.skipIf(!canRun)(
    "dry-run: password from payload.passwordEnv (env-var name) is not leaked in output",
    () => {
      const testDb = join(tmpRoot, "test3.accdb");
      runPs(`
        $e = New-Object -ComObject DAO.DBEngine.120
        try {
          $db = $e.CreateDatabase('${testDb}', ';LANGID=0x0409;CP=1252;COUNTRY=0')
          $td = $db.CreateTableDef('Products')
          $f = $td.CreateField('ID', 4)
          $td.Fields.Append($f)
          $db.TableDefs.Append($td)
          $db.Close()
        } finally { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($e) | Out-Null }
      `);

      const secret = "EnvVarPwd789";
      const payload = JSON.stringify({
        action: "compact_repair",
        databasePath: testDb,
        passwordEnv: "DYSFLOW_TEST_BACKEND_PASSWORD",
        dryRun: true,
      });

      const result = runPs(`
        $env:DYSFLOW_MOCK_COM = '1'
        $env:DYSFLOW_TEST_BACKEND_PASSWORD = '${secret}'
        & '${scriptPath}' -AccessDbPath '${testDb}' -Operation 'query' -PayloadJson '${payload}'
      `);

      expect(result.exitCode).toBe(0);
      const output = result.stdout + result.stderr;
      expect(output).not.toContain(secret);
    },
  );

  // ------------------------------------------------------------------
  // Test: no password — dry-run still works
  // ------------------------------------------------------------------
  it.skipIf(!canRun)("dry-run: no password still works (backward compatibility)", () => {
    const testDb = join(tmpRoot, "test4.accdb");
    runPs(`
        $e = New-Object -ComObject DAO.DBEngine.120
        try {
          $db = $e.CreateDatabase('${testDb}', ';LANGID=0x0409;CP=1252;COUNTRY=0')
          $td = $db.CreateTableDef('Products')
          $f = $td.CreateField('ID', 4)
          $td.Fields.Append($f)
          $db.TableDefs.Append($td)
          $db.Close()
        } finally { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($e) | Out-Null }
      `);

    const payload = JSON.stringify({
      action: "compact_repair",
      databasePath: testDb,
      dryRun: true,
    });

    const result = runPs(`
        $env:DYSFLOW_MOCK_COM = '1'
& '${scriptPath}' -AccessDbPath '${testDb}' -Operation 'query' -PayloadJson '${payload}'
      `);

    expect(result.exitCode).toBe(0);
    // Should contain DYSFLOW_RESULT with dryRun: true
    expect(result.stdout).toContain("DYSFLOW_RESULT");
    expect(result.stdout).toContain('"dryRun":true');
  });

  // ------------------------------------------------------------------
  // Test (real DAO): apply compaction of a PASSWORD-PROTECTED source.
  // Regression for "No es una contraseña válida": the source password must be
  // passed to DAO CompactDatabase's 5th arg (SrcConnect), not only the 3rd
  // (DstConnect). With the old 3rd-arg-only call this failed to open a protected
  // source. The password reaches the runner via $env:DYSFLOW_ACCESS_PASSWORD
  // (frontend == AccessDbPath -> Resolve-CompactPassword returns $AccessPassword).
  // ------------------------------------------------------------------
  it.skipIf(!canRun || !hasDao)(
    "apply: compacts a password-protected source and keeps it protected",
    () => {
      const testDb = join(tmpRoot, "protected.accdb");
      const pwd = "compactPwd-Áç1";
      const create = runPs(`
        $e = New-Object -ComObject DAO.DBEngine.120
        try {
          $db = $e.CreateDatabase('${testDb}', ';LANGID=0x0409;CP=1252;COUNTRY=0')
          $td = $db.CreateTableDef('Products'); $f = $td.CreateField('ID', 4)
          $td.Fields.Append($f); $db.TableDefs.Append($td)
          $db.NewPassword('', '${pwd}')
          $db.Close()
        } finally { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($e) | Out-Null }
      `);
      expect(create.exitCode).toBe(0);

      // compact_repair apply; password supplied via env (NOT payload, matching production
      // where raw payload passwords are stripped). No DYSFLOW_MOCK_COM -> real DAO.
      const payload = JSON.stringify({ action: "compact_repair", dryRun: false });
      const result = runPs(`
        $env:DYSFLOW_ACCESS_PASSWORD = '${pwd}'
        & '${scriptPath}' -AccessDbPath '${testDb}' -Operation 'query' -PayloadJson '${payload}'
      `);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('"compacted":true');
      // The password must NOT leak into any output channel.
      expect(result.stdout + result.stderr).not.toContain(pwd);

      // The compacted database must still open with the same password (preserved on the output).
      const reopen = runPs(`
        $e = New-Object -ComObject DAO.DBEngine.120
        try { $db = $e.OpenDatabase('${testDb}', $false, $false, ';PWD=${pwd}'); $db.Close(); 'OPENED_OK' }
        finally { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($e) | Out-Null }
      `);
      expect(reopen.stdout).toContain("OPENED_OK");
    },
  );
});
