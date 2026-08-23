/**
 * Issue #1494 — the Access process scan must not pay for a PowerShell background
 * job when no Access process exists at all.
 *
 * Measured on Windows 11 before this change:
 *
 *   listProcesses(): 906ms, 902ms, 913ms  (returning 0 processes)
 *
 * The cost is not the PowerShell host (~165ms) — it is `Start-Job`, which in
 * PowerShell 5.1 spins up a second runspace. A no-op `Start-Job` round trip
 * measured ~510ms on its own. The scan paid that on every adapter call, through
 * the preflight cleanup, to learn that nothing was running.
 *
 * The short-circuit is behaviour-preserving by construction: the CIM query is
 * filtered on `Name='MSACCESS.EXE'`, and `Get-Process -Name MSACCESS` reads the
 * same OS process table. When the latter finds nothing, the former cannot find
 * anything either, so returning an empty list early is equivalent — not an
 * approximation.
 *
 * Measured after: ~208ms.
 */

import { describe, expect, it } from "vitest";
import { buildAccessProcessQueryScript } from "../../../src/adapters/process/windows-processes.js";

describe("#1494 Access process query script", () => {
  const scanScript = () => buildAccessProcessQueryScript("Name='MSACCESS.EXE'", "MSACCESS");
  const inspectScript = () => buildAccessProcessQueryScript("ProcessId=4242", "MSACCESS", 4242);

  it("probes for a live Access process before doing any other work", () => {
    const script = scanScript();
    const probeAt = script.indexOf("Get-Process");
    const jobAt = script.indexOf("Start-Job");
    const cimAt = script.indexOf("Get-CimInstance");

    expect(probeAt).toBeGreaterThanOrEqual(0);
    expect(jobAt).toBeGreaterThan(probeAt);
    expect(cimAt).toBeGreaterThan(probeAt);
  });

  it("exits before the background job when the probe finds nothing", () => {
    const script = scanScript();
    const exitAt = script.indexOf("exit 0");
    const jobAt = script.indexOf("Start-Job");

    expect(exitAt, "script must carry an early exit").toBeGreaterThanOrEqual(0);
    expect(exitAt, "the early exit must precede the background job").toBeLessThan(jobAt);
  });

  it("short-circuits the PID-scoped inspect path too", () => {
    const script = inspectScript();
    expect(script.indexOf("exit 0")).toBeLessThan(script.indexOf("Start-Job"));
    // The PID filter must survive the short-circuit, or inspect would widen to
    // every Access process.
    expect(script).toContain("4242");
  });

  it("still asks CIM for CommandLine — orphan matching depends on it", () => {
    // scanAndCleanOrphans skips any process whose commandLine is undefined
    // (access-operation-preflight.ts). Dropping it from the projection would
    // silently disable orphan cleanup rather than fail loudly.
    expect(scanScript()).toContain("CommandLine");
  });
});
