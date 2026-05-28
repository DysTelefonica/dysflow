import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type VbaManagerExecutionRequest,
  VbaSyncAdapter,
} from "../../../src/adapters/vba-sync/vba-sync-adapter.js";

const noOpPreflightCleanup = {
  cleanup: async () => ({ cleaned: [], killed: [], orphanedKilled: [], errors: [] }),
};

// Issue #185: export_modules must respect exportPath parameter
describe("VbaSyncAdapter export_modules exportPath routing (issue #185)", () => {
  it("passes exportPath to the VBA manager executor when provided", async () => {
    const capturedRequests: VbaManagerExecutionRequest[] = [];
    const fakeExecutor = async (request: VbaManagerExecutionRequest) => {
      capturedRequests.push(request);
      return { exitCode: 0, stdout: "", stderr: "", durationMs: 10, timedOut: false };
    };

    const service = new VbaSyncAdapter({
      executor: fakeExecutor,
      scriptPath: "fake.ps1",
      accessPath: "C:\\MyProject\\front.accdb",
      destinationRoot: "src",
      preflightCleanup: noOpPreflightCleanup,
    });

    const exportPath = join(tmpdir(), "nc_export_check");
    await service.execute("export_modules", { exportPath, moduleNames: ["TestModule"] });

    expect(capturedRequests).toHaveLength(1);
    // exportPath must be reflected as destinationRoot (the PS -DestinationRoot flag)
    expect(capturedRequests[0]?.destinationRoot).toBe(exportPath);
  });

  it("falls back to destinationRoot from config when exportPath is not provided", async () => {
    const capturedRequests: VbaManagerExecutionRequest[] = [];
    const fakeExecutor = async (request: VbaManagerExecutionRequest) => {
      capturedRequests.push(request);
      return { exitCode: 0, stdout: "", stderr: "", durationMs: 10, timedOut: false };
    };

    const configDestinationRoot = "C:\\MyProject\\src";
    const service = new VbaSyncAdapter({
      executor: fakeExecutor,
      scriptPath: "fake.ps1",
      accessPath: "C:\\MyProject\\front.accdb",
      destinationRoot: configDestinationRoot,
      preflightCleanup: noOpPreflightCleanup,
    });

    await service.execute("export_modules", { moduleNames: ["TestModule"] });

    expect(capturedRequests).toHaveLength(1);
    expect(capturedRequests[0]?.destinationRoot).toBe(configDestinationRoot);
  });

  it("does not export to src/ when exportPath points to a temp directory", async () => {
    const capturedRequests: VbaManagerExecutionRequest[] = [];
    const fakeExecutor = async (request: VbaManagerExecutionRequest) => {
      capturedRequests.push(request);
      return { exitCode: 0, stdout: "", stderr: "", durationMs: 10, timedOut: false };
    };

    const service = new VbaSyncAdapter({
      executor: fakeExecutor,
      scriptPath: "fake.ps1",
      accessPath: "C:\\MyProject\\front.accdb",
      destinationRoot: "src",
      preflightCleanup: noOpPreflightCleanup,
    });

    const tempExportPath = join(tmpdir(), "opencode", "nc_export_check");
    await service.execute("export_modules", { exportPath: tempExportPath });

    expect(capturedRequests).toHaveLength(1);
    // Must use tempExportPath, NOT "src"
    expect(capturedRequests[0]?.destinationRoot).toBe(tempExportPath);
    expect(capturedRequests[0]?.destinationRoot).not.toBe("src");
  });
});
