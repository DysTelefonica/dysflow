import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("CodeQL workflow (#1708)", () => {
  it("runs semantic SAST over the TypeScript source on pull requests", async () => {
    const workflow = await readFile(".github/workflows/codeql.yml", "utf8");

    expect(workflow).toContain("pull_request:");
    expect(workflow).toMatch(/^\s*schedule:\s*$/m);
    expect(workflow).toContain("uses: github/codeql-action/init@");
    expect(workflow).toContain("uses: github/codeql-action/analyze@");
    expect(workflow).toContain("languages: javascript-typescript");
    expect(workflow).toMatch(/uses: github\/codeql-action\/(init|analyze)@[0-9a-f]{40}/);
  });
});
