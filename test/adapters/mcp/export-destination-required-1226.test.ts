/**
 * Issue #1226 — `export_modules` / `export_all` must require explicit
 * destinationRoot (or explicit `allowConfiguredDestinationRoot:true`).
 *
 * Today `destinationRoot` is `required: false` in both schemas. The runtime
 * falls back to the configured value in `.dysflow/project.json`, which is a
 * silent "I'll write to your config's destination" — if the config is
 * stale or pointing at the wrong tree, the call overwrites the source
 * root without an explicit target declaration.
 *
 * Direction chosen (per issue body, recommendation 2): keep
 * `destinationRoot` optional at the schema layer, but add a NEW
 * `allowConfiguredDestinationRoot` opt-in flag that the caller must pass
 * explicitly when they want to use the configured default. Without that
 * flag (and without `destinationRoot` / `exportPath`), the dispatch seam
 * rejects with a NEW typed error code `DESTINATION_ROOT_REQUIRED`.
 *
 * These tests pin the contract at the dispatch seam (real
 * `createDysflowMcpTools` path) AND at the schema layer so a regression
 * in either side fails CI. They share the same `FakeVbaService` shape
 * the existing #785 export-source-guard suite uses.
 */
import { describe, expect, it } from "vitest";
import {
  DESTINATION_ROOT_REQUIRED,
  destinationRootRequired,
  EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION,
  exportSourceGuardRefused,
} from "../../../src/adapters/mcp/dispatch-common";
import type { McpAccessContextResolver } from "../../../src/adapters/mcp/result-translation";
import { VBA_SYNC_TOOL_SCHEMAS } from "../../../src/adapters/mcp/schemas/vba-sync-schemas";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools";
import { successResult } from "../../../src/core/contracts/index";

class FakeVbaService {
  public requests: Array<{ toolName: string; input: unknown }> = [];
  async execute(...args: unknown[]) {
    const toolName = typeof args[0] === "string" ? args[0] : "export_modules";
    const input = args.length > 1 ? args[1] : args[0];
    this.requests.push({ toolName, input });
    return successResult({ returnValue: "ok" });
  }
}

class FakeQueryService {
  async execute() {
    return successResult({ rows: [] });
  }
}
class FakeDiagnosticsService {
  async run() {
    return successResult({ checks: [] });
  }
}

function makeServices() {
  return {
    vbaService: new FakeVbaService(),
    queryService: new FakeQueryService(),
    diagnosticsService: new FakeDiagnosticsService(),
    vbaSyncToolService: new FakeVbaService(),
  };
}

function makeAccessContextResolver(
  accessPath: string,
  projectRoot: string,
  destinationRoot: string = projectRoot,
): McpAccessContextResolver {
  return async () => ({
    ok: true as const,
    data: { accessPath, projectRoot, destinationRoot },
    diagnostics: [],
    durationMs: 0,
  });
}

// ─── Envelope helper shape (#1226) ──────────────────────────────────────────

describe("destinationRootRequired — envelope shape (#1226)", () => {
  it("emits the structured envelope with code, message, toolName, missingFields, remediation", () => {
    const result = destinationRootRequired({
      toolName: "export_all",
      missingFields: ["destinationRoot", "allowConfiguredDestinationRoot"],
    });
    expect(result.isError).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe(DESTINATION_ROOT_REQUIRED);
    expect(result.error?.toolName).toBe("export_all");
    expect(result.error?.missingFields).toEqual([
      "destinationRoot",
      "allowConfiguredDestinationRoot",
    ]);
    expect(result.error?.remediation).toContain("destinationRoot");
    expect(result.error?.remediation).toContain("allowConfiguredDestinationRoot");
    expect(result.content[0]?.text).toContain(DESTINATION_ROOT_REQUIRED);
  });

  it("does not collide with the post-resolve EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION envelope", () => {
    const required = destinationRootRequired({
      toolName: "export_modules",
      missingFields: ["destinationRoot"],
    });
    const guard = exportSourceGuardRefused({
      toolName: "export_modules",
      destination: "C:/projets/dysflow",
      sourceRoot: "C:/projets/dysflow",
    });
    expect(required.error?.code).toBe(DESTINATION_ROOT_REQUIRED);
    expect(guard.error?.code).toBe(EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION);
    expect(required.error?.code).not.toBe(guard.error?.code);
  });
});

// ─── Schema layer (#1226) ────────────────────────────────────────────────────

describe("export_modules / export_all schema — allowConfiguredDestinationRoot opt-in (#1226)", () => {
  it("export_modules exposes the new flag with description pointing at the destinationRoot contract", () => {
    const schema = VBA_SYNC_TOOL_SCHEMAS.export_modules;
    expect(schema.properties.allowConfiguredDestinationRoot).toBeDefined();
    expect(schema.properties.allowConfiguredDestinationRoot?.type).toBe("boolean");
    expect(schema.properties.allowConfiguredDestinationRoot?.description ?? "").toContain(
      "destinationRoot",
    );
  });

  it("export_all exposes the new flag with description pointing at the destinationRoot contract", () => {
    const schema = VBA_SYNC_TOOL_SCHEMAS.export_all;
    expect(schema.properties.allowConfiguredDestinationRoot).toBeDefined();
    expect(schema.properties.allowConfiguredDestinationRoot?.type).toBe("boolean");
    expect(schema.properties.allowConfiguredDestinationRoot?.description ?? "").toContain(
      "destinationRoot",
    );
  });

  it("export_modules still accepts explicit destinationRoot (backward compat)", () => {
    const schema = VBA_SYNC_TOOL_SCHEMAS.export_modules;
    expect(schema.properties.destinationRoot).toBeDefined();
    expect(schema.properties.exportPath).toBeDefined();
  });

  it("export confirmation uses the unified fields", () => {
    const schema = VBA_SYNC_TOOL_SCHEMAS.export_all;
    expect(schema.properties.confirmOverwriteSource).toBeUndefined();
    expect(schema.properties.implements_check).toBeDefined();
    expect(schema.properties.confirmedRequiresConfirmation).toBeDefined();
  });
});

// ─── Dispatch seam — RED contract enforcement (#1226) ───────────────────────

describe("dispatch-factory — destinationRoot-required gate (#1226)", () => {
  const SCRATCH = "C:/Projets/dysflow";

  it("export_modules without destinationRoot/exportPath/allowConfiguredDestinationRoot → DESTINATION_ROOT_REQUIRED", async () => {
    const services = makeServices();
    const tools = createDysflowMcpTools({
      services,
      writes: true,
      writeExecutionPolicy: "developer",
    });
    const tool = tools.find((candidate) => candidate.name === "export_modules");
    if (!tool) throw new Error("export_modules not registered");

    // Intentionally call with moduleNames + apply; NO destinationRoot and
    // NO exportPath and NO allowConfiguredDestinationRoot opt-in.
    const result = await tool.handler({ moduleNames: ["Foo"], apply: true });

    expect(result.isError).toBe(true);
    expect(result.error?.code).toBe(DESTINATION_ROOT_REQUIRED);
    expect(result.error?.missingFields).toEqual(
      expect.arrayContaining(["destinationRoot", "allowConfiguredDestinationRoot"]),
    );
    // The runner must NOT have been engaged.
    expect(services.vbaSyncToolService.requests).toHaveLength(0);
  });

  it("export_all without destinationRoot/exportPath/allowConfiguredDestinationRoot → DESTINATION_ROOT_REQUIRED", async () => {
    const services = makeServices();
    const tools = createDysflowMcpTools({
      services,
      writes: true,
      writeExecutionPolicy: "developer",
    });
    const tool = tools.find((candidate) => candidate.name === "export_all");
    if (!tool) throw new Error("export_all not registered");

    const result = await tool.handler({ apply: true });

    expect(result.isError).toBe(true);
    expect(result.error?.code).toBe(DESTINATION_ROOT_REQUIRED);
    expect(services.vbaSyncToolService.requests).toHaveLength(0);
  });

  it("export_all with explicit destinationRoot executes the runner (no rejection)", async () => {
    const services = makeServices();
    // Pin the access-context resolver so the source root is fully
    // resolved before the post-resolve #785 guard reads it. Without
    // the resolver, the guard falls back to `input.destinationRoot` as
    // the source root and self-overlaps the destination — that path
    // is correctly covered by the dedicated overlap test below.
    const accessContextResolver = makeAccessContextResolver(
      "C:/Projets/dysflow-1226a/front.accdb",
      "C:/Projets/dysflow-1226a",
      "C:/Projets/dysflow-1226a",
    );
    const tools = createDysflowMcpTools({
      services,
      writes: true,
      writeExecutionPolicy: "developer",
      accessContextResolver,
    });
    const tool = tools.find((candidate) => candidate.name === "export_all");
    if (!tool) throw new Error("export_all not registered");

    // External destination (does NOT overlap the resolver's source root)
    // — both the new pre-resolve gate and the post-resolve #785 guard
    // stay silent.
    const result = await tool.handler({
      destinationRoot: "C:/elsewhere/scratch-1226",
      apply: true,
    });

    expect(result.isError).toBe(false);
    expect(result.error?.code).not.toBe(DESTINATION_ROOT_REQUIRED);
    expect(services.vbaSyncToolService.requests.length).toBeGreaterThanOrEqual(1);
  });

  it("export_all with destinationRoot matching the source root still fires the post-resolve #785 guard", async () => {
    const services = makeServices();
    const tools = createDysflowMcpTools({
      services,
      writes: true,
      writeExecutionPolicy: "developer",
    });
    const tool = tools.find((candidate) => candidate.name === "export_all");
    if (!tool) throw new Error("export_all not registered");

    // Caller declared the destination explicitly. The pre-resolve gate
    // accepts this; the post-resolve guard (#785) fires because the
    // destination overlaps the active source root and the caller did
    // NOT pass confirmOverwriteSource. The typed rejection from this
    // path must NOT be DESTINATION_ROOT_REQUIRED.
    const result = await tool.handler({
      destinationRoot: SCRATCH,
      apply: true,
    });

    expect(result.isError).toBe(true);
    expect(result.error?.code).toBe(EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION);
    expect(result.error?.code).not.toBe(DESTINATION_ROOT_REQUIRED);
    expect(services.vbaSyncToolService.requests).toHaveLength(0);
  });

  it("export_modules with allowConfiguredDestinationRoot:true (no explicit destination) executes the runner", async () => {
    const services = makeServices();
    const tools = createDysflowMcpTools({
      services,
      writes: true,
      writeExecutionPolicy: "developer",
    });
    const tool = tools.find((candidate) => candidate.name === "export_modules");
    if (!tool) throw new Error("export_modules not registered");

    // No destinationRoot. No exportPath. Caller opts in to the
    // configured destinationRoot.
    const result = await tool.handler({
      moduleNames: ["Foo"],
      allowConfiguredDestinationRoot: true,
      apply: true,
    });

    expect(result.isError).toBe(false);
    expect(result.error?.code).not.toBe(DESTINATION_ROOT_REQUIRED);
    expect(services.vbaSyncToolService.requests.length).toBeGreaterThanOrEqual(1);
  });

  it("export_modules with explicit exportPath (legacy alias) bypasses the new gate and reaches the runner", async () => {
    const services = makeServices();
    const tools = createDysflowMcpTools({
      services,
      writes: true,
      writeExecutionPolicy: "developer",
    });
    const tool = tools.find((candidate) => candidate.name === "export_modules");
    if (!tool) throw new Error("export_modules not registered");

    const result = await tool.handler({
      moduleNames: ["Foo"],
      exportPath: "C:/elsewhere/scratch-1226-via-exportpath",
      apply: true,
    });

    expect(result.isError).toBe(false);
    expect(result.error?.code).not.toBe(DESTINATION_ROOT_REQUIRED);
    expect(services.vbaSyncToolService.requests.length).toBeGreaterThanOrEqual(1);
  });
});
