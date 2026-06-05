import { describe, expect, it } from "vitest";
import { translateCoreResultToMcpContent } from "../../../src/adapters/mcp/tools";
import { failureResult } from "../../../src/core/contracts/index";
import { sanitizeSecrets } from "../../../src/core/utils/index";

function mcpErrorText(message: string, secrets?: readonly string[]): string {
  const result = translateCoreResultToMcpContent(
    failureResult({ code: "TEST_ERROR", message, retryable: false }),
    secrets,
  );
  return result.content[0]?.text ?? "";
}

describe("MCP error secret redaction (#429)", () => {
  it("redacts an explicit known secret from the MCP tool result, matching the HTTP path", () => {
    const secret = "S3cr3t-Backend-Pwd!";
    const coreMessage = `failed to open backend with password ${secret}`;

    const mcpText = mcpErrorText(coreMessage, [secret]);

    // Parity baseline: HTTP applies sanitizeSecrets(error, secrets) at its sink.
    const httpEquivalent = sanitizeSecrets(coreMessage, [secret]);

    expect(mcpText).not.toContain(secret);
    expect(mcpText).toContain("[REDACTED]");
    // MCP↔HTTP parity for known secrets (modulo MCP's "CODE: " prefix).
    expect(mcpText).toBe(`TEST_ERROR: ${httpEquivalent}`);
  });

  it("strips connect-string passwords heuristically even without an explicit secret list", () => {
    const coreMessage =
      "DAO connect failed: ODBC;DSN=db;UID=admin;PWD=hunter2-connect;DATABASE=app";

    const mcpText = mcpErrorText(coreMessage);

    expect(mcpText).not.toContain("hunter2-connect");
    expect(mcpText).not.toContain("PWD=");
  });

  it("preserves path redaction while redacting secrets in the same message", () => {
    const secret = "topSecretValue";
    const coreMessage = `auth ${secret} failed at C:\\Users\\alice\\repo\\front.accdb`;

    const mcpText = mcpErrorText(coreMessage, [secret]);

    expect(mcpText).toContain("[PATH]");
    expect(mcpText).not.toContain(secret);
    expect(mcpText).not.toContain("alice");
  });
});
