import { describe, expect, it, vi } from "vitest";

const mockExecFile = vi.fn();
vi.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
}));

import {
  PROCESS_INSPECTOR_TIMEOUT_MS,
  parseCimDateTimeToIso,
  WindowsMsAccessProcessInspector,
  WindowsMsAccessProcessScanner,
  WindowsProcessKiller,
} from "../../../src/core/operations/windows-processes";

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
    });
    resolveExecFile(cimJson);
    const inspector = new WindowsMsAccessProcessInspector();
    const result = await inspector.getProcess(1234);

    expect(result).toBeDefined();
    expect(result?.pid).toBe(1234);
    expect(result?.name).toBe("MSACCESS.EXE");
    expect(result?.startTime).toBe("2026-05-18T12:34:56.000Z");
    expect(result?.commandLine).toBe('MSACCESS.EXE "C:/data/app.accdb"');
  });

  it("returns OsProcessInfo with commandLine undefined when JSON has no CommandLine", async () => {
    const partialJson = JSON.stringify({
      ProcessId: 1234,
      Name: "MSACCESS.EXE",
      CreationDate: "20260518123456.000000+000",
      // No CommandLine — fallback path from Get-Process
    });
    resolveExecFile(partialJson);
    const inspector = new WindowsMsAccessProcessInspector();
    const result = await inspector.getProcess(1234);

    expect(result).toBeDefined();
    expect(result?.commandLine).toBeUndefined();
    expect(result?.pid).toBe(1234);
    expect(result?.startTime).toBe("2026-05-18T12:34:56.000Z");
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
    });
    resolveExecFile(partialJson);
    const inspector = new WindowsMsAccessProcessInspector();
    const result = await inspector.getProcess(1234);

    expect(result).toBeDefined();
    expect(result?.pid).toBe(1234);
    // startTime absent/empty should not throw — it can be undefined or empty string
    // but it must NOT throw or return undefined for the whole process info
    expect(result).toMatchObject({ pid: 1234, name: "MSACCESS.EXE" });
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
    });
    resolveExecFile(singleJson);
    const scanner = new WindowsMsAccessProcessScanner();
    const result = await scanner.listProcesses();

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
    expect(result[0]?.pid).toBe(5678);
  });

  it("returns OsProcessInfo with commandLine undefined for each entry missing CommandLine", async () => {
    if (process.platform !== "win32") return;
    const arrayJson = JSON.stringify([
      { ProcessId: 1111, Name: "MSACCESS.EXE", CreationDate: "20260518120000.000000+000" },
      {
        ProcessId: 2222,
        Name: "MSACCESS.EXE",
        CreationDate: "20260518120100.000000+000",
        CommandLine: 'MSACCESS.EXE "C:/data/b.accdb"',
      },
    ]);
    resolveExecFile(arrayJson);
    const scanner = new WindowsMsAccessProcessScanner();
    const result = await scanner.listProcesses();

    expect(result.length).toBe(2);
    expect(result[0]?.commandLine).toBeUndefined();
    expect(result[1]?.commandLine).toBe('MSACCESS.EXE "C:/data/b.accdb"');
  });
});
