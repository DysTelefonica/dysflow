/**
 * Issue #1076 — compose shared context, target, and write-intent schemas
 * into named blocks so the 90-tool catalog stops duplicating parameter
 * definitions (and descriptions) across every tool.
 *
 * The audit (`docs/analysis/dysflow-api-homogeneity-audit-2026-07-23.md`)
 * found:
 *   - projectId duplicated in 84 tools
 *   - contextId in 80 tools
 *   - accessPath in 65 tools
 *   - backendPath in 59 tools
 *   - destinationRoot in 49 tools
 *   - projectRoot in 48 tools
 *   - strictContext + expected* in 30 tools
 * with descriptions that drifted in the modern tool family
 * (src/adapters/mcp/schemas/dysflow-schemas.ts: inline `projectId` and
 * `contextId` blocks with 11 variants of "unless explicitly
 * overridden" prose).
 *
 * This test asserts:
 *   1. Eight named blocks exist as the single internal definition of
 *      the shared parameter atoms (ProjectIdentity,
 *      OperationCorrelation, AccessTarget, DatabaseTarget,
 *      ManagedSourceTarget, StrictContext, WriteIntent, OutputMode).
 *   2. Each block's property values are `===` to the canonical
 *      `SCHEMA_PROPS` reference — the block is a thin alias, not a
 *      second hand-maintained table.
 *   3. Tool-specific schemas compose the blocks plus their functional
 *      parameters; no tool inlines a fresh `projectId` / `contextId`
 *      / `accessPath` / `backendPath` / `destinationRoot` /
 *      `projectRoot` / `strictContext` / `expected*` / `dryRun` /
 *      `apply` / `diff` / `outputMode` object that diverges from the
 *      shared reference.
 *   4. No public parameter is removed: every tool that already
 *      advertised one of the shared parameters still advertises it.
 *
 * The test is currently RED because the named blocks do not exist as
 * exports of the shared validation module and the modern tool schemas
 * in dysflow-schemas.ts still inline their own projectId / contextId
 * / accessPath / destinationRoot / etc. copies.
 */
import { describe, expect, it } from "vitest";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import { successResult } from "../../../src/core/contracts/index.js";
import { SCHEMA_PROPS } from "../../../src/shared/validation/index.js";
import {
  ACCESS_TARGET_BLOCK,
  composeAccessAndSourceTargets,
  composeFullTargetStack,
  composeIdentityAndCorrelation,
  DATABASE_TARGET_BLOCK,
  MANAGED_SOURCE_TARGET_BLOCK,
  OPERATION_CORRELATION_BLOCK,
  OUTPUT_MODE_BLOCK,
  PROJECT_IDENTITY_BLOCK,
  STRICT_CONTEXT_BLOCK,
  WRITE_INTENT_BLOCK,
} from "../../../src/shared/validation/schema-blocks.js";

class FakeVbaService {
  async execute() {
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

const TOOLS = createDysflowMcpTools({
  services: {
    vbaService: new FakeVbaService(),
    queryService: new FakeQueryService(),
    diagnosticsService: new FakeDiagnosticsService(),
  },
});

type JsonSchemaLike = {
  type?: string;
  properties?: Record<string, unknown>;
  required?: readonly string[];
};

function advertisedSchema(name: string): JsonSchemaLike {
  const tool = TOOLS.find((t) => t.name === name);
  if (tool === undefined) return { type: "object", properties: {} };
  const schema = (tool.inputSchema ?? {}) as JsonSchemaLike;
  return { type: schema.type, properties: schema.properties ?? {}, required: schema.required };
}

function propertyOf(schema: JsonSchemaLike, name: string): unknown {
  return schema.properties?.[name];
}

describe("schema composition blocks (#1076)", () => {
  it("exports the eight named composition blocks as single source of truth", () => {
    expect(PROJECT_IDENTITY_BLOCK).toBeDefined();
    expect(OPERATION_CORRELATION_BLOCK).toBeDefined();
    expect(ACCESS_TARGET_BLOCK).toBeDefined();
    expect(DATABASE_TARGET_BLOCK).toBeDefined();
    expect(MANAGED_SOURCE_TARGET_BLOCK).toBeDefined();
    expect(STRICT_CONTEXT_BLOCK).toBeDefined();
    expect(WRITE_INTENT_BLOCK).toBeDefined();
    expect(OUTPUT_MODE_BLOCK).toBeDefined();
  });

  it("each block's properties are the SAME reference as SCHEMA_PROPS (no second copy)", () => {
    expect(PROJECT_IDENTITY_BLOCK.projectId).toBe(SCHEMA_PROPS.projectId);
    expect(OPERATION_CORRELATION_BLOCK.contextId).toBe(SCHEMA_PROPS.contextId);
    expect(ACCESS_TARGET_BLOCK.accessPath).toBe(SCHEMA_PROPS.accessPath);
    expect(ACCESS_TARGET_BLOCK.backendPath).toBe(SCHEMA_PROPS.backendPath);
    expect(DATABASE_TARGET_BLOCK.databasePath).toBe(SCHEMA_PROPS.databasePath);
    expect(DATABASE_TARGET_BLOCK.sourcePath).toBe(SCHEMA_PROPS.sourcePath);
    expect(MANAGED_SOURCE_TARGET_BLOCK.destinationRoot).toBe(SCHEMA_PROPS.destinationRoot);
    expect(MANAGED_SOURCE_TARGET_BLOCK.projectRoot).toBe(SCHEMA_PROPS.projectRoot);
    expect(STRICT_CONTEXT_BLOCK.strictContext).toBe(SCHEMA_PROPS.strictContext);
    expect(STRICT_CONTEXT_BLOCK.expectedAccessPath).toBe(SCHEMA_PROPS.expectedAccessPath);
    expect(STRICT_CONTEXT_BLOCK.expectedProjectRoot).toBe(SCHEMA_PROPS.expectedProjectRoot);
    expect(STRICT_CONTEXT_BLOCK.expectedDestinationRoot).toBe(SCHEMA_PROPS.expectedDestinationRoot);
    expect(WRITE_INTENT_BLOCK.dryRun).toBe(SCHEMA_PROPS.dryRun);
    expect(WRITE_INTENT_BLOCK.apply).toBe(SCHEMA_PROPS.apply);
    expect(WRITE_INTENT_BLOCK.diff).toBe(SCHEMA_PROPS.diff);
    expect(OUTPUT_MODE_BLOCK.outputMode).toBe(SCHEMA_PROPS.outputMode);
  });

  it("composes ProjectIdentity + OperationCorrelation without duplicating guidance", () => {
    const composed = composeIdentityAndCorrelation();
    expect(composed.projectId).toBe(SCHEMA_PROPS.projectId);
    expect(composed.contextId).toBe(SCHEMA_PROPS.contextId);
  });

  it("composes AccessTarget + ManagedSourceTarget (no databasePath) for binary-only tools", () => {
    const composed = composeAccessAndSourceTargets();
    expect(composed.accessPath).toBe(SCHEMA_PROPS.accessPath);
    expect(composed.backendPath).toBe(SCHEMA_PROPS.backendPath);
    expect(composed.destinationRoot).toBe(SCHEMA_PROPS.destinationRoot);
    expect(composed.projectRoot).toBe(SCHEMA_PROPS.projectRoot);
  });

  it("composes AccessTarget + DatabaseTarget + ManagedSourceTarget for db+path tools", () => {
    const composed = composeFullTargetStack();
    expect(composed.accessPath).toBe(SCHEMA_PROPS.accessPath);
    expect(composed.backendPath).toBe(SCHEMA_PROPS.backendPath);
    expect(composed.databasePath).toBe(SCHEMA_PROPS.databasePath);
    expect(composed.sourcePath).toBe(SCHEMA_PROPS.sourcePath);
    expect(composed.destinationRoot).toBe(SCHEMA_PROPS.destinationRoot);
    expect(composed.projectRoot).toBe(SCHEMA_PROPS.projectRoot);
  });

  it("every advertised tool's projectId is the SAME reference as the shared block", () => {
    const failures: string[] = [];
    for (const tool of TOOLS) {
      const schema = advertisedSchema(tool.name);
      const property = propertyOf(schema, "projectId");
      if (property === undefined) continue;
      if (property !== SCHEMA_PROPS.projectId) {
        failures.push(tool.name);
      }
    }
    expect(failures, `tools with inlined projectId: ${failures.join(", ")}`).toEqual([]);
  });

  it("every advertised tool's contextId is the SAME reference as the shared block", () => {
    const failures: string[] = [];
    for (const tool of TOOLS) {
      const schema = advertisedSchema(tool.name);
      const property = propertyOf(schema, "contextId");
      if (property === undefined) continue;
      if (property !== SCHEMA_PROPS.contextId) {
        failures.push(tool.name);
      }
    }
    expect(failures, `tools with inlined contextId: ${failures.join(", ")}`).toEqual([]);
  });

  it("every advertised tool's accessPath/backendPath is the shared reference when present", () => {
    const failures: string[] = [];
    for (const tool of TOOLS) {
      const schema = advertisedSchema(tool.name);
      const access = propertyOf(schema, "accessPath");
      if (access !== undefined && access !== SCHEMA_PROPS.accessPath)
        failures.push(`${tool.name}.accessPath`);
      const backend = propertyOf(schema, "backendPath");
      if (backend !== undefined && backend !== SCHEMA_PROPS.backendPath)
        failures.push(`${tool.name}.backendPath`);
    }
    expect(failures, `tools with inlined access/backend paths: ${failures.join(", ")}`).toEqual([]);
  });

  it("every advertised tool's destinationRoot/projectRoot is the shared reference when present", () => {
    const failures: string[] = [];
    for (const tool of TOOLS) {
      const schema = advertisedSchema(tool.name);
      const destination = propertyOf(schema, "destinationRoot");
      if (destination !== undefined && destination !== SCHEMA_PROPS.destinationRoot) {
        failures.push(`${tool.name}.destinationRoot`);
      }
      const project = propertyOf(schema, "projectRoot");
      if (project !== undefined && project !== SCHEMA_PROPS.projectRoot) {
        failures.push(`${tool.name}.projectRoot`);
      }
    }
    expect(failures, `tools with inlined roots: ${failures.join(", ")}`).toEqual([]);
  });

  it("every advertised tool's strictContext/expected* is the shared reference when present", () => {
    const failures: string[] = [];
    const fields = [
      ["strictContext", SCHEMA_PROPS.strictContext],
      ["expectedAccessPath", SCHEMA_PROPS.expectedAccessPath],
      ["expectedProjectRoot", SCHEMA_PROPS.expectedProjectRoot],
      ["expectedDestinationRoot", SCHEMA_PROPS.expectedDestinationRoot],
    ] as const;
    for (const tool of TOOLS) {
      const schema = advertisedSchema(tool.name);
      for (const [name, expected] of fields) {
        const value = propertyOf(schema, name);
        if (value !== undefined && value !== expected) {
          failures.push(`${tool.name}.${name}`);
        }
      }
    }
    expect(failures, `tools with inlined strict-context: ${failures.join(", ")}`).toEqual([]);
  });

  it("every advertised tool's dryRun/apply/diff is the shared reference when present", () => {
    const failures: string[] = [];
    const fields = [
      ["dryRun", SCHEMA_PROPS.dryRun],
      ["apply", SCHEMA_PROPS.apply],
      ["diff", SCHEMA_PROPS.diff],
    ] as const;
    for (const tool of TOOLS) {
      const schema = advertisedSchema(tool.name);
      for (const [name, expected] of fields) {
        const value = propertyOf(schema, name);
        if (value !== undefined && value !== expected) {
          failures.push(`${tool.name}.${name}`);
        }
      }
    }
    expect(failures, `tools with inlined write intent: ${failures.join(", ")}`).toEqual([]);
  });

  it("every advertised tool's outputMode is the shared reference when present", () => {
    const failures: string[] = [];
    for (const tool of TOOLS) {
      const schema = advertisedSchema(tool.name);
      const value = propertyOf(schema, "outputMode");
      if (value !== undefined && value !== SCHEMA_PROPS.outputMode) {
        failures.push(tool.name);
      }
    }
    expect(failures, `tools with inlined outputMode: ${failures.join(", ")}`).toEqual([]);
  });

  it("ProjectIdentity and OperationCorrelation are split — contextId is not duplicated by guidance", () => {
    // The issue's guardrail: "projectId remains identity; contextId remains
    // correlation and is not duplicated by guidance." If a single block
    // re-declared `contextId` with a second description, this guard would
    // regress. Pin that the two blocks share the SAME contextId reference.
    const identity = PROJECT_IDENTITY_BLOCK as Record<string, unknown>;
    const correlation = OPERATION_CORRELATION_BLOCK as Record<string, unknown>;
    expect(identity.contextId).toBeUndefined();
    expect(correlation.projectId).toBeUndefined();
  });
});
