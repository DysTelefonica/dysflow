import { describe, expect, it } from "vitest";
import {
  type McpAcceptanceProbe,
  runMcpAcceptanceContractChecks,
} from "../../src/cli/commands/doctor/checks/mcp-acceptance.js";
import { handleDoctorCommand } from "../../src/cli/commands/doctor.js";

describe("dysflow doctor MCP acceptance contracts (#1328)", () => {
  it("executes the three runtime contracts through public MCP ports", async () => {
    const checks = await runMcpAcceptanceContractChecks();

    expect(checks).toHaveLength(3);
    expect(checks.map((check) => check.check_id)).toEqual([
      "mcp_response_schema_version",
      "mcp_recovery_token_dispatch",
      "setup_project_id_fail_closed",
    ]);
    expect(
      checks.every((check) => check.ok),
      JSON.stringify(checks, null, 2),
    ).toBe(true);
    expect(checks.map((check) => check.message).join("\n")).toMatch(
      /schemaVersion:dysflow\.result\/v1/,
    );
    expect(checks.map((check) => check.message).join("\n")).toMatch(/routes once/);
    expect(checks.map((check) => check.message).join("\n")).toMatch(
      /requires an explicit id or reuses/,
    );
  });

  it("fails closed when an executable probe is unavailable", async () => {
    const probe: McpAcceptanceProbe = {
      responseSchema: async () => ({ status: "unavailable", message: "transport unavailable" }),
      ambiguityRecovery: async () => ({ status: "pass", message: "recovery passed" }),
      setupProjectId: async () => ({ status: "pass", message: "setup passed" }),
    };

    const checks = await runMcpAcceptanceContractChecks(probe);

    expect(checks[0]).toMatchObject({
      ok: false,
      severity: "critical",
      reason_code: "MCP_RESPONSE_SCHEMA_VERSION_MISSING",
      message: "unavailable: transport unavailable",
    });
  });

  it("renders injected acceptance checks in doctor category C", async () => {
    const result = await handleDoctorCommand(["--category", "C"], {
      checkMcpAcceptanceContracts: async () => [
        {
          ok: false,
          name: "MCP response schema discriminator",
          message: "unavailable: injected transport failure",
          severity: "critical",
          check_id: "mcp_response_schema_version",
          reason_code: "MCP_RESPONSE_SCHEMA_VERSION_MISSING",
          requires_confirmation: false,
          category: "runtimeConsumer",
        },
      ],
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toMatch(/MCP response schema discriminator/);
    expect(result.stdout).toMatch(/unavailable: injected transport failure/);
  });
});
