import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("issue #1256 release E2E records", () => {
  const source = readFileSync(resolve("E2E_testing/mcp-e2e.mjs"), "utf8");

  it.each([
    'await record("protocol", "data-schema-coverage", { projectId, view: "compact" });',
    'await record("vba", "find_references:1018-schema-leak", {',
    'await record("vba-sync", "fix_encoding:plan-drift-visibility", {',
    'await record("vba-sync", "delete_module:bad-backendPath", {',
    'await record("vba-sync", "verify_code:timeout-remediation", { ...ctx, diff: false });',
    'await record("vba-sync", "generate_erd:path-semantics", { ...ctx, erdPath: tempRoot + "/ERD" });',
    'await record("vba-sync", "validate_manifest:allowlist-check-not-noop", {',
    "const errorEnvelopeArgs = {",
    'query_execute: { mode: "read", sql: "DROP TABLE [ZZZ_DysflowErrorProbe]" },',
    'list_tables: { projectId: "non-existent" },',
    "throw new Error(`Missing deterministic error-envelope probe args for " + "$" + "{tool}`);",
    'await record("query", `' +
      "$" +
      '{tool}:error-envelope-remediation`, args, { expected: "error" });',
    'await record("protocol", "effective-dry-run-default-coherence", { projectId });',
  ])("contains the exact literal %s", (literal) => {
    expect(source).toContain(literal);
  });

  it("keeps the release telemetry schema probe on an explicit bounded view", () => {
    expect(source).toMatch(
      /await record\(\s*"release-telemetry",\s*"schema",\s*\{\s*projectId,\s*view:\s*"index",?\s*\}\s*\);/,
    );
  });

  it("pins every SQL tool named by the issue", () => {
    expect(source).toContain(
      'const sqlTools = ["query_execute", "create_table", "drop_table", "list_access_files",',
    );
    expect(source).toContain('"seed_fixture", "teardown_fixture", "list_tables"];');
  });

  it.each([
    "query_execute",
    "create_table",
    "drop_table",
    "list_access_files",
    "seed_fixture",
    "teardown_fixture",
    "list_tables",
  ])("pins deterministic invalid input for %s", (tool) => {
    const argsBlock = source.slice(
      source.indexOf("const errorEnvelopeArgs = {"),
      source.indexOf("for (const tool of sqlTools)"),
    );

    expect(argsBlock).toMatch(new RegExp(`(?:^|\\n)\\s*${tool}:\\s*\\{`));
  });

  it("makes every probe invalid without relying on missing parameters", () => {
    const argsBlock = source.slice(
      source.indexOf("const errorEnvelopeArgs = {"),
      source.indexOf("for (const tool of sqlTools)"),
    );

    expect(argsBlock).toContain(
      'query_execute: { mode: "read", sql: "DROP TABLE [ZZZ_DysflowErrorProbe]" }',
    );
    expect(argsBlock.match(/projectId: "non-existent"/g)).toHaveLength(6);
  });
});
