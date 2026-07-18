import { describe, expect, it } from "vitest";
import {
  createDysflowMcpTools,
  MODERN_TOOL_NAMES,
} from "../../../src/adapters/mcp/tools.js";
import type { DysflowMcpServices } from "../../../src/adapters/mcp/tools";
import type {
  CleanStaleMarkersError,
  CleanStaleMarkersResult,
} from "../../../src/core/operations/stale-marker-cleanup.js";

/**
 * Round-12 (#976) — `dysflow.clean_stale_markers` tool.
 *
 * Companion to #967 (auto-cleanup on every operation start). This test file
 * pins the user-callable tool's contract:
 *
 *   - dryRun defaults to true (safe-by-default).
 *   - `olderThanMinutes` is forwarded to the core service.
 *   - `keepFailed` is forwarded to the core service.
 *   - `dryRun: false` without `confirm: true` is refused.
 *   - `MODERN_TOOL_NAMES` and the schema declaration are honest.
 *
 * The service seam (`cleanStaleMarkersService.run`) is the boundary under
 * test. The handler delegates everything else to it; this file does NOT
 * re-test the core sweep algorithm (that lives in
 * `test/core/operations/stale-marker-cleanup.test.ts` for #967 and a
 * sibling file for the #976 wrapper).
 */

class FakeCleanStaleMarkersService {
  public readonly calls: Array<{
    markersRoot: string;
    olderThanMs: number;
    keepFailed: boolean;
    dryRun: boolean;
    nowMs?: number;
  }> = [];
  constructor(private readonly next: CleanStaleMarkersResult) {}

  async run(request: {
    markersRoot: string;
    olderThanMs: number;
    keepFailed: boolean;
    dryRun: boolean;
    nowMs?: number;
  }): Promise<CleanStaleMarkersResult> {
    this.calls.push(request);
    return this.next;
  }
}

function makeBaseServices() {
  return {
    vbaService: { execute: async () => ({ ok: true as const, data: { returnValue: "ok" } }) },
    queryService: { execute: async () => ({ ok: true as const, data: { rows: [] } }) },
    diagnosticsService: { run: async () => ({ ok: true as const, data: { checks: [] } }) },
  };
}

function makeServices(fake: FakeCleanStaleMarkersService): DysflowMcpServices {
  return {
    ...makeBaseServices(),
    cleanStaleMarkersService: fake,
  } as unknown as DysflowMcpServices;
}

const TOOL = "clean_stale_markers";

describe("dysflow.clean_stale_markers (Round-12 #976)", () => {
  it("is registered with the modern tool name and a typed input schema", () => {
    const fake = new FakeCleanStaleMarkersService({
      ok: true,
      scanned: 0,
      removed: 0,
      kept: 0,
      removedMarkerIds: [],
      keptMarkerIds: [],
      errors: [],
    });
    const tools = createDysflowMcpTools({
      services: makeServices(fake),
      writes: true,
      accessContextResolver: async () => ({
        ok: true,
        data: { accessPath: "C:/proj/app.accdb", projectRoot: "C:/proj" },
      }),
    });

    const tool = tools.find((t) => t.name === TOOL);
    expect(tool).toBeDefined();
    expect(tool?.inputSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      properties: {
        projectId: { type: "string" },
        options: {
          type: "object",
          additionalProperties: false,
          properties: {
            olderThanMinutes: { type: "number", minimum: 1 },
            dryRun: { type: "boolean" },
            keepFailed: { type: "boolean" },
            confirm: { type: "boolean" },
          },
        },
      },
    });
  });

  it("MODERN_TOOL_NAMES advertises clean_stale_markers", () => {
    expect(MODERN_TOOL_NAMES).toContain(TOOL);
  });

  it("dry-run (default) does NOT mutate and forwards the default thresholds to the service", async () => {
    // 3 stale running + 1 fresh running; service reports no removals.
    const fake = new FakeCleanStaleMarkersService({
      ok: true,
      scanned: 4,
      removed: 0,
      kept: 4,
      removedMarkerIds: [],
      keptMarkerIds: ["op-stale-1.json", "op-stale-2.json", "op-stale-3.json", "op-fresh.json"],
      errors: [],
    });
    const tools = createDysflowMcpTools({
      services: makeServices(fake),
      writes: true,
      accessContextResolver: async () => ({
        ok: true,
        data: { accessPath: "C:/proj/app.accdb", projectRoot: "C:/proj" },
      }),
    });
    const tool = tools.find((t) => t.name === TOOL);

    // Caller passes NEITHER dryRun nor confirm — defaults must apply:
    //   dryRun → true, keepFailed → true, olderThanMinutes → 30, no confirm needed.
    const result = await tool?.handler({ projectId: "proj-main" });

    expect(result?.isError).toBe(false);
    expect(fake.calls).toEqual([
      {
        markersRoot: "C:/proj/.dysflow/runtime/markers",
        olderThanMs: 30 * 60 * 1000,
        keepFailed: true,
        dryRun: true,
      },
    ]);
    const payload = JSON.parse(result?.content[0]?.text ?? "{}") as CleanStaleMarkersResult;
    expect(payload.removed).toBe(0);
    expect(payload.kept).toBe(4);
    expect(payload.scanned).toBe(4);
  });

  it("apply with dryRun:false + confirm:true removes only stale running markers", async () => {
    // 3 stale running + 1 fresh running + 1 failed. After apply: 3 removed, 2 kept.
    const fake = new FakeCleanStaleMarkersService({
      ok: true,
      scanned: 5,
      removed: 3,
      kept: 2,
      removedMarkerIds: ["op-stale-1.json", "op-stale-2.json", "op-stale-3.json"],
      keptMarkerIds: ["op-fresh.json", "op-failed.json"],
      errors: [],
    });
    const tools = createDysflowMcpTools({
      services: makeServices(fake),
      writes: true,
      accessContextResolver: async () => ({
        ok: true,
        data: { accessPath: "C:/proj/app.accdb", projectRoot: "C:/proj" },
      }),
    });
    const tool = tools.find((t) => t.name === TOOL);

    const result = await tool?.handler({
      projectId: "proj-main",
      options: { olderThanMinutes: 30, dryRun: false, confirm: true, keepFailed: true },
    });

    expect(result?.isError).toBe(false);
    expect(fake.calls).toEqual([
      {
        markersRoot: "C:/proj/.dysflow/runtime/markers",
        olderThanMs: 30 * 60 * 1000,
        keepFailed: true,
        dryRun: false,
      },
    ]);
    const payload = JSON.parse(result?.content[0]?.text ?? "{}") as CleanStaleMarkersResult;
    expect(payload.removed).toBe(3);
    expect(payload.kept).toBe(2);
    expect(payload.removedMarkerIds).toEqual([
      "op-stale-1.json",
      "op-stale-2.json",
      "op-stale-3.json",
    ]);
    expect(payload.keptMarkerIds).toEqual(["op-fresh.json", "op-failed.json"]);
  });

  it("olderThanMinutes + keepFailed overrides are forwarded verbatim to the service", async () => {
    const fake = new FakeCleanStaleMarkersService({
      ok: true,
      scanned: 0,
      removed: 0,
      kept: 0,
      removedMarkerIds: [],
      keptMarkerIds: [],
      errors: [],
    });
    const tools = createDysflowMcpTools({
      services: makeServices(fake),
      writes: true,
      accessContextResolver: async () => ({
        ok: true,
        data: { accessPath: "C:/proj/app.accdb", projectRoot: "C:/proj" },
      }),
    });
    const tool = tools.find((t) => t.name === TOOL);

    await tool?.handler({
      projectId: "proj-main",
      options: { olderThanMinutes: 60, keepFailed: false, dryRun: true },
    });

    expect(fake.calls).toEqual([
      {
        markersRoot: "C:/proj/.dysflow/runtime/markers",
        olderThanMs: 60 * 60 * 1000,
        keepFailed: false,
        dryRun: true,
      },
    ]);
  });

  it("dryRun:false without confirm:true returns MCP_INPUT_INVALID and never calls the service", async () => {
    const fake = new FakeCleanStaleMarkersService({
      ok: true,
      scanned: 0,
      removed: 0,
      kept: 0,
      removedMarkerIds: [],
      keptMarkerIds: [],
      errors: [],
    });
    const tools = createDysflowMcpTools({
      services: makeServices(fake),
      writes: true,
      accessContextResolver: async () => ({
        ok: true,
        data: { accessPath: "C:/proj/app.accdb", projectRoot: "C:/proj" },
      }),
    });
    const tool = tools.find((t) => t.name === TOOL);

    const result = await tool?.handler({
      projectId: "proj-main",
      options: { dryRun: false },
    });

    expect(result?.isError).toBe(true);
    expect(result?.content[0]?.text).toContain("MCP_INPUT_INVALID");
    expect(result?.content[0]?.text).toContain("confirm");
    expect(fake.calls).toEqual([]);

    // confirm:false is also rejected (only literal `true` unblocks the gate).
    const resultFalse = await tool?.handler({
      projectId: "proj-main",
      options: { dryRun: false, confirm: false },
    });
    expect(resultFalse?.isError).toBe(true);
    expect(resultFalse?.content[0]?.text).toContain("MCP_INPUT_INVALID");
    expect(fake.calls).toEqual([]);
  });

  it("returns CLEAN_STALE_MARKERS_NOT_CONFIGURED when no service is wired (defensive surface)", async () => {
    const tools = createDysflowMcpTools({
      services: makeBaseServices() as DysflowMcpServices,
      writes: true,
      accessContextResolver: async () => ({
        ok: true,
        data: { accessPath: "C:/proj/app.accdb", projectRoot: "C:/proj" },
      }),
    });
    const tool = tools.find((t) => t.name === TOOL);

    const result = await tool?.handler({ projectId: "proj-main" });

    expect(result?.isError).toBe(true);
    expect(result?.content[0]?.text).toContain("CLEAN_STALE_MARKERS_NOT_CONFIGURED");
  });

  it("propagates service-layer error[] as structured errors[] in the response payload", async () => {
    // Setup: dry-run hits one corrupt marker — service reports ok:true with
    // a non-empty errors[] (the sweep never aborts on a single bad file).
    const fake = new FakeCleanStaleMarkersService({
      ok: true,
      scanned: 2,
      removed: 0,
      kept: 1,
      removedMarkerIds: [],
      keptMarkerIds: ["op-ok.json"],
      errors: [{ markerId: "op-corrupt.json", error: "JSON.parse failed: unexpected token" }],
    });
    const tools = createDysflowMcpTools({
      services: makeServices(fake),
      writes: true,
      accessContextResolver: async () => ({
        ok: true,
        data: { accessPath: "C:/proj/app.accdb", projectRoot: "C:/proj" },
      }),
    });
    const tool = tools.find((t) => t.name === TOOL);

    const result = await tool?.handler({ projectId: "proj-main" });

    expect(result?.isError).toBe(false);
    const payload = JSON.parse(result?.content[0]?.text ?? "{}") as CleanStaleMarkersResult;
    expect(payload.errors).toHaveLength(1);
    const firstError = payload.errors[0] as CleanStaleMarkersError;
    expect(firstError.markerId).toBe("op-corrupt.json");
    expect(firstError.error).toContain("JSON.parse failed");
  });
});