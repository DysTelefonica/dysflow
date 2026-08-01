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
    'const errorEnvelopeArgs = { list_access_files: { projectId: "non-existent" } };',
    'await record("query", `' +
      "$" +
      '{tool}:error-envelope-remediation`, errorEnvelopeArgs[tool] ?? {}, { expected: "error" });',
    'await record("protocol", "effective-dry-run-default-coherence", { projectId });',
  ])("contains the exact literal %s", (literal) => {
    expect(source).toContain(literal);
  });

  it("pins every SQL tool named by the issue", () => {
    expect(source).toContain(
      'const sqlTools = ["query_execute", "create_table", "drop_table", "list_access_files",',
    );
    expect(source).toContain('"seed_fixture", "teardown_fixture", "list_tables"];');
  });

  it("keeps list_access_files error coverage invalid after sandbox config resolution", () => {
    expect(source).toContain(
      'const errorEnvelopeArgs = { list_access_files: { projectId: "non-existent" } };',
    );
  });
});
