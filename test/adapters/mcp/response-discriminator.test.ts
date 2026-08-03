import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import {
  type DysflowMcpTool,
  RESULT_SCHEMA_VERSION,
  translateCoreResultToMcpContent,
} from "../../../src/adapters/mcp/result-translation.js";
import { createSetupProjectTool } from "../../../src/adapters/mcp/setup-project-tool.js";
import { startWithSdkServer } from "../../../src/adapters/mcp/stdio.js";
import {
  createDysflowError,
  failureResult,
  successResult,
} from "../../../src/core/contracts/index.js";

async function callOverPublicSdk(tool: DysflowMcpTool, args: Record<string, unknown> = {}) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const serverDone = startWithSdkServer([tool], serverTransport);
  const client = new Client({ name: "response-discriminator-test", version: "1.0.0" }, {});
  await client.connect(clientTransport);
  try {
    return await client.callTool({ name: tool.name, arguments: args });
  } finally {
    await client.close();
    await serverDone.catch(() => undefined);
  }
}

describe("MCP response carries schemaVersion:'dysflow.result/v1' discriminator (#1168)", () => {
  it("get_capabilities success exposes the discriminated envelope over the public SDK transport", async () => {
    const result = await callOverPublicSdk({
      name: "get_capabilities",
      description: "Returns a capability snapshot.",
      handler: async () =>
        translateCoreResultToMcpContent(
          successResult({ adapterVersion: "2.34.0", toolsVisible: 104 }),
        ),
    });

    expect(result.content).toEqual([
      {
        type: "text",
        text: JSON.stringify({ adapterVersion: "2.34.0", toolsVisible: 104 }),
      },
    ]);
    expect(result.structuredContent).toMatchObject({
      schemaVersion: RESULT_SCHEMA_VERSION,
      adapterVersion: "2.34.0",
      content: result.content,
      isError: false,
    });
  });

  it("import_modules success exposes the same discriminator without changing legacy text", async () => {
    const result = await callOverPublicSdk(
      {
        name: "import_modules",
        description: "Returns an import plan.",
        handler: async () =>
          translateCoreResultToMcpContent(
            successResult({ mode: "plan", moduleNames: ["Constantes"] }),
          ),
      },
      { apply: false },
    );

    expect(result.content).toEqual([
      {
        type: "text",
        text: JSON.stringify({ mode: "plan", moduleNames: ["Constantes"] }),
      },
    ]);
    expect(result.structuredContent).toMatchObject({
      schemaVersion: RESULT_SCHEMA_VERSION,
      mode: "plan",
      isError: false,
    });
  });

  it("MCP_INPUT_INVALID exposes the discriminated error envelope over the public SDK transport", async () => {
    const result = await callOverPublicSdk({
      name: "invalid_probe",
      description: "Returns a typed invalid-input error.",
      handler: async () =>
        translateCoreResultToMcpContent(
          failureResult(createDysflowError("MCP_INPUT_INVALID", "projectId is required")),
        ),
    });

    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      { type: "text", text: "MCP_INPUT_INVALID: projectId is required" },
    ]);
    expect(result.structuredContent).toMatchObject({
      schemaVersion: RESULT_SCHEMA_VERSION,
      content: result.content,
      isError: true,
      error: { code: "MCP_INPUT_INVALID", message: "projectId is required" },
    });
  });

  it("setup_project preserves missing-target evidence over the public SDK transport", async () => {
    const workdir = mkdtempSync(join(tmpdir(), "dysflow-setup-transport-"));
    try {
      writeFileSync(join(workdir, ".git"), "gitdir: fixture", "utf8");
      mkdirSync(join(workdir, "src"));

      const result = await callOverPublicSdk(
        createSetupProjectTool({ cwd: workdir, writesEnabled: true }),
        {
          frontendFile: "Missing.accdb",
          projectId: "missing-target-evidence",
          apply: true,
        },
      );
      const content = result.content as Array<{ type: string; text?: string }>;
      const payload = JSON.parse(content[0]?.text ?? "{}");

      expect(result.isError).toBe(true);
      expect(payload.error).toMatchObject({
        code: "TARGET_NOT_FOUND",
        configPath: join(workdir, ".dysflow", "project.json"),
        resolvedConfig: { id: "missing-target-evidence" },
      });
    } finally {
      rmSync(workdir, { recursive: true, force: true });
    }
  });
});
