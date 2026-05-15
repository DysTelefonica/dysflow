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
});
