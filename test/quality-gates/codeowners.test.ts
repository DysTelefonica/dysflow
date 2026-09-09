import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("CODEOWNERS (#1711)", () => {
  it("requires review over the CI/CD and release-trust surfaces", async () => {
    const codeowners = await readFile(".github/CODEOWNERS", "utf8");

    expect(codeowners).toMatch(/^\/\.github\/workflows\/\s+@\S+/m);
  });
});
