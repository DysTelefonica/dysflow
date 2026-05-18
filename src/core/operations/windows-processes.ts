import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { OsProcessInfo, ProcessInspector, ProcessKiller } from "./access-operation-cleanup.js";

const execFileAsync = promisify(execFile);

export class WindowsMsAccessProcessInspector implements ProcessInspector {
  async getProcess(pid: number): Promise<OsProcessInfo | undefined> {
    const script = `Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" | Select-Object ProcessId,Name,CreationDate,CommandLine | ConvertTo-Json -Compress`;
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true });
    if (stdout.trim().length === 0) return undefined;
    let parsed: { ProcessId: number; Name: string; CreationDate?: string; CommandLine?: string };
    try {
      parsed = JSON.parse(stdout) as { ProcessId: number; Name: string; CreationDate?: string; CommandLine?: string };
    } catch {
      return undefined;
    }
    return { pid: parsed.ProcessId, name: parsed.Name, startTime: parsed.CreationDate ?? "", commandLine: parsed.CommandLine };
  }
}

export class WindowsProcessKiller implements ProcessKiller {
  async kill(pid: number): Promise<void> {
    if (!Number.isSafeInteger(pid) || pid <= 0) {
      throw new Error("Process id must be a positive safe integer.");
    }
    await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Stop-Process -Id ${pid} -Force`], { windowsHide: true });
  }
}
