import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const docPath = join(process.cwd(), "docs", "api", "http-api.md");

describe("HTTP API documentation", () => {
  it("documents local bind policy, route schemas, and script-friendly examples", () => {
    const doc = readFileSync(docPath, "utf8");

    expect(doc).toContain("# Dysflow Local HTTP API");
    expect(doc).toContain("Default bind: `127.0.0.1:17321`");
    expect(doc).toContain("Writes are disabled by default");
    expect(doc).toContain("GET /health");
    expect(doc).toContain("GET /diagnostics");
    expect(doc).toContain("POST /query/read");
    expect(doc).toContain("POST /query/write");
    expect(doc).toContain("POST /vba/execute");
    expect(doc).toContain("GET /access/operations");
    expect(doc).toContain("POST /access/cleanup");
    expect(doc).toContain("Never kill `MSACCESS.EXE` by process name");
    expect(doc).toContain("PowerShell example");
    expect(doc).toContain("Node fetch example");
    expect(doc).toContain("--enable-writes");
  });

  it("documents that detach is MCP-only and the detached-run conflict status (#1993)", () => {
    const doc = readFileSync(docPath, "utf8");

    expect(doc).toContain("| `detach` (detached runs are MCP-only) | `400 HTTP_INVALID_INPUT` |");
    expect(doc).toContain("`409 TEST_RUN_ALREADY_ACTIVE`");
    expect(doc).toContain("test/adapters/http/http-test-vba-detach-1993.test.ts");
  });

  it("documents env-first HTTP token authentication (#592)", () => {
    const doc = readFileSync(docPath, "utf8");

    expect(doc).toContain("httpTokenEnv");
    expect(doc).toContain("DYSFLOW_HTTP_TOKEN");
    expect(doc).toContain("env-first");
    expect(doc).toContain("env var value takes precedence");
    expect(doc).toContain("inline `httpToken` is local-only");
    expect(doc).toContain("must not be committed");
  });
});
