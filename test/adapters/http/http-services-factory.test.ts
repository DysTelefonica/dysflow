import { mkdtemp } from "node:fs/promises";
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

    let services;
    let threw = false;
    try {
      services = await createHttpServices({}, tempDir);
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(services).toBeDefined();
    expect(services).not.toBeNull();

    // Degraded services should return SERVICE_UNAVAILABLE
    const result = await services!.diagnosticsService.run();
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("SERVICE_UNAVAILABLE");
  });
});
