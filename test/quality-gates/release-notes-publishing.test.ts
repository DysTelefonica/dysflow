import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const script = resolve("scripts/check-release-notes.mjs");
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const headings = [
  "Summary",
  "Provenance",
  "Integrated pull requests",
  "Verification evidence",
  "Compatibility and configuration",
  "Upgrade and rollback",
  "Closure register",
];
const valid = (tag: string) =>
  `# ${tag}\n\n${headings.map((h) => `## ${h}\n\nEvidence.\n`).join("\n")}`;

describe("published release notes", () => {
  it("passes the tag-specific notes file to the publishing action", () => {
    const workflow = readFileSync(resolve(".github/workflows/release.yml"), "utf8");
    const action = workflow.slice(workflow.indexOf("uses: softprops/action-gh-release@"));
    const path = action.match(/^\s+body_path:\s*(.+)$/m)?.[1];
    expect(path, "the publisher must receive the materialized notes").toBeDefined();
    const pkg = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
    const currentPath = path?.replace(/\$\{\{\s*github\.ref_name\s*\}\}/, `v${pkg.version}`) ?? "";
    expect(readFileSync(resolve(currentPath), "utf8").trim()).not.toBe("");
  });

  it("validates notes before the release build and its dependent heavy jobs", () => {
    const workflow = readFileSync(resolve(".github/workflows/release.yml"), "utf8");
    const check = workflow.indexOf('node scripts/check-release-notes.mjs "$RELEASE_TAG"');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(workflow.indexOf("run: pnpm build"));
  });

  it("documents usage and refuses an unrecognized explicit option", () => {
    const help = spawnSync(process.execPath, [script, "--help"], {
      encoding: "utf8",
      windowsHide: true,
    });
    expect(help.status).toBe(0);
    expect(help.stdout).toBe("Usage: node scripts/check-release-notes.mjs <version-tag>\n");
    expect(help.stderr).toBe("");
    const rejected = spawnSync(process.execPath, [script, "v4.5.10", "--skip"], {
      encoding: "utf8",
      windowsHide: true,
    });
    expect(rejected.status).toBe(1);
    expect(rejected.stdout).toBe("");
    expect(rejected.stderr).toContain("Usage:");
  });

  it.each([
    { tag: "v1.2.3", notes: valid("v1.2.3"), success: true },
    { tag: "v1.2.3-rc.1", notes: valid("v1.2.3-rc.1"), success: true },
    { tag: "v1.2.3", notes: undefined, success: false },
    { tag: "v1.2.3", notes: " \n", success: false },
    { tag: "v1.2.3", notes: valid("v1.2.4"), success: false },
    {
      tag: "v1.2.3",
      notes: valid("v1.2.3").replace("## Closure register", "## Other"),
      success: false,
    },
    { tag: "../outside", notes: undefined, success: false },
  ])(
    "validates the notes command at its file/process boundary: $tag / $success",
    ({ tag, notes, success }) => {
      const root = mkdtempSync(join(tmpdir(), "dysflow-release-notes-test-"));
      roots.push(root);
      const dir = join(root, "docs", "releases", tag);
      mkdirSync(dir, { recursive: true });
      const path = join(dir, "release-notes.md");
      if (notes !== undefined) writeFileSync(path, notes);
      const result = spawnSync(process.execPath, [script, tag], {
        cwd: root,
        encoding: "utf8",
        windowsHide: true,
        timeout: 10_000,
      });
      expect(result.status).toBe(success ? 0 : 1);
      expect(result.stdout).toBe(success ? `Validated release notes for ${tag}.\n` : "");
      if (success) expect(result.stderr).toBe("");
      else expect(result.stderr).toContain("Release notes validation failed:");
      if (notes !== undefined) expect(readFileSync(path, "utf8")).toBe(notes);
    },
  );
});
