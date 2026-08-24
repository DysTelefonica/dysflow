import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import {
  DESTRUCTIVE_TOOL_CONFIRMATIONS,
  enforceDestructiveToolConfirmation,
} from "../../../src/adapters/mcp/destructive-tool-confirmation";
import { handleValidatedMcpWrite } from "../../../src/adapters/mcp/dispatch-common";
import type { InvocationTelemetryEntry } from "../../../src/adapters/mcp/invocation-telemetry";
import { buildInvocationAggregate } from "../../../src/adapters/mcp/logs-tool";
import { buildToolSchemaCatalog } from "../../../src/adapters/mcp/schema-tool";
import { QUERY_TOOL_SCHEMAS } from "../../../src/adapters/mcp/schemas/query-schemas";
import { VBA_SYNC_TOOL_SCHEMAS } from "../../../src/adapters/mcp/schemas/vba-sync-schemas";
import { successResult } from "../../../src/core/contracts/index.js";

const expected = {
  delete_module: "delete_module_precheck",
  compact_repair: "compact_repair_precheck",
  relink_directory: "relink_directory_precheck",
  localize_backend_links: "localize_backend_precheck",
  drop_table: "drop_table_precheck",
  teardown_fixture: "teardown_fixture_precheck",
} as const;

describe("issue #1537 destructive confirmation contract", () => {
  it("keeps the exact opt-in inventory and does not include non-destructive tools", () => {
    expect(DESTRUCTIVE_TOOL_CONFIRMATIONS).toEqual(expected);
    expect(DESTRUCTIVE_TOOL_CONFIRMATIONS).not.toHaveProperty("export_all");
    expect(DESTRUCTIVE_TOOL_CONFIRMATIONS).not.toHaveProperty("cleanup_access_operation");
    expect(DESTRUCTIVE_TOOL_CONFIRMATIONS).not.toHaveProperty("run_vba");
  });

  for (const [toolName, implementsCheck] of Object.entries(expected)) {
    it(`${toolName} rejects apply:true without both confirmation fields`, () => {
      for (const input of [
        { apply: true },
        { apply: true, implements_check: implementsCheck },
        {
          apply: true,
          implements_check: implementsCheck,
          confirmedRequiresConfirmation: false,
        },
      ]) {
        const result = enforceDestructiveToolConfirmation(input, toolName);
        expect(result?.ok).toBe(false);
        expect(result?.isError).toBe(true);
        expect(result?.error?.code).toBe("CONFIRMATION_REQUIRED");
        expect(result?.error?.missingFields).toEqual(
          input.implements_check === implementsCheck
            ? ["confirmedRequiresConfirmation"]
            : ["implements_check", "confirmedRequiresConfirmation"],
        );
        expect(result?.error?.remediation).toEqual({
          implements_check: implementsCheck,
          confirmedRequiresConfirmation: true,
        });
      }
    });

    it(`${toolName} rejects the wrong implements_check precisely`, () => {
      const result = enforceDestructiveToolConfirmation(
        {
          apply: true,
          implements_check: "wrong_precheck",
          confirmedRequiresConfirmation: true,
        },
        toolName,
      );
      expect(result?.error).toMatchObject({
        code: "MCP_INPUT_INVALID",
        rejectedFlag: "implements_check",
        expected: implementsCheck,
      });
    });

    it(`${toolName} allows plans and exact confirmed execution`, () => {
      expect(enforceDestructiveToolConfirmation({ apply: false }, toolName)).toBeUndefined();
      expect(
        enforceDestructiveToolConfirmation(
          {
            apply: true,
            implements_check: implementsCheck,
            confirmedRequiresConfirmation: true,
          },
          toolName,
        ),
      ).toBeUndefined();
    });
  }

  it("does not gate tools outside the explicit destructive inventory", () => {
    expect(enforceDestructiveToolConfirmation({ apply: true }, "create_table")).toBeUndefined();
  });

  it("allows trusted internal composition without exposing a public input flag", () => {
    expect(
      enforceDestructiveToolConfirmation({ apply: true }, "delete_module", {
        internalCall: true,
      }),
    ).toBeUndefined();
  });

  it("enforces the contract in the shared alias-tool write seam", async () => {
    let executions = 0;
    const execute = async () => {
      executions += 1;
      return successResult({ operation: "drop_table" });
    };
    const base = { tableName: "Fixture", apply: true };
    const rejected = await handleValidatedMcpWrite(
      base,
      QUERY_TOOL_SCHEMAS.drop_table,
      true,
      undefined,
      execute,
      "drop_table",
    );
    expect(rejected.error?.code).toBe("CONFIRMATION_REQUIRED");
    expect(executions).toBe(0);

    const missingBoolean = await handleValidatedMcpWrite(
      { ...base, implements_check: "drop_table_precheck" },
      QUERY_TOOL_SCHEMAS.drop_table,
      true,
      undefined,
      execute,
      "drop_table",
    );
    expect(missingBoolean.error?.code).toBe("CONFIRMATION_REQUIRED");
    expect(missingBoolean.error?.missingFields).toEqual(["confirmedRequiresConfirmation"]);

    const planWithPartialConfirmation = await handleValidatedMcpWrite(
      { tableName: "Fixture", apply: false, confirmedRequiresConfirmation: true },
      QUERY_TOOL_SCHEMAS.drop_table,
      true,
      undefined,
      execute,
      "drop_table",
    );
    expect(planWithPartialConfirmation.isError).toBe(false);

    const accepted = await handleValidatedMcpWrite(
      {
        ...base,
        implements_check: "drop_table_precheck",
        confirmedRequiresConfirmation: true,
      },
      QUERY_TOOL_SCHEMAS.drop_table,
      true,
      undefined,
      execute,
      "drop_table",
    );
    expect(accepted.isError).toBe(false);
    expect(executions).toBe(2);
  });

  it("is a constant-time lookup far below the 5ms per-call contract", () => {
    const started = performance.now();
    for (let index = 0; index < 10_000; index += 1) {
      enforceDestructiveToolConfirmation({ apply: true }, "drop_table");
    }
    expect((performance.now() - started) / 10_000).toBeLessThan(5);
  });

  it("advertises each exact implements_check token in the public schemas", () => {
    const schemas = {
      delete_module: VBA_SYNC_TOOL_SCHEMAS.delete_module,
      compact_repair: QUERY_TOOL_SCHEMAS.compact_repair,
      relink_directory: QUERY_TOOL_SCHEMAS.relink_directory,
      localize_backend_links: QUERY_TOOL_SCHEMAS.localize_backend_links,
      drop_table: QUERY_TOOL_SCHEMAS.drop_table,
      teardown_fixture: QUERY_TOOL_SCHEMAS.teardown_fixture,
    };
    for (const [toolName, implementsCheck] of Object.entries(expected)) {
      const schema = schemas[toolName as keyof typeof schemas];
      expect(schema.properties?.implements_check?.const).toBe(implementsCheck);
      expect(schema.properties?.confirmedRequiresConfirmation).toBeDefined();
    }
    const catalog = buildToolSchemaCatalog({ view: "full" });
    for (const [toolName, implementsCheck] of Object.entries(expected)) {
      expect(
        catalog.tools.find((tool) => tool.name === toolName)?.parameters.implements_check
          ?.expectedValue,
      ).toBe(implementsCheck);
    }
  });

  it("aggregates confirmation-required and confirmation-provided migration telemetry", () => {
    const base = {
      timestamp: "2026-08-24T00:00:00.000Z",
      tool: "drop_table",
      action: "query",
      operationId: null,
      projectId: "dysflow",
      failureClass: "contract" as const,
      durationMs: 1,
      writeIntent: "apply" as const,
      missingParams: [] as string[],
      rejectedParams: [] as string[],
      unknownToolName: null,
    };
    const records: InvocationTelemetryEntry[] = [
      {
        ...base,
        outcome: "error",
        errorCode: "CONFIRMATION_REQUIRED",
        paramNamesPresent: ["apply"],
      },
      {
        ...base,
        outcome: "ok",
        failureClass: "none",
        errorCode: null,
        paramNamesPresent: ["apply", "confirmedRequiresConfirmation", "implements_check"],
      },
    ];
    expect(buildInvocationAggregate(records).calls).toEqual({
      confirmationRequired: 1,
      confirmationProvided: 1,
    });
  });
});
