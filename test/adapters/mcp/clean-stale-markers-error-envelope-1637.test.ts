import { mkdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { createUnavailableServices, startWithSdkServer } from "../../../src/adapters/mcp/stdio.js";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import type { DysflowError } from "../../../src/core/contracts/index.js";
import { successResult } from "../../../src/core/contracts/index.js";

describe("#1637 clean_stale_markers error envelope", () => {
  it("renders an object-valued startup config error as actionable strings", async () => {
    const startup = await mkdtemp(join(tmpdir(), "dysflow-stale-marker-startup-"));
    mkdirSync(join(startup, ".dysflow"), { recursive: true });
    const missingFrontend = join(startup, "Missing.accdb");
    const remediation =
      "Create the configured frontend file or update frontendFile in .dysflow/project.json, then retry.";
    const startupError = {
      code: "CONFIG_TARGET_NOT_FOUND",
      message: {
        code: "CONFIG_TARGET_NOT_FOUND",
        message: `Configured accessPath does not exist on disk: ${missingFrontend}.`,
        remediation,
      },
      retryable: false,
    } as unknown as DysflowError;
    const services = createUnavailableServices(startupError, { cwd: startup, env: {} });
    const tools = createDysflowMcpTools({
      services,
      accessContextResolver: async () =>
        successResult({ accessPath: missingFrontend, projectRoot: startup }),
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const serverDone = startWithSdkServer(tools, serverTransport);
    const client = new Client({ name: "issue-1637-test", version: "0.0.1" });
    await client.connect(clientTransport);

    try {
      const result = await client.callTool({
        name: "clean_stale_markers",
        arguments: { apply: false },
      });
      const wireResult = result as {
        isError?: boolean;
        content: Array<{ type: string; text?: string }>;
      };
      const content = wireResult.content[0];
      if (content?.type !== "text") throw new Error("expected text error envelope");
      const envelope = JSON.parse(content.text ?? "") as {
        error: {
          message: unknown;
          errorMessage: unknown;
          remediation: unknown;
          diagnostics: Array<{ message: unknown; remediation: unknown }>;
        };
      };

      expect(wireResult.isError).toBe(true);
      expect(typeof envelope.error.message).toBe("string");
      expect(envelope.error.message).toContain("Configured accessPath does not exist on disk");
      expect(envelope.error.message).not.toContain("[object Object]");
      expect(envelope.error.errorMessage).toBe(envelope.error.message);
      expect(envelope.error.remediation).toBe(remediation);
      expect(envelope.error.diagnostics[0]).toMatchObject({
        message: envelope.error.message,
        remediation,
      });
    } finally {
      await client.close();
      await serverDone.catch(() => {});
      await rm(startup, { recursive: true, force: true });
    }
  });
});
