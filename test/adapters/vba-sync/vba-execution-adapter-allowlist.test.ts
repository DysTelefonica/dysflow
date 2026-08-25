import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AllowedProcedures } from "../../../src/adapters/mcp/allowed-procedures-resolver.js";
import { createConfiguredServices } from "../../../src/adapters/mcp/stdio.js";
import {
  VbaExecutionAdapter,
  type VbaSyncOrchestrator,
} from "../../../src/adapters/vba-sync/vba-execution-adapter.js";
import type { DysflowConfig } from "../../../src/core/config/dysflow-config.js";
import { successResult } from "../../../src/core/contracts/index.js";

/**
 * F23 — v1.19.0 regression: `test_vba` reports `MCP_ALLOWLIST_NOT_CONFIGURED`
 * even when the project's `.dysflow/project.json` declares an `allowedProcedures`
 * allowlist. The orchestrator observed the gate refusing the 9-test plan with
 * the "no allowlist" error while the config on disk had 22 entries (including
 * the 4 new tests on lines 28-31).
 *
 * Root cause: `loadDysflowConfigShared` (in `src/core/config/dysflow-config.ts`)
 * short-circuited to `buildExplicitConfig` whenever the input carried an
 * explicit `accessPath`, skipping the project config file on disk. The
 * explicit-config path did not surface the project's `allowedProcedures`, so
 * the per-input resolver returned `undefined` and the gate refused with
 * `MCP_ALLOWLIST_NOT_CONFIGURED`.
 *
 * The original regression remains covered for configured whitelists. Issue
 * #1556 additionally locks missing/empty as unrestricted, eliminating the
 * obsolete missing-allowlist refusal while preserving configured-list drift.
 */

function writeProjectConfig(
  projectDir: string,
  options: { allowedProcedures?: readonly string[] | undefined; projectId?: string } = {},
): void {
  mkdirSync(join(projectDir, ".dysflow"), { recursive: true });
  const config: Record<string, unknown> = {
    id: options.projectId ?? "f23-project",
    accessPath: "front.accdb",
  };
  if (options.allowedProcedures !== undefined) {
    // Use the consolidated `capabilities` block — the canonical v1.19.0 shape.
    config.capabilities = { procedures: { allow: options.allowedProcedures } };
  }
  writeFileSync(
    join(projectDir, ".dysflow", "project.json"),
    JSON.stringify(config, null, 2),
    "utf8",
  );
}

describe("F23 — test_vba allowlist end-to-end (regression: must NOT emit MCP_ALLOWLIST_NOT_CONFIGURED when config declares allowlist)", () => {
  let workDir: string;
  let projectDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "dysflow-f23-"));
    projectDir = join(workDir, "project");
    mkdirSync(projectDir, { recursive: true });
    // Create a real (empty) .accdb file so the config loader does not fail
    // with CONFIG_TARGET_NOT_FOUND when the dispatch path validates it.
    writeFileSync(join(projectDir, "front.accdb"), "", "utf8");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Layer 1: VbaExecutionAdapter unit (resolver path) ─────────────────────
  // The VbaExecutionAdapter test ensures the gate accepts the plan when the
  // per-input resolver returns a non-empty allowlist. This is the closest
  // unit-level reproduction of the F23 condition.
  it("VbaExecutionAdapter: test_vba accepts a plan when the per-input resolver returns a non-empty allowlist", async () => {
    const executeMappedTool = vi
      .fn()
      .mockResolvedValue(successResult([{ ok: true, procedure: "Test_A" }]));
    const orchestrator: VbaSyncOrchestrator = {
      executeMappedTool,
      cwd: projectDir,
    };
    // Per-input resolver simulating the production wiring: the resolver is
    // called with each test_vba input and returns the allowlist of the project
    // the input targets.
    const resolver: AllowedProcedures = vi.fn().mockResolvedValue(["Test_A", "Test_B", "Test_C"]);
    const adapter = new VbaExecutionAdapter(orchestrator, resolver);

    const result = await adapter.execute("test_vba", {
      procedureName: "Test_A",
      argsJson: "[]",
      projectId: "f23-project",
      accessPath: resolve(projectDir, "front.accdb"),
    });

    // F23 regression assertion: the gate MUST NOT refuse with
    // MCP_ALLOWLIST_NOT_CONFIGURED when the resolver returns a non-empty
    // allowlist that contains the procedure. This is the exact condition
    // observed in the F23 friction report.
    expect(result.ok).toBe(true);
    if (!result.ok) {
      // Diagnostic aid if the regression ever returns: surface the error
      // envelope so the failure mode is clear without re-running.
      throw new Error(
        `F23 regression: gate refused valid plan with code ${result.error.code}: ${result.error.message}`,
      );
    }
    // The runner MUST have been called with the test plan.
    expect(executeMappedTool).toHaveBeenCalledWith(
      "test_vba",
      expect.objectContaining({
        proceduresJson: JSON.stringify([{ procedure: "Test_A", args: [] }]),
      }),
      expect.any(Object),
    );
  });

  // ─── Layer 2: createConfiguredServices integration ────────────────────────
  // The F23 root cause hypothesis mentions "the resolver wiring for test_vba
  // is broken (it works for dysflow_vba_execute per F7, but not for test_vba
  // per F23)". This integration test goes through the full
  // `createConfiguredServices` path that `startMcpStdioAdapter` uses, with a
  // REAL `.dysflow/project.json` on disk. If the wiring is broken in the
  // composition root, this test catches it; the unit test above does not.
  it("createConfiguredServices: vbaSyncToolService accepts a test_vba plan when the project config declares a non-empty allowedProcedures", async () => {
    writeProjectConfig(projectDir, { allowedProcedures: ["Test_A", "Test_B"] });

    const config: DysflowConfig = {
      configSource: "repo-config",
      allowWrites: false,
      accessDbPath: resolve(projectDir, "front.accdb"),
      projectRoot: projectDir,
      timeoutMs: 30_000,
    };
    const services = createConfiguredServices(config, { cwd: projectDir });

    // The composition root MUST wire a resolver (per F7), not a frozen array —
    // a frozen array is the F22/F23 regression vector. `createConfiguredServices`
    // is statically typed with an optional `vbaSyncToolService` because the
    // dynamic `createDynamicServices` factory may omit it; for the static
    // composition root it is always present, so we narrow with `assert` here.
    assert(
      services.vbaSyncToolService,
      "createConfiguredServices must wire vbaSyncToolService for the static composition root",
    );
    // `vbaSyncToolService` is exposed as the narrow `VbaSyncPort` contract, but
    // the static composition root wires a `VbaSyncAdapter` whose concrete
    // `allowedProcedures` resolver is the regression-relevant property. Cast
    // through `unknown` to a minimal structural view that exposes only the
    // field under test — keeps the rest of the contract intact.
    const adapter = services.vbaSyncToolService as unknown as {
      allowedProcedures?: AllowedProcedures;
    };
    expect(typeof adapter.allowedProcedures).toBe("function");

    // Narrow the `AllowedProcedures` union (`readonly string[] | function`)
    // to the function branch so the `await resolver(input)` call type-checks.
    assert(
      typeof adapter.allowedProcedures === "function",
      "vbaSyncToolService must wire a function-form resolver for the F23 path",
    );
    const resolver = adapter.allowedProcedures;
    const input = {
      projectId: "f23-project",
      accessPath: resolve(projectDir, "front.accdb"),
    };
    const resolved = await resolver(input);
    // Sanity: with the F23 fix in `loadDysflowConfigShared`, an explicit
    // accessPath no longer bypasses the project config — the allowlist from
    // `.dysflow/project.json` is surfaced even when the input carries
    // accessPath. Before the fix, this returned `undefined`.
    expect(resolved).toEqual(["Test_A", "Test_B"]);

    // Drive the test_vba path through the composition root with dryRun:true
    // so the runner is short-circuited (this is a config-layer regression
    // test, not a runner test — the real PowerShell spawn would fail on the
    // empty `.accdb` fixture and obscure the F23 signal we care about).
    const result = await services.vbaSyncToolService.execute("test_vba", {
      ...input,
      proceduresJson: JSON.stringify([{ procedure: "Test_A", args: [] }]),
      dryRun: true,
    });

    // F23 regression assertion at the integration layer: the gate must NOT
    // emit MCP_ALLOWLIST_NOT_CONFIGURED when the config on disk declares a
    // non-empty allowlist. dryRun:true means a plan-shaped success is the
    // expected outcome.
    if (!result.ok) {
      throw new Error(
        `F23 regression (integration): gate refused valid plan with code ${result.error.code}: ${result.error.message}`,
      );
    }
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({
        dryRun: true,
        willExecute: false,
        plan: { procedureName: ["Test_A"], proceduresCount: 1 },
      });
    }
  });

  // ─── Layer 3: opt-in allowlist semantics (#1556) ─────────────────────────
  it("executes when the resolver returns undefined (no allowlist configured)", async () => {
    const executeMappedTool = vi
      .fn()
      .mockResolvedValue(successResult({ passed: 2, failed: 0, errors: 0, tests: [] }));
    const orchestrator: VbaSyncOrchestrator = { executeMappedTool, cwd: projectDir };
    // No allowlist: the resolver returns undefined to simulate a project
    // config that has NO allowedProcedures (the original F23 condition: even
    // when the config DOES have entries, the gate emits this envelope).
    const resolver: AllowedProcedures = vi.fn().mockResolvedValue(undefined);
    const adapter = new VbaExecutionAdapter(orchestrator, resolver);

    const result = await adapter.execute("test_vba", {
      proceduresJson: JSON.stringify([
        { procedure: "Test_First", args: [] },
        { procedure: "Test_Second", args: ["x"] },
      ]),
      projectId: "f23-project",
      accessPath: resolve(projectDir, "front.accdb"),
    });

    expect(result.ok).toBe(true);
    expect(executeMappedTool).toHaveBeenCalled();
  });

  it("executes when the resolver returns [] (empty means no restrictions)", async () => {
    const executeMappedTool = vi
      .fn()
      .mockResolvedValue(successResult({ passed: 1, failed: 0, errors: 0, tests: [] }));
    const orchestrator: VbaSyncOrchestrator = { executeMappedTool, cwd: projectDir };
    const resolver: AllowedProcedures = vi.fn().mockResolvedValue([]);
    const adapter = new VbaExecutionAdapter(orchestrator, resolver);

    const result = await adapter.execute("test_vba", {
      procedureName: "Test_Any",
      argsJson: "[]",
      projectId: "f23-project",
      accessPath: resolve(projectDir, "front.accdb"),
    });

    expect(result.ok).toBe(true);
    expect(executeMappedTool).toHaveBeenCalled();
  });
});
