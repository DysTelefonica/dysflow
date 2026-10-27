import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// #1964: a bundled skill that names another skill must name one an agent can
// load. A reference resolves when `skills/<name>/SKILL.md` exists. A retired
// skill may still be named, but only from the retirement register itself or on
// a line that says it is retired — never as a destination to go to.

const REPO_ROOT = process.cwd();
const SKILLS_ROOT = join(REPO_ROOT, "skills");
const DEPRECATED_REGISTER = "skills/dysflow-codegraph-update/references/deprecated-skills.md";

// Backtick-quoted tokens whose first path segment looks like a skill name.
// Tokens with a dot in that segment (`dysflow-vba-manager.ps1`) are files.
const SKILL_LIKE = /^((?:vba|access|dysflow)-[a-z0-9]+(?:-[a-z0-9]+)*)(?:\/.*)?$/;
const HISTORICAL_LINE = /retir|deprecat|obsolet/i;

// Skill-shaped identifiers that are not skills.
const NOT_SKILLS = new Map<string, string>([
  ["vba-test-manifest", "CodeGraph edge tag on Test_* references (vba-source-impact)"],
  ["dysflow-plugin", "plugin namespace (plugin/claude-code/.claude-plugin/plugin.json)"],
]);

function markdownFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(full);
    return entry.name.endsWith(".md") ? [full] : [];
  });
}

function toRepoPath(file: string): string {
  return relative(REPO_ROOT, file).replaceAll("\\", "/");
}

function retiredSkills(): Set<string> {
  const text = readFileSync(join(REPO_ROOT, DEPRECATED_REGISTER), "utf8");
  const retired = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const firstCell = /^\|([^|]+)\|/.exec(line)?.[1];
    if (!firstCell) continue;
    for (const [, name] of firstCell.matchAll(/`([^`]+)`/g)) if (name) retired.add(name);
  }
  return retired;
}

function skillExists(name: string): boolean {
  return existsSync(join(SKILLS_ROOT, name, "SKILL.md"));
}

describe("bundled skill references resolve (#1964)", () => {
  it("every skill-like name in skills/**/*.md names a loadable skill", () => {
    const retired = retiredSkills();
    const unresolved: string[] = [];

    for (const file of markdownFiles(SKILLS_ROOT)) {
      const repoPath = toRepoPath(file);
      const inRegister = repoPath === DEPRECATED_REGISTER;
      readFileSync(file, "utf8")
        .split(/\r?\n/)
        .forEach((line, index) => {
          for (const match of line.matchAll(/`([^`\s]+)`/g)) {
            const name = SKILL_LIKE.exec(match[1] ?? "")?.[1];
            if (!name || NOT_SKILLS.has(name) || skillExists(name)) continue;
            if (retired.has(name) && (inRegister || HISTORICAL_LINE.test(line))) continue;
            const why = retired.has(name)
              ? "retired skill named as a destination"
              : "no such skill";
            unresolved.push(`${repoPath}:${index + 1} \`${name}\` (${why})`);
          }
        });
    }

    expect(unresolved, unresolved.join("\n")).toEqual([]);
  });

  it("every retired skill in the register is really gone", () => {
    const stillPresent = [...retiredSkills()].filter(skillExists);
    expect(stillPresent).toEqual([]);
  });
});
