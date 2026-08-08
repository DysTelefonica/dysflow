import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error The production CLI is JavaScript; its public behavior is exercised here.
import { classifyChanges, validateMarkdown } from "../../scripts/check-documentation-quality.mjs";

type Violation = { readonly rule: string };
const good = "# Documentation\n\n## Quick Path\n\nA short paragraph.\n\n```bash\necho ok\n```\n";
const script = join(process.cwd(), "scripts/check-documentation-quality.mjs");
const check = (cwd: string, base: string, head: string) =>
  execFileSync(process.execPath, [script, "check", "--base", base, "--head", head], { cwd });
describe("documentation quality", () => {
  it("classifies only repository documentation as docs-only and fails closed", () => {
    expect(classifyChanges([{ status: "M", paths: ["README.md"] }]).codeRequired).toBe(false);
    expect(classifyChanges([{ status: "M", paths: ["docs/testing/gate.md"] }]).codeRequired).toBe(
      false,
    );
    for (const path of "src/index.ts openspec/change.md docs/archive/old.md docs/prompts/run.md".split(
      " ",
    ))
      expect(classifyChanges([{ status: "M", paths: [path] }]).codeRequired).toBe(true);
    expect(classifyChanges([]).codeRequired).toBe(true);
    expect(
      classifyChanges([{ status: "R100", paths: ["README.md", "src/readme.md"] }]).codeRequired,
    ).toBe(true);
    expect(classifyChanges([{ status: "?", paths: ["README.md"] }]).codeRequired).toBe(true);
  });
  it("enforces the deterministic subset of documentation-alan-style", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-doc-quality-"));
    await mkdir(join(root, "docs"));
    await writeFile(join(root, "target.md"), "target");
    expect(await validateMarkdown({ path: "docs/good-name.md", content: good, root })).toEqual([]);
    const bad =
      "# One\n# Two\n### Jump\n#### Deep\n\n" +
      "x".repeat(201) +
      "\n\n```\ncode\n```\n\n[bad](missing.md)\n";
    const rules = (await validateMarkdown({ path: "docs/Bad_Name.md", content: bad, root })).map(
      (v: Violation) => v.rule,
    );
    for (const rule of "h1 heading-depth heading-jump fence-language paragraph-length relative-link file-name".split(
      " ",
    ))
      expect(rules).toContain(rule);
  });
  it("checks a real Git diff, ratchets existing debt, and rejects mixed changes", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-doc-git-"));
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
    git("init");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    await mkdir(join(root, "docs"));
    await writeFile(join(root, "docs", "guide.md"), `${good}\n${"x".repeat(201)}`);
    git("add", ".");
    git("commit", "-m", "base");
    const base = git("rev-parse", "HEAD");
    await writeFile(join(root, "docs", "guide.md"), `${good}\nshort now`);
    git("add", ".");
    git("commit", "-m", "docs");
    const docsHead = git("rev-parse", "HEAD");
    expect(() => check(root, base, docsHead)).not.toThrow();
    await writeFile(join(root, "docs", "guide.md"), `${good}\n[new](missing.md)`);
    git("add", ".");
    git("commit", "-m", "broken link");
    expect(() => check(root, docsHead, "HEAD")).toThrow();
    git("reset", "--hard", docsHead);
    const cli = (...argv: string[]) =>
      JSON.parse(
        execFileSync(process.execPath, [script, "classify", ...argv], {
          cwd: root,
          encoding: "utf8",
        }),
      );
    git("mv", "docs/guide.md", "docs/renamed-guide.md");
    git("commit", "-m", "rename");
    const renamedHead = git("rev-parse", "HEAD");
    expect(cli("--base", docsHead, "--head", renamedHead).codeRequired).toBe(false);
    git("rm", "docs/renamed-guide.md");
    git("commit", "-m", "delete");
    const deletedHead = git("rev-parse", "HEAD");
    expect(cli("--base", renamedHead, "--head", deletedHead).codeRequired).toBe(false);
    expect(cli("--base", deletedHead, "--head", deletedHead).codeRequired).toBe(true);
    await writeFile(join(root, "code.ts"), "export {};");
    git("add", ".");
    git("commit", "-m", "mixed");
    expect(cli("--base", deletedHead, "--head", "HEAD")).toMatchObject({ codeRequired: true });
  });
});
