import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type VbaManagerExecutionRequest,
  VbaSyncAdapter,
} from "../../../src/adapters/vba-sync/vba-sync-adapter";
import { noopPreflightCleanup } from "../../_helpers/noop-preflight-cleanup.js";

/**
 * #1823 — `test_vba` must hand `Access.Application.Run` a name it can resolve,
 * through the same resolution #1787/#1788 gave `run_vba`, and must not answer
 * an unresolvable name with a recompile that cannot help.
 *
 * The port under test is the VBA-manager executor: the only seam where the
 * procedure name leaves dysflow for Access. The executor is faked; the source
 * tree is a real temporary directory, because the resolution decision is
 * driven by what the project's source declares.
 */

type Captured = { procedures: Array<{ procedure: string; args: unknown[] }> };

const NOT_FOUND_ES = (name: string) =>
  `Excepción al llamar a "Run" con los argumentos "1": "No Conformidades no encuentra el procedimiento '${name}'."`;

async function sourceTree(modules: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "dysflow-1823-"));
  await mkdir(join(root, "modules"), { recursive: true });
  for (const [name, body] of Object.entries(modules)) {
    await writeFile(join(root, "modules", `${name}.bas`), body, "utf8");
  }
  return root;
}

function moduleDeclaring(moduleName: string, ...procedures: string[]): string {
  return [
    `Attribute VB_Name = "${moduleName}"`,
    "Option Compare Database",
    "Option Explicit",
    ...procedures.flatMap((proc) => [
      `Public Function ${proc}() As String`,
      `    ${proc} = "{""ok"":true}"`,
      "End Function",
    ]),
  ].join("\r\n");
}

function adapterFor(
  destinationRoot: string,
  runnerTests: (procedures: Captured["procedures"]) => unknown[],
): { adapter: VbaSyncAdapter; captured: Captured } {
  const captured: Captured = { procedures: [] };
  const adapter = new VbaSyncAdapter({
    accessPath: join(destinationRoot, "front.accdb"),
    destinationRoot,
    preflightCleanup: noopPreflightCleanup(),
    env: {},
    executor: async (request: VbaManagerExecutionRequest) => {
      const json = request.extra.proceduresJson;
      captured.procedures = typeof json === "string" ? JSON.parse(json) : [];
      return {
        exitCode: 0,
        stdout: `DYSFLOW_RESULT ${JSON.stringify({ tests: runnerTests(captured.procedures) })}`,
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    },
  });
  return { adapter, captured };
}

const passing = (procedures: Captured["procedures"]) =>
  procedures.map((entry) => ({ ok: true, procedure: entry.procedure, logs: [], error: null }));

const notFound = (procedures: Captured["procedures"]) =>
  procedures.map((entry) => ({
    ok: false,
    procedure: entry.procedure,
    logs: [],
    error: NOT_FOUND_ES(entry.procedure),
  }));

type FailureCause = { code: string; retryable: boolean; remediation: string };
type Failure = { procedure?: string; invokedProcedureName?: string; cause?: FailureCause };

function firstFailure(result: Awaited<ReturnType<VbaSyncAdapter["execute"]>>): Failure {
  if (result.ok) throw new Error("expected test_vba to fail");
  const details = result.error.details as { failures?: Failure[] } | undefined;
  const failure = details?.failures?.[0];
  if (failure === undefined) throw new Error("expected error.details.failures[0]");
  return failure;
}

describe("test_vba procedure invocation — #1823", () => {
  it("drops a qualifier that names a module of this project before the name reaches Access", async () => {
    const root = await sourceTree({ Test_Suite: moduleDeclaring("Test_Suite", "Test_Alpha") });
    const { adapter, captured } = adapterFor(root, passing);

    const result = await adapter.execute("test_vba", {
      proceduresJson: JSON.stringify(["Test_Suite.Test_Alpha"]),
      apply: true,
    });

    expect(result.ok).toBe(true);
    expect(captured.procedures.map((entry) => entry.procedure)).toEqual(["Test_Alpha"]);
  });

  it("forwards a qualifier that is not a module of this project verbatim (referenced database form)", async () => {
    const root = await sourceTree({ Test_Suite: moduleDeclaring("Test_Suite", "Test_Alpha") });
    const { adapter, captured } = adapterFor(root, passing);

    const result = await adapter.execute("test_vba", {
      proceduresJson: JSON.stringify(["SharedLib.Test_Alpha", "Test_Alpha"]),
      apply: true,
    });

    expect(result.ok).toBe(true);
    expect(captured.procedures.map((entry) => entry.procedure)).toEqual([
      "SharedLib.Test_Alpha",
      "Test_Alpha",
    ]);
  });

  it("forwards every name verbatim when the project has no source tree to verify against", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-1823-empty-"));
    const { adapter, captured } = adapterFor(root, passing);

    const result = await adapter.execute("test_vba", {
      proceduresJson: JSON.stringify(["Test_Suite.Test_Alpha"]),
      apply: true,
    });

    expect(result.ok).toBe(true);
    expect(captured.procedures.map((entry) => entry.procedure)).toEqual(["Test_Suite.Test_Alpha"]);
  });

  it("keeps the caller's name on a failure and reports the name that reached Access alongside it", async () => {
    const root = await sourceTree({ Test_Suite: moduleDeclaring("Test_Suite", "Test_Alpha") });
    const { adapter } = adapterFor(root, notFound);

    const failure = firstFailure(
      await adapter.execute("test_vba", {
        proceduresJson: JSON.stringify(["Test_Suite.Test_Alpha"]),
        apply: true,
      }),
    );

    expect(failure.procedure).toBe("Test_Suite.Test_Alpha");
    expect(failure.invokedProcedureName).toBe("Test_Alpha");
  });

  it("names the module/procedure name collision instead of asking for a recompile (the reported case)", async () => {
    const root = await sourceTree({
      Test_Backfill_Preview_Atomic: moduleDeclaring(
        "Test_Backfill_Preview_Atomic",
        "Test_Backfill_Preview_Atomic",
      ),
    });
    const { adapter, captured } = adapterFor(root, notFound);

    const result = await adapter.execute("test_vba", {
      proceduresJson: JSON.stringify([{ procedure: "Test_Backfill_Preview_Atomic", args: [] }]),
      apply: true,
    });

    expect(captured.procedures.map((entry) => entry.procedure)).toEqual([
      "Test_Backfill_Preview_Atomic",
    ]);
    const failure = firstFailure(result);
    expect(failure.cause?.code).toBe("PROCEDURE_NOT_CALLABLE");
    expect(failure.cause?.retryable).toBe(false);
    expect(failure.cause?.remediation).not.toMatch(/recompile/i);
    expect(failure.cause?.remediation).toMatch(/rename/i);
    expect(failure.cause?.remediation).toContain("Test_Backfill_Preview_Atomic");
  });

  it("names an unverifiable qualifier as the suspect instead of only asking for a recompile", async () => {
    const root = await sourceTree({ Test_Suite: moduleDeclaring("Test_Suite", "Test_Alpha") });
    const { adapter } = adapterFor(root, notFound);

    const failure = firstFailure(
      await adapter.execute("test_vba", {
        proceduresJson: JSON.stringify(["SharedLib.Test_Alpha"]),
        apply: true,
      }),
    );

    expect(failure.cause?.code).toBe("PROCEDURE_NOT_CALLABLE");
    expect(failure.cause?.remediation).toContain("'SharedLib'");
    expect(failure.cause?.remediation).toContain("referenced database");
  });

  it("keeps the stale p-code remediation for a plain name whose module does not share its name", async () => {
    const root = await sourceTree({ Test_Suite: moduleDeclaring("Test_Suite", "Test_Alpha") });
    const { adapter } = adapterFor(root, notFound);

    const failure = firstFailure(
      await adapter.execute("test_vba", {
        proceduresJson: JSON.stringify(["Test_Alpha"]),
        apply: true,
      }),
    );

    expect(failure.procedure).toBe("Test_Alpha");
    expect(failure.invokedProcedureName).toBeUndefined();
    expect(failure.cause).toEqual({
      code: "PROCEDURE_NOT_CALLABLE",
      retryable: true,
      remediation: "Recompile in Access VBE (Debug → Compile) and retry.",
    });
  });

  it("keeps the dry-run plan echoing the caller's original names", async () => {
    const root = await sourceTree({ Test_Suite: moduleDeclaring("Test_Suite", "Test_Alpha") });
    const { adapter, captured } = adapterFor(root, passing);

    const result = await adapter.execute("test_vba", {
      proceduresJson: JSON.stringify(["Test_Suite.Test_Alpha"]),
      apply: false,
    });

    expect(result.ok).toBe(true);
    expect(
      (result as { data: { plan: { procedureName: string[] } } }).data.plan.procedureName,
    ).toEqual(["Test_Suite.Test_Alpha"]);
    expect(captured.procedures).toEqual([]);
  });
});
