import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  OsProcessInfo,
  ProcessInspector,
  ProcessKiller,
  ProcessScanner,
} from "../../core/operations/access-operation-cleanup.js";
import type { AccessOperationPreflightCleanup } from "../../core/operations/access-operation-preflight.js";
import { AccessOperationPreflightCleanupService } from "../../core/operations/access-operation-preflight.js";
import type { AccessOperationRegistry } from "../../core/operations/access-operation-registry.js";
import {
  normalizeProcessList,
  PROCESS_INSPECTOR_TIMEOUT_MS,
} from "../../core/operations/windows-processes.js";

const execFileAsync = promisify(execFile);

/** PS-side CIM job timeout in seconds (shorter than the Node-level execFile timeout). */
const CIM_JOB_TIMEOUT_SEC = 4;

/**
 * Builds a PS 5.1-compatible script that:
 * 1. Runs the CIM query in a background job to bound WMI hangs.
 * 2. Joins CIM metadata with Get-Process MainWindowHandle because Win32_Process
 *    does not expose that property.
 * 3. Falls back to Get-Process (Id + StartTime + MainWindowHandle only, no
 *    CommandLine) when the job times out or fails.
 * 4. Emits a single-line JSON (possibly an array) via ConvertTo-Json -Compress.
 *
 * The filter expression is injected by the caller (already-quoted PS literal).
 */
function buildCimWithFallbackScript(
  filter: string,
  fallbackNameFilter: string,
  fallbackProcessId?: number,
): string {
  const fallbackFilter =
    fallbackProcessId === undefined ? `` : ` | Where-Object { $_.Id -eq ${fallbackProcessId} }`;
  return (
    `$gp = @{}; ` +
    `Get-Process -Name "${fallbackNameFilter}" -ErrorAction SilentlyContinue${fallbackFilter} | ` +
    `ForEach-Object { $gp[[int]$_.Id] = if ($null -ne $_.MainWindowHandle) { $_.MainWindowHandle.ToInt64() } else { $null } }; ` +
    `$job = Start-Job { Get-CimInstance Win32_Process -Filter "${filter}" | ` +
    `Select-Object ProcessId,Name,CreationDate,CommandLine }; ` +
    `$r = $null; ` +
    `if (Wait-Job $job -Timeout ${CIM_JOB_TIMEOUT_SEC}) { $r = Receive-Job $job }; ` +
    `Stop-Job $job; Remove-Job $job; ` +
    `if ($r -ne $null) { ` +
    `$r = $r | ForEach-Object { ` +
    `$h = $null; if ($gp.ContainsKey([int]$_.ProcessId)) { $h = $gp[[int]$_.ProcessId] }; ` +
    `[pscustomobject]@{ProcessId=$_.ProcessId;Name=$_.Name;CreationDate=$_.CreationDate;CommandLine=$_.CommandLine;MainWindowHandle=$h} ` +
    `} ` +
    `} else { ` +
    `$r = Get-Process -Name "${fallbackNameFilter}" -ErrorAction SilentlyContinue | ` +
    `Where-Object { ${fallbackProcessId === undefined ? `$true` : `$_.Id -eq ${fallbackProcessId}`} } | ` +
    `Select-Object @{n='ProcessId';e={$_.Id}},` +
    `@{n='Name';e={$_.Name}},` +
    `@{n='CreationDate';e={if ($_.StartTime) { $_.StartTime.ToUniversalTime().ToString('yyyyMMddHHmmss.ffffff+000') } else { $null }}},` +
    `@{n='CommandLine';e={$null}},` +
    `@{n='MainWindowHandle';e={if ($null -ne $_.MainWindowHandle) { $_.MainWindowHandle.ToInt64() } else { $null }}} ` +
    `}; ` +
    `if ($r -ne $null) { $r | ConvertTo-Json -Compress } else { '' }`
  );
}

export class WindowsMsAccessProcessInspector implements ProcessInspector {
  async getProcess(pid: number): Promise<OsProcessInfo | undefined> {
    const script = buildCimWithFallbackScript(`ProcessId=${pid}`, `MSACCESS`, pid);
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true, timeout: PROCESS_INSPECTOR_TIMEOUT_MS },
    );
    const processes = normalizeProcessList(stdout);
    return processes[0];
  }
}

export class WindowsProcessKiller implements ProcessKiller {
  async kill(pid: number): Promise<void> {
    if (!Number.isSafeInteger(pid) || pid <= 0) {
      throw new Error("Process id must be a positive safe integer.");
    }
    await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", `Stop-Process -Id ${pid} -Force`],
      { windowsHide: true, timeout: PROCESS_INSPECTOR_TIMEOUT_MS },
    );
  }
}

export class WindowsMsAccessProcessScanner implements ProcessScanner {
  async listProcesses(): Promise<OsProcessInfo[]> {
    if (process.platform !== "win32") return [];

    const script = buildCimWithFallbackScript(`Name='MSACCESS.EXE'`, `MSACCESS`);
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true, timeout: PROCESS_INSPECTOR_TIMEOUT_MS },
    );
    return normalizeProcessList(stdout);
  }
}

export function createWindowsAccessOperationPreflightCleanup(options: {
  registry: AccessOperationRegistry;
  clock?: () => string;
  operationTimeoutMs?: number;
}): AccessOperationPreflightCleanup {
  return new AccessOperationPreflightCleanupService({
    registry: options.registry,
    processInspector: new WindowsMsAccessProcessInspector(),
    processKiller: new WindowsProcessKiller(),
    processScanner: new WindowsMsAccessProcessScanner(),
    clock: options.clock,
    operationTimeoutMs: options.operationTimeoutMs,
  });
}
