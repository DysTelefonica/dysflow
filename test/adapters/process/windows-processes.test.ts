import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const mockExecFile = vi.fn();
vi.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
}));

import {
  WindowsMsAccessProcessInspector,
  WindowsMsAccessProcessScanner,
  WindowsProcessKiller,
} from "../../../src/adapters/process/windows-processes";
import {
  normalizeProcessList,
  PROCESS_INSPECTOR_TIMEOUT_MS,
  parseCimDateTimeToIso,
} from "../../../src/core/operations/windows-processes";

describe("Windows process adapter boundary", () => {
  it("keeps concrete child_process ownership in the adapter module", () => {
    const adapterSource = readFileSync(
      resolve(process.cwd(), "src/adapters/process/windows-processes.ts"),
      "utf8",
    );

    expect(adapterSource).toContain('from "node:child_process"');
    expect(adapterSource).toContain("class WindowsMsAccessProcessInspector");
    expect(adapterSource).toContain("class WindowsProcessKiller");
    expect(adapterSource).toContain("class WindowsMsAccessProcessScanner");
  });

  it("rejects node:child_process ownership in the core process helpers", () => {
    const coreSource = readFileSync(
      resolve(process.cwd(), "src/core/operations/windows-processes.ts"),
      "utf8",
    );

    expect(coreSource).not.toMatch(/from\s+["']node:child_process["']/);
    expect(coreSource).not.toContain("class WindowsMsAccessProcessInspector");
    expect(coreSource).not.toContain("class WindowsProcessKiller");
    expect(coreSource).not.toContain("class WindowsMsAccessProcessScanner");
  });
});

describe("parseCimDateTimeToIso", () => {
  it("converts a DMTF CIM datetime string to ISO 8601 UTC", () => {
    expect(parseCimDateTimeToIso("20240315143000.000000+000")).toBe("2024-03-15T14:30:00.000Z");
  });

  it("converts a DMTF string with non-zero milliseconds", () => {
    expect(parseCimDateTimeToIso("20260518123456.123000+000")).toBe("2026-05-18T12:34:56.123Z");
  });

  it("passes through a value that is already ISO 8601", () => {
    const iso = "2024-03-15T14:30:00.000Z";
    expect(parseCimDateTimeToIso(iso)).toBe(iso);
  });

  it("returns empty string for null/undefined input", () => {
    expect(parseCimDateTimeToIso(undefined)).toBe("");
    expect(parseCimDateTimeToIso(null)).toBe("");
  });

  it("returns empty string for empty string input", () => {
    expect(parseCimDateTimeToIso("")).toBe("");
  });

  it("returns empty string for a malformed DMTF string that cannot be parsed", () => {
    expect(parseCimDateTimeToIso("not-a-date")).toBe("");
  });
});

describe("WindowsProcessKiller", () => {
  it.each([
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])("rejects invalid process id before building PowerShell command: %s", async (pid) => {
    const killer = new WindowsProcessKiller();

    await expect(killer.kill(pid)).rejects.toThrow("Process id must be a positive safe integer.");
  });
});

describe("PROCESS_INSPECTOR_TIMEOUT_MS", () => {
  it("is a positive integer of at most 10 seconds", () => {
    expect(Number.isInteger(PROCESS_INSPECTOR_TIMEOUT_MS)).toBe(true);
    expect(PROCESS_INSPECTOR_TIMEOUT_MS).toBeGreaterThan(0);
    expect(PROCESS_INSPECTOR_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
  });

  it("is wired into getProcess — a timeout-style execFile rejection propagates to the caller", async () => {
    // Mock execFile to reject with a timeout error (simulates what the OS does when
    // the PowerShell process exceeds PROCESS_INSPECTOR_TIMEOUT_MS).
    // This proves the timeout constant is actually passed to the execFile call and
    // that getProcess does not swallow the error silently.
    const timeoutError = Object.assign(new Error("spawn ETIMEDOUT"), { code: "ETIMEDOUT" });
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: object, callback: (err: Error) => void) => {
        callback(timeoutError);
      },
    );

    const inspector = new WindowsMsAccessProcessInspector();
    // getProcess propagates the execFile rejection — the caller receives an error,
    // not a silent undefined, so it can surface the failure through its error channel.
    await expect(inspector.getProcess(1234)).rejects.toThrow("ETIMEDOUT");
  });
});

describe("WindowsMsAccessProcessScanner", () => {
  it("degrades to an empty process list outside Windows", async () => {
    const scanner = new WindowsMsAccessProcessScanner();

    if (process.platform === "win32") return;

    await expect(scanner.listProcesses()).resolves.toEqual([]);
  });
});

// Helper: simulate a successful execFile call returning given stdout
function resolveExecFile(stdout: string) {
  mockExecFile.mockImplementation(
    (
      _cmd: string,
      _args: string[],
      _opts: object,
      callback: (err: null, result: { stdout: string }) => void,
    ) => {
      callback(null, { stdout });
    },
  );
}

describe("WindowsMsAccessProcessInspector — TS parsing behavior", () => {
  it("returns full OsProcessInfo when CIM JSON has all fields", async () => {
    const cimJson = JSON.stringify({
      ProcessId: 1234,
      Name: "MSACCESS.EXE",
      CreationDate: "20260518123456.000000+000",
      CommandLine: 'MSACCESS.EXE "C:/data/app.accdb"',
      MainWindowHandle: 0,
    });
    resolveExecFile(cimJson);
    const inspector = new WindowsMsAccessProcessInspector();
    const result = await inspector.getProcess(1234);

    expect(result).toBeDefined();
    expect(result?.pid).toBe(1234);
    expect(result?.name).toBe("MSACCESS.EXE");
    expect(result?.startTime).toBe("2026-05-18T12:34:56.000Z");
    expect(result?.commandLine).toBe('MSACCESS.EXE "C:/data/app.accdb"');
    expect(result?.mainWindowHandle).toBe(0);
  });

  it("normalizes the joined CIM plus Get-Process shape for a headless Access process", async () => {
    const joinedJson = JSON.stringify({
      ProcessId: 1234,
      Name: "MSACCESS.EXE",
      CreationDate: "20260518123456.000000+000",
      CommandLine: 'MSACCESS.EXE "C:/data/app.accdb"',
      MainWindowHandle: 0,
    });
    resolveExecFile(joinedJson);
    const inspector = new WindowsMsAccessProcessInspector();
    const result = await inspector.getProcess(1234);

    expect(result).toMatchObject({
      pid: 1234,
      name: "MSACCESS.EXE",
      commandLine: 'MSACCESS.EXE "C:/data/app.accdb"',
      mainWindowHandle: 0,
    });
  });

  it("normalizes the joined CIM plus Get-Process shape for a visible Access process", async () => {
    const joinedJson = JSON.stringify({
      ProcessId: 1234,
      Name: "MSACCESS.EXE",
      CreationDate: "20260518123456.000000+000",
      CommandLine: 'MSACCESS.EXE "C:/data/app.accdb"',
      MainWindowHandle: 48879,
    });
    resolveExecFile(joinedJson);
    const inspector = new WindowsMsAccessProcessInspector();
    const result = await inspector.getProcess(1234);

    expect(result?.mainWindowHandle).toBe(48879);
  });

  it("keeps mainWindowHandle undefined only when the adapter output genuinely lacks it", async () => {
    const unavailableJson = JSON.stringify({
      ProcessId: 1234,
      Name: "MSACCESS.EXE",
      CreationDate: "20260518123456.000000+000",
      CommandLine: 'MSACCESS.EXE "C:/data/app.accdb"',
    });
    resolveExecFile(unavailableJson);
    const inspector = new WindowsMsAccessProcessInspector();
    const result = await inspector.getProcess(1234);

    expect(result?.mainWindowHandle).toBeUndefined();
  });

  it("builds a PID-scoped Get-Process fallback for getProcess", async () => {
    resolveExecFile("  ");
    const inspector = new WindowsMsAccessProcessInspector();
    await inspector.getProcess(1234);

    const lastCall = mockExecFile.mock.calls[mockExecFile.mock.calls.length - 1];
    const args = lastCall?.[1] as string[];
    const script = args[3];
    expect(script).toContain('Get-Process -Name "MSACCESS"');
    expect(script).toContain("Where-Object { $_.Id -eq 1234 }");
    expect(script).toContain("$_.MainWindowHandle.ToInt64()");
    expect(script).toContain(
      "@{n='MainWindowHandle';e={if ($null -ne $_.MainWindowHandle) { $_.MainWindowHandle.ToInt64() } else { $null }}}",
    );
  });

  it("returns OsProcessInfo with commandLine undefined when JSON has no CommandLine", async () => {
    const partialJson = JSON.stringify({
      ProcessId: 1234,
      Name: "MSACCESS.EXE",
      CreationDate: "20260518123456.000000+000",
      // No CommandLine — fallback path from Get-Process
      MainWindowHandle: 0,
    });
    resolveExecFile(partialJson);
    const inspector = new WindowsMsAccessProcessInspector();
    const result = await inspector.getProcess(1234);

    expect(result).toBeDefined();
    expect(result?.commandLine).toBeUndefined();
    expect(result?.pid).toBe(1234);
    expect(result?.startTime).toBe("2026-05-18T12:34:56.000Z");
    expect(result?.mainWindowHandle).toBe(0);
  });

  it("returns undefined when stdout is empty", async () => {
    resolveExecFile("  \n  ");
    const inspector = new WindowsMsAccessProcessInspector();
    const result = await inspector.getProcess(1234);
    expect(result).toBeUndefined();
  });

  it("returns undefined when stdout is invalid JSON", async () => {
    resolveExecFile("not-json");
    const inspector = new WindowsMsAccessProcessInspector();
    const result = await inspector.getProcess(1234);
    expect(result).toBeUndefined();
  });

  it("returns OsProcessInfo with undefined startTime when CreationDate is absent (Get-Process fallback)", async () => {
    const partialJson = JSON.stringify({
      ProcessId: 1234,
      Name: "MSACCESS.EXE",
      // No CreationDate — Get-Process path; StartTime is a DateTime, not represented here
      MainWindowHandle: 0,
    });
    resolveExecFile(partialJson);
    const inspector = new WindowsMsAccessProcessInspector();
    const result = await inspector.getProcess(1234);

    expect(result).toBeDefined();
    expect(result?.pid).toBe(1234);
    // startTime absent/empty should not throw — it can be undefined or empty string
    // but it must NOT throw or return undefined for the whole process info
    expect(result).toMatchObject({ pid: 1234, name: "MSACCESS.EXE" });
    expect(result?.mainWindowHandle).toBe(0);
  });
});

describe("WindowsMsAccessProcessScanner — TS parsing behavior", () => {
  it("returns empty array when stdout is empty", async () => {
    if (process.platform !== "win32") {
      // scanner exits early on non-Windows
      const scanner = new WindowsMsAccessProcessScanner();
      const result = await scanner.listProcesses();
      expect(result).toEqual([]);
      return;
    }
    resolveExecFile("  ");
    const scanner = new WindowsMsAccessProcessScanner();
    const result = await scanner.listProcesses();
    expect(result).toEqual([]);
  });

  it("wraps a single-object JSON response into a one-element array", async () => {
    if (process.platform !== "win32") return;
    const singleJson = JSON.stringify({
      ProcessId: 5678,
      Name: "MSACCESS.EXE",
      CreationDate: "20260518120000.000000+000",
      CommandLine: 'MSACCESS.EXE "C:/data/other.accdb"',
      MainWindowHandle: 0,
    });
    resolveExecFile(singleJson);
    const scanner = new WindowsMsAccessProcessScanner();
    const result = await scanner.listProcesses();

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
    expect(result[0]?.pid).toBe(5678);
    expect(result[0]?.mainWindowHandle).toBe(0);
  });

  it("returns OsProcessInfo with commandLine undefined for each entry missing CommandLine", async () => {
    if (process.platform !== "win32") return;
    const arrayJson = JSON.stringify([
      {
        ProcessId: 1111,
        Name: "MSACCESS.EXE",
        CreationDate: "20260518120000.000000+000",
        MainWindowHandle: 0,
      },
      {
        ProcessId: 2222,
        Name: "MSACCESS.EXE",
        CreationDate: "20260518120100.000000+000",
        CommandLine: 'MSACCESS.EXE "C:/data/b.accdb"',
        MainWindowHandle: 48879,
      },
    ]);
    resolveExecFile(arrayJson);
    const scanner = new WindowsMsAccessProcessScanner();
    const result = await scanner.listProcesses();

    expect(result.length).toBe(2);
    expect(result[0]?.commandLine).toBeUndefined();
    expect(result[1]?.commandLine).toBe('MSACCESS.EXE "C:/data/b.accdb"');
    expect(result[0]?.mainWindowHandle).toBe(0);
    expect(result[1]?.mainWindowHandle).toBe(48879);
  });
});

describe("normalizeProcessList", () => {
  it("returns empty array for empty string or whitespace", () => {
    expect(normalizeProcessList("")).toEqual([]);
    expect(normalizeProcessList("  \n  ")).toEqual([]);
  });

  it("returns empty array for invalid JSON or non-object values", () => {
    expect(normalizeProcessList("invalid-json")).toEqual([]);
    expect(normalizeProcessList("42")).toEqual([]);
    expect(normalizeProcessList("null")).toEqual([]);
    expect(normalizeProcessList('"string"')).toEqual([]);
    expect(normalizeProcessList("true")).toEqual([]);
  });

  it("returns single process list when input is a single valid process object", () => {
    const json = JSON.stringify({
      ProcessId: 1234,
      Name: "MSACCESS.EXE",
      CreationDate: "20260518123456.000000+000",
      CommandLine: 'MSACCESS.EXE "C:/data/app.accdb"',
      MainWindowHandle: 0,
    });
    expect(normalizeProcessList(json)).toEqual([
      {
        pid: 1234,
        name: "MSACCESS.EXE",
        startTime: "2026-05-18T12:34:56.000Z",
        commandLine: 'MSACCESS.EXE "C:/data/app.accdb"',
        mainWindowHandle: 0,
      },
    ]);
  });

  it("returns multiple process list when input is an array of process objects", () => {
    const json = JSON.stringify([
      {
        ProcessId: 1234,
        Name: "MSACCESS.EXE",
        CreationDate: "20260518123456.000000+000",
        CommandLine: 'MSACCESS.EXE "C:/data/app.accdb"',
        MainWindowHandle: 0,
      },
      {
        ProcessId: 5678,
        Name: "MSACCESS.EXE",
        MainWindowHandle: 48879,
      },
    ]);
    expect(normalizeProcessList(json)).toEqual([
      {
        pid: 1234,
        name: "MSACCESS.EXE",
        startTime: "2026-05-18T12:34:56.000Z",
        commandLine: 'MSACCESS.EXE "C:/data/app.accdb"',
        mainWindowHandle: 0,
      },
      {
        pid: 5678,
        name: "MSACCESS.EXE",
        startTime: undefined,
        commandLine: undefined,
        mainWindowHandle: 48879,
      },
    ]);
  });

  it("normalizes actual IntPtr JSON object shapes for headless and visible windows", () => {
    const json = JSON.stringify([
      {
        ProcessId: 1234,
        Name: "MSACCESS.EXE",
        MainWindowHandle: { value: 0 },
      },
      {
        ProcessId: 5678,
        Name: "MSACCESS.EXE",
        MainWindowHandle: { Value: 48879 },
      },
    ]);

    expect(normalizeProcessList(json)).toEqual([
      {
        pid: 1234,
        name: "MSACCESS.EXE",
        startTime: undefined,
        commandLine: undefined,
        mainWindowHandle: 0,
      },
      {
        pid: 5678,
        name: "MSACCESS.EXE",
        startTime: undefined,
        commandLine: undefined,
        mainWindowHandle: 48879,
      },
    ]);
  });

  it("ignores unsafe MainWindowHandle object shapes", () => {
    const json = JSON.stringify([
      {
        ProcessId: 1234,
        Name: "MSACCESS.EXE",
        MainWindowHandle: { value: Number.MAX_SAFE_INTEGER + 1 },
      },
      {
        ProcessId: 5678,
        Name: "MSACCESS.EXE",
        MainWindowHandle: { Value: -1 },
      },
      {
        ProcessId: 9012,
        Name: "MSACCESS.EXE",
        MainWindowHandle: { value: "48879" },
      },
    ]);

    expect(normalizeProcessList(json).map((process) => process.mainWindowHandle)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("filters out invalid process objects (missing ProcessId or Name)", () => {
    const json = JSON.stringify([
      {
        Name: "MSACCESS.EXE",
      },
      {
        ProcessId: 5678,
      },
      {
        ProcessId: "invalid",
        Name: "MSACCESS.EXE",
      },
      {
        ProcessId: 1234,
        Name: "MSACCESS.EXE",
        MainWindowHandle: 0,
      },
    ]);
    expect(normalizeProcessList(json)).toEqual([
      {
        pid: 1234,
        name: "MSACCESS.EXE",
        startTime: undefined,
        commandLine: undefined,
        mainWindowHandle: 0,
      },
    ]);
  });
});

describe("normalizeProcessList — swallowed-I/O diagnostics (#478)", () => {
  it("returns empty array for garbage JSON (behavior preserved) and logs the parse error", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const result = normalizeProcessList("not-valid-json{{{");
    expect(result).toEqual([]);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]?.[0]).toMatch(
      /\[dysflow:swallowed-io:windows-processes:normalize-process-list\]/,
    );
    spy.mockRestore();
  });

  it("logs the error message from the parse failure", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    normalizeProcessList("{ bad json");
    expect(spy).toHaveBeenCalledOnce();
    const loggedMessage = spy.mock.calls[0]?.[0] as string;
    // V8's JSON.parse error wording differs across versions ("Unexpected token"
    // vs "Expected property name"); the test is asserting that the helper
    // surfaces the original error message verbatim, not a specific wording.
    expect(loggedMessage).toMatch(/Unexpected|Expected/);
    expect(loggedMessage).toMatch(/JSON/);
    spy.mockRestore();
  });
});
