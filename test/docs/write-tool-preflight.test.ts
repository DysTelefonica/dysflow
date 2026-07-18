import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

// Issue #966 — docs gap. The `destinationRoot` pre-condition for every
// write-tool must be surfaced in (1) the JSON schema top-level
// `description` and (2) the operator-facing skill assets. The runtime
// error contract (`DESTINATION_ROOT_NOT_FOUND` + structured remediation)
// is already implemented by #962 + #970; this test only asserts the
// documentation surface.

const SCHEMAS_PATH = "src/adapters/mcp/schemas/vba-sync-schemas.ts";

const SKILL_DIR = "C:/Users/adm1/.agents/skills/dysflow-usage/assets";
const VERIFY_SCRIPT_PATH = `${SKILL_DIR}/scripts/verify-examples-vs-runtime.ps1`;
const EXPORT_MODULES_EXAMPLE_PATH = `${SKILL_DIR}/examples/export-modules.md`;
const IMPORT_MODULES_EXAMPLE_PATH = `${SKILL_DIR}/examples/import-modules.md`;
const SYNC_BINARY_EXAMPLE_PATH = `${SKILL_DIR}/examples/sync-binary.md`;

const PRE_FLIGHT_BLOCK = [
  "Pre-flight checks (executed automatically at apply:true)",
  // The recovery story must include the exact sequence:
  "git rm -r",
].join("\n");

describe("write-tools Pre-flight checks docs (Round-12 #966)", () => {
  it("export_modules schema carries a Pre-flight checks block that names destinationRoot and the git rm -r footgun", async () => {
    const source = await readFile(SCHEMAS_PATH, "utf8");
    const exportModulesSection = sectionAfterToolEntry(source, "export_modules:");

    expect(exportModulesSection).toContain("Pre-flight checks");
    expect(exportModulesSection).toContain("destinationRoot");
    expect(exportModulesSection).toContain("git rm -r");
    // First-line constant of the block — guards against a description
    // that drifts away from the canonical wording.
    expect(exportModulesSection).toMatch(/Pre-flight checks \(executed automatically/);
  });

  it("import_modules schema carries a Pre-flight checks block that names destinationRoot and the git rm -r footgun", async () => {
    const source = await readFile(SCHEMAS_PATH, "utf8");
    const importModulesSection = sectionAfterToolEntry(source, "import_modules:");

    expect(importModulesSection).toContain("Pre-flight checks");
    expect(importModulesSection).toContain("destinationRoot");
    expect(importModulesSection).toContain("git rm -r");
  });

  it("sync_binary schema carries a Pre-flight checks block that names destinationRoot and the git rm -r footgun", async () => {
    const source = await readFile(SCHEMAS_PATH, "utf8");
    const syncBinarySection = sectionAfterToolEntry(source, "sync_binary:");

    expect(syncBinarySection).toContain("Pre-flight checks");
    expect(syncBinarySection).toContain("destinationRoot");
    expect(syncBinarySection).toContain("git rm -r");
  });

  it("verify-examples-vs-runtime.ps1 covers the recovery workflow (git rm -r -> mkdir -> export_modules apply:true)", async () => {
    const script = await readFile(VERIFY_SCRIPT_PATH, "utf8");
    // A single regex that matches all three steps in sequence with
    // tolerated whitespace: removing src/, recreating it, then exporting.
    expect(script).toMatch(/git rm -r[^\n]*\n[\s\S]*?mkdir[\s\S]*?export_modules[\s\S]*?apply\s*:\s*true/s);
    // The recovery story must be named in prose so reviewers can spot
    // it without grepping the syntax.
    expect(script).toMatch(/git rm -r/);
    expect(script).toMatch(/mkdir/);
  });

  it("export-modules.md surfaces the destinationRoot pre-condition and the git rm -r footgun", async () => {
    const example = await readFile(EXPORT_MODULES_EXAMPLE_PATH, "utf8");
    expect(example).toContain("destinationRoot must exist");
    expect(example).toContain("git rm -r");
    // The shared constant block from the schema should be echoed in the
    // example for parity.
    expect(example).toMatch(/Pre-flight checks|recovery/i);
  });

  it("import-modules.md surfaces the destinationRoot pre-condition and the git rm -r footgun", async () => {
    const example = await readFile(IMPORT_MODULES_EXAMPLE_PATH, "utf8");
    expect(example).toContain("destinationRoot must exist");
    expect(example).toContain("git rm -r");
    expect(example).toMatch(/Pre-flight checks|recovery/i);
  });

  it("sync-binary.md surfaces the destinationRoot pre-condition and the git rm -r footgun", async () => {
    const example = await readFile(SYNC_BINARY_EXAMPLE_PATH, "utf8");
    expect(example).toContain("destinationRoot must exist");
    expect(example).toContain("git rm -r");
    expect(example).toMatch(/Pre-flight checks|recovery/i);
  });

  it("PRE_FLIGHT_BLOCK constant points at every required doc surface", () => {
    // Constant health-check: if the block itself loses a key phrase,
    // we want a focused failure rather than three confusing ones.
    expect(PRE_FLIGHT_BLOCK).toContain("Pre-flight checks");
    expect(PRE_FLIGHT_BLOCK).toContain("git rm -r");
  });
});

/**
 * Returns the slice of `source` starting at the `toolName:` entry
 * declaration and ending at the next `toolName:` (or end of source).
 * Captures only the body of one schema entry, so per-tool asserts stay
 * scoped and don't fail when a sibling tool's doc grows.
 */
function sectionAfterToolEntry(source: string, toolEntry: string): string {
  const start = source.indexOf(toolEntry);
  expect(start, `missing tool entry ${toolEntry}`).toBeGreaterThanOrEqual(0);
  // Find the next sibling top-level key (`  tool_name:`) so we read the
  // body of one entry at a time. Crude — collapses on 2-space indent.
  const rest = source.slice(start + toolEntry.length);
  const nextKeyMatch = rest.match(/\n  \w+_?\w+:\s*\{/);
  const end = nextKeyMatch?.index ?? rest.length;
  return rest.slice(0, end);
}
