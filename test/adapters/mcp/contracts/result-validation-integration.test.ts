import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineResultContract } from "../../../../src/adapters/mcp/contracts/result-contract.js";
import { startWithSdkServer } from "../../../../src/adapters/mcp/stdio.js";
import {
  createDysflowMcpTools,
  type DysflowMcpServices,
  type DysflowMcpTool,
} from "../../../../src/adapters/mcp/tools.js";
import { successResult } from "../../../../src/core/contracts/index.js";

const resultContract = defineResultContract({
  schema: z.object({ ok: z.literal(true), count: z.number() }).strict(),
});

async function callSynthetic(
  policy: "report" | "enforce",
  report = vi.fn(),
): Promise<{ result: Awaited<ReturnType<Client["callTool"]>>; report: typeof report }> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const tools: DysflowMcpTool[] = [
    {
      name: "invalid_result",
      description: "Returns a deliberately invalid result.",
      resultContract,
      handler: async () => ({
        content: [{ type: "text", text: JSON.stringify({ ok: true, count: "password-value" }) }],
        isError: false,
      }),
    },
  ];
  const serverDone = startWithSdkServer(tools, serverTransport, {
    resultValidationPolicy: policy,
    reportResultContractViolation: report,
  });
  const client = new Client({ name: "test", version: "0.0.0" }, { capabilities: {} });
  await client.connect(clientTransport);
  try {
    return {
      result: await client.callTool({ name: "invalid_result", arguments: {} }),
      report,
    };
  } finally {
    await client.close();
    await serverDone.catch(() => undefined);
  }
}

describe("SDK pre-serialization result validation seam", () => {
  it("report preserves the legacy response and emits a redacted diagnostic", async () => {
    const { result, report } = await callSynthetic("report");
    expect(result.isError).toBeFalsy();
    expect(result.content).toEqual([
      { type: "text", text: '{"ok":true,"count":"password-value"}' },
    ]);
    expect(result.structuredContent).toMatchObject({
      schemaVersion: "dysflow.result/v1",
      isError: false,
    });
    expect(report).toHaveBeenCalledOnce();
    expect(JSON.stringify(report.mock.calls)).not.toContain("password-value");
  });

  it("enforce fails closed with a typed envelope before invalid success serialization", async () => {
    const { result } = await callSynthetic("enforce");
    expect(result.isError).toBe(true);
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "RESULT_CONTRACT_VIOLATION",
        errorCode: "RESULT_CONTRACT_VIOLATION",
      },
    });
    expect(JSON.stringify(result)).not.toContain("password-value");
  });

  it("preserves migrate_project_config previews after registered-tool warnings are decorated", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "dysflow-migrate-result-contract-"));
    mkdirSync(join(cwd, ".dysflow"), { recursive: true });
    writeFileSync(
      join(cwd, ".dysflow", "project.json"),
      JSON.stringify({
        id: "migrate-preview",
        frontendFile: "frontend.accdb",
        capabilities: { allowWrites: true },
      }),
      "utf8",
    );

    const services = {
      vbaService: { execute: async () => successResult({ returnValue: "ok" }) },
      queryService: { execute: async () => successResult({ rows: [] }) },
      diagnosticsService: { run: async () => successResult({ checks: [] }) },
      vbaSyncToolService: {
        execute: async (tool: string) => successResult({ operation: tool, ok: true, warnings: [] }),
      },
    } as unknown as DysflowMcpServices;
    const migrateTool = createDysflowMcpTools({
      services,
      writes: true,
      writeAccessResolver: async () => true,
      cwd,
    }).find((tool) => tool.name === "migrate_project_config");
    if (migrateTool === undefined) throw new Error("migrate_project_config should be registered");

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const serverDone = startWithSdkServer([migrateTool], serverTransport, {
      resultValidationPolicy: "enforce",
    });
    const client = new Client({ name: "test", version: "0.0.0" }, { capabilities: {} });
    await client.connect(clientTransport);
    try {
      const result = await client.callTool({
        name: "migrate_project_config",
        arguments: { apply: false },
      });
      expect(result.isError).toBeFalsy();
      const content = result.content as Array<{ type: string; text?: string }>;
      const preview = JSON.parse(
        content.find((entry) => entry.type === "text")?.text ?? "{}",
      ) as Record<string, unknown>;
      expect(preview).toMatchObject({
        outcome: "ok",
        applied: false,
        diff: "",
        remediation: [],
        current: expect.any(Object),
        proposed: expect.any(Object),
      });
      expect(preview.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "PREFERRED_TOOL_AVAILABLE",
            called: "migrate_project_config",
          }),
        ]),
      );
    } finally {
      await client.close();
      await serverDone.catch(() => undefined);
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
