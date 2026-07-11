import { describe, expect, it, vi } from "vitest";
import { applyGuardedFormWrite } from "../../../src/adapters/vba-sync/vba-forms-guarded-write";
import type {
  ManagedFormSource,
  VbaFormsOrchestrator,
} from "../../../src/adapters/vba-sync/vba-forms-types";
import { failureResult, successResult } from "../../../src/core/contracts/index";
import type { FormFileSystemPort } from "../../../src/core/services/vba-form-service";

const RESOLVED: ManagedFormSource = {
  sourcePath: "C:\\repo\\forms\\Form_Customer.form.txt",
  destinationRoot: "C:\\repo",
  moduleName: "Customer",
};

const IMPORT_FAIL = failureResult({
  code: "IMPORT_FAILED",
  message: "import_modules failed",
  retryable: false,
});

function makeOrchestrator(importResult = successResult({ imported: true })): VbaFormsOrchestrator {
  return {
    executor: vi.fn(),
    env: {},
    cwd: "C:/repo",
    resolveExecutionTarget: vi.fn(),
    validateStrictContext: vi.fn(),
    executeMappedTool: vi.fn().mockResolvedValue(importResult),
  };
}

function mockFs(overrides: Partial<FormFileSystemPort> = {}): FormFileSystemPort {
  return {
    mkdir: vi.fn(),
    readdir: vi.fn(),
    readFile: vi.fn(),
    readJson: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("applyGuardedFormWrite — internal seam (PR 4 contract)", () => {
  it("writes once, invokes import_modules once, returns the importResult, and pins the param-merge order", async () => {
    const orchestrator = makeOrchestrator(successResult({ imported: true, note: "ok" }));
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const fs = mockFs({ writeFile });

    const result = await applyGuardedFormWrite({
      orchestrator,
      fileSystem: fs,
      source: RESOLVED,
      newSource: "new text",
      originalSource: "old text",
      targetExisted: true,
      // Caller-supplied fields the seam MUST override, plus `extra` which the
      // seam MUST preserve (proves merge order: forwarded first, seam overrides last).
      forwardedParams: {
        sourcePath: "caller-supplied",
        destinationRoot: "caller-supplied",
        moduleNames: ["caller-supplied"],
        importMode: "Manual",
        apply: false,
        dryRun: true,
        extra: "preserved",
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ importResult: { imported: true, note: "ok" } });
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(writeFile).toHaveBeenCalledWith(RESOLVED.sourcePath, "new text", "utf8");
    expect(orchestrator.executeMappedTool).toHaveBeenCalledTimes(1);
    expect(orchestrator.executeMappedTool).toHaveBeenCalledWith(
      "import_modules",
      {
        extra: "preserved",
        sourcePath: RESOLVED.sourcePath,
        destinationRoot: RESOLVED.destinationRoot,
        moduleNames: [RESOLVED.moduleName],
        importMode: "Auto",
        apply: true,
        dryRun: false,
      },
      expect.any(Object),
    );
  });

  it("rolls back to originalSource on import_modules failure (FORM_IMPORT_GATE_FAILED + #692 outcome)", async () => {
    const orchestrator = makeOrchestrator(IMPORT_FAIL);
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const fs = mockFs({ writeFile });

    const result = await applyGuardedFormWrite({
      orchestrator,
      fileSystem: fs,
      source: RESOLVED,
      newSource: "new text",
      originalSource: "old text",
      targetExisted: true,
      forwardedParams: {},
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORM_IMPORT_GATE_FAILED");
      expect(result.error.message).toContain(RESOLVED.sourcePath);
      expect(result.error.details).toMatchObject({
        cause: expect.objectContaining({ code: "IMPORT_FAILED" }),
        rollback: { attempted: true, applied: true, targetExisted: true },
      });
    }
    // 1 mutation write + 1 rollback write; import_modules invoked exactly once.
    expect(writeFile).toHaveBeenCalledTimes(2);
    expect(writeFile).toHaveBeenNthCalledWith(1, RESOLVED.sourcePath, "new text", "utf8");
    expect(writeFile).toHaveBeenNthCalledWith(2, RESOLVED.sourcePath, "old text", "utf8");
    expect(orchestrator.executeMappedTool).toHaveBeenCalledTimes(1);
    expect(orchestrator.executeMappedTool).toHaveBeenCalledWith(
      "import_modules",
      expect.any(Object),
      expect.any(Object),
    );
  });

  it("returns FORM_WRITE_FAILED without invoking import_modules when the initial writeFile throws", async () => {
    const orchestrator = makeOrchestrator();
    const writeFile = vi.fn().mockRejectedValue(new Error("EACCES: permission denied"));
    const fs = mockFs({ writeFile });

    const result = await applyGuardedFormWrite({
      orchestrator,
      fileSystem: fs,
      source: RESOLVED,
      newSource: "new text",
      originalSource: "old text",
      targetExisted: true,
      forwardedParams: {},
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORM_WRITE_FAILED");
      expect(result.error.message).toContain("EACCES");
    }
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(orchestrator.executeMappedTool).not.toHaveBeenCalled();
  });

  it("reports rollback failure when the restore write throws", async () => {
    const orchestrator = makeOrchestrator(IMPORT_FAIL);
    const writeFile = vi
      .fn()
      .mockImplementationOnce(async () => undefined) // mutation write succeeds
      .mockImplementationOnce(async () => {
        throw new Error("ENOSPC: no space left on device");
      });
    const fs = mockFs({ writeFile });

    const result = await applyGuardedFormWrite({
      orchestrator,
      fileSystem: fs,
      source: RESOLVED,
      newSource: "new text",
      originalSource: "old text",
      targetExisted: true,
      forwardedParams: {},
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORM_IMPORT_GATE_FAILED");
      expect(result.error.details).toMatchObject({
        cause: expect.objectContaining({ code: "IMPORT_FAILED" }),
        rollback: {
          attempted: true,
          applied: false,
          targetExisted: true,
          error: { message: expect.stringContaining("ENOSPC") },
        },
      });
    }
  });

  it("propagates targetExisted=false into the rollback metadata for new-target restores (#692)", async () => {
    const orchestrator = makeOrchestrator(IMPORT_FAIL);
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const fs = mockFs({ writeFile });

    const result = await applyGuardedFormWrite({
      orchestrator,
      fileSystem: fs,
      source: RESOLVED,
      newSource: "new text",
      originalSource: "", // target was newly created — original state was empty
      targetExisted: false,
      forwardedParams: {},
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.details).toMatchObject({
        rollback: {
          attempted: true,
          applied: true,
          targetExisted: false,
          restoredState: "empty-placeholder",
          requiresManualCleanup: true,
        },
      });
    }
  });
});
