import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
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

function formText(controlNames: readonly string[]): string {
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
  return `Version =21
VersionRequired =20
Begin Form
    Caption ="Test"
    Width =20000
    Begin
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
  const client = new Client({ name: "issue-1409-test", version: "0.0.0" }, { capabilities: {} });
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

describe("issue #1409 verify_form_bindings MCP contract", () => {
  it("returns the real binding-validation payload without a contract violation", async () => {
    const fileSystem = mockFs(vi.fn().mockResolvedValue(formText(["txtName", "txtCode"])));
    const result = await callTool(createTools(fileSystem), "verify_form_bindings", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      schema: { Customers: [{ name: "Id", type: "Long", nullable: false }] },
    });

    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content?.[0]?.text ?? "null") as Record<string, unknown>;
    expect(payload).toEqual(
      expect.objectContaining({
        formName: "Customer",
        controls: expect.any(Number),
        findings: expect.any(Array),
      }),
    );
  });

  it("keeps the contract valid across distinct form fixtures", async () => {
    const fixtures = new Map([
      ["C:/repo/forms/Form_One.form.txt", formText(["txtOne"])],
      ["C:/repo/forms/Form_Two.form.txt", formText(["txtTwo", "txtOther"])],
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
      const result = await callTool(tools, "verify_form_bindings", {
        sourcePath,
        schema: { Customers: [{ name: "Id", type: "Long", nullable: false }] },
      });
      expect(result.isError, sourcePath).toBe(false);
      const payload = JSON.parse(result.content?.[0]?.text ?? "null") as Record<string, unknown>;
      expect(payload).toEqual(
        expect.objectContaining({
          formName: expect.any(String),
          controls: expect.any(Number),
          findings: expect.any(Array),
        }),
      );
    }
  });
});
