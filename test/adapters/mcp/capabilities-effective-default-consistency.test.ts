/**
 * Issue #785 (v2.1.1) — capabilities consistency contract.
 *
 * The `get_capabilities` snapshot reports `effectiveDryRunDefault[t]` per
 * tool — the value consumers should see the runtime apply. This pin
 * asserts the contract holds: for a sample of contract tools, the
 * capabilities default agrees with what `resolveEffectiveDryRunInput`
 * computes (the helper that the dispatch seam forwards to the adapter).
 *
 * If this test fails, the snapshot and the runtime disagree — which
 * means consumers reading `get_capabilities.effectiveDryRunDefault`
 * would plan around an incorrect default and the dispatch would
 * execute differently than the snapshot advertised.
 */

import { describe, expect, it } from "vitest";
import { createGetCapabilitiesTool } from "../../../src/adapters/mcp/get-capabilities-tool";
import { effectiveDryRunDefaultForTool } from "../../../src/adapters/mcp/mcp-tool-risks.js";
import { resolveEffectiveDryRunInput } from "../../../src/adapters/mcp/write-execution-dispatch.js";

describe("get_capabilities — effectiveDryRunDefault agrees with dispatch seam (#785, capa 5)", () => {
  // Pick a representative tool from each risk class so a regression in
  // any one risk surfaces here. Full table pinning lives in
  // mcp-tool-risks.test.ts — these samples keep the snapshot-to-runtime
  // chain honest without duplicating the full table.
  const samples: Array<{ tool: string; risk: string }> = [
    { tool: "import_modules", risk: "routine-dev-write" },
    { tool: "import_all", risk: "routine-dev-write" },
    { tool: "test_vba", risk: "routine-dev-write" },
    { tool: "export_modules", risk: "destructive-write" },
    { tool: "delete_module", risk: "destructive-write" },
    { tool: "fix_encoding", risk: "protected-write" },
    { tool: "query_execute", risk: "arbitrary-write" },
    { tool: "doctor", risk: "read-only" },
    { tool: "list_objects", risk: "read-only" },
  ];

  for (const { tool } of samples) {
    it(`${tool} — capabilities snapshot agrees with resolveEffectiveDryRunInput`, () => {
      const tool$ = createGetCapabilitiesTool({
        writesEnabled: true,
        writeAccessResolver: undefined,
        allowedProcedures: ["Test_A"],
        projectId: "test-785",
        allowWrites: true,
        accessDbPath: "C:/project/front.accdb",
        writeExecutionPolicy: "developer",
      });
      // Invoke the tool — it does not need an actual handler call; we
      // read the snapshot it would return.
      const handler = tool$.handler as unknown as (
        input: Record<string, unknown>,
      ) => Promise<{ content: Array<{ text: string }> }>;
      return handler({}).then((result) => {
        const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
          writeExecutionPolicy: string;
          effectiveDryRunDefault: Record<string, boolean>;
        };
        const advertised = payload.effectiveDryRunDefault[tool];
        const helperDefault = effectiveDryRunDefaultForTool(
          tool as Parameters<typeof effectiveDryRunDefaultForTool>[0],
          "developer",
        );

        // Both should agree.
        expect(advertised).toBe(helperDefault);

        // Helper should also agree with the dispatcher-seam injection
        // (no caller intent → helper returns input with dryRun default).
        const normalized = resolveEffectiveDryRunInput(tool, "developer", {
          moduleNames: ["Foo"],
        });
        const expectRecord = { moduleNames: ["Foo"], dryRun: helperDefault };
        expect(normalized).toEqual(expectRecord);

        // Pin the policy verbatim so a regression here surfaces.
        expect(payload.writeExecutionPolicy).toBe("developer");
      });
    });
  }

  it("safe-by-default + same tool set → defaults flip uniformly", () => {
    const tool$ = createGetCapabilitiesTool({
      writesEnabled: true,
      writeAccessResolver: undefined,
      allowedProcedures: ["Test_A"],
      projectId: "test-785",
      allowWrites: true,
      accessDbPath: "C:/project/front.accdb",
      writeExecutionPolicy: "safe-by-default",
    });
    const handler = tool$.handler as unknown as (
      input: Record<string, unknown>,
    ) => Promise<{ content: Array<{ text: string }> }>;
    return handler({}).then((result) => {
      const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
        effectiveDryRunDefault: Record<string, boolean>;
      };
      for (const tool of samples) {
        const advertised = payload.effectiveDryRunDefault[tool.tool];
        const helperDefault = effectiveDryRunDefaultForTool(
          tool.tool as Parameters<typeof effectiveDryRunDefaultForTool>[0],
          "safe-by-default",
        );
        expect(advertised).toBe(helperDefault);
        expect(advertised).toBe(true); // safe-by-default is always true.
      }
    });
  });

  it("developer + routine-dev-write tools flip to false", () => {
    const tool$ = createGetCapabilitiesTool({
      writesEnabled: true,
      writeAccessResolver: undefined,
      allowedProcedures: ["Test_A"],
      projectId: "test-785",
      allowWrites: true,
      accessDbPath: "C:/project/front.accdb",
      writeExecutionPolicy: "developer",
    });
    const handler = tool$.handler as unknown as (
      input: Record<string, unknown>,
    ) => Promise<{ content: Array<{ text: string }> }>;
    return handler({}).then((result) => {
      const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
        effectiveDryRunDefault: Record<string, boolean>;
      };
      expect(payload.effectiveDryRunDefault.import_modules).toBe(false);
      expect(payload.effectiveDryRunDefault.import_all).toBe(false);
      expect(payload.effectiveDryRunDefault.test_vba).toBe(false);
    });
  });

  it("developer + destructive / protected / arbitrary tools stay at true", () => {
    const tool$ = createGetCapabilitiesTool({
      writesEnabled: true,
      writeAccessResolver: undefined,
      allowedProcedures: ["Test_A"],
      projectId: "test-785",
      allowWrites: true,
      accessDbPath: "C:/project/front.accdb",
      writeExecutionPolicy: "developer",
    });
    const handler = tool$.handler as unknown as (
      input: Record<string, unknown>,
    ) => Promise<{ content: Array<{ text: string }> }>;
    return handler({}).then((result) => {
      const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
        effectiveDryRunDefault: Record<string, boolean>;
      };
      // Destructive / protected / arbitrary stay at dryRun:true even
      // in developer mode — the operator must explicitly opt-in via
      // `dryRun: false` or `apply: true`.
      expect(payload.effectiveDryRunDefault.export_modules).toBe(true);
      expect(payload.effectiveDryRunDefault.delete_module).toBe(true);
      expect(payload.effectiveDryRunDefault.fix_encoding).toBe(true);
      expect(payload.effectiveDryRunDefault.query_execute).toBe(true);
    });
  });
});
