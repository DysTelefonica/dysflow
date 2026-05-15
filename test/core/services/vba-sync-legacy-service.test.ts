import { describe, expect, it } from "vitest";
import { failureResult } from "../../../src/core/contracts/index";
import { VbaSyncLegacyService, resolveDefaultVbaManagerScriptPath, type VbaManagerExecutor } from "../../../src/core/services/vba-sync-legacy-service";

describe("VbaSyncLegacyService", () => {
  it("maps export_modules to a product-owned PowerShell runner invocation", async () => {
    const calls: unknown[] = [];
    const executor: VbaManagerExecutor = async (request) => {
      calls.push(request);
      return { exitCode: 0, stdout: '{"ok":true}', stderr: "", durationMs: 12 };
    };
    const service = new VbaSyncLegacyService({
      executor,
      scriptPath: "C:/Users/alice/AppData/Local/dysflow/app/scripts/dysflow-vba-manager.ps1",
      env: { DYSFLOW_ACCESS_DB_PATH: "C:/db/front.accdb", DYSFLOW_ACCESS_PASSWORD: "secret" },
    });

    await expect(service.execute("export_modules", { moduleNames: ["Module1"], destinationRoot: "C:/repo/src" })).resolves.toMatchObject({
      ok: true,
      data: { ok: true },
      durationMs: 12,
    });

    expect(calls).toEqual([{ 
      scriptPath: "C:/Users/alice/AppData/Local/dysflow/app/scripts/dysflow-vba-manager.ps1",
      action: "Export",
      accessPath: "C:/db/front.accdb",
      destinationRoot: "C:/repo/src",
      moduleNames: ["Module1"],
      password: "secret",
      json: false,
      extra: {},
    }]);
  });

  it("maps legacy list/exists tools with JSON output enabled", async () => {
    const calls: unknown[] = [];
    const service = new VbaSyncLegacyService({
      executor: async (request) => {
        calls.push(request);
        return { exitCode: 0, stdout: '{"exists":true}', stderr: "", durationMs: 1 };
      },
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      env: { DYSFLOW_ACCESS_DB_PATH: "C:/db/front.accdb" },
    });

    await service.execute("exists", { moduleName: "Form_Main" });
    await service.execute("list_objects", {});

    expect(calls).toEqual([
      expect.objectContaining({ action: "Exists", moduleNames: ["Form_Main"], json: true }),
      expect.objectContaining({ action: "List-Objects", moduleNames: [], json: true }),
    ]);
  });

  it("returns a safe failure when a direct runner mapping is not available yet", async () => {
    const service = new VbaSyncLegacyService({
      executor: async () => ({ exitCode: 0, stdout: "{}", stderr: "", durationMs: 1 }),
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      env: { DYSFLOW_ACCESS_DB_PATH: "C:/db/front.accdb" },
    });

    expect(await service.execute("verify_binary", { diff: true })).toEqual(failureResult({
      code: "LEGACY_TOOL_NOT_IMPLEMENTED",
      message: "verify_binary requires a higher-level source/binary comparison implementation and is tracked by #25.",
      retryable: false,
    }));
  });

  it("redacts passwords from runner failures", async () => {
    const service = new VbaSyncLegacyService({
      executor: async () => ({ exitCode: 1, stdout: "", stderr: "bad password secret", durationMs: 3 }),
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      env: { DYSFLOW_ACCESS_DB_PATH: "C:/db/front.accdb", DYSFLOW_ACCESS_PASSWORD: "secret" },
    });

    const result = await service.execute("export_all", {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("[REDACTED]");
      expect(result.error.message).not.toContain("secret");
    }
  });

  it("resolves installed script path from DYSFLOW_HOME", () => {
    expect(resolveDefaultVbaManagerScriptPath({ DYSFLOW_HOME: "C:/Users/alice/AppData/Local/dysflow" })).toBe("C:/Users/alice/AppData/Local/dysflow/app/scripts/dysflow-vba-manager.ps1");
  });
});
