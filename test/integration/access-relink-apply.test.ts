/**
 * Integration tests for `relink_directory` apply mode.
 *
 * These tests require DAO.DBEngine.120 (Windows + Access runtime installed)
 * and are excluded from the standard vitest run. Run manually or in a
 * Windows CI pipeline that has the Access runtime available.
 *
 * Guard: hasDaoCom() — checks that DAO.DBEngine.120 is instantiable.
 *
 * Tasks covered: 6.11, 6.12, 6.13, 6.14
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleRelinkDirectoryCommand } from "../../src/cli/commands/access/relink-directory.js";
import { loadDysflowConfig } from "../../src/core/config/dysflow-config.js";
import type { OperationResult, RelinkDirectoryReport } from "../../src/core/contracts/index.js";
import { successResult } from "../../src/core/contracts/index.js";
import { AccessPowerShellRunner } from "../../src/core/runner/access-runner.js";
import type { AccessQueryResult } from "../../src/core/services/query-service.js";
import { AccessQueryService } from "../../src/core/services/query-service.js";

// ---------------------------------------------------------------------------
// Guard — DAO.DBEngine.120 availability check
// ---------------------------------------------------------------------------

function hasDaoCom(): boolean {
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

const canRun = hasDaoCom();
if (!canRun) {
  console.warn(
    "[dysflow] Skipping relink-directory integration tests: DAO.DBEngine.120 unavailable.",
  );
}

// ---------------------------------------------------------------------------
// PowerShell fixture helpers
// ---------------------------------------------------------------------------

function runPs(script: string, timeoutMs = 45_000): string {
  return execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    windowsHide: true,
    timeout: timeoutMs,
  });
}

/** Build PS script that creates a backend .accdb with a single native "Products" table. */
function psCreateNativeDb(path: string): string {
  return `
    $e = New-Object -ComObject DAO.DBEngine.120
    try {
      $db = $e.CreateDatabase('${path}', ';LANGID=0x0409;CP=1252;COUNTRY=0')
      $td = $db.CreateTableDef('Products')
      $f  = $td.CreateField('ID', 4)
      $td.Fields.Append($f)
      $db.TableDefs.Append($td)
      $db.Close()
    } finally { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($e) | Out-Null }
    'done'
  `;
}

/** Build PS script that creates a frontend .accdb whose linkName table links to backendPath. */
function psCreateLinkedDb(
  frontendPath: string,
  backendPath: string,
  sourceTable = "Products",
  linkName = "Products",
): string {
  return `
    $e = New-Object -ComObject DAO.DBEngine.120
    try {
      $db = $e.CreateDatabase('${frontendPath}', ';LANGID=0x0409;CP=1252;COUNTRY=0')
      $lk = $db.CreateTableDef('${linkName}')
      $lk.Connect = ';DATABASE=${backendPath}'
      $lk.SourceTableName = '${sourceTable}'
      $db.TableDefs.Append($lk)
      $db.Close()
    } finally { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($e) | Out-Null }
    'done'
  `;
}

/** Read the Connect string for a table in an .accdb. */
function psReadConnect(dbPath: string, tableName: string): string {
  const raw = runPs(`
    $e = New-Object -ComObject DAO.DBEngine.120
    try {
      $db = $e.OpenDatabase('${dbPath}', $false, $true)
      try {
        $connect = ''
        foreach ($td in $db.TableDefs) {
          if ($td.Name -eq '${tableName}') { $connect = $td.Connect; break }
        }
        $connect
      } finally { $db.Close() }
    } finally { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($e) | Out-Null }
  `);
  return raw.trim();
}

/** Check whether a table exists in an .accdb. */
function psTableExists(dbPath: string, tableName: string): boolean {
  const raw = runPs(`
    $e = New-Object -ComObject DAO.DBEngine.120
    try {
      $db = $e.OpenDatabase('${dbPath}', $false, $true)
      try {
        $found = $false
        foreach ($td in $db.TableDefs) {
          if ($td.Name -eq '${tableName}') { $found = $true; break }
        }
        if ($found) { 'yes' } else { 'no' }
      } finally { $db.Close() }
    } finally { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($e) | Out-Null }
  `);
  return raw.trim() === "yes";
}

// ---------------------------------------------------------------------------
// Service factory
// ---------------------------------------------------------------------------

function makeService(rootPath: string): AccessQueryService {
  const cfg = loadDysflowConfig({ accessDbPath: rootPath });
  if (!cfg.ok) throw new Error(`loadDysflowConfig failed: ${cfg.error.message}`);
  return new AccessQueryService({ runner: new AccessPowerShellRunner(), config: cfg.data });
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("relink-directory apply integration", { timeout: 90_000 }, () => {
  let tmpRoot: string;
  let extRoot: string;

  beforeEach(() => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    tmpRoot = join(tmpdir(), `dysflow-rlint-${id}`);
    extRoot = join(tmpdir(), `dysflow-rlext-${id}`);
    mkdirSync(tmpRoot, { recursive: true });
    mkdirSync(extRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
    rmSync(extRoot, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // Task 6.11 — apply remaps link, creates .bak-* backup; re-run is alreadyLocal
  // -----------------------------------------------------------------------
  it.skipIf(!canRun)(
    "6.11 apply: remaps external link, creates .bak-* backup; re-run dry-run shows alreadyLocal",
    async () => {
      const extBackend = join(extRoot, "backend.accdb");
      const localBackend = join(tmpRoot, "backend.accdb");
      const frontend = join(tmpRoot, "frontend.accdb");

      // Build fixture: external backend, local copy, frontend linked to external
      runPs(psCreateNativeDb(extBackend));
      runPs(`Copy-Item -LiteralPath '${extBackend}' -Destination '${localBackend}'`);
      runPs(psCreateLinkedDb(frontend, extBackend));

      const service = makeService(tmpRoot);

      // Apply
      const applyResult = await handleRelinkDirectoryCommand(
        ["--root", tmpRoot, "--apply"],
        {},
        { service },
      );
      expect(applyResult.exitCode).toBe(0);

      // Backup file must exist next to frontend
      const bakFiles = readdirSync(tmpRoot).filter((f) => f.startsWith("frontend.accdb.bak-"));
      expect(bakFiles.length).toBeGreaterThan(0);

      // Connect string now points to local backend
      const connect = psReadConnect(frontend, "Products");
      expect(connect.toLowerCase()).toContain(localBackend.toLowerCase());

      // Re-run dry-run: link is now alreadyLocal, no planned relinks
      const dryResult = await handleRelinkDirectoryCommand(
        ["--root", tmpRoot, "--dry-run", "--json"],
        {},
        { service },
      );
      expect(dryResult.exitCode).toBe(0);
      const report = JSON.parse(dryResult.stdout) as RelinkDirectoryReport;
      expect(report.alreadyLocal).toBeGreaterThan(0);
      expect(report.plannedRelinks).toBe(0);
    },
  );

  // -----------------------------------------------------------------------
  // Task 6.12 — --remove-unresolved deletes the unresolvable TableDef
  // -----------------------------------------------------------------------
  it.skipIf(!canRun)(
    "6.12 --remove-unresolved: unresolvable linked table is deleted from TableDefs",
    async () => {
      const extBackend = join(extRoot, "backend.accdb");
      const frontend = join(tmpRoot, "frontend.accdb");

      runPs(psCreateNativeDb(extBackend));
      runPs(psCreateLinkedDb(frontend, extBackend));

      // Do NOT copy backend.accdb to tmpRoot → link is unresolvable inside tmpRoot
      expect(existsSync(join(tmpRoot, "backend.accdb"))).toBe(false);

      const service = makeService(tmpRoot);
      const result = await handleRelinkDirectoryCommand(
        ["--root", tmpRoot, "--apply", "--remove-unresolved"],
        {},
        { service },
      );

      expect(result.exitCode).toBe(0);
      expect(psTableExists(frontend, "Products")).toBe(false);
    },
  );

  // -----------------------------------------------------------------------
  // Task 6.13 — chain A→B→C: after apply, A links directly to C (chainHops:2)
  // -----------------------------------------------------------------------
  it.skipIf(!canRun)(
    "6.13 chain A→B→C: after apply A links directly to C with chainHops:2",
    async () => {
      // extC: native "Products"; extB: links extC.Products; frontend: links extB.Products
      const extC = join(extRoot, "C_backend.accdb");
      const extB = join(extRoot, "B_middle.accdb");
      const localC = join(tmpRoot, "C_backend.accdb");
      const localB = join(tmpRoot, "B_middle.accdb");
      const frontend = join(tmpRoot, "frontend.accdb");

      runPs(psCreateNativeDb(extC));
      runPs(psCreateNativeDb(extB));
      runPs(psCreateLinkedDb(frontend, extB));

      // Rewrite extB.Products to link to extC
      runPs(`
        $e = New-Object -ComObject DAO.DBEngine.120
        try {
          $db = $e.OpenDatabase('${extB}', $false, $false)
          $db.TableDefs.Delete('Products')
          $lk = $db.CreateTableDef('Products')
          $lk.Connect = ';DATABASE=${extC}'
          $lk.SourceTableName = 'Products'
          $db.TableDefs.Append($lk)
          $db.Close()
        } finally { [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($e) | Out-Null }
      `);

      // Copy both to local root (making chain resolvable)
      runPs(`Copy-Item -LiteralPath '${extC}' -Destination '${localC}'`);
      runPs(`Copy-Item -LiteralPath '${extB}' -Destination '${localB}'`);

      const service = makeService(tmpRoot);
      const jsonResult = await handleRelinkDirectoryCommand(
        ["--root", tmpRoot, "--apply", "--json"],
        {},
        { service },
      );

      expect(jsonResult.exitCode).toBe(0);
      const report = JSON.parse(jsonResult.stdout) as RelinkDirectoryReport;
      expect(report.appliedRelinks).toBeGreaterThan(0);

      // frontend.Products must now point to C_backend (the native endpoint)
      const connect = psReadConnect(frontend, "Products");
      expect(connect.toLowerCase()).toContain("c_backend.accdb");
      expect(connect.toLowerCase()).not.toContain("b_middle.accdb");

      // chainHops should be 2 (frontend→B→C)
      const frontendResult = report.fileResults.find(
        (fr) => (fr as { filePath: string }).filePath.toLowerCase() === frontend.toLowerCase(),
      ) as { links: Array<{ chainHops: number }> } | undefined;
      const link = frontendResult?.links?.[0];
      expect(link?.chainHops).toBe(2);
    },
  );

  // -----------------------------------------------------------------------
  // Task 6.14 — cycle A→B→A: cycleDetected:true, no mutations (fake service)
  // -----------------------------------------------------------------------
  it("6.14 cycle detection: cycleDetected links are preserved in report and handler returns exit 0", async () => {
    // Use a FakeQueryService returning a cycle report — no COM needed
    const cycleReport: RelinkDirectoryReport = {
      mode: "apply",
      root: tmpRoot,
      filesScanned: 2,
      linkedTablesFound: 2,
      alreadyLocal: 0,
      plannedRelinks: 0,
      appliedRelinks: 0,
      unresolved: [],
      removed: [],
      externalLinkCount: 0,
      datosteLinkCount: 0,
      brokenLinkCount: 0,
      backupPaths: [],
      errors: [],
      fileResults: [
        {
          filePath: join(tmpRoot, "a.accdb"),
          linkedTablesFound: 1,
          alreadyLocal: 0,
          plannedRelinks: 0,
          appliedRelinks: 0,
          links: [
            {
              database: join(tmpRoot, "a.accdb"),
              linkName: "Ref",
              originalBackendPath: join(extRoot, "b.accdb"),
              classification: "cycle",
              resolvedLocalPath: null,
              chainHops: 2,
              cycleDetected: true,
            },
          ],
          errors: [],
        },
      ],
    };

    const fakeService = {
      async execute(_req: unknown): Promise<OperationResult<AccessQueryResult>> {
        return successResult({ relinkDirectory: cycleReport });
      },
    };

    const result = await handleRelinkDirectoryCommand(
      ["--root", tmpRoot, "--apply", "--json"],
      {},
      { service: fakeService },
    );

    // No errors → exit code 0 (no external/deny counts triggered)
    expect(result.exitCode).toBe(0);

    const report = JSON.parse(result.stdout) as RelinkDirectoryReport;
    const link = report.fileResults?.[0]?.links?.[0] as
      | { cycleDetected?: boolean; classification?: string }
      | undefined;
    expect(link?.cycleDetected).toBe(true);
    expect(link?.classification).toBe("cycle");

    // No files were modified (no backups, no applied relinks)
    expect(report.appliedRelinks).toBe(0);
    expect(report.backupPaths.length).toBe(0);
  });
});
