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

export class WindowsMsAccessProcessInspector implements ProcessInspector {
  async getProcess(pid: number): Promise<OsProcessInfo | undefined> {
    const script = `Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" | Select-Object ProcessId,Name,CreationDate,CommandLine | ConvertTo-Json -Compress`;
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true, timeout: PROCESS_INSPECTOR_TIMEOUT_MS },
    );
    if (stdout.trim().length === 0) return undefined;
    let parsed: { ProcessId: number; Name: string; CreationDate?: string; CommandLine?: string };
    try {
      parsed = JSON.parse(stdout) as {
        ProcessId: number;
        Name: string;
        CreationDate?: string;
        CommandLine?: string;
      };
    } catch {
      return undefined;
    }
    return {
      pid: parsed.ProcessId,
      name: parsed.Name,
      startTime: parseCimDateTimeToIso(parsed.CreationDate),
      commandLine: parsed.CommandLine,
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

    const script = `Get-CimInstance Win32_Process -Filter "Name='MSACCESS.EXE'" | Select-Object ProcessId,Name,CreationDate,CommandLine | ConvertTo-Json -Compress`;
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true, timeout: PROCESS_INSPECTOR_TIMEOUT_MS },
    );
    if (stdout.trim().length === 0) return [];
    let parsed: Array<{
      ProcessId: number;
      Name: string;
      CreationDate?: string;
      CommandLine?: string;
    }>;
    try {
      parsed = JSON.parse(stdout) as Array<{
        ProcessId: number;
        Name: string;
        CreationDate?: string;
        CommandLine?: string;
      }>;
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) {
      parsed = [parsed];
    }
    return parsed.map((p) => ({
      pid: p.ProcessId,
      name: p.Name,
      startTime: parseCimDateTimeToIso(p.CreationDate),
      commandLine: p.CommandLine,
    }));
  }
}
