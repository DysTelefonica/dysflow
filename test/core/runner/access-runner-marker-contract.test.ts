/**
 * Contract tests for the TS↔PowerShell ACCESS_PROCESS marker guard (#417).
 *
 * The guard `isAccessProcessMarker` decides which parsed stderr markers are accepted
 * and forwarded to `onAccessProcessCaptured` (which captures the Access PID). If the
 * guard rejects a shape the PowerShell child legitimately emits, the PID is never
 * captured and the process becomes an untracked zombie.
 *
 * Regression: `scripts/dysflow-access-runner.ps1` emits `processStartTime: null` when
 * `ConvertTo-IsoStartTime` cannot resolve the OS StartTime. The guard MUST accept that.
 */
import { describe, expect, it } from "vitest";
import { isAccessProcessMarker } from "../../../src/core/runner/access-runner.js";

describe("isAccessProcessMarker — TS↔PS marker contract (#417)", () => {
  it("accepts a marker with an ISO processStartTime string", () => {
    expect(isAccessProcessMarker({ pid: 42, processStartTime: "2026-06-01T00:00:00.000Z" })).toBe(
      true,
    );
  });

  it("accepts a marker with processStartTime null (PS could not resolve StartTime)", () => {
    // This is the real shape that broke PID capture before the fix.
    expect(isAccessProcessMarker({ pid: 42, processStartTime: null })).toBe(true);
  });

  it("accepts a marker with commandLine null (primary hWnd capture path)", () => {
    // Write-AccessProcessMarkerFromPid emits commandLine:null (no WMI → no command line).
    // This is the shape that broke real PID capture before the fix.
    expect(isAccessProcessMarker({ pid: 42, processStartTime: null, commandLine: null })).toBe(
      true,
    );
  });

  it("accepts a marker with an optional commandLine", () => {
    expect(
      isAccessProcessMarker({
        pid: 7,
        processStartTime: null,
        commandLine: 'MSACCESS.EXE "C:/data/app.accdb"',
      }),
    ).toBe(true);
  });

  it("rejects a marker without a numeric pid", () => {
    expect(isAccessProcessMarker({ processStartTime: null })).toBe(false);
    expect(isAccessProcessMarker({ pid: "42", processStartTime: null })).toBe(false);
  });

  it("rejects a non-object payload", () => {
    expect(isAccessProcessMarker(null)).toBe(false);
    expect(isAccessProcessMarker("DYSFLOW_ACCESS_PROCESS")).toBe(false);
    expect(isAccessProcessMarker(42)).toBe(false);
  });

  it("rejects a marker whose commandLine is not a string", () => {
    expect(isAccessProcessMarker({ pid: 1, processStartTime: null, commandLine: 123 })).toBe(false);
  });
});
