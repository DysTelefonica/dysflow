import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

function workflowJobBlock(workflow: string, job: string): string {
  const lines = workflow.split(/\r?\n/);
  const start = lines.indexOf(`  ${job}:`);
  if (start < 0) throw new Error(`release.yml declares no "${job}" job`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^ {2}\S/.test(line));
  return (end < 0 ? rest : rest.slice(0, end)).join("\n");
}

describe("release E2E authority documentation (#1528)", () => {
  it("pins operator and agent guidance to the tag-triggered publication gate", async () => {
    const [agents, checklist, workflow] = await Promise.all([
      readFile("AGENTS.md", "utf8"),
      readFile("docs/release-checklist.md", "utf8"),
      readFile(".github/workflows/release.yml", "utf8"),
    ]);
    const e2e = workflowJobBlock(workflow, "e2e-validation");
    const publication = workflowJobBlock(workflow, "release");

    expect(e2e).toContain("if: startsWith(github.ref, 'refs/tags/v')");
    expect(e2e).toContain("run: pnpm test:e2e:mcp:release");
    expect(publication).toContain("needs: [build, quality-authority, e2e-validation]");

    for (const policy of [agents, checklist]) {
      expect(policy).toContain("sole heavy release E2E authority");
      expect(policy).toContain("pnpm test:e2e:mcp:release");
      expect(policy).toContain("must not run it locally as a pre-tag gate");
    }

    expect(checklist).toContain("exact-SHA `main` CI");
    expect(checklist).toContain("GitHub Release is published only after");
    expect(checklist).not.toContain("it is NOT run by CI");
    expect(checklist).not.toContain("Run the heavy E2E only at the very end");
  });
});
