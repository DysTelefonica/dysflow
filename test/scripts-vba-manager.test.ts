import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync("scripts/dysflow-vba-manager.ps1", "utf8");

describe("dysflow-vba-manager.ps1", () => {
  it("resolves passwords from env vars or trusted -Password without .secrets.json fallback", () => {
    expect(script).toContain("if (-not $Password) { $Password = $env:DYSFLOW_ACCESS_PASSWORD }");
    expect(script).toContain("if (-not $Password) { $Password = $env:ACCESS_VBA_PASSWORD }");
    expect(script).not.toContain(".secrets.json");
    expect(script).not.toContain("access_password");
  });
});
