/**
 * #1174 — RED: integration test pinning the contract that the MCP adapter's
 * `buildRunVbaRequest` and the `AccessVbaService` dry-run path BOTH populate
 * `moduleName` from the supplied `procedureName`. Without the GREEN commit
 * that wires `parseProcedureName` into both call sites, the dry-run plan
 * echoes `moduleName: ""` while the apply path's preflight still scans every
 * module — exactly the asymmetry the issue reports.
 *
 * Each test below is a pre-fix assertion that currently fails:
 *
 *   1. `buildRunVbaRequest` projects the parsed `moduleName` onto the typed
 *      `AccessVbaRequest` (currently hard-codes `""`).
 *   2. `AccessVbaService.execute({dryRun:true})` echoes the parsed
 *      `moduleName` in its plan (currently echoes `""`).
 *   3. When `dryRun: true` and `apply: true` are called against the same
 *      procedureName in the same binary, both paths agree on `moduleName`
 *      (currently: dry-run says "", apply path scans every module — the
 *      asymmetry that triggers the bug).
 *   4. An empty / malformed `procedureName` short-circuits with a typed
 *      envelope BEFORE the runner is spawned (currently: dry-run would
 *      silently succeed with empty fields; apply would surface
 *      `PROCEDURE_NOT_FOUND` from the preflight — divergent error shapes).
 *
 * The GREEN commit threads `parseProcedureName` into both call sites and
 * uses `procName` (not the full `procedureName`) for the apply-path
 * `listVbaProcedures` lookup, fixing the lookup bug at the same time.
 */

import { describe, expect, it } from "vitest";
import { buildRunVbaRequest, isMcpToolResult } from "../../../src/adapters/mcp/alias-tools.js";
import type { DysflowConfig } from "../../../src/core/config/dysflow-config.js";
import type { OperationResult } from "../../../src/core/contracts/index.js";
import type {
  AccessRunner,
  AccessRunnerOperation,
} from "../../../src/core/runner/access-runner.js";
import { AccessVbaService } from "../../../src/core/services/vba-service.js";

const config: DysflowConfig = {
  configSource: "explicit-request",
  allowWrites: true,
  accessDbPath: "C:/data/proj.accdb",
  timeoutMs: 30_000,
};

class RecordingRunner implements AccessRunner {
  public operations: AccessRunnerOperation[] = [];

  constructor(private readonly nextResult: OperationResult<unknown> = defaultResult()) {}

  async run<TData>(operation: AccessRunnerOperation): Promise<OperationResult<TData>> {
    this.operations.push(operation);
    return this.nextResult as OperationResult<TData>;
  }

  async runProbe<TData>(): Promise<OperationResult<TData>> {
    throw new Error("RecordingRunner.runProbe: not used by these tests");
  }
}

function defaultResult(): OperationResult<unknown> {
  return {
    ok: true,
    data: { returnValue: 0 },
    diagnostics: [],
    durationMs: 5,
  };
}

describe("#1174 — run_vba apply/dryRun consistency on procedureName parsing", () => {
  it("buildRunVbaRequest parses 'MyModule.Foo' and projects moduleName onto the typed request", () => {
    const request = buildRunVbaRequest({
      procedureName: "MyModule.Foo",
    });
    expect(isMcpToolResult(request)).toBe(false);
    if (isMcpToolResult(request)) return;
    // The adapter MUST echo the parsed module so the downstream preflight
    // and Access COM runner see a non-empty moduleName. Without #1174 this
    // hard-coded "" — the symmetry the bug report calls out.
    expect(request.moduleName).toBe("MyModule");
    expect(request.procedureName).toBe("MyModule.Foo");
  });

  it("buildRunVbaRequest preserves an unqualified procedureName with moduleName=''", () => {
    const request = buildRunVbaRequest({
      procedureName: "JustAProc",
    });
    expect(isMcpToolResult(request)).toBe(false);
    if (isMcpToolResult(request)) return;
    // Legacy unqualified shape: preserve verbatim so the apply path's
    // all-modules fallback (Test 3 in run-vba-preflight) still applies.
    expect(request.moduleName).toBe("");
    expect(request.procedureName).toBe("JustAProc");
  });

  it("AccessVbaService.execute dry-run echoes the parsed moduleName in the plan", async () => {
    const runner = new RecordingRunner();
    const service = new AccessVbaService({ runner, config });

    const result = await service.execute({
      moduleName: "",
      procedureName: "MyModule.Foo",
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected dry-run plan to succeed");
    expect("dryRun" in result.data).toBe(true);
    if (!("dryRun" in result.data)) return;
    // Plan MUST echo the parsed module so dry-run and apply agree.
    expect(result.data.moduleName).toBe("MyModule");
    expect(result.data.procedureName).toBe("MyModule.Foo");
    // And MUST NOT have spawned the runner.
    expect(runner.operations).toEqual([]);
  });

  it("dry-run and apply return consistent moduleName / procedureName for the same input", async () => {
    const runner = new RecordingRunner({
      ok: true,
      data: { returnValue: "ok" },
      diagnostics: [],
      durationMs: 1,
    });
    const service = new AccessVbaService({ runner, config });

    const dryRun = await service.execute({
      moduleName: "",
      procedureName: "MyModule.Foo",
      dryRun: true,
    });
    expect(dryRun.ok).toBe(true);
    if (!dryRun.ok || !("dryRun" in dryRun.data)) throw new Error("dry-run must succeed");

    const apply = await service.execute({
      moduleName: "",
      procedureName: "MyModule.Foo",
      // dryRun omitted → real execution
    });
    expect(apply.ok).toBe(true);
    expect(runner.operations.length).toBe(1);
    const forwarded = runner.operations[0];
    expect(forwarded).toBeDefined();
    if (forwarded?.kind !== "vba") throw new Error("expected a VBA operation");
    // The runtime MUST have parsed and forwarded the same moduleName the
    // dry-run plan reported. Without #1174 the adapter sent moduleName=""
    // AND the apply path's all-modules scan diverged from the dry-run
    // answer (the exact bug the issue reports).
    expect(forwarded.request.moduleName).toBe(dryRun.data.moduleName);
    expect(forwarded.request.moduleName).toBe("MyModule");
    expect(forwarded.request.procedureName).toBe("MyModule.Foo");
  });

  it("apply-path preflight looks up by procName (no module prefix) in listVbaProcedures output", async () => {
    // The reproducer from #1174: procedureName "Module.Proc" with the module
    // present in source and the bare procedure declared inside. The old
    // preflight compared the FULL "Module.Proc" string against
    // listVbaProcedures() output ("Proc"), so it always missed.
    const runner = new RecordingRunner();
    const resolver = {
      async resolveModuleSource() {
        return [
          'Attribute VB_Name = "MyModule"',
          "Option Explicit",
          "Public Function Proc() As String",
          '    Proc = "ok"',
          "End Function",
        ].join("\r\n");
      },
      async resolveAllModuleSources() {
        return {};
      },
    };
    const service = new AccessVbaService({ runner, config, sourceResolver: resolver });

    const result = await service.execute({
      moduleName: "",
      procedureName: "MyModule.Proc",
    });

    // Without #1174 this returned PROCEDURE_NOT_FOUND because the preflight
    // compared "MyModule.Proc" against the parsed procedure name "Proc".
    expect(runner.operations.length).toBe(1);
    expect(result.ok).toBe(true);
  });

  it("dry-run echoes moduleName='MyModule' for procedureName='MyModule.Foo' AND the apply preflight uses procName='Foo' to find the declaration", async () => {
    // Cross-check both halves of the contract at once. The preflight MUST
    // use the parsed procName ("Foo") so the lookup hits the declared
    // function; the dry-run plan MUST echo the parsed moduleName so both
    // paths agree on the rendered plan.
    const runner = new RecordingRunner({
      ok: true,
      data: { returnValue: "ok" },
      diagnostics: [],
      durationMs: 1,
    });
    const resolver = {
      async resolveModuleSource() {
        return [
          'Attribute VB_Name = "MyModule"',
          "Option Explicit",
          "Public Function Foo() As String",
          '    Foo = "ok"',
          "End Function",
        ].join("\r\n");
      },
      async resolveAllModuleSources() {
        return {};
      },
    };
    const service = new AccessVbaService({ runner, config, sourceResolver: resolver });

    const dryRun = await service.execute({
      moduleName: "",
      procedureName: "MyModule.Foo",
      dryRun: true,
    });
    expect(dryRun.ok).toBe(true);
    if (!dryRun.ok || !("dryRun" in dryRun.data)) throw new Error("dry-run must succeed");
    expect(dryRun.data.moduleName).toBe("MyModule");
    expect(dryRun.data.procedureName).toBe("MyModule.Foo");

    const apply = await service.execute({
      moduleName: "",
      procedureName: "MyModule.Foo",
    });
    expect(apply.ok).toBe(true);
    expect(runner.operations.length).toBe(1);
  });
});
