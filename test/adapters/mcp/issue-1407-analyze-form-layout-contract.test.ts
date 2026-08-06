import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineResultContract } from "../../../src/adapters/mcp/contracts/result-contract.js";
import { startWithSdkServer } from "../../../src/adapters/mcp/stdio.js";
import { createDysflowMcpTools, type DysflowMcpTool } from "../../../src/adapters/mcp/tools.js";
import {
  VbaFormsAdapter,
  type VbaFormsOrchestrator,
} from "../../../src/adapters/vba-sync/vba-forms-adapter.js";
import { successResult } from "../../../src/core/contracts/index.js";
import type { FormFileSystemPort } from "../../../src/core/services/vba-form-service.js";

function makeOrchestrator(): VbaFormsOrchestrator {
  return {
    executor: vi.fn(),
    env: {},
    cwd: "C:/repo",
    resolveExecutionTarget: vi.fn(),
    validateStrictContext: vi.fn(),
    executeMappedTool: vi.fn(),
  };
}

function mockFs(readFile: FormFileSystemPort["readFile"]): FormFileSystemPort {
  return {
    mkdir: vi.fn(),
    readdir: vi.fn(),
    readFile,
    readJson: vi.fn(),
    writeFile: vi.fn(),
  };
}

function formText(controlNames: readonly string[], includeHeader = false): string {
  const controls = controlNames
    .map(
      (name, index) => `
            Begin TextBox
                Name ="${name}"
                Left =${1000 + index * 2000}
                Top =1000
                Width =1500
                Height =400
            End`,
    )
    .join("");
  const header = includeHeader
    ? `
        Begin FormHeader
            Height =500
        End`
    : "";
  return `Version =21
VersionRequired =20
Begin Form
    Caption ="Test"
    Width =20000
    Begin${header}
        Begin Detail${controls}
        End
    End
End
`;
}

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

function createTools(fileSystem: FormFileSystemPort): DysflowMcpTool[] {
  return createDysflowMcpTools({
    services: {
      vbaService: new FakeVbaService(),
      vbaSyncToolService: new VbaFormsAdapter(makeOrchestrator(), fileSystem),
      queryService: new FakeQueryService(),
      diagnosticsService: new FakeDiagnosticsService(),
    },
    writes: false,
    resultValidationPolicy: "enforce",
  });
}

async function callTool(
  tools: DysflowMcpTool[],
  name: string,
  args: Record<string, unknown>,
): Promise<{
  isError?: boolean;
  content?: Array<{ text?: string }>;
  error?: Record<string, unknown>;
}> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const serverDone = startWithSdkServer(tools, serverTransport, {
    resultValidationPolicy: "enforce",
  });
  const client = new Client({ name: "issue-1407-test", version: "0.0.0" }, { capabilities: {} });
  await client.connect(clientTransport);
  try {
    return (await client.callTool({ name, arguments: args })) as {
      isError?: boolean;
      content?: Array<{ text?: string }>;
      error?: Record<string, unknown>;
    };
  } finally {
    await client.close();
    await serverDone.catch(() => undefined);
  }
}

describe("issue #1407 analyze_form_layout MCP contract", () => {
  it("returns the real analysis payload without a contract violation", async () => {
    const fileSystem = mockFs(vi.fn().mockResolvedValue(formText(["txtName", "txtCode"])));
    const result = await callTool(createTools(fileSystem), "analyze_form_layout", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
    });

    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content?.[0]?.text ?? "null") as Record<string, unknown>;
    expect(payload).toEqual(
      expect.objectContaining({
        formName: "Customer",
        controls: expect.any(Number),
        sections: expect.any(Number),
        findings: expect.any(Array),
      }),
    );
  });

  it("includes remediation fields when a result contract is violated", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const tools: DysflowMcpTool[] = [
      {
        name: "form_set_property",
        description: "Synthetic invalid form result.",
        resultContract: defineResultContract({
          schema: z.object({ mode: z.literal("dry-run"), changed: z.boolean() }).strict(),
        }),
        handler: async () => ({
          content: [
            { type: "text", text: JSON.stringify({ mode: "dry-run", changed: "invalid" }) },
          ],
          isError: false,
        }),
      },
    ];
    const serverDone = startWithSdkServer(tools, serverTransport, {
      resultValidationPolicy: "enforce",
    });
    const client = new Client({ name: "issue-1407-test", version: "0.0.0" }, { capabilities: {} });
    await client.connect(clientTransport);
    try {
      const result = await client.callTool({ name: "form_set_property", arguments: {} });
      expect(result).toMatchObject({
        isError: true,
        error: {
          code: "RESULT_CONTRACT_VIOLATION",
          remediation: expect.any(String),
          remediationHint: expect.any(Object),
        },
      });
    } finally {
      await client.close();
      await serverDone.catch(() => undefined);
    }
  });

  it("keeps the contract valid across distinct form fixtures", async () => {
    const fixtures = new Map([
      ["C:/repo/forms/Form_One.form.txt", formText(["txtOne"])],
      ["C:/repo/forms/Form_Two.form.txt", formText(["txtTwo", "txtOther"], true)],
      ["C:/repo/forms/Form_Three.form.txt", formText(["txtA", "txtB", "txtC"])],
    ]);
    const fileSystem = mockFs(
      vi.fn().mockImplementation(async (path: string) => {
        const fixture = fixtures.get(path.replace(/\\/g, "/"));
        if (fixture === undefined) throw new Error("ENOENT");
        return fixture;
      }),
    );
    const tools = createTools(fileSystem);

    for (const sourcePath of fixtures.keys()) {
      const result = await callTool(tools, "analyze_form_layout", { sourcePath });
      expect(result.isError, sourcePath).toBe(false);
      const payload = JSON.parse(result.content?.[0]?.text ?? "null") as Record<string, unknown>;
      expect(payload).toEqual(
        expect.objectContaining({
          formName: expect.any(String),
          controls: expect.any(Number),
          sections: expect.any(Number),
          findings: expect.any(Array),
        }),
      );
    }
  });
});
