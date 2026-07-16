import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("form import-gate recovery documentation (#888)", () => {
  it("gives consumers a code-driven, rollback-aware recovery contract", async () => {
    const guide = await readFile("docs/diagnostics/form-import-gate-failures.md", "utf8");
    const formSkill = await readFile("skills/access-form-ui-builder/SKILL.md", "utf8");

    expect(guide).toContain("`FORM_IMPORT_GATE_FAILED`");
    expect(guide).toContain("`VBA_IMPORT_FAILED`");
    expect(guide).toContain("`VBA_IMPORT_PHASE_FAILED`");

    for (const phase of ["locate-source", "remove-existing", "import", "compile"]) {
      expect(guide).toContain(`\`${phase}\``);
    }

    expect(guide).toContain("`details.cause`");
    expect(guide).toContain("`details.rollback`");
    expect(guide).toContain("Do not retry blindly");
    expect(guide).toContain("raw Access text");
    expect(guide).toContain("not a stable branching contract");
    expect(guide).toContain('`sync_binary({ direction: "both", dryRun: true })`');
    expect(formSkill).toContain("docs/diagnostics/form-import-gate-failures.md");
  });
});
