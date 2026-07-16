import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const RELEASE_YML = ".github/workflows/release.yml";
// #895 — the independent workflow covers human edits. Creation remains guarded
// inline in release.yml because GITHUB_TOKEN-created releases do not reliably
// trigger another workflow.
const GUARD_YML = ".github/workflows/release-title-guard.yml";
const GUARD_SCRIPT = ".github/scripts/check-release-title.mjs";

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

/**
 * Extract the inline `run:` block scalar from the workflow. The workflow uses
 * `run: |` (block scalar) so the body is the indented text under the `run:`
 * line. We capture the LAST `run: |` block (the new assert-release-name step)
 * because it is the one that runs the assertion; earlier `run: |` blocks
 * (build, sign) are not what this test cares about.
 */
function extractLastRunBlock(workflow: string): string {
  const matches = [
    ...workflow.matchAll(/run:\s*\|\s*\n([\s\S]+?)(?=\n {10}[a-z-]+:\s|\n[a-z-]+:\s|$)/g),
  ];
  const last = matches[matches.length - 1];
  if (!last || last[1] === undefined) {
    throw new Error("could not extract last `run:` block from workflow");
  }
  const lines = last[1].split("\n");
  const indents = lines
    .filter((l) => l.trim().length > 0)
    .map((l) => l.match(/^ */)?.[0].length ?? 0);
  const minIndent = indents.length > 0 ? Math.min(...indents) : 0;
  return lines
    .map((l) => l.slice(minIndent))
    .join("\n")
    .trim();
}

/**
 * Render the extracted `run:` block with a concrete fixture value for both
 * forms of the GitHub Actions expression: `${{ github.ref_name }}` (templated)
 * and `${GITHUB_REF_NAME}` (extracted at runtime). The new assert step uses
 * `gh release view` to fetch the live release, so the test stubs that call
 * to control the simulated output.
 */
function renderAssertScript(runBlock: string, tagName: string): string {
  return runBlock
    .replace(/\${{\s*github\.ref_name\s*}}/g, tagName)
    .replace(/\$\{GITHUB_REF_NAME\}/g, tagName);
}

describe("release name == tag_name CI guard (#668)", () => {
  describe("release.yml — defense-in-depth #1: explicit release name", () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions template syntax in test name
    it("passes name: ${{ github.ref_name }} to softprops/action-gh-release@v3", () => {
      const workflow = readText(RELEASE_YML);
      expect(workflow).toContain("uses: softprops/action-gh-release@v3");
      // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions template syntax, not a JS template literal
      expect(workflow).toContain("name: ${{ github.ref_name }}");
    });
  });

  describe("release.yml — defense-in-depth #2: post-create assert step (#668)", () => {
    it("contains an assert-release-name step that queries the live release via gh", () => {
      const workflow = readText(RELEASE_YML);
      expect(workflow).toMatch(/gh release view[\s\S]*--json\s+name[\s\S]*--jq\s+\.name/);
      expect(workflow).toMatch(/RELEASE_NAME.*!=.*TAG/);
    });

    it("exits 1 on drift with both values labelled to stderr", () => {
      const workflow = readText(RELEASE_YML);
      expect(workflow).toContain("exit 1");
      expect(workflow).toMatch(/name\s*=/);
      expect(workflow).toMatch(/tag\s*=/);
    });
  });

  describe("release-title-guard.yml — post-creation edit enforcement (#895)", () => {
    it("runs only for release edits with read-only repository permissions", () => {
      expect(existsSync(GUARD_YML)).toBe(true);
      const workflow = readText(GUARD_YML);
      expect(workflow).toMatch(/release:\s*\n\s+types:\s*\[edited\]/);
      expect(workflow).not.toMatch(/types:\s*\[[^\]]*created/);
      expect(workflow).toMatch(/permissions:\s*\n\s+contents:\s*read/);
      expect(workflow).not.toMatch(/contents:\s*write/);
      // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression syntax
      expect(workflow).toContain("ref: ${{ github.event.repository.default_branch }}");
      expect(workflow).toContain("persist-credentials: false");
    });

    it("pins the real release event fields name and tag_name", () => {
      const workflow = readText(GUARD_YML);
      // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression syntax
      expect(workflow).toContain("${{ github.event.release.name }}");
      // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression syntax
      expect(workflow).toContain("${{ github.event.release.tag_name }}");
      expect(workflow).not.toContain("github.event.release.title");
    });

    it.each([
      ["v2.13.4", "v2.13.4", 0],
      ["Dysflow v2.13.4", "v2.13.4", 1],
    ])("validates release name %s against tag %s", (name, tag, expectedStatus) => {
      const result = spawnSync(process.execPath, [GUARD_SCRIPT], {
        encoding: "utf8",
        env: { ...process.env, RELEASE_NAME: name, RELEASE_TAG_NAME: tag },
      });
      expect(result.status).toBe(expectedStatus);
      if (expectedStatus !== 0) {
        expect(result.stderr).toContain(`name     = ${name}`);
        expect(result.stderr).toContain(`tag_name = ${tag}`);
        expect(result.stderr).toContain("Restore the release title");
      }
    });
  });

  describe("extracted assert script — text-level invariants", () => {
    it("renders the script with the comparison logic intact", () => {
      const workflow = readText(RELEASE_YML);
      const runBlock = extractLastRunBlock(workflow);
      expect(runBlock).toContain("gh release view");
      expect(runBlock).toContain("--json name");
      expect(runBlock).toContain("--jq .name");
      expect(runBlock).toMatch(/RELEASE_NAME.*!=.*TAG/);
      expect(runBlock).toContain('echo "Release name must equal tag_name."');
      expect(runBlock).toMatch(/name\s*=/);
      expect(runBlock).toMatch(/tag\s*=/);
      expect(runBlock).toContain("exit 1");
    });

    it("the rendered script substitutes the tag name correctly", () => {
      // Verifies the renderAssertScript helper in isolation — no shell, just
      // confirms that the helper produces a script where TAG is set to the
      // supplied value. This is the deterministic part of the previous
      // bash-spawning tests; the non-deterministic part (actual exit code)
      // is left to CI on Ubuntu where the bash semantics are stable.
      const workflow = readText(RELEASE_YML);
      const runBlock = extractLastRunBlock(workflow);
      const rendered = renderAssertScript(runBlock, "v9.9.9-rc1");
      expect(rendered).toContain('TAG="v9.9.9-rc1"');
      // Make sure no templated syntax leaked through into the rendered form.
      expect(rendered).not.toMatch(/\${{/);
      expect(rendered).not.toContain("$" + "{GITHUB_REF_NAME}");
    });
  });
});
