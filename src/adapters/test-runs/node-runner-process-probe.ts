import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PROCESS_INSPECTOR_TIMEOUT_MS } from "../../core/operations/windows-processes.js";
import type {
  ProcessProbeResult,
  RunnerProcessProbe,
} from "../../core/test-runs/test-run-ports.js";

const execFileAsync = promisify(execFile);

/** Signal 0 checks existence without delivering a signal; EPERM still means "exists". */
function pidExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return !(typeof err === "object" && err !== null && "code" in err && err.code === "ESRCH");
  }
}

async function windowsStartTime(pid: number): Promise<string | null> {
  const script =
    `$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; ` +
    `if ($p -and $p.StartTime) { $p.StartTime.ToUniversalTime().ToString('o') }`;
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true, timeout: PROCESS_INSPECTOR_TIMEOUT_MS },
    );
    const value = stdout.trim();
    return value.length > 0 && !Number.isNaN(Date.parse(value)) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Production {@link RunnerProcessProbe} (#1993). Liveness comes from a
 * signal-0 probe; the start time, which is what tells a recycled PID apart,
 * comes from `Get-Process` on Windows. Elsewhere the start time is unknown
 * (`null`) and the store falls back to liveness alone.
 */
export const nodeRunnerProcessProbe: RunnerProcessProbe = {
  async inspect(pid: number): Promise<ProcessProbeResult> {
    if (!Number.isSafeInteger(pid) || pid <= 0 || !pidExists(pid)) return { alive: false };
    if (process.platform !== "win32") return { alive: true, startTime: null };
    return { alive: true, startTime: await windowsStartTime(pid) };
  },
};
