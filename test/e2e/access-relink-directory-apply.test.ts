delete process.env.DYSFLOW_HOME;

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { successResult } from "../../src/core/contracts/index.js";
import type { OperationResult } from "../../src/core/contracts/index.js";
import type { AccessQueryResult } from "../../src/core/services/query-service.js";
import type { RelinkDirectoryReport } from "../../src/core/contracts/index.js";
import { handleRelinkDirectoryCommand } from "../../src/cli/commands/access/relink-directory.js";
import { loadDysflowConfig } from "../../src/core/config/dysflow-config.js";
import { AccessPowerShellRunner } from "../../src/core/runner/access-runner.js";
import { AccessQueryService } from "../../src/core/services/query-service.js";

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

function hasDaoCom(): boolean {
  try {
    const out = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command",
        "try { $e = New-Object -ComObject DAO.DBEngine.120; [System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($e) | Out-Null; 'ok' } catch { 'missing' }"],
      { encoding: "utf8", windowsHide: true, timeout: 15_000 },
    );
    return out.trim().includes("ok");
  } catch {
    return false;
  }
}

const canRun = hasDaoCom();
if (!canRun) {
  console.warn("[dysflow] Skipping relink-directory apply E2E: DAO.DBEngine.120 unavailable.");
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function runPs(script: string, timeoutMs = 45_000): string {
  return execFileSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { encoding: "utf8", windowsHide: true, timeout: timeoutMs },
  );
}

/**
 * Create a backend .accdb with a single native table "Products" (one ID field).
 */
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

/**
 * Create a frontend .accdb whose "Products" table links to $backendPath.
 * DAO validates the source table exists in the backend at creation time.
 */
function psCreateLinkedDb(frontendPath: string, backendPath: string, sourceTable = "Products", linkName = "Products"): string {
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

/** Read the Connect string for a given table name in an .accdb. */
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

/** Check if a table exists in an .accdb. */
function psTableExists(dbPath: string, tableName: string): boolean {
  const raw = runPs(`
    $e = New-Object -ComObject DAO.DBEngine.120
    try {
      $db = $e.OpenDatabase('${dbPath}', $false, $true)
      try {
        $found = $false
        foreach ($td in $db.TableDefs) { if ($td.Name -eq '${tableName}') { $found = $true; break } }
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

describe("relink-directory apply integration", { timeout: 60_000 }, () => {
  let tmpRoot: string;
  let extRoot: string;

  beforeEach(() => {
    tmpRoot = join(tmpdir(), `dysflow-rld-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    extRoot = join(tmpdir(), `dysflow-rld-ext-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(tmpRoot, { recursive: true });
    mkdirSync(extRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
    rmSync(extRoot, { recursive: true, force: true });
  });

  // 6.11 — apply creates backup and remaps link; re-run dry-run → alreadyLocal
  it.skipIf(!canRun)(
    "apply: remaps external link, creates .bak-* backup; re-run is alreadyLocal",
    async () => {
      const extBackend  = join(extRoot, "backend.accdb");
      const localBackend = join(tmpRoot, "backend.accdb");
      const frontend     = join(tmpRoot, "frontend.accdb");

      runPs(psCreateNativeDb(extBackend));
      runPs(`Copy-Item -LiteralPath '${extBackend}' -Destination '${localBackend}'`);
      runPs(psCreateLinkedDb(frontend, extBackend));

      const service = makeService(tmpRoot);
      const applyResult = await handleRelinkDirectoryCommand(
        ["--root", tmpRoot, "--apply"],
        {},
        { service },
      );

      expect(applyResult.exitCode).toBe(0);

      // Backup must exist next to frontend
      const bakFiles = require("node:fs").readdirSync(tmpRoot)
        .filter((f: string) => f.startsWith("frontend.accdb.bak-"));
      expect(bakFiles.length).toBeGreaterThan(0);

      // Connect string now points to local backend
      const connect = psReadConnect(frontend, "Products");
      expect(connect.toLowerCase()).toContain(localBackend.toLowerCase());

      // Re-run dry-run: link is now alreadyLocal
      const dryResult = await handleRelinkDirectoryCommand(
        ["--root", tmpRoot, "--dry-run"],
        {},
        { service },
      );
      expect(dryResult.exitCode).toBe(0);
      const report = JSON.parse(
        await handleRelinkDirectoryCommand(["--root", tmpRoot, "--dry-run", "--json"], {}, { service })
          .then(r => r.stdout),
      ) as RelinkDirectoryReport;
      expect(report.alreadyLocal).toBeGreaterThan(0);
      expect(report.plannedRelinks).toBe(0);
    },
  );

  // 6.12 — --remove-unresolved deletes the unresolvable linked table
  it.skipIf(!canRun)(
    "--remove-unresolved: unresolvable link deleted from TableDefs",
    async () => {
      const extBackend = join(extRoot, "backend.accdb");
      const frontend   = join(tmpRoot, "frontend.accdb");

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

  // 6.13 — chain A→B→C: after apply, A links directly to C (chainHops:2)
  it.skipIf(!canRun)(
    "chain A→B→C: after apply A links directly to C with chainHops 2",
    async () => {
      // extC has native "Products"; extB links to extC.
      // Local root has copies of B and C plus a frontend linking to extB.
      const extC  = join(extRoot, "C_backend.accdb");
      const extB  = join(extRoot, "B_middle.accdb");
      const localC = join(tmpRoot, "C_backend.accdb");
      const localB = join(tmpRoot, "B_middle.accdb");
      const frontend = join(tmpRoot, "frontend.accdb");

      runPs(psCreateNativeDb(extC));
      runPs(psCreateNativeDb(extB));
      runPs(psCreateLinkedDb(frontend, extB));
      runPs(`
        $e=New-Object -ComObject DAO.DBEngine.120
        try {
          $db=$e.OpenDatabase('${extB}',$false,$false)
          $db.TableDefs.Delete('Products')
          $lk=$db.CreateTableDef('Products')
          $lk.Connect=';DATABASE=${extC}'
          $lk.SourceTableName='Products'
          $db.TableDefs.Append($lk)
          $db.Close()
        } finally { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($e)|Out-Null }
      `);
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

      // After apply, frontend.Products must point to C_backend (the native endpoint)
      const connect = psReadConnect(frontend, "Products");
      expect(connect.toLowerCase()).toContain("c_backend.accdb");

      // chainHops should be 2 (frontend→B→C)
      const frontendResult = report.fileResults.find(
        fr => (fr as { filePath: string }).filePath.toLowerCase() === frontend.toLowerCase(),
      ) as { links: Array<{ chainHops: number }> } | undefined;
      const link = frontendResult?.links?.[0];
      expect(link?.chainHops).toBe(2);
    },
  );

  // 6.14 — cycle: FakeQueryService returns cycleDetected; TS handler propagates it
  it(
    "cycle detection: cycleDetected links pass through report unchanged",
    async () => {
      const cycleReport: RelinkDirectoryReport = {
        mode: "apply", root: tmpRoot,
        filesScanned: 1, linkedTablesFound: 1,
        alreadyLocal: 0, plannedRelinks: 0, appliedRelinks: 0,
        unresolved: [], removed: [],
        externalLinkCount: 1, datosteLinkCount: 0, brokenLinkCount: 0,
        backupPaths: [], errors: [],
        fileResults: [{
          filePath: join(tmpRoot, "frontend.accdb"),
          linkedTablesFound: 1, alreadyLocal: 0, plannedRelinks: 0, appliedRelinks: 0,
          links: [{
            database: join(tmpRoot, "frontend.accdb"),
            linkName: "Products",
            originalBackendPath: "\\\\ext\\share\\backend.accdb",
            classification: "cycle",
            resolvedLocalPath: null,
            chainHops: 2,
            cycleDetected: true,
          }],
          errors: [],
        }],
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

      expect(result.exitCode).toBe(0);
      const report = JSON.parse(result.stdout) as RelinkDirectoryReport;
      const link = report.fileResults?.[0]?.links?.[0] as { cycleDetected?: boolean };
      expect(link?.cycleDetected).toBe(true);
    },
  );
});
