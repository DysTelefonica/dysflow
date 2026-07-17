import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { resolveDocumentationBundleStatusNearModule } from "../../src/shared/install-docs.js";

describe("resolveDocumentationBundleStatusNearModule", () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("reports docs from the packaged runtime even when DYSFLOW_HOME is stale", () => {
    const runtimeDir = mkdtempSync(path.join(tmpdir(), "dysflow-install-docs-"));
    temporaryDirectories.push(runtimeDir);
    mkdirSync(path.join(runtimeDir, "app", "dist", "adapters", "mcp"), { recursive: true });
    mkdirSync(path.join(runtimeDir, "references"), { recursive: true });
    mkdirSync(path.join(runtimeDir, "docs", "diagnostics"), { recursive: true });
    writeFileSync(path.join(runtimeDir, "app", "package.json"), '{"version":"2.14.1"}');
    writeFileSync(path.join(runtimeDir, "references", "error-codes.md"), "errors");
    writeFileSync(path.join(runtimeDir, "docs", "diagnostics", "hresult-guide.md"), "hresults");

    const moduleUrl = pathToFileURL(
      path.join(runtimeDir, "app", "dist", "adapters", "mcp", "stdio.js"),
    ).href;
    const result = resolveDocumentationBundleStatusNearModule(moduleUrl, {
      DYSFLOW_HOME: path.join(runtimeDir, "stale-runtime"),
    });

    expect(result).toEqual({
      errorCodesMd: true,
      hresultGuideMd: true,
      version: "2.14.1",
    });
  });
});
