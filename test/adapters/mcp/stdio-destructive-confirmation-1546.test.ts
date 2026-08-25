import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import type { InvocationTelemetryEntry } from "../../../src/adapters/mcp/invocation-telemetry.js";
import { startWithSdkServer } from "../../../src/adapters/mcp/stdio.js";
import { createDysflowMcpTools, type DysflowMcpServices } from "../../../src/adapters/mcp/tools.js";
import { successResult } from "../../../src/core/contracts/index.js";

const CASES = [
  {
    name: "delete_module",
    token: "delete_module_precheck",
    port: "vba" as const,
    input: { moduleName: "FixtureModule", accessPath: "C:/project/front.accdb" },
  },
  {
    name: "compact_repair",
    token: "compact_repair_precheck",
    port: "query" as const,
    input: { accessPath: "C:/project/front.accdb" },
  },
  {
    name: "relink_directory",
    token: "relink_directory_precheck",
    port: "query" as const,
    input: { accessPath: "C:/project/front.accdb", rootPath: "C:/project/backends" },
  },
  {
    name: "localize_backend_links",
    token: "localize_backend_precheck",
    port: "query" as const,
    input: {
      accessPath: "C:/project/front.accdb",
      backendPath: "C:/project/backend.accdb",
    },
  },
  {
    name: "drop_table",
    token: "drop_table_precheck",
    port: "query" as const,
    input: { accessPath: "C:/project/front.accdb", tableName: "FixtureTable" },
  },
  {
    name: "teardown_fixture",
    token: "teardown_fixture_precheck",
    port: "query" as const,
    input: {
      accessPath: "C:/project/front.accdb",
      tableName: "FixtureTable",
      predicate: { column: "TestId", min: 900_000, max: 900_010 },
    },
  },
] as const;

type PublicResult = {
  isError?: boolean;
  content?: unknown;
  structuredContent?: Record<string, unknown>;
};

async function createHarness() {
  const queryExecute = vi.fn(async () => successResult({ rows: [] }));
  const vbaSyncExecute = vi.fn(async () => successResult({ operation: "completed" }));
  const telemetry: InvocationTelemetryEntry[] = [];
  const services = {
    vbaService: { execute: vi.fn(async () => successResult({ returnValue: "ok" })) },
    vbaSyncToolService: { execute: vbaSyncExecute },
    queryService: { execute: queryExecute },
    diagnosticsService: { run: vi.fn(async () => successResult({ checks: [] })) },
  } as unknown as DysflowMcpServices;
  // The fake ports return intentionally generic payloads. Remove only the
  // tool-specific success validators so this suite isolates the public
  // request/error/telemetry contract instead of duplicating every adapter's
  // result fixture.
  const tools = createDysflowMcpTools({ services, writes: true, toolSurface: "full" }).map(
    ({ resultContract: _resultContract, ...tool }) => tool,
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const serverDone = startWithSdkServer(tools, serverTransport, {
    toolSurface: "full",
    invocationRecorder: {
      record: async (entry) => {
        telemetry.push(entry);
      },
    },
  });
  const client = new Client({ name: "confirmation-contract", version: "1" }, { capabilities: {} });
  await client.connect(clientTransport);
  return {
    client,
    queryExecute,
    vbaSyncExecute,
    telemetry,
    close: async () => {
      await client.close();
      await serverDone.catch(() => undefined);
    },
  };
}

function callsFor(
  harness: Awaited<ReturnType<typeof createHarness>>,
  port: (typeof CASES)[number]["port"],
) {
  return port === "query" ? harness.queryExecute : harness.vbaSyncExecute;
}

function errorOf(result: PublicResult) {
  return result.structuredContent?.error as Record<string, unknown> | undefined;
}

describe("public MCP destructive-confirmation contract (#1546)", () => {
  it.each(
    CASES,
  )("$name rejects missing confirmations before its service port", async (testCase) => {
    const harness = await createHarness();
    try {
      for (const confirmation of [
        {},
        { implements_check: testCase.token },
        { implements_check: testCase.token, confirmedRequiresConfirmation: false },
      ]) {
        const result = (await harness.client.callTool({
          name: testCase.name,
          arguments: { ...testCase.input, apply: true, ...confirmation },
        })) as PublicResult;
        expect(result.isError).toBe(true);
        expect(result.structuredContent).toMatchObject({
          schemaVersion: "dysflow.result/v1",
          ok: false,
          isError: true,
        });
        expect(errorOf(result)).toMatchObject({
          code: "CONFIRMATION_REQUIRED",
          remediation: {
            implements_check: testCase.token,
            confirmedRequiresConfirmation: true,
          },
        });
        expect(result.content).toEqual([
          expect.objectContaining({
            type: "text",
            text: expect.stringContaining("CONFIRMATION_REQUIRED"),
          }),
        ]);
      }
      expect(callsFor(harness, testCase.port)).not.toHaveBeenCalled();
      expect(harness.telemetry.map((entry) => entry.errorCode)).toEqual([
        "CONFIRMATION_REQUIRED",
        "CONFIRMATION_REQUIRED",
        "CONFIRMATION_REQUIRED",
      ]);
    } finally {
      await harness.close();
    }
  });

  it.each(
    CASES,
  )("$name rejects a wrong token through the public error envelope", async (testCase) => {
    const harness = await createHarness();
    try {
      const result = (await harness.client.callTool({
        name: testCase.name,
        arguments: {
          ...testCase.input,
          apply: true,
          implements_check: "wrong_precheck",
          confirmedRequiresConfirmation: true,
        },
      })) as PublicResult;
      expect(result.isError).toBe(true);
      expect(errorOf(result)).toMatchObject({
        code: "MCP_INPUT_INVALID",
        rejectedFlag: "implements_check",
        expected: testCase.token,
      });
      expect(callsFor(harness, testCase.port)).not.toHaveBeenCalled();
      expect(harness.telemetry).toEqual([
        expect.objectContaining({ tool: testCase.name, errorCode: "MCP_INPUT_INVALID" }),
      ]);
    } finally {
      await harness.close();
    }
  });

  it.each(CASES)("$name bypasses confirmation in plan mode", async (testCase) => {
    const harness = await createHarness();
    try {
      const result = (await harness.client.callTool({
        name: testCase.name,
        arguments: { ...testCase.input, apply: false },
      })) as PublicResult;
      expect(result.isError).toBeFalsy();
      expect(callsFor(harness, testCase.port)).toHaveBeenCalledOnce();
    } finally {
      await harness.close();
    }
  });

  it.each(CASES)("$name accepts its exact confirmation and records telemetry", async (testCase) => {
    const harness = await createHarness();
    try {
      const result = (await harness.client.callTool({
        name: testCase.name,
        arguments: {
          ...testCase.input,
          apply: true,
          implements_check: testCase.token,
          confirmedRequiresConfirmation: true,
        },
      })) as PublicResult;
      expect(result.isError).toBeFalsy();
      expect(callsFor(harness, testCase.port)).toHaveBeenCalledOnce();
      expect(harness.telemetry).toEqual([
        expect.objectContaining({
          tool: testCase.name,
          outcome: "ok",
          errorCode: null,
          paramNamesPresent: expect.arrayContaining([
            "apply",
            "implements_check",
            "confirmedRequiresConfirmation",
          ]),
        }),
      ]);
    } finally {
      await harness.close();
    }
  });

  it("keeps raw-password rejection ahead of relink confirmation", async () => {
    const harness = await createHarness();
    try {
      const result = (await harness.client.callTool({
        name: "relink_directory",
        arguments: {
          rootPath: "C:/project/backends",
          apply: true,
          backendPassword: "never-log-this",
        },
      })) as PublicResult;
      expect(result.isError).toBe(true);
      expect(errorOf(result)).toMatchObject({ code: "MCP_INPUT_INVALID" });
      expect(JSON.stringify(result)).toContain("passwordEnv");
      expect(JSON.stringify(result)).not.toContain("never-log-this");
      expect(harness.queryExecute).not.toHaveBeenCalled();
      expect(harness.telemetry).toEqual([
        expect.objectContaining({ tool: "relink_directory", errorCode: "MCP_INPUT_INVALID" }),
      ]);
    } finally {
      await harness.close();
    }
  });

  it("does not expose the trusted internal bypass as a public argument", async () => {
    const harness = await createHarness();
    try {
      const result = (await harness.client.callTool({
        name: "drop_table",
        arguments: {
          tableName: "FixtureTable",
          apply: true,
          internalCall: true,
        },
      })) as PublicResult;
      expect(result.isError).toBe(true);
      expect(errorOf(result)).toMatchObject({ code: "MCP_INPUT_INVALID" });
      expect(harness.queryExecute).not.toHaveBeenCalled();
    } finally {
      await harness.close();
    }
  });
});
