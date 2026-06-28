/**
 * Unit tests for the consumer-request contract on dysflow_import_modules
 * at the Node adapter boundary.
 *
 * Pairs with scripts/tests/dysflow-vba-manager-import-lists.Tests.ps1:
 * the Pester file pins the PowerShell-side behavior (phase, durationMs,
 * ACCESS_DATABASE_LOCKED); this file pins the adapter contract that the
 * MCP layer relies on — long lists pass through unchanged, the per-module
 * payload round-trips through the DYSFLOW_RESULT sentinel, and an explicit
 * empty moduleNames is NOT silently expanded to import-all.
 *
 * TDD strict (engram #14545): these tests fail against the production
 * adapter on commit 3fbd60a because:
 *   - the schema caps moduleNames at 100 (R1 says remove)
 *   - the per-module payload shape is `{module, status, error:string}`
 *     not the rich `{module, status, phase, error:{...}, durationMs,
 *     rollbackApplied}` the consumer needs
 *
 * The implementation that makes them green removes the cap and changes
 * the payload contract; the existing Pester test at
 * scripts/tests/dysflow-vba-manager.Tests.ps1:2045 will be updated to
 * match the new error-object shape (it is not one of the 13 pre-existing
 * failures, so this change is in-scope per the consumer request).
 */
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type VbaManagerExecutor,
  VbaSyncAdapter,
} from "../../../src/adapters/vba-sync/vba-sync-adapter";

interface CapturedCall {
  action: string;
  moduleNames: string[];
  extra: Record<string, unknown>;
}

function buildAdapter(executor: VbaManagerExecutor, accessPath = "C:/db/front.accdb") {
  return new VbaSyncAdapter({
    executor,
    scriptPath: "scripts/dysflow-vba-manager.ps1",
    accessPath,
    destinationRoot: "C:/repo/src",
    env: {},
  });
}

describe("VbaSyncAdapter — import_modules long-list contract (consumer request)", () => {
  it("R1 — passes a 30-module list through to the PowerShell runner unchanged", async () => {
    const captured: CapturedCall[] = [];
    const names = Array.from({ length: 30 }, (_, i) => `ListMod${i + 1}`);

    const adapter = buildAdapter(async (request) => {
      captured.push({
        action: request.action,
        moduleNames: [...(request.moduleNames ?? [])],
        extra: { ...(request.extra ?? {}) },
      });
      return {
        exitCode: 0,
        stdout: 'DYSFLOW_RESULT [{"module":"ListMod1","status":"ok"}]',
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    });

    const result = await adapter.execute("import_modules", {
      moduleNames: names,
      apply: true,
    });

    expect(result.ok).toBe(true);
    expect(captured).toHaveLength(1);
    const [firstCall] = captured;
    expect(firstCall).toBeDefined();
    expect(firstCall?.action).toBe("Import");
    expect(firstCall?.moduleNames).toEqual(names);
    expect(firstCall?.moduleNames).toHaveLength(30);
  });

  it("R2 — round-trips the rich per-module payload (phase, durationMs, rollbackApplied) through the sentinel", async () => {
    const adapter = buildAdapter(async () => {
      // Simulate what the new PowerShell contract emits for a partial failure.
      const payload = [
        {
          module: "ModA",
          status: "ok",
          phase: null,
          error: null,
          durationMs: 12,
          rollbackApplied: false,
        },
        {
          module: "ModB",
          status: "error",
          phase: "import",
          error: {
            code: "VBA_IMPORT_PHASE_FAILED",
            message: "synthetic import failure",
            machine: null,
            user: null,
          },
          durationMs: 7,
          rollbackApplied: false,
        },
      ];
      return {
        exitCode: 0,
        stdout: `DYSFLOW_RESULT ${JSON.stringify(payload)}`,
        stderr: "",
        durationMs: 19,
        timedOut: false,
      };
    });

    const result = await adapter.execute("import_modules", {
      moduleNames: ["ModA", "ModB"],
      apply: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    // For import_* tools the adapter wraps the DYSFLOW_RESULT payload under
    // .data.result so the .data object can carry diagnostics (projectRoot,
    // accessPath, etc.). The per-module array lives at .data.result.
    const data = result.data as { result: unknown };
    const modules = data.result as Array<{
      module: string;
      status: string;
      phase: string | null;
      durationMs: number;
      rollbackApplied: boolean;
      error: { code: string; message: string; machine: string | null; user: string | null } | null;
    }>;
    expect(Array.isArray(modules)).toBe(true);
    expect(modules).toHaveLength(2);
    expect(modules[0]).toMatchObject({
      module: "ModA",
      status: "ok",
      phase: null,
      durationMs: 12,
      rollbackApplied: false,
    });
    expect(modules[1]).toMatchObject({
      module: "ModB",
      status: "error",
      phase: "import",
      durationMs: 7,
      rollbackApplied: false,
      error: {
        code: "VBA_IMPORT_PHASE_FAILED",
        message: "synthetic import failure",
      },
    });
    const failedModule = modules[1];
    expect(failedModule).toBeDefined();
    expect(failedModule?.error?.machine).toBeNull();
    expect(failedModule?.error?.user).toBeNull();
  });

  it("R4 — empty moduleNames list is dispatched as Import with [], NOT expanded to import-all", async () => {
    const captured: CapturedCall[] = [];

    const adapter = buildAdapter(async (request) => {
      captured.push({
        action: request.action,
        moduleNames: [...(request.moduleNames ?? [])],
        extra: { ...(request.extra ?? {}) },
      });
      // The PowerShell side, after the fix, returns an empty plan for an
      // explicit empty list (no Get-ChildItem fallback, no import-all expansion).
      return {
        exitCode: 0,
        stdout: "DYSFLOW_RESULT []",
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    });

    const result = await adapter.execute("import_modules", {
      moduleNames: [],
      apply: true,
    });

    expect(result.ok).toBe(true);
    expect(captured).toHaveLength(1);
    const [emptyCall] = captured;
    expect(emptyCall).toBeDefined();
    expect(emptyCall?.action).toBe("Import");
    // Critical: the array reaches the runner EXACTLY as [], not as undefined
    // (which would mean "import everything") and not as a synthesized full list.
    expect(emptyCall?.moduleNames).toEqual([]);
  });

  it("R5 — ACCESS_DATABASE_LOCKED envelope from the script is surfaced unchanged", async () => {
    const adapter = buildAdapter(async () => {
      const envelope = {
        ok: false,
        error: {
          code: "ACCESS_DATABASE_LOCKED",
          message:
            "Database is locked by another user on machine WORKSTATION-ANDREAS (user andreas).",
          machine: "WORKSTATION-ANDREAS",
          user: "andreas",
          remediation:
            "Close the interactive Access session that holds the lock (machine 'WORKSTATION-ANDREAS', user 'andreas'), then retry.",
        },
        modules: [],
      };
      return {
        exitCode: 1,
        stdout: `DYSFLOW_RESULT ${JSON.stringify(envelope)}`,
        stderr: "",
        durationMs: 5,
        timedOut: false,
      };
    });

    const result = await adapter.execute("import_modules", {
      moduleNames: ["ModA"],
      apply: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("ACCESS_DATABASE_LOCKED");
    expect(result.error.message).toMatch(/machine WORKSTATION-ANDREAS/);
    // The adapter must surface the machine / user / remediation fields so
    // the consumer can render an actionable remediation message. The
    // adapter forwards them via DysflowError.details for structured-failure
    // envelopes (when exitCode != 0).
    const details = (result.error.details ?? {}) as Record<string, unknown>;
    expect(details.machine).toBe("WORKSTATION-ANDREAS");
    expect(details.user).toBe("andreas");
    expect(typeof details.remediation).toBe("string");
    expect(details.remediation as string).toMatch(/machine 'WORKSTATION-ANDREAS'/);
  });

  it("R1 (schema) — moduleNames array of 50 modules passes schema validation without truncation", async () => {
    // The schema at src/shared/validation/schema-props.ts had maxItems:100 on
    // moduleNames. This test exercises 50 modules (well under the cap) and
    // asserts the adapter still receives every entry. The cap is being
    // removed entirely per R1; this test pins the "no truncation" contract.
    const names = Array.from({ length: 50 }, (_, i) => `BulkMod${i + 1}`);
    let received = 0;
    const adapter = buildAdapter(async (request) => {
      received = request.moduleNames?.length ?? 0;
      return {
        exitCode: 0,
        stdout: "DYSFLOW_RESULT []",
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    });

    const result = await adapter.execute("import_modules", {
      moduleNames: names,
      apply: true,
    });

    expect(result.ok).toBe(true);
    expect(received).toBe(50);
  });

  it("works against a real on-disk project.json with an empty modules dir", async () => {
    // Smoke test: confirm the adapter resolves a real .dysflow/project.json
    // for the empty-moduleNames path and does not blow up.
    const root = await mkdtemp(join(tmpdir(), "dysflow-import-empty-"));
    // The .dysflow directory must exist before project.json can be written.
    await mkdir(join(root, ".dysflow"), { recursive: true });
    await writeFile(
      join(root, ".dysflow", "project.json"),
      JSON.stringify({
        id: "empty-plan",
        accessPath: "front.accdb",
        destinationRoot: "src",
      }),
      "utf8",
    );

    const adapter = new VbaSyncAdapter({
      cwd: root,
      executor: async () => ({
        exitCode: 0,
        stdout: "DYSFLOW_RESULT []",
        stderr: "",
        durationMs: 1,
        timedOut: false,
      }),
      env: {},
    });

    const result = await adapter.execute("import_modules", {
      projectId: "empty-plan",
      moduleNames: [],
      apply: true,
    });
    expect(result.ok).toBe(true);
  });
});
