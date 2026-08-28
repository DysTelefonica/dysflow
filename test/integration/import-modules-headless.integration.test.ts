import { spawn, spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { platform, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { runMcpHarness } from "../../E2E_testing/_helpers/mcp-harness.mjs";

const REPO_ROOT = resolve(__dirname, "..", "..");
const MCP_ENTRY = join(REPO_ROOT, "dist", "cli", "index.js");
const ACCESS_EXE = "C:\\Program Files\\Microsoft Office\\Root\\Office16\\MSACCESS.EXE";

type ProcessResult = { stdout: string; stderr: string; exitCode: number };
type ProcessIdentity = { pid: number; creationTime: string };
type VisibleWindow = ProcessIdentity & { title: string; className: string };
type MonitorResult = { identities: ProcessIdentity[]; windows: VisibleWindow[] };
type OperationIdentityRecord = {
  accessPath?: string;
  accessPid?: number | null;
  action?: string;
  metadata?: { managerAction?: string; toolName?: string };
  processStartTime?: string | null;
};
type HarnessResult = {
  isError?: boolean;
  response?: { result?: { structuredContent?: unknown } };
  text?: string;
  timedOut?: boolean;
};
type SyncBinaryPayload = {
  dryRun?: boolean;
  execution?: unknown;
  ok?: boolean;
  plan?: { toImport?: string[] };
};

async function runPwsh(script: string, env: NodeJS.ProcessEnv = {}): Promise<ProcessResult> {
  return await new Promise((resolvePromise, reject) => {
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    const child = spawn("pwsh", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ stdout, stderr, exitCode: code ?? -1 }));
  });
}

async function waitForFile(path: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await access(path);
      return;
    } catch {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
    }
  }
  throw new Error(`Timed out waiting for ${path}`);
}

async function createDisposableDatabase(databasePath: string): Promise<void> {
  const result = await runPwsh(
    `
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class DysflowCreatorPidProbe {
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
'@
$access = New-Object -ComObject Access.Application
try {
  $access.NewCurrentDatabase($env:DYSFLOW_TEST_DATABASE)
  [uint32]$ownedPid = 0
  [void][DysflowCreatorPidProbe]::GetWindowThreadProcessId([IntPtr]$access.hWndAccessApp(), [ref]$ownedPid)
  $owned = Get-CimInstance Win32_Process -Filter ("ProcessId={0}" -f $ownedPid)
  if (-not $owned -or $owned.Name -ine 'MSACCESS.EXE') { throw 'Could not attribute the creator Access process from hWndAccessApp' }
  $identity = [pscustomobject]@{
    pid = [int]$owned.ProcessId
    creationTime = ([datetime]$owned.CreationDate).ToUniversalTime().ToString('o')
  }
} finally {
  try { $access.CloseCurrentDatabase() } catch {}
  try { $access.Quit() } catch {}
  [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($access)
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
if ($identity) {
  $current = Get-CimInstance Win32_Process -Filter ("ProcessId={0}" -f $identity.pid) -ErrorAction SilentlyContinue
  if ($current) {
    $currentStart = ([datetime]$current.CreationDate).ToUniversalTime().ToString('o')
    if ($currentStart -ne $identity.creationTime) { throw 'Creator Access PID was reused; refusing cleanup' }
    Stop-Process -Id $identity.pid -Force
  }
}
`,
    { DYSFLOW_TEST_DATABASE: databasePath },
  );
  expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0);
}

function startAccessWindowMonitor(
  root: string,
  databasePath: string,
  readyPath: string,
  stopPath: string,
): Promise<ProcessResult> {
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class DysflowOwnedWindowProbe {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr extraData);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder text, int count);
}
'@
$seenIdentities = @{}
$seenWindows = @{}
Set-Content -LiteralPath $env:DYSFLOW_MONITOR_READY -Value ready -Encoding ascii
while (-not (Test-Path -LiteralPath $env:DYSFLOW_MONITOR_STOP)) {
  $ownedProcesses = @{}
  foreach ($projectRoot in @($env:DYSFLOW_TEST_ROOT, (Join-Path $env:DYSFLOW_TEST_ROOT 'src'))) {
    $registryPath = Join-Path $projectRoot '.dysflow/runtime/operations.json'
    try {
      $registry = Get-Content -LiteralPath $registryPath -Raw -ErrorAction Stop | ConvertFrom-Json
      $records = if ($registry -is [array]) { @($registry) } else { @($registry.records) }
      foreach ($record in $records) {
        if ($record.accessPath -ine $env:DYSFLOW_TEST_DATABASE) { continue }
        if ($record.metadata.toolName -ne 'import_modules' -and $record.metadata.managerAction -ne 'Import') { continue }
        if ($null -eq $record.accessPid -or [string]::IsNullOrWhiteSpace([string]$record.processStartTime)) { continue }
        $identity = [pscustomobject]@{ pid = [int]$record.accessPid; creationTime = [string]$record.processStartTime }
        $key = '{0}|{1}' -f $identity.pid, $identity.creationTime
        $seenIdentities[$key] = $identity
      }
    } catch {
      # The registry is written atomically; retry while a replacement is in flight.
    }
    $markersRoot = Join-Path $projectRoot '.dysflow/runtime/markers'
    foreach ($markerFile in @(Get-ChildItem -LiteralPath $markersRoot -Filter '*.json' -File -ErrorAction SilentlyContinue)) {
      try {
        $marker = Get-Content -LiteralPath $markerFile.FullName -Raw | ConvertFrom-Json
        if ($marker.action -ne 'Import' -or $marker.accessPath -ine $env:DYSFLOW_TEST_DATABASE) { continue }
        if ($null -eq $marker.accessPid -or [string]::IsNullOrWhiteSpace([string]$marker.processStartTime)) { continue }
        $identity = [pscustomobject]@{ pid = [int]$marker.accessPid; creationTime = [string]$marker.processStartTime }
        $key = '{0}|{1}' -f $identity.pid, $identity.creationTime
        $seenIdentities[$key] = $identity
        $ownedProcesses[$identity.pid] = $identity
      } catch {
        # The manager replaces the marker while this poller is reading it; retry on the next pass.
      }
    }
  }
  foreach ($identity in @($seenIdentities.Values)) {
    $process = Get-CimInstance Win32_Process -Filter ("ProcessId={0}" -f $identity.pid) -ErrorAction SilentlyContinue
    if (-not $process -or $process.Name -ine 'MSACCESS.EXE') { continue }
    $currentStart = ([datetime]$process.CreationDate).ToUniversalTime()
    $expectedStart = [datetime]::Parse(
      $identity.creationTime,
      [Globalization.CultureInfo]::InvariantCulture,
      [Globalization.DateTimeStyles]::AssumeUniversal -bor [Globalization.DateTimeStyles]::AdjustToUniversal
    )
    if ([Math]::Abs(($currentStart - $expectedStart).TotalMilliseconds) -le 1000) {
      $ownedProcesses[$identity.pid] = $identity
    }
  }
  [void][DysflowOwnedWindowProbe]::EnumWindows({
    param($hwnd, $unused)
    if (-not [DysflowOwnedWindowProbe]::IsWindowVisible($hwnd)) { return $true }
    [uint32]$windowProcessId = 0
    [void][DysflowOwnedWindowProbe]::GetWindowThreadProcessId($hwnd, [ref]$windowProcessId)
    $identity = $ownedProcesses[[int]$windowProcessId]
    if (-not $identity) { return $true }
    $title = [Text.StringBuilder]::new(512)
    $className = [Text.StringBuilder]::new(256)
    [void][DysflowOwnedWindowProbe]::GetWindowText($hwnd, $title, $title.Capacity)
    [void][DysflowOwnedWindowProbe]::GetClassName($hwnd, $className, $className.Capacity)
    $key = '{0}|{1}|{2}|{3}' -f $identity.pid, $identity.creationTime, $className, $title
    $seenWindows[$key] = [pscustomobject]@{
      pid = $identity.pid
      creationTime = $identity.creationTime
      title = $title.ToString()
      className = $className.ToString()
    }
    return $true
  }, [IntPtr]::Zero)
  Start-Sleep -Milliseconds 2
}
[pscustomobject]@{ identities = @($seenIdentities.Values); windows = @($seenWindows.Values) } | ConvertTo-Json -Compress -Depth 4
`;
  return runPwsh(script, {
    DYSFLOW_MONITOR_READY: readyPath,
    DYSFLOW_MONITOR_STOP: stopPath,
    DYSFLOW_TEST_DATABASE: databasePath,
    DYSFLOW_TEST_ROOT: root,
  });
}

function sameProcessIdentity(left: ProcessIdentity, right: ProcessIdentity): boolean {
  return (
    left.pid === right.pid &&
    Math.abs(Date.parse(left.creationTime) - Date.parse(right.creationTime)) <= 1_000
  );
}

async function readManagerIdentity(
  root: string,
  databasePath: string,
): Promise<ProcessIdentity | undefined> {
  const records: OperationIdentityRecord[] = [];
  for (const projectRoot of [root, join(root, "src")]) {
    try {
      const registry = JSON.parse(
        await readFile(join(projectRoot, ".dysflow", "runtime", "operations.json"), "utf8"),
      ) as OperationIdentityRecord[] | { records?: OperationIdentityRecord[] };
      records.push(...(Array.isArray(registry) ? registry : (registry.records ?? [])));
    } catch {}

    try {
      const markersRoot = join(projectRoot, ".dysflow", "runtime", "markers");
      for (const name of await readdir(markersRoot)) {
        if (!name.endsWith(".json")) continue;
        records.push(
          JSON.parse(await readFile(join(markersRoot, name), "utf8")) as OperationIdentityRecord,
        );
      }
    } catch {}
  }

  const expectedPath = resolve(databasePath).toLowerCase();
  const identities = records
    .filter(
      (record) =>
        typeof record.accessPid === "number" &&
        typeof record.processStartTime === "string" &&
        typeof record.accessPath === "string" &&
        resolve(record.accessPath).toLowerCase() === expectedPath &&
        (record.metadata?.toolName === "import_modules" ||
          record.metadata?.managerAction === "Import" ||
          record.action === "Import"),
    )
    .map((record) => ({
      pid: record.accessPid as number,
      creationTime: record.processStartTime as string,
    }));
  return identities.find((identity, index) =>
    identities.every(
      (candidate, candidateIndex) =>
        candidateIndex === index || sameProcessIdentity(candidate, identity),
    ),
  );
}

async function cleanupExactProcess(identity: ProcessIdentity | undefined): Promise<void> {
  if (identity === undefined) return;
  const expectedStart = new Date(identity.creationTime);
  expect(Number.isNaN(expectedStart.getTime())).toBe(false);
  {
    const result = await runPwsh(
      `
$current = Get-CimInstance Win32_Process -Filter "ProcessId=${identity.pid}" -ErrorAction SilentlyContinue
if ($current) {
  $currentStart = ([datetime]$current.CreationDate).ToUniversalTime()
  $expectedStart = [datetime]::Parse(
    '${identity.creationTime.replaceAll("'", "''")}',
    [Globalization.CultureInfo]::InvariantCulture,
    [Globalization.DateTimeStyles]::AssumeUniversal -bor [Globalization.DateTimeStyles]::AdjustToUniversal
  )
  if ([Math]::Abs(($currentStart - $expectedStart).TotalMilliseconds) -gt 1000) { throw 'Owned Access PID was reused; refusing cleanup' }
  Stop-Process -Id ${identity.pid} -Force
  Wait-Process -Id ${identity.pid} -Timeout 10 -ErrorAction SilentlyContinue
  if (Get-Process -Id ${identity.pid} -ErrorAction SilentlyContinue) { throw 'Owned Access process did not exit' }
}
`,
    );
    expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0);
  }
}

function payloadOf(result: HarnessResult): SyncBinaryPayload {
  const structured = result.response?.result?.structuredContent;
  const structuredRecord = structured as { content?: Array<{ text?: unknown }> } | undefined;
  const verbatim = structuredRecord?.content?.[0]?.text;
  if (typeof verbatim === "string") return JSON.parse(verbatim) as SyncBinaryPayload;
  if (structured !== undefined) return structured as SyncBinaryPayload;
  return JSON.parse(String(result.text)) as SyncBinaryPayload;
}

describe.skipIf(platform() !== "win32")("sync_binary headless persistence (#1667)", () => {
  it("imports a new source module through the public workflow without exposing an owned Access window", async () => {
    await expect(access(ACCESS_EXE)).resolves.toBeUndefined();
    await expect(access(MCP_ENTRY)).resolves.toBeUndefined();
    const root = await mkdtemp(join(tmpdir(), "dysflow-headless-sync-"));
    const databasePath = join(root, "headless.accdb");
    const sourceRoot = join(root, "src");
    const readyPath = join(root, "monitor.ready");
    const stopPath = join(root, "monitor.stop");
    let monitorPromise: Promise<ProcessResult> | undefined;
    let ownedIdentity: ProcessIdentity | undefined;

    try {
      await createDisposableDatabase(databasePath);
      await mkdir(join(root, ".dysflow"), { recursive: true });
      await mkdir(join(sourceRoot, "modules"), { recursive: true });
      const gitInit = spawnSync("git", ["init", "--quiet"], { cwd: root, encoding: "utf8" });
      expect(gitInit.status, `${gitInit.stdout}\n${gitInit.stderr}`).toBe(0);
      await writeFile(
        join(root, ".dysflow", "project.json"),
        `${JSON.stringify(
          {
            id: "headless-sync-1667",
            accessPath: "headless.accdb",
            destinationRoot: "src",
            capabilities: { allowWrites: true, writeExecutionPolicy: "safe-by-default" },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      await writeFile(
        join(sourceRoot, "modules", "Probe1667.bas"),
        'Attribute VB_Name = "Probe1667"\r\nOption Compare Database\r\nOption Explicit\r\nPublic Sub Probe1667Entry()\r\nEnd Sub\r\n',
        "utf8",
      );

      const child = spawn(
        process.execPath,
        [MCP_ENTRY, "mcp", "--tool-surface", "full", "--enable-writes"],
        { cwd: root, env: { ...process.env }, stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
      );
      monitorPromise = startAccessWindowMonitor(root, databasePath, readyPath, stopPath);
      const earlyMonitorExit = await Promise.race([
        waitForFile(readyPath).then(() => null),
        monitorPromise,
      ]);
      if (earlyMonitorExit !== null) {
        throw new Error(
          `Owned-window monitor exited before readiness (${earlyMonitorExit.exitCode}): ${earlyMonitorExit.stdout}\n${earlyMonitorExit.stderr}`,
        );
      }

      const result = (await runMcpHarness({
        child,
        requestId: 2,
        method: "tools/call",
        params: {
          name: "sync_binary",
          arguments: {
            cwd: root,
            projectId: "headless-sync-1667",
            accessPath: databasePath,
            destinationRoot: sourceRoot,
            moduleNames: ["Probe1667"],
            direction: "src-to-binary",
            apply: true,
          },
        },
        timeoutMs: Number(process.env.DYSFLOW_HEADLESS_SYNC_TIMEOUT_MS ?? 120_000),
        closeWatchdogMs: 5_000,
      })) as HarnessResult;
      await writeFile(stopPath, "stop", "ascii");
      const monitor = await monitorPromise;
      expect(monitor.exitCode, `${monitor.stdout}\n${monitor.stderr}`).toBe(0);
      const monitored = JSON.parse(monitor.stdout.trim()) as MonitorResult;
      ownedIdentity = monitored.identities[0];

      expect(
        ownedIdentity,
        `manager did not persist the sync_binary Access process identity: ${JSON.stringify(result.response?.result?.structuredContent)}`,
      ).toBeDefined();
      expect(
        monitored.identities.every(
          (identity) => ownedIdentity !== undefined && sameProcessIdentity(identity, ownedIdentity),
        ),
        `manager attributed multiple Access process identities: ${JSON.stringify(monitored.identities)}`,
      ).toBe(true);
      const ownedWindows = monitored.windows.filter(
        (window) => ownedIdentity !== undefined && sameProcessIdentity(window, ownedIdentity),
      );
      expect(ownedWindows, `Visible owned Access windows: ${JSON.stringify(ownedWindows)}`).toEqual(
        [],
      );
      expect(result.timedOut).toBe(false);
      expect(result.isError, result.text).toBe(false);
      const payload = payloadOf(result);
      expect(payload.ok).toBe(true);
      expect(payload.dryRun).toBe(false);
      expect(payload.plan?.toImport).toContain("Probe1667");
      expect(payload.execution).not.toBeNull();
    } finally {
      await writeFile(stopPath, "stop", "ascii").catch(() => undefined);
      if (monitorPromise !== undefined) {
        const monitor = await monitorPromise.catch(() => undefined);
        if (ownedIdentity === undefined && monitor?.stdout.trim()) {
          ownedIdentity = (JSON.parse(monitor.stdout.trim()) as MonitorResult).identities[0];
        }
      }
      ownedIdentity ??= await readManagerIdentity(root, databasePath);
      await cleanupExactProcess(ownedIdentity);
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });
});
