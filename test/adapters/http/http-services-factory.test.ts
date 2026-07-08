import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createHttpServices,
  createUnavailableHttpServices,
} from "../../../src/adapters/http/http-services-factory";

describe("createUnavailableHttpServices", () => {
  it("returns service methods that resolve to SERVICE_UNAVAILABLE", async () => {
    const services = createUnavailableHttpServices();

    const diagnosticsResult = await services.diagnosticsService.run();
    const queryResult = await services.queryService.execute({
      sql: "SELECT 1",
      mode: "read",
    });
    const vbaResult = await services.vbaService.execute({
      moduleName: "Mod",
      procedureName: "Proc",
    });

    expect(diagnosticsResult.ok).toBe(false);
    expect(!diagnosticsResult.ok && diagnosticsResult.error.code).toBe("SERVICE_UNAVAILABLE");

    expect(queryResult.ok).toBe(false);
    expect(!queryResult.ok && queryResult.error.code).toBe("SERVICE_UNAVAILABLE");

    expect(vbaResult.ok).toBe(false);
    expect(!vbaResult.ok && vbaResult.error.code).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns a non-null operationRegistry", () => {
    const services = createUnavailableHttpServices();

    expect(services.operationRegistry).not.toBeNull();
    expect(services.operationRegistry).not.toBeUndefined();
  });
});

describe("createHttpServices", () => {
  it("falls back gracefully when cwd has no .dysflow config (returns services, does not throw)", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "dysflow-factory-test-"));

    let services: Awaited<ReturnType<typeof createHttpServices>> | undefined;
    let threw = false;
    try {
      services = await createHttpServices({}, tempDir);
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(services).toBeDefined();
    expect(services).not.toBeNull();
    if (services === undefined) {
      throw new Error("Expected degraded HTTP services to be created");
    }

    // Degraded services should return SERVICE_UNAVAILABLE
    const result = await services.diagnosticsService.run();
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("SERVICE_UNAVAILABLE");
  });

  it("wires vbaSyncToolService with configured allowedProcedures for HTTP /vba/test", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "dysflow-factory-allowlist-"));
    await mkdir(join(tempDir, ".dysflow"), { recursive: true });
    await mkdir(join(tempDir, "src"), { recursive: true });
    await writeFile(join(tempDir, "app.accdb"), "", "utf8");
    await writeFile(
      join(tempDir, ".dysflow", "project.json"),
      JSON.stringify({
        accessPath: "app.accdb",
        destinationRoot: "src",
        capabilities: {
          allowWrites: true,
          procedures: { allow: ["Test_A"] },
        },
      }),
      "utf8",
    );

    const services = await createHttpServices({}, tempDir);

    expect(services.vbaSyncToolService).toBeDefined();
    const result = await services.vbaSyncToolService?.execute("test_vba", {
      proceduresJson: '["Test_B"]',
    });

    expect(result?.ok).toBe(false);
    if (result === undefined || result.ok) throw new Error("expected allowlist refusal");
    expect(result.error.code).toBe("PROCEDURE_NOT_ALLOWED");
  });
});
