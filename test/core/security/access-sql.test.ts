import { describe, expect, it } from "vitest";
import { AccessPowerShellRunner, type PowerShellExecutor } from "../../../src/core/runner/access-runner.js";
import type { DysflowConfig } from "../../../src/core/config/dysflow-config.js";
import { formatAccessIdentifier } from "../../../src/core/security/access-sql.js";

const config: DysflowConfig = {
  configSource: "explicit-request",
  accessDbPath: "C:/data/finance.accdb",
  timeoutMs: 1_500,
  processTimeoutMs: 1_500,
};

describe("access SQL identifier security", () => {
  it("rejects SQL/meta-character injection identifiers", () => {
    const result = formatAccessIdentifier("Users]; DROP TABLE Users;--", "tableName");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("ACCESS_SQL_INVALID_IDENTIFIER");
  });

  it("fails fast before executing PowerShell when query identifiers are invalid", async () => {
    let executorCalled = false;
    const executor: PowerShellExecutor = async () => {
      executorCalled = true;
      return { exitCode: 0, stdout: "{}", stderr: "", durationMs: 1, timedOut: false };
    };
    const runner = new AccessPowerShellRunner({ executor, scriptPath: "C:/tools/run.ps1" });

    const result = await runner.run(
      {
        kind: "query",
        request: {
          action: "get_schema",
          mode: "read",
          sql: "",
          tableName: "People]; DROP TABLE People;--",
        },
      },
      config,
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("ACCESS_SQL_INVALID_IDENTIFIER");
    expect(executorCalled).toBe(false);
  });
});
