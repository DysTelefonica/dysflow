import { describe, expect, it } from "vitest";
import {
  parseCimDateTimeToIso,
  PROCESS_INSPECTOR_TIMEOUT_MS,
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
