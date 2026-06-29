/**
 * RED tests for H1 (exists) + H2 (delete_module) single-name forwarding.
 *
 * Pins the contract at the public port: when the VbaSyncAdapter handles a
 * single-name tool mapping (exists, delete_module) and the mapping's
 * `moduleNames()` resolver produces a non-empty array, the adapter MUST
 * forward that array to the executor AND set `moduleNamesProvided: true`,
 * regardless of whether the upstream payload used the plural `moduleNames`
 * or the singular `name` / `moduleName` key.
 *
 * The presence flag must follow the MAPPING'S OUTPUT, not the upstream
 * payload's surface key. The pre-fix bug at vba-sync-adapter.ts:251
 * (Object.hasOwn(params, "moduleNames")) made `moduleNamesProvided` false
 * when only a singular key was present, sending PowerShell an empty module
 * list and triggering the `Exists requiere exactamente un nombre` throw
 * from dysflow-vba-manager.ps1:4150.
 *
 * Tests use the public API `VbaSyncAdapter.execute(toolName, params)` with
 * a fake `executor` that captures the `VbaManagerExecutionRequest` — the
 * same shape proven by `vba-modules-adapter-import-lists.test.ts`.
 *
 * Singular cases (the actual bug surface) MUST be RED until the fix lands:
 *   - exists + moduleName:"Foo"      → moduleNamesProvided===true
 *   - exists + name:"Bar"            → moduleNamesProvided===true
 *   - delete_module + moduleName:"Foo" → moduleNamesProvided===true
 * Plural + empty cases pin the contract so the fix does not regress them.
 */

import { describe, expect, it } from "vitest";
import {
  type VbaManagerExecutionRequest,
  type VbaManagerExecutionResult,
  type VbaManagerExecutor,
  VbaSyncAdapter,
} from "../../../src/adapters/vba-sync/vba-sync-adapter";

interface CapturedCall {
  action: string;
  moduleNames: string[];
  moduleNamesProvided: boolean | undefined;
  extra: Record<string, unknown>;
}

function buildAdapter(executor: VbaManagerExecutor) {
  return new VbaSyncAdapter({
    executor,
    scriptPath: "C:/fake/dysflow-vba-manager.ps1",
    accessPath: "C:/fake/front.accdb",
    destinationRoot: "C:/fake/src",
    env: {},
  });
}

function makeCapturingExecutor(captured: CapturedCall[]): VbaManagerExecutor {
  return async (request: VbaManagerExecutionRequest): Promise<VbaManagerExecutionResult> => {
    captured.push({
      action: request.action,
      moduleNames: [...request.moduleNames],
      moduleNamesProvided: request.moduleNamesProvided,
      extra: { ...request.extra },
    });
    // Return the sentinel-format stdout the parseOutput contract expects.
    return {
      exitCode: 0,
      stdout: "DYSFLOW_RESULT {\"ok\":true,\"data\":{\"exists\":false}}",
      stderr: "",
      durationMs: 1,
      timedOut: false,
    };
  };
}

describe("VbaSyncAdapter — single-name tool mapping forwards moduleNames to PowerShell", () => {
  it("H1a — exists with singular moduleName forwards moduleNamesProvided:true and moduleNames:['Foo']", async () => {
    const captured: CapturedCall[] = [];
    const adapter = buildAdapter(makeCapturingExecutor(captured));

    await adapter.execute("exists", {
      moduleName: "Foo",
    });

    expect(captured).toHaveLength(1);
    const sent = captured[0];
    expect(sent).toBeDefined();
    expect(sent?.action).toBe("Exists");
    expect(sent?.moduleNames).toEqual(["Foo"]);
    expect(sent?.moduleNamesProvided).toBe(true);
  });

  it("H1b — exists with singular name alias forwards moduleNamesProvided:true and moduleNames:['Bar']", async () => {
    const captured: CapturedCall[] = [];
    const adapter = buildAdapter(makeCapturingExecutor(captured));

    await adapter.execute("exists", {
      name: "Bar",
    });

    expect(captured).toHaveLength(1);
    const sent = captured[0];
    expect(sent).toBeDefined();
    expect(sent?.action).toBe("Exists");
    expect(sent?.moduleNames).toEqual(["Bar"]);
    expect(sent?.moduleNamesProvided).toBe(true);
  });

  it("H1c — exists with no name forwards moduleNamesProvided:false and moduleNames:[]", async () => {
    const captured: CapturedCall[] = [];
    const adapter = buildAdapter(makeCapturingExecutor(captured));

    await adapter.execute("exists", {});

    expect(captured).toHaveLength(1);
    const sent = captured[0];
    expect(sent).toBeDefined();
    expect(sent?.action).toBe("Exists");
    expect(sent?.moduleNames).toEqual([]);
    expect(sent?.moduleNamesProvided).toBe(false);
  });

  it("H2a — delete_module with singular moduleName+force forwards moduleNamesProvided:true and moduleNames:['Foo'] and extra.force=true", async () => {
    const captured: CapturedCall[] = [];
    const adapter = buildAdapter(makeCapturingExecutor(captured));

    await adapter.execute("delete_module", {
      moduleName: "Foo",
      force: true,
    });

    expect(captured).toHaveLength(1);
    const sent = captured[0];
    expect(sent).toBeDefined();
    expect(sent?.action).toBe("Delete");
    expect(sent?.moduleNames).toEqual(["Foo"]);
    expect(sent?.moduleNamesProvided).toBe(true);
    expect(sent?.extra.force).toBe(true);
  });

  it("H2b — delete_module with plural moduleNames forwards moduleNamesProvided:true and moduleNames:['X','Y']", async () => {
    const captured: CapturedCall[] = [];
    const adapter = buildAdapter(makeCapturingExecutor(captured));

    await adapter.execute("delete_module", {
      moduleNames: ["X", "Y"],
    });

    expect(captured).toHaveLength(1);
    const sent = captured[0];
    expect(sent).toBeDefined();
    expect(sent?.action).toBe("Delete");
    expect(sent?.moduleNames).toEqual(["X", "Y"]);
    expect(sent?.moduleNamesProvided).toBe(true);
  });

  it("H2c — delete_module with no name forwards moduleNamesProvided:false and moduleNames:[] (no -ModuleNamesJson sent)", async () => {
    const captured: CapturedCall[] = [];
    const adapter = buildAdapter(makeCapturingExecutor(captured));

    await adapter.execute("delete_module", {});

    expect(captured).toHaveLength(1);
    const sent = captured[0];
    expect(sent).toBeDefined();
    expect(sent?.action).toBe("Delete");
    expect(sent?.moduleNames).toEqual([]);
    expect(sent?.moduleNamesProvided).toBe(false);
  });
});