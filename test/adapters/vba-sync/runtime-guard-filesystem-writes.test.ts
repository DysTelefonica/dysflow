/**
 * Runtime-guard coverage for filesystem-writing tools (issue #574).
 *
 * The `isWithinRuntime` guard already protects `vba_inline_execution` (#548).
 * Three other write/delete paths can still receive destination/export/catalog
 * paths that point into the production runtime directory:
 *
 *   1. `VbaModulesAdapter.execute` — `export_modules` / `export_all` when
 *      `exportPath` overrides `destinationRoot` (#185).
 *   2. `VbaModulesAdapter.exportAllWithPrune` — `export_all prune:true` deletes
 *      managed source files under `destinationRoot`.
 *   3. `VbaFormService.generateForm` — writes a form/report `.json` spec under
 *      `destinationRoot` (or `projectRoot` as fallback).
 *
 * AGENTS.md hard rule: never mutate the production runtime directory. The
 * `test-runtime` is allowed; `isWithinRuntime` resolves via `DYSFLOW_HOME`,
 * the system marker, or the `LOCALAPPDATA` default and excludes `test-runtime`
 * only if it lives OUTSIDE the resolved runtime path. The guard must fail
 * CLOSED (refuse) for any caller that points these paths at production.
 */

import { describe, expect, it, vi } from "vitest";
import { VbaModulesAdapter } from "../../../src/adapters/vba-sync/vba-modules-adapter";
import { successResult } from "../../../src/core/contracts/index.js";
import { VbaFormService } from "../../../src/core/services/vba-form-service";

describe("Issue #574 — runtime guard for VbaModulesAdapter.execute exportPath (#185)", () => {
  const runtimeEnv = {
    DYSFLOW_HOME: "C:/runtime/dysflow",
  } as unknown as Record<string, string | undefined>;

  function makeAdapter(env: Record<string, string | undefined>) {
    const executeMappedTool = vi.fn();
    const resolveExecutionTarget = vi.fn();
    const validateStrictContext = vi.fn(() => successResult<undefined>(undefined));
    const runPreflightCleanup = vi.fn();
    const adapter = new VbaModulesAdapter({
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      cwd: "C:/runtime/dysflow",
      env,
      executeMappedTool,
      resolveExecutionTarget,
      validateStrictContext,
      runPreflightCleanup,
      executor: vi.fn(),
    });
    return { adapter, executeMappedTool };
  }

  it("refuses export_modules when exportPath points inside the production runtime", async () => {
    const { adapter, executeMappedTool } = makeAdapter(runtimeEnv);

    const result = await adapter.execute("export_modules", {
      exportPath: "C:/runtime/dysflow/app/scripts",
      moduleNames: ["Module1"],
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.error.code).toBe("INVALID_INPUT");
    expect(result.error.message).toMatch(/production runtime|inside the runtime/i);
    // Critical: must NOT call the runner — refuse BEFORE any side effect.
    expect(executeMappedTool).not.toHaveBeenCalled();
  });

  it("refuses export_all when exportPath points inside the production runtime", async () => {
    const { adapter, executeMappedTool } = makeAdapter(runtimeEnv);

    const result = await adapter.execute("export_all", {
      exportPath: "C:/runtime/dysflow",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.error.code).toBe("INVALID_INPUT");
    expect(result.error.message).toMatch(/production runtime|inside the runtime/i);
    expect(executeMappedTool).not.toHaveBeenCalled();
  });

  it("allows export_modules when exportPath points outside the production runtime", async () => {
    const { adapter, executeMappedTool } = makeAdapter(runtimeEnv);
    executeMappedTool.mockResolvedValue({ ok: true, data: { ok: true } });

    const result = await adapter.execute("export_modules", {
      exportPath: "C:/projects/myapp/src",
      moduleNames: ["Module1"],
    });

    // Guard passed; execution reached the runner. The runner may return anything;
    // we only assert the guard did NOT block this call.
    expect(executeMappedTool).toHaveBeenCalled();
    // And the rejected guard wasn't triggered.
    if (!result.ok) {
      expect(result.error.code).not.toBe("INVALID_INPUT");
    }
  });
});

describe("Issue #574 — runtime guard for VbaModulesAdapter.exportAllWithPrune", () => {
  const runtimeEnv = {
    DYSFLOW_HOME: "C:/runtime/dysflow",
  } as unknown as Record<string, string | undefined>;

  function makeAdapter(env: Record<string, string | undefined>, destinationRoot: string) {
    const executeMappedTool = vi
      .fn()
      .mockResolvedValue(successResult({ exported: [], warnings: [] }));
    const resolveExecutionTarget = vi
      .fn()
      .mockResolvedValue(successResult({ destinationRoot, projectRoot: "C:/projects/anywhere" }));
    const validateStrictContext = vi.fn(() => successResult<undefined>(undefined));
    const runPreflightCleanup = vi.fn().mockResolvedValue({ performed: false });
    const adapter = new VbaModulesAdapter({
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      cwd: "C:/projects/anywhere",
      env,
      executeMappedTool,
      resolveExecutionTarget,
      validateStrictContext,
      runPreflightCleanup,
      executor: vi.fn(),
    });
    return { adapter, resolveExecutionTarget };
  }

  it("refuses export_all prune when destinationRoot resolves inside the production runtime", async () => {
    const { adapter, resolveExecutionTarget } = makeAdapter(
      runtimeEnv,
      "C:/runtime/dysflow/app/scripts",
    );

    const result = await adapter.execute("export_all", { prune: true });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.error.code).toBe("INVALID_INPUT");
    expect(result.error.message).toMatch(/production runtime|inside the runtime/i);
    // resolveExecutionTarget WAS called (target must be inspected before the guard),
    // but the runner's destructive phase MUST be skipped.
    expect(resolveExecutionTarget).toHaveBeenCalled();
  });

  it("allows export_all prune when destinationRoot resolves outside the production runtime", async () => {
    const { adapter } = makeAdapter(runtimeEnv, "C:/projects/myapp/src");

    const result = await adapter.execute("export_all", { prune: true });

    // The guard did NOT block; the runner returned a normal prune result.
    // (We mocked the runner's executeMappedTool to return success with empty exported list.)
    expect(result.ok).toBe(true);
  });
});

describe("Issue #574 — runtime guard for VbaFormService.generateForm", () => {
  const runtimeEnv = {
    DYSFLOW_HOME: "C:/runtime/dysflow",
  } as unknown as Record<string, string | undefined>;

  function makeService(env?: Record<string, string | undefined>) {
    return new VbaFormService({
      cwd: "C:/runtime/dysflow",
      env,
    });
  }

  it("refuses generateForm when destinationRoot points inside the production runtime", async () => {
    const service = makeService(runtimeEnv);
    const result = await service.generateForm({
      spec: { name: "Form_Smuggle", kind: "Form", controls: [] },
      destinationRoot: "C:/runtime/dysflow/app/scripts",
      apply: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.error.code).toBe("INVALID_INPUT");
    expect(result.error.message).toMatch(/production runtime|inside the runtime/i);
  });

  it("refuses generateForm when projectRoot fallback points inside the production runtime", async () => {
    const service = makeService(runtimeEnv);
    const result = await service.generateForm({
      spec: { name: "Form_Smuggle2", kind: "Form", controls: [] },
      projectRoot: "C:/runtime/dysflow",
      apply: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.error.code).toBe("INVALID_INPUT");
  });

  it("refuses generateForm when cwd fallback is inside the production runtime", async () => {
    // Service cwd lives inside the runtime, no destinationRoot/projectRoot in params.
    const service = new VbaFormService({
      cwd: "C:/runtime/dysflow",
      env: runtimeEnv,
    });
    const result = await service.generateForm({
      spec: { name: "Form_Smuggle3", kind: "Form", controls: [] },
      apply: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.error.code).toBe("INVALID_INPUT");
  });

  it("allows generateForm when destinationRoot is outside the production runtime", async () => {
    const service = makeService(runtimeEnv);
    const result = await service.generateForm({
      spec: { name: "Form_Normal", kind: "Form", controls: [] },
      destinationRoot: "C:/projects/myapp",
      apply: true,
    });
    // The guard did NOT block. Whether the spec validation/writing succeeds is
    // unrelated to the runtime guard, so we only assert the guard's effect.
    if (!result.ok) {
      expect(result.error.code).not.toBe("INVALID_INPUT");
    }
  });
});
