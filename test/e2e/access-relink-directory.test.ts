/**
 * E2E suite for `dysflow access relink-directory`.
 * Requires DAO.DBEngine.120 (Windows + Access runtime installed).
 * Excluded from the standard vitest run — run manually or in a Windows E2E pipeline.
 */
delete process.env.DYSFLOW_HOME;

import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
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
// Guard
// ---------------------------------------------------------------------------

function hasDaoCom(): boolean {
  try {
    const out = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "try { $e=New-Object -ComObject DAO.DBEngine.120; [Runtime.InteropServices.Marshal]::FinalReleaseComObject($e)|Out-Null; 'ok' } catch { 'missing' }",
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
  console.warn("[dysflow] Skipping relink-directory E2E: DAO.DBEngine.120 unavailable.");
}

// ---------------------------------------------------------------------------
// PS helpers
// ---------------------------------------------------------------------------

function ps(script: string): void {
  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 45_000,
  });
}

/** Create a backend .accdb with a single native table "Products". */
function createNativeDb(path: string): void {
  ps(`
    $e=$_=$null; $e=New-Object -ComObject DAO.DBEngine.120
    try {
      $db=$e.CreateDatabase('${path}',';LANGID=0x0409;CP=1252;COUNTRY=0')
      $td=$db.CreateTableDef('Products'); $f=$td.CreateField('ID',4)
      $td.Fields.Append($f); $db.TableDefs.Append($td); $db.Close()
    } finally { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($e)|Out-Null }
  `);
}

/** Create a frontend .accdb whose $linkName links to $backendPath.$sourceTable. */
function createLinkedDb(
  frontendPath: string,
  backendPath: string,
  sourceTable = "Products",
  linkName = "Products",
): void {
  ps(`
    $e=New-Object -ComObject DAO.DBEngine.120
    try {
      $db=$e.CreateDatabase('${frontendPath}',';LANGID=0x0409;CP=1252;COUNTRY=0')
      $lk=$db.CreateTableDef('${linkName}')
      $lk.Connect=';DATABASE=${backendPath}'
      $lk.SourceTableName='${sourceTable}'
      $db.TableDefs.Append($lk); $db.Close()
    } finally { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($e)|Out-Null }
  `);
}

function readConnect(dbPath: string, tableName: string): string {
  const out = execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `
    $e=New-Object -ComObject DAO.DBEngine.120
    try {
      $db=$e.OpenDatabase('${dbPath}',$false,$true)
      try { foreach($td in $db.TableDefs){ if($td.Name -eq '${tableName}'){ $td.Connect; break } } }
      finally { $db.Close() }
    } finally { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($e)|Out-Null }
  `,
    ],
    { encoding: "utf8", windowsHide: true, timeout: 30_000 },
  );
  return out.trim();
}

function _tableExists(dbPath: string, tableName: string): boolean {
  const out = execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `
    $e=New-Object -ComObject DAO.DBEngine.120
    try {
      $db=$e.OpenDatabase('${dbPath}',$false,$true)
      try { $found=$false; foreach($td in $db.TableDefs){ if($td.Name -eq '${tableName}'){ $found=$true; break } }; if($found){'yes'}else{'no'} }
      finally { $db.Close() }
    } finally { [Runtime.InteropServices.Marshal]::FinalReleaseComObject($e)|Out-Null }
  `,
    ],
    { encoding: "utf8", windowsHide: true, timeout: 30_000 },
  );
  return out.trim() === "yes";
}

// ---------------------------------------------------------------------------
// Service factory
// ---------------------------------------------------------------------------

function makeService(rootPath: string): AccessQueryService {
  const cfg = loadDysflowConfig({ accessDbPath: rootPath });
  if (!cfg.ok) throw new Error(`Config failed: ${cfg.error.message}`);
  return new AccessQueryService({ runner: new AccessPowerShellRunner(), config: cfg.data });
}

async function runRelink(
  rootPath: string,
  extraArgs: string[] = [],
): Promise<RelinkDirectoryReport> {
  const service = makeService(rootPath);
  const result = await handleRelinkDirectoryCommand(
    ["--root", rootPath, "--json", ...extraArgs],
    {},
    { service },
  );
  if (!result.stdout) throw new Error(`No stdout. stderr: ${result.stderr}`);
  return JSON.parse(result.stdout) as RelinkDirectoryReport;
}

// ---------------------------------------------------------------------------
// E2E suite
// ---------------------------------------------------------------------------

describe("relink-directory E2E", { timeout: 90_000 }, () => {
  let local: string;
  let ext: string;

  beforeEach(() => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    local = join(tmpdir(), `rld-local-${id}`);
    ext = join(tmpdir(), `rld-ext-${id}`);
    mkdirSync(local, { recursive: true });
    mkdirSync(ext, { recursive: true });
  });

  afterEach(() => {
    rmSync(local, { recursive: true, force: true });
    rmSync(ext, { recursive: true, force: true });
  });

  // 7.8 — dry-run: no .bak files, plannedRelinks > 0
  it.skipIf(!canRun)("dry-run: no .bak files created, plannedRelinks reported", async () => {
    const extBackend = join(ext, "backend.accdb");
    const localBackend = join(local, "backend.accdb");
    const frontend = join(local, "frontend.accdb");
    createNativeDb(extBackend);
    ps(`Copy-Item -LiteralPath '${extBackend}' -Destination '${localBackend}'`);
    createLinkedDb(frontend, extBackend);

    const report = await runRelink(local, ["--dry-run"]);

    expect(report.mode).toBe("dry-run");
    expect(report.plannedRelinks).toBeGreaterThan(0);
    // No backup files created
    expect(readdirSync(local).some((f) => f.includes(".bak-"))).toBe(false);
  });

  // 7.9 — apply: .bak-* exists, link points local, exit 0
  it.skipIf(!canRun)("apply: creates .bak-* backup and remaps link to local path", async () => {
    const extBackend = join(ext, "backend.accdb");
    const localBackend = join(local, "backend.accdb");
    const frontend = join(local, "frontend.accdb");
    createNativeDb(extBackend);
    ps(`Copy-Item -LiteralPath '${extBackend}' -Destination '${localBackend}'`);
    createLinkedDb(frontend, extBackend);

    const service = makeService(local);
    const result = await handleRelinkDirectoryCommand(
      ["--root", local, "--apply"],
      {},
      { service },
    );

    expect(result.exitCode).toBe(0);
    expect(readdirSync(local).some((f) => f.startsWith("frontend.accdb.bak-"))).toBe(true);
    expect(readConnect(frontend, "Products").toLowerCase()).toContain("backend.accdb");
    expect(readConnect(frontend, "Products").toLowerCase()).toContain(local.toLowerCase());
  });

  // 7.10 — verify after apply: externalLinkCount:0, exit 0
  it.skipIf(!canRun)(
    "after apply: externalLinkCount is 0 and exit code is 0 with --strict-local",
    async () => {
      const extBackend = join(ext, "backend.accdb");
      const localBackend = join(local, "backend.accdb");
      const frontend = join(local, "frontend.accdb");
      createNativeDb(extBackend);
      ps(`Copy-Item -LiteralPath '${extBackend}' -Destination '${localBackend}'`);
      createLinkedDb(frontend, extBackend);

      // Apply first
      await runRelink(local, ["--apply"]);

      // Re-run with --strict-local: should be exit 0 (no external links remaining)
      const service = makeService(local);
      const result = await handleRelinkDirectoryCommand(
        ["--root", local, "--dry-run", "--strict-local"],
        {},
        { service },
      );
      expect(result.exitCode).toBe(0);

      const report = await runRelink(local, ["--dry-run"]);
      expect(report.externalLinkCount).toBe(0);
    },
  );

  // 7.11 — chain A→B→C: after apply, frontend links directly to C with chainHops:2
  it.skipIf(!canRun)(
    "chain A→B→C: apply resolves to native endpoint with chainHops 2",
    async () => {
      const extC = join(ext, "C_backend.accdb");
      const extB = join(ext, "B_middle.accdb");
      const localC = join(local, "C_backend.accdb");
      const localB = join(local, "B_middle.accdb");
      const frontend = join(local, "frontend.accdb");

      createNativeDb(extC);
      createNativeDb(extB);
      createLinkedDb(frontend, extB);
      ps(`
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
      ps(`Copy-Item -LiteralPath '${extC}' -Destination '${localC}'`);
      ps(`Copy-Item -LiteralPath '${extB}' -Destination '${localB}'`);

      const report = await runRelink(local, ["--apply"]);

      expect(report.appliedRelinks).toBeGreaterThan(0);
      // Frontend must now link to C_backend.accdb (not B_middle)
      const connect = readConnect(frontend, "Products").toLowerCase();
      expect(connect).toContain("c_backend.accdb");
      expect(connect).not.toContain("b_middle.accdb");

      // chainHops should be 2
      const frontendResult = report.fileResults?.find(
        (fr: { filePath: string }) => fr.filePath.toLowerCase() === frontend.toLowerCase(),
      ) as { links: Array<{ chainHops: number }> } | undefined;
      expect(frontendResult?.links?.[0]?.chainHops).toBe(2);
    },
  );

  // 7.12 — --strict-local with an unresolvable link: exit 1, externalLinkCount > 0
  it.skipIf(!canRun)(
    "--strict-local: exits 1 when unresolvable external link remains",
    async () => {
      const extBackend = join(ext, "backend.accdb");
      const frontend = join(local, "frontend.accdb");
      createNativeDb(extBackend);
      // Do NOT copy backend to local → link is unresolvable
      createLinkedDb(frontend, extBackend);

      const service = makeService(local);
      const result = await handleRelinkDirectoryCommand(
        ["--root", local, "--dry-run", "--strict-local"],
        {},
        { service },
      );

      expect(result.exitCode).toBe(1);

      const report = await runRelink(local, ["--dry-run"]);
      expect(report.externalLinkCount).toBeGreaterThan(0);
    },
  );

  // 7.13 — --deny-prefix: exit 1 when a link matches the denied prefix
  it.skipIf(!canRun)("--deny-prefix: exits 1 when link path matches denied prefix", async () => {
    const extBackend = join(ext, "backend.accdb");
    const localBackend = join(local, "backend.accdb");
    const frontend = join(local, "frontend.accdb");
    createNativeDb(extBackend);
    ps(`Copy-Item -LiteralPath '${extBackend}' -Destination '${localBackend}'`);
    // Use the ext path as the link target; deny ext root prefix
    createLinkedDb(frontend, extBackend);

    const service = makeService(local);
    const result = await handleRelinkDirectoryCommand(
      ["--root", local, "--dry-run", "--deny-prefix", ext],
      {},
      { service },
    );

    expect(result.exitCode).toBe(1);

    const report = await runRelink(local, ["--dry-run", "--deny-prefix", ext]);
    expect(report.datosteLinkCount).toBeGreaterThan(0);
  });

  // 7.14 — cycle: FakeQueryService returns cycleDetected links; TS handler propagates
  it("cycle: cycleDetected links are preserved and reported in output", async () => {
    const cycleReport: RelinkDirectoryReport = {
      mode: "apply",
      root: local,
      filesScanned: 1,
      linkedTablesFound: 1,
      alreadyLocal: 0,
      plannedRelinks: 0,
      appliedRelinks: 0,
      unresolved: [],
      removed: [],
      externalLinkCount: 1,
      datosteLinkCount: 0,
      brokenLinkCount: 0,
      backupPaths: [],
      errors: [],
      fileResults: [
        {
          filePath: join(local, "a.accdb"),
          linkedTablesFound: 1,
          alreadyLocal: 0,
          plannedRelinks: 0,
          appliedRelinks: 0,
          links: [
            {
              database: join(local, "a.accdb"),
              linkName: "Ref",
              originalBackendPath: join(ext, "b.accdb"),
              classification: "cycle",
              resolvedLocalPath: null,
              chainHops: 1,
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
      ["--root", local, "--apply", "--json"],
      {},
      { service: fakeService },
    );

    expect(result.exitCode).toBe(0);
    const report = JSON.parse(result.stdout) as RelinkDirectoryReport;
    const link = report.fileResults?.[0]?.links?.[0] as { cycleDetected?: boolean } | undefined;
    expect(link?.cycleDetected).toBe(true);
  });
});
