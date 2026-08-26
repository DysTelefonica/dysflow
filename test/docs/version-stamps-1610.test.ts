import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "../..");
const packageVersion = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8")) as {
  version: string;
};

describe("dysflow-usage version stamps", () => {
  it.each([
    "skills/dysflow-usage/references/error-codes.md",
    "skills/dysflow-usage/assets/write-flags-matrix.md",
  ])("matches the package version in %s", (relativePath) => {
    const document = readFileSync(resolve(repoRoot, relativePath), "utf8");
    expect(document).toContain(`verified for the v${packageVersion.version} release`);
  });
});
