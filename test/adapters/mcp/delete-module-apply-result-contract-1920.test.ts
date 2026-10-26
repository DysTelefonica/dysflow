import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineResultContract } from "../../../src/adapters/mcp/contracts/result-contract.js";
import { startWithSdkServer } from "../../../src/adapters/mcp/stdio.js";
import {
  createDysflowMcpTools,
  type DysflowMcpServices,
  type DysflowMcpTool,
} from "../../../src/adapters/mcp/tools.js";
import { VbaSyncAdapter } from "../../../src/adapters/vba-sync/vba-sync-adapter.js";
import { successResult } from "../../../src/core/contracts/index.js";
import { noopPreflightCleanup } from "../../_helpers/noop-preflight-cleanup.js";

/**
 * Issue #1920 — a successful `delete_module` apply must reach the caller as a
 * success envelope, not as RESULT_CONTRACT_VIOLATION. Only the PowerShell
 * runner is faked. Its stdout mirrors `Invoke-DeleteAction`: every per-module
 * entry carries `deleted` as the removed object NAME (a string), and
 * `ConvertTo-Json` unwraps a one-module batch into a bare object.
 */
type PublicResult = {
  isError?: boolean;
  content?: { type: string; text: string }[];
  structuredContent?: Record<string, unknown>;
};

const ACCESS_PATH = "C:/project/front.accdb";
// A real folder: an explicit destinationRoot is the spawn cwd, so it must exist (#1914).
const SOURCE_ROOT = mkdtempSync(join(tmpdir(), "dysflow-delete-apply-1920-"));
afterAll(() => rmSync(SOURCE_ROOT, { recursive: true, force: true }));

const APPLY_ARGS = {
  accessPath: ACCESS_PATH,
  destinationRoot: SOURCE_ROOT,
  apply: true,
  implements_check: "delete_module_precheck",
  confirmedRequiresConfirmation: true,
} as const;

function deletedEntry(name: string) {
  return { module: name, status: "ok", deleted: name, kind: "VBComponent" };
}

function runnerStdout(payload: unknown): string {
  return `DYSFLOW_RESULT ${JSON.stringify(payload)}`;
}

function buildTools(stdout: string) {
  const executor = vi.fn(async () => ({
    exitCode: 0,
    stdout,
    stderr: "",
    durationMs: 1,
    timedOut: false,
  }));
  const vbaSyncToolService = new VbaSyncAdapter({
    preflightCleanup: noopPreflightCleanup(),
    executor,
    accessPath: ACCESS_PATH,
    destinationRoot: SOURCE_ROOT,
    env: {},
  });
  const services = {
    vbaService: { execute: vi.fn(async () => successResult({})) },
    vbaSyncToolService,
    queryService: { execute: vi.fn(async () => successResult({ rows: [] })) },
    diagnosticsService: { run: vi.fn(async () => successResult({ checks: [] })) },
  } as unknown as DysflowMcpServices;
  const tools = createDysflowMcpTools({ services, writes: true, toolSurface: "core" });
  return { tools, executor };
}

async function callTool(tools: DysflowMcpTool[], name: string, args: Record<string, unknown>) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const serverDone = startWithSdkServer(tools, serverTransport, {
    toolSurface: "core",
    resultValidationPolicy: "enforce",
  });
  const client = new Client({ name: "delete-module-1920", version: "1" }, { capabilities: {} });
  await client.connect(clientTransport);
  try {
    return (await client.callTool({ name, arguments: args })) as PublicResult;
  } finally {
    await client.close();
    await serverDone.catch(() => undefined);
  }
}

function payloadOf(result: PublicResult): Record<string, unknown> {
  return JSON.parse(result.content?.[0]?.text ?? "") as Record<string, unknown>;
}

function errorOf(result: PublicResult): Record<string, unknown> {
  return (result.structuredContent?.error ?? {}) as Record<string, unknown>;
}

describe("delete_module apply result contract (#1920)", () => {
  it("returns a success envelope naming the deleted source-less standard module", async () => {
    const { tools, executor } = buildTools(runnerStdout(deletedEntry("OrphanModule")));

    const result = await callTool(tools, "delete_module", {
      ...APPLY_ARGS,
      moduleNames: ["OrphanModule"],
    });

    expect(executor).toHaveBeenCalledOnce();
    expect(result.content?.[0]?.text ?? "").not.toContain("RESULT_CONTRACT_VIOLATION");
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      schemaVersion: "dysflow.result/v1",
      ok: true,
    });
    expect(payloadOf(result)).toMatchObject({
      operation: "delete_module",
      dryRun: false,
      willModifyAccess: true,
      deleted: ["OrphanModule"],
      modulesCount: 1,
    });
  });

  it("names every deleted module of a batch and keeps the per-module runner evidence", async () => {
    const { tools } = buildTools(runnerStdout([deletedEntry("ModA"), deletedEntry("ModB")]));

    const result = await callTool(tools, "delete_module", {
      ...APPLY_ARGS,
      moduleNames: ["ModA", "ModB"],
    });

    expect(result.isError).toBeFalsy();
    expect(payloadOf(result)).toMatchObject({
      operation: "delete_module",
      deleted: ["ModA", "ModB"],
      modulesCount: 2,
      results: [
        { module: "ModA", status: "ok", deleted: "ModA", kind: "VBComponent" },
        { module: "ModB", status: "ok", deleted: "ModB", kind: "VBComponent" },
      ],
    });
  });

  it("reports the requested name when a document module removes its owning object", async () => {
    const { tools } = buildTools(
      runnerStdout({
        module: "Form_frmOld",
        status: "ok",
        deleted: "frmOld",
        kind: "DocumentModule-DeleteObject",
      }),
    );

    const result = await callTool(tools, "delete_module", {
      ...APPLY_ARGS,
      moduleName: "Form_frmOld",
    });

    expect(result.isError).toBeFalsy();
    expect(payloadOf(result)).toMatchObject({
      deleted: ["Form_frmOld"],
      results: [{ module: "Form_frmOld", deleted: "frmOld" }],
    });
  });
});

describe("result contract violation reports whether Access was mutated (#1920)", () => {
  const strictContract = defineResultContract({
    description: "A contract no real payload satisfies.",
    schema: z.object({ neverEmitted: z.literal(true) }),
  });

  function withStrictContract(tools: DysflowMcpTool[], name: string): DysflowMcpTool[] {
    return tools.map((tool) =>
      tool.name === name ? { ...tool, resultContract: strictContract } : tool,
    );
  }

  it("flags binaryMutated:true when a binary-mutating apply succeeded", async () => {
    const { tools } = buildTools(runnerStdout(deletedEntry("OrphanModule")));

    const result = await callTool(withStrictContract(tools, "delete_module"), "delete_module", {
      ...APPLY_ARGS,
      moduleNames: ["OrphanModule"],
    });

    expect(result.isError).toBe(true);
    expect(errorOf(result)).toMatchObject({
      code: "RESULT_CONTRACT_VIOLATION",
      binaryMutated: true,
      actualShape: expect.objectContaining({ type: "object" }),
      expectedShape: expect.objectContaining({ schema: expect.any(Object) }),
      details: expect.objectContaining({ binaryMutated: true }),
    });
  });

  it("flags binaryMutated:false for a plan-mode result", async () => {
    const { tools, executor } = buildTools(runnerStdout(deletedEntry("OrphanModule")));

    const result = await callTool(withStrictContract(tools, "delete_module"), "delete_module", {
      accessPath: ACCESS_PATH,
      destinationRoot: SOURCE_ROOT,
      moduleNames: ["OrphanModule"],
      apply: false,
    });

    expect(executor).not.toHaveBeenCalled();
    expect(errorOf(result)).toMatchObject({
      code: "RESULT_CONTRACT_VIOLATION",
      binaryMutated: false,
    });
  });
});
