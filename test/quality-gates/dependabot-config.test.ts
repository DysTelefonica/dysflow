import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Dependabot configuration (#1709)", () => {
  it("keeps npm and github-actions updates on a recurring schedule", async () => {
    const config = await readFile(".github/dependabot.yml", "utf8");
    const ecosystems = [...config.matchAll(/package-ecosystem:\s*"([^"]+)"/g)].map(
      (match) => match[1],
    );

    expect(ecosystems).toContain("npm");
    expect(ecosystems).toContain("github-actions");
    expect(config).toMatch(/version:\s*2/);
    expect([...config.matchAll(/interval:\s*"(\w+)"/g)].every((m) => m[1] !== undefined)).toBe(
      true,
    );
  });
});
