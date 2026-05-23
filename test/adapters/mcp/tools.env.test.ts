import { describe, expect, it } from "vitest";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools";
import { successResult } from "../../../src/core/contracts/index";

type CapturedRequest = { backendPassword?: string };

function makeServices() {
  const captured: CapturedRequest[] = [];
  const queryService = {
    async execute(request: Record<string, unknown>) {
      captured.push({ backendPassword: request.backendPassword as string | undefined });
      return successResult({ rows: [] });
    },
  };
  return {
    services: {
      vbaService: { async execute() { return successResult({ returnValue: "ok" }); } },
      queryService,
      diagnosticsService: { async run() { return successResult({ checks: [] }); } },
    },
    captured,
  };
}

describe("Environment injection in MCP adapter (toLegacyMaintenanceRequest)", () => {
  it("resolves passwordEnv from injected env, not process.env", async () => {
    const { services, captured } = makeServices();
    const injectedEnv: Record<string, string | undefined> = { MY_DB_PASS: "injected-password" };

    const tools = createDysflowMcpTools(services, true, undefined, injectedEnv);
    const relinkDir = tools.find((t) => t.name === "relink_directory");
    expect(relinkDir).toBeDefined();

    await relinkDir!.handler({ passwordEnv: "MY_DB_PASS" });

    expect(captured[0]?.backendPassword).toBe("injected-password");
  });

  it("divergent env values confirm injection takes precedence over process.env", async () => {
    const { services, captured } = makeServices();

    // Set a different value in process.env vs injected env
    const original = process.env["DIVERGENT_TEST_VAR"];
    process.env["DIVERGENT_TEST_VAR"] = "process-env-value";

    const injectedEnv: Record<string, string | undefined> = { DIVERGENT_TEST_VAR: "injected-value" };
    const tools = createDysflowMcpTools(services, true, undefined, injectedEnv);
    const relinkDir = tools.find((t) => t.name === "relink_directory");

    await relinkDir!.handler({ passwordEnv: "DIVERGENT_TEST_VAR" });

    // Restore process.env
    if (original === undefined) {
      delete process.env["DIVERGENT_TEST_VAR"];
    } else {
      process.env["DIVERGENT_TEST_VAR"] = original;
    }

    expect(captured[0]?.backendPassword).toBe("injected-value");
  });

  it("when no env is injected, defaults to process.env (backwards compat)", async () => {
    const { services, captured } = makeServices();

    const original = process.env["BC_TEST_VAR"];
    process.env["BC_TEST_VAR"] = "process-env-bc-value";

    const tools = createDysflowMcpTools(services, true); // no env parameter
    const relinkDir = tools.find((t) => t.name === "relink_directory");

    await relinkDir!.handler({ passwordEnv: "BC_TEST_VAR" });

    if (original === undefined) {
      delete process.env["BC_TEST_VAR"];
    } else {
      process.env["BC_TEST_VAR"] = original;
    }

    expect(captured[0]?.backendPassword).toBe("process-env-bc-value");
  });
});
