import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadProjectConfigCore } from "../../src/core/config/dysflow-config";

const OPERATOR_DOCS = [
  "README.md",
  "docs/architecture/absent-by-design.md",
  "docs/security/adapter-write-gates.md",
  "skills/dysflow-usage/assets/examples/migrate-project-config.md",
] as const;

const CONTRACT_SOURCES = [
  "src/core/config/dysflow-config.ts",
  "src/adapters/mcp/migrate-project-config-tool.ts",
] as const;

const UPGRADE_NOTES = "CHANGELOG.md";
const APPLY_MIGRATION_CALL = "migrate_project_config({ apply: true })";

const workspaces: string[] = [];

afterEach(() => {
  for (const workspace of workspaces.splice(0)) {
    rmSync(workspace, { recursive: true, force: true });
  }
});

function loadLegacyProjectConfig(field: "allowWrites" | "allowedProcedures") {
  const root = mkdtempSync(join(tmpdir(), "dysflow-removed-config-fields-"));
  workspaces.push(root);
  mkdirSync(join(root, ".dysflow"), { recursive: true });
  writeFileSync(join(root, "app.accdb"), "", "utf8");

  return loadProjectConfigCore(
    join(root, ".dysflow", "project.json"),
    {
      accessPath: "app.accdb",
      [field]: field === "allowWrites" ? true : ["Test_Example"],
    },
    { cwd: root, env: {} },
    {},
    "repo-config",
    undefined,
  );
}

describe("#1580 removed top-level project config fields", () => {
  it.each([
    ["allowWrites", "capabilities.allowWrites"],
    ["allowedProcedures", "capabilities.procedures.allow"],
  ] as const)("anchors %s documentation to the runtime rejection", (field, replacement) => {
    const result = loadLegacyProjectConfig(field);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected removed top-level field to be rejected");
    expect(result.error.code).toBe("CONFIG_TOP_LEVEL_FIELDS_REMOVED");
    expect(result.error.message).toContain(field);
    expect(result.error.message).toContain(replacement);
  });

  it("anchors the runtime remediation to the v4.0.3 upgrade note", async () => {
    const result = loadLegacyProjectConfig("allowWrites");
    const changelog = await readFile(UPGRADE_NOTES, "utf8");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected removed top-level field to be rejected");
    expect(result.error.message).toContain("migrate_project_config");
    expect(result.error.message).toContain(APPLY_MIGRATION_CALL);
    expect(changelog).toContain("## [v4.0.3]");
    expect(changelog).toContain("### Breaking changes");
    expect(changelog).toContain("CONFIG_TOP_LEVEL_FIELDS_REMOVED");
    expect(changelog).toContain(APPLY_MIGRATION_CALL);
  });

  it.each(
    OPERATOR_DOCS,
  )("documents the runtime error and both canonical replacements in %s", async (path) => {
    const text = await readFile(path, "utf8");

    expect(text).toContain("CONFIG_TOP_LEVEL_FIELDS_REMOVED");
    expect(text).toContain("capabilities.allowWrites");
    expect(text).toContain("capabilities.procedures.allow");
  });

  it.each([
    ...OPERATOR_DOCS,
    ...CONTRACT_SOURCES,
  ])("does not describe removed fields as live read-through aliases in %s", async (path) => {
    const text = await readFile(path, "utf8");

    expect(text).not.toMatch(/kept as (?:deprecated )?read-through aliases?/i);
    expect(text).not.toMatch(/read-through aliases? until v1\.15\.0/i);
    expect(text).not.toMatch(/read-through fallback to the deprecated top-level/i);
  });
});
