import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

async function text(relativePath: string): Promise<string> {
  return await readFile(path.join(repoRoot, relativePath), "utf8");
}

describe("dysflow-codegraph-update ownership contract", () => {
  it("separates release-owned runtime skills from canonical personal consumers", async () => {
    const skill = await text("skills/dysflow-codegraph-update/SKILL.md");

    expect(skill).toMatch(/exactly six Dysflow-owned runtime skills/i);
    for (const name of [
      "access-form-ui-builder",
      "dysflow-arnes",
      "dysflow-usage",
      "dysflow-codegraph-update",
      "dysflow-examples-sync",
      "dysflow-pointer-rollout",
    ]) {
      expect(skill).toContain(`\`${name}\``);
    }
    expect(skill).toMatch(/\$PERSONAL_SKILLS_DIR.*~\/personal-skills\/skills/is);
    expect(skill).toMatch(/installed mirrors are read-only evidence/i);
  });

  it("pins the five runtime adapter SkillsDirs without assigning Dysflow ownership elsewhere", async () => {
    const procedure = await text("skills/dysflow-codegraph-update/references/procedure.md");

    expect(procedure).toMatch(/exactly five runtime adapter SkillsDirs/i);
    for (const target of [
      "~/.config/opencode/skills/",
      "~/.claude/skills/",
      "~/.codex/skills/",
      "~/.cursor/skills/",
      "~/.pi/agent/skills/",
    ]) {
      expect(procedure).toContain(`\`${target}\``);
    }
    expect(procedure).toMatch(
      /not Dysflow targets.*~\/\.agents\/skills\/.*~\/\.opencode\/skills\//is,
    );
  });

  it("delegates personal propagation to the personal-skills repository", async () => {
    const procedure = await text("skills/dysflow-codegraph-update/references/procedure.md");

    expect(procedure).toContain(
      "testing/suites/refresh-personal-symlinks/refresh-personal-symlinks.sh",
    );
    expect(procedure).toContain("bin/link-personal-skills.ps1 -DryRun");
    expect(procedure).toMatch(/post-commit hook/i);
    expect(procedure).not.toMatch(/\b\d+ personal skills\b/i);
  });

  it("requires a schema-derived audit of personal Dysflow consumer skills", async () => {
    const skill = await text("skills/dysflow-codegraph-update/SKILL.md");
    const procedure = await text("skills/dysflow-codegraph-update/references/procedure.md");

    expect(skill).toMatch(/consumer-skill semantic audit/i);
    for (const evidence of ["schema index", "inputSchema", "resultContract", "migrationNotes"]) {
      expect(procedure).toContain(`\`${evidence}\``);
    }
    expect(procedure).toMatch(/historical examples.*separately/is);
    expect(procedure).toMatch(/dirty.*do not edit/is);
    expect(procedure).toMatch(/unknown tool.*unknown parameter.*invalid enum/is);
  });
});
