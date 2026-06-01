import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  OsProcessInfo,
  ProcessInspector,
  ProcessKiller,
  ProcessScanner,
} from "./access-operation-cleanup.js";

const execFileAsync = promisify(execFile);

export const PROCESS_INSPECTOR_TIMEOUT_MS = 5_000;

// DMTF CIM datetime format: YYYYMMDDHHmmss.ffffff+ooo
// e.g. "20260518123456.000000+000" → "2026-05-18T12:34:56.000Z"
const DMTF_PATTERN = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\.(\d{6})([+-]\d{3})$/;

export function parseCimDateTimeToIso(value: string | null | undefined): string {
  if (value == null || value.length === 0) return "";

  const match = DMTF_PATTERN.exec(value);
  if (match === null) {
    // Not DMTF — check if it already looks like ISO 8601; pass through or return empty
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return value;
    return "";
  }

  const [, year, month, day, hour, minute, second, microseconds, offsetRaw] = match;
  const ms = Math.floor(Number(microseconds) / 1000);
  const msStr = String(ms).padStart(3, "0");

  // Convert offset "+ooo" / "-ooo" (minutes-from-UTC as 3 digits) to ISO offset
  const sign = offsetRaw[0];
  const offsetMinutes = Number(offsetRaw.slice(1));
  if (offsetMinutes === 0) {
    return `${year}-${month}-${day}T${hour}:${minute}:${second}.${msStr}Z`;
  }

  const offsetHours = Math.floor(offsetMinutes / 60);
  const offsetMins = offsetMinutes % 60;
  const isoOffset = `${sign}${String(offsetHours).padStart(2, "0")}:${String(offsetMins).padStart(2, "0")}`;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}.${msStr}${isoOffset}`;
}

/** PS-side CIM job timeout in seconds (shorter than the Node-level execFile timeout). */
const CIM_JOB_TIMEOUT_SEC = 4;

/**
 * Builds a PS 5.1-compatible script that:
 * 1. Runs the CIM query in a background job to bound WMI hangs.
 * 2. Falls back to Get-Process (Id + StartTime only, no CommandLine) when the job
 *    times out or fails.
 * 3. Emits a single-line JSON (possibly an array) via ConvertTo-Json -Compress.
 *
 * The filter expression is injected by the caller (already-quoted PS literal).
 */
function buildCimWithFallbackScript(filter: string, fallbackNameFilter: string): string {
  return (
    `$job = Start-Job { Get-CimInstance Win32_Process -Filter "${filter}" | ` +
    `Select-Object ProcessId,Name,CreationDate,CommandLine }; ` +
    `$r = $null; ` +
    `if (Wait-Job $job -Timeout ${CIM_JOB_TIMEOUT_SEC}) { $r = Receive-Job $job }; ` +
    `Stop-Job $job; Remove-Job $job; ` +
    `if ($r -eq $null) { ` +
    `$r = Get-Process -Name "${fallbackNameFilter}" -ErrorAction SilentlyContinue | ` +
    `Select-Object @{n='ProcessId';e={$_.Id}},` +
    `@{n='Name';e={$_.Name}},` +
    `@{n='CreationDate';e={if ($_.StartTime) { $_.StartTime.ToString('yyyyMMddHHmmss.ffffff+000') } else { $null }}},` +
    `@{n='CommandLine';e={$null}} ` +
    `}; ` +
    `if ($r -ne $null) { $r | ConvertTo-Json -Compress } else { '' }`
  );
}

export class WindowsMsAccessProcessInspector implements ProcessInspector {
  async getProcess(pid: number): Promise<OsProcessInfo | undefined> {
    const script = buildCimWithFallbackScript(
      `ProcessId=${pid}`,
      `MSACCESS`,
    );
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true, timeout: PROCESS_INSPECTOR_TIMEOUT_MS },
    );
    if (stdout.trim().length === 0) return undefined;
    let parsed: { ProcessId: number; Name: string; CreationDate?: string | null; CommandLine?: string | null };
    try {
      parsed = JSON.parse(stdout) as {
        ProcessId: number;
        Name: string;
        CreationDate?: string | null;
        CommandLine?: string | null;
      };
    } catch {
      return undefined;
    }
    const startTime = parsed.CreationDate ? parseCimDateTimeToIso(parsed.CreationDate) : undefined;
    return {
      pid: parsed.ProcessId,
      name: parsed.Name,
      startTime: startTime || undefined,
      commandLine: parsed.CommandLine ?? undefined,
    };
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
    if (stdout.trim().length === 0) return [];
    let parsed: Array<{
      ProcessId: number;
      Name: string;
      CreationDate?: string | null;
      CommandLine?: string | null;
    }>;
    try {
      parsed = JSON.parse(stdout) as Array<{
        ProcessId: number;
        Name: string;
        CreationDate?: string | null;
        CommandLine?: string | null;
      }>;
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) {
      parsed = [parsed];
    }
    return parsed.map((p) => {
      const startTime = p.CreationDate ? parseCimDateTimeToIso(p.CreationDate) : undefined;
      return {
        pid: p.ProcessId,
        name: p.Name,
        startTime: startTime || undefined,
        commandLine: p.CommandLine ?? undefined,
      };
    });
  }
}
