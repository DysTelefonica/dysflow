import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("AGENTS MCP workflow recipes", () => {
  it("documents the agent MCP recipes required for safe Access automation (#594)", async () => {
    const agentsGuide = await readFile("AGENTS.md", "utf8");
    const recipes = sectionBetween(agentsGuide, "## MCP workflow recipes", "## Form inspection");

    for (const heading of [
      "### Bootstrap / doctor / config verification",
      "### Daily VBA sync loop",
      "### Timeout and orphan recovery",
      "### Safe write enablement",
      "### Frontend vs backend target selection",
      "### Form/report sync ownership",
    ]) {
      expect(recipes).toContain(heading);
    }

    for (const requiredPhrase of [
      "dysflow setup --write-project",
      "dysflow doctor",
      "export_all",
      "import_modules",
      "compile_vba",
      "verify_code",
      "dysflow_access_operations_list",
      "dysflow_access_cleanup",
      "dysflow_access_force_cleanup_orphaned",
      "Never kill `MSACCESS.EXE` by process name",
      "dryRun",
      "apply: true",
      "allowWrites",
      "--enable-writes",
      "accessPath",
      "backendPath",
      "databasePath",
      "sourcePath",
      "`.cls`",
      "`.form.txt`",
    ]) {
      expect(recipes).toContain(requiredPhrase);
    }
  });
});

function sectionBetween(content: string, startHeading: string, endHeading: string): string {
  const start = content.indexOf(startHeading);
  const end = content.indexOf(endHeading, start + startHeading.length);
  expect(start, `missing start heading ${startHeading}`).toBeGreaterThanOrEqual(0);
  expect(end, `missing end heading ${endHeading}`).toBeGreaterThan(start);
  return content.slice(start, end);
}
