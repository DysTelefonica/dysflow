import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnVbaManager } from "../../../src/adapters/vba-sync/vba-sync-adapter";

/**
 * Real-spawn regression for the ENAMETOOLONG bug: a large `proceduresJson` used to
 * be passed inline on the PowerShell command line, overflowing the Windows ~32K
 * command-line limit so `spawn` failed with ENAMETOOLONG before MSACCESS.EXE ever
 * launched (`import_modules` was unaffected — it only passes a short module list).
 *
 * This launches a real `powershell.exe` (no child_process mock), so it is gated to
 * Windows. It needs no Access COM: the dummy script accepts the manager's params
 * and exits 0. Pre-fix, this spawn throws/reports ENAMETOOLONG; post-fix the plan
 * is offloaded to a temp file and the process starts cleanly.
 */
describe("spawnVbaManager — command line stays within the OS limit (real spawn)", () => {
  let workDir: string;
  let scriptPath: string;

  beforeAll(async () => {
    workDir = await mkdtemp(join(tmpdir(), "dysflow-cmdline-"));
    scriptPath = join(workDir, "dummy-manager.ps1");
    // A no-op stand-in for the real VBA manager: binds the params the executor
    // sends for Run-Tests and exits cleanly without touching Access.
    await writeFile(
      scriptPath,
      [
        "param(",
        "  [string]$Action,",
        "  [string]$DestinationRoot,",
        "  [string]$AccessPath,",
        "  [switch]$Json,",
        "  [string]$ProceduresJson,",
        "  [string]$ProceduresJsonFile",
        ")",
        "Write-Output 'DYSFLOW_RESULT {\"ok\":true}'",
        "exit 0",
      ].join("\r\n"),
      "utf8",
    );
  });

  afterAll(async () => {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  });

  it.skipIf(process.platform !== "win32")(
    "launches the process with a huge proceduresJson instead of failing with ENAMETOOLONG",
    async () => {
      // ~60K chars — comfortably past the Windows command-line limit if inlined.
      const hugePlan = JSON.stringify(
        Array.from({ length: 3_000 }, (_, i) => ({
          procedure: `Test_Procedure_Number_${i}`,
          args: [],
        })),
      );
      expect(hugePlan.length).toBeGreaterThan(32_000);

      const result = await spawnVbaManager({
        scriptPath,
        action: "Run-Tests",
        accessPath: join(workDir, "front.accdb"),
        destinationRoot: workDir,
        moduleNames: [],
        json: true,
        extra: { proceduresJson: hugePlan },
        timeoutMs: 30_000,
        cwd: workDir,
      });

      expect(result.stderr).not.toContain("ENAMETOOLONG");
      expect(result.timedOut).toBe(false);
      expect(result.exitCode).toBe(0);
    },
  );
});
