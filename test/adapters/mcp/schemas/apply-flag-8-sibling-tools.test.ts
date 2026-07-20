/**
 * Issue #1031 — `apply:true` parity for the eight tools left out of #1014 / PR #1030.
 * Pins schema declaration, validation, and existing MCP dispatch behavior.
 */
import { describe, expect, it } from "vitest";
import { createDispatchTool } from "../../../../src/adapters/mcp/dispatch-factory.js";
import type { DysflowMcpServices } from "../../../../src/adapters/mcp/result-translation.js";
import { QUERY_TOOL_SCHEMAS } from "../../../../src/adapters/mcp/schemas/query-schemas.js";
import { VBA_SYNC_TOOL_SCHEMAS } from "../../../../src/adapters/mcp/schemas/vba-sync-schemas.js";
import { createDysflowMcpTools } from "../../../../src/adapters/mcp/tools.js";
import { successResult } from "../../../../src/core/contracts/index.js";
import { COMMIT_FLAG_REGISTRY } from "../../../../src/core/runtime/commit-flag-registry.js";
import {
  type JsonObjectSchema,
  SCHEMA_PROPS,
  validateInput,
} from "../../../../src/shared/validation/index.js";

const VBA_SYNC_SIBLINGS = [
  "fix_encoding",
  "import_all",
  "run_vba",
  "vba_inline_execution",
] as const;

const QUERY_MAINTENANCE_SIBLINGS = [
  "relink_tables",
  "unlink_table",
  "import_queries",
  "localize_backend_links",
] as const;

const AFFECTED_TOOLS = [...VBA_SYNC_SIBLINGS, ...QUERY_MAINTENANCE_SIBLINGS] as const;

type AffectedTool = (typeof AFFECTED_TOOLS)[number];
type GeneratedSiblingTool = Exclude<AffectedTool, "run_vba">;

const VBA_SYNC_SIBLING_NAMES = new Set<string>(VBA_SYNC_SIBLINGS);
const QUERY_MAINTENANCE_SIBLING_NAMES = new Set<string>(QUERY_MAINTENANCE_SIBLINGS);

const BASE_INPUTS: Record<AffectedTool, Record<string, unknown>> = {
  fix_encoding: {
    accessPath: "C:/project/Foo.accdb",
    projectRoot: "C:/project",
    location: "C:/project/src",
  },
  import_all: {
    accessPath: "C:/project/Foo.accdb",
    projectRoot: "C:/project",
  },
  run_vba: {
    accessPath: "C:/project/Foo.accdb",
    procedureName: "Issue1031Proc",
  },
  vba_inline_execution: {
    accessPath: "C:/project/Foo.accdb",
    projectRoot: "C:/project",
    code: 'result = "OK"',
  },
  relink_tables: {
    accessPath: "C:/project/Foo.accdb",
    backendPath: "C:/project/Backend.accdb",
  },
  unlink_table: {
    accessPath: "C:/project/Foo.accdb",
    tableName: "LinkedTable",
  },
  import_queries: {
    accessPath: "C:/project/Foo.accdb",
    queryDefinitions: [{ name: "Q_Issue1031", sql: "SELECT 1" }],
  },
  localize_backend_links: {
    accessPath: "C:/project/Foo.accdb",
    backendPath: "C:/project/Backend.accdb",
  },
};

interface CapturedVbaSyncCall {
  name: string;
  input: Record<string, unknown>;
}

function schemaFor(toolName: AffectedTool): JsonObjectSchema {
  const schema = VBA_SYNC_SIBLING_NAMES.has(toolName)
    ? (VBA_SYNC_TOOL_SCHEMAS as Record<string, JsonObjectSchema>)[toolName]
    : (QUERY_TOOL_SCHEMAS as Record<string, JsonObjectSchema>)[toolName];
  if (schema === undefined) throw new Error(`Missing schema for ${toolName}`);
  return schema;
}

function inputFor(
  toolName: AffectedTool,
  flags: Record<string, unknown> = {},
): Record<string, unknown> {
  return { ...BASE_INPUTS[toolName], ...flags };
}

function makeServices() {
  const vbaSyncCalls: CapturedVbaSyncCall[] = [];
  const vbaRequests: Record<string, unknown>[] = [];
  const queryRequests: Record<string, unknown>[] = [];

  const services: DysflowMcpServices = {
    vbaService: {
      execute: async (request) => {
        vbaRequests.push(request as unknown as Record<string, unknown>);
        return successResult({ returnValue: "ok" });
      },
    },
    vbaSyncToolService: {
      execute: async (name, input) => {
        vbaSyncCalls.push({
          name,
          input:
            typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {},
        });
        return successResult({ status: "ok", tool: name });
      },
    },
    queryService: {
      execute: async (request) => {
        queryRequests.push(request as unknown as Record<string, unknown>);
        return successResult({ rows: [] });
      },
    },
    diagnosticsService: {
      run: async () => successResult({ checks: [] }),
    },
  };

  return { services, vbaSyncCalls, vbaRequests, queryRequests };
}

function generatedHandlerFor(toolName: GeneratedSiblingTool) {
  const harness = makeServices();
  const tool = createDispatchTool(
    toolName,
    harness.services,
    /* writesEnabled */ true,
    undefined,
    {},
  );
  return { handler: tool.handler, ...harness };
}

function runVbaHandler() {
  const harness = makeServices();
  const tool = createDysflowMcpTools({
    services: harness.services,
    writes: true,
    allowedProcedures: ["Issue1031Proc"],
  }).find((candidate) => candidate.name === "run_vba");
  if (tool === undefined) throw new Error("run_vba tool is not registered");
  return { handler: tool.handler, ...harness };
}

describe("Issue #1031 — eight sibling tools accept apply:true", () => {
  describe("schema contract", () => {
    for (const toolName of AFFECTED_TOOLS) {
      it(`${toolName} declares the shared apply property and matches the commit registry`, () => {
        const schema = schemaFor(toolName);

        expect(schema.properties.apply).toBe(SCHEMA_PROPS.apply);
        expect(COMMIT_FLAG_REGISTRY[toolName]).toMatchObject({
          commitFlag: "apply",
          defaultBehavior: "plan",
        });
      });
    }
  });

  describe("schema validation", () => {
    for (const toolName of AFFECTED_TOOLS) {
      it(`${toolName} accepts apply:true, preserves the default, and rejects invalid flags`, () => {
        const schema = schemaFor(toolName);

        expect(validateInput(inputFor(toolName, { apply: true }), schema)).toBeUndefined();
        expect(validateInput(inputFor(toolName), schema)).toBeUndefined();

        const wrongType = validateInput(inputFor(toolName, { apply: "yes" }), schema);
        expect(wrongType).toMatch(/apply must be a boolean/i);

        const unknownFlag = validateInput(inputFor(toolName, { notARealFlag: true }), schema);
        expect(unknownFlag).toMatch(/notARealFlag is not allowed/i);
      });
    }
  });

  describe("dispatch forwarding and existing default behavior", () => {
    for (const toolName of AFFECTED_TOOLS) {
      it(`${toolName} forwards apply:true and preserves its existing dry-run/default behavior`, async () => {
        if (toolName === "run_vba") {
          const { handler, vbaRequests } = runVbaHandler();
          const applyResult = await handler(inputFor(toolName, { apply: true }));
          const dryRunResult = await handler(inputFor(toolName, { dryRun: false }));
          const defaultResult = await handler(inputFor(toolName));

          expect([applyResult.isError, dryRunResult.isError, defaultResult.isError]).toEqual([
            false,
            false,
            false,
          ]);
          expect(
            vbaRequests.map((request) => ({
              procedureName: request.procedureName,
              dryRun: request.dryRun,
            })),
          ).toEqual([
            { procedureName: "Issue1031Proc", dryRun: undefined },
            { procedureName: "Issue1031Proc", dryRun: undefined },
            { procedureName: "Issue1031Proc", dryRun: undefined },
          ]);
          return;
        }

        const { handler, vbaSyncCalls, queryRequests } = generatedHandlerFor(toolName);

        if (QUERY_MAINTENANCE_SIBLING_NAMES.has(toolName)) {
          const applyResult = await handler(inputFor(toolName, { apply: true }));
          const dryRunResult = await handler(inputFor(toolName, { dryRun: false }));
          const defaultResult = await handler(inputFor(toolName));

          expect([applyResult.isError, dryRunResult.isError, defaultResult.isError]).toEqual([
            false,
            false,
            false,
          ]);
          expect(
            queryRequests.map((request) => ({
              action: request.action,
              mode: request.mode,
              dryRun: request.dryRun,
            })),
          ).toEqual([
            { action: toolName, mode: "write", dryRun: false },
            { action: toolName, mode: "write", dryRun: false },
            { action: toolName, mode: "write", dryRun: true },
          ]);
          return;
        }

        const applyResult = await handler(inputFor(toolName, { apply: true }));
        const supportsDryRun = "dryRun" in schemaFor(toolName).properties;
        const dryRunResult = supportsDryRun
          ? await handler(inputFor(toolName, { dryRun: false }))
          : undefined;
        const defaultResult = await handler(inputFor(toolName));

        expect(applyResult.isError).toBe(false);
        expect(defaultResult.isError).toBe(false);
        expect(dryRunResult?.isError).toBe(supportsDryRun ? false : undefined);
        expect(vbaSyncCalls.map((call) => call.name)).toEqual(
          supportsDryRun ? [toolName, toolName, toolName] : [toolName, toolName],
        );
        expect(vbaSyncCalls[0]?.input).toMatchObject({ apply: true });
        if (supportsDryRun) {
          expect(vbaSyncCalls[1]?.input).toMatchObject({ dryRun: false });
        }
        expect(vbaSyncCalls.at(-1)?.input).toMatchObject({ dryRun: true });
      });
    }
  });
});
