import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const RELEASE_YML = ".github/workflows/release.yml";
const GUARD_YML = ".github/workflows/release-title-guard.yml";

function readText(path: string): string {
  return readFileSync(path, "utf8");
}

/** Detect whether the `bash` binary is reachable on the current PATH. */
function bashAvailable(): boolean {
  const probe = spawnSync("bash", ["-c", "echo ok"], { stdio: "ignore" });
  return probe.status === 0;
}

/**
 * Extract the inline `run:` block scalar from a workflow file. The workflow
 * uses `run: |` (block scalar) so the body is the indented text under the
 * `run:` line. We capture greedily to end-of-string (the release-title-guard
 * workflow has a single `run:` block) and then strip the common leading
 * indentation so the result is a runnable shell script.
 */
function extractRunBlock(workflow: string): string {
  const match = /run:\s*\|\s*\n([\s\S]+)$/.exec(workflow);
  if (!match || match[1] === undefined) {
    throw new Error("could not extract `run:` block from workflow");
  }
  const lines = match[1].split("\n");
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
 * Render the extracted `run:` block with concrete fixture values for the two
 * GitHub Actions templated expressions the guard relies on. Mirrors what the
 * GitHub-hosted runner does at runtime: `${{ ... }}` expands to a raw string
 * (the workflow's own `"${{ ... }}"` quotes wrap the value), so we substitute
 * the raw value here, NOT a quoted one. Adding quotes would produce `""foo""`
 * and break `[`: too many arguments`.
 */
function renderGuardScript(runBlock: string, title: string, tagName: string): string {
  return runBlock
    .replace(/\${{\s*github\.event\.release\.title\s*}}/g, title)
    .replace(/\${{\s*github\.event\.release\.tag_name\s*}}/g, tagName);
}

describe("release title == tag_name CI guard (#621, F4)", () => {
  describe("release.yml — defense-in-depth #1: explicit release name", () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions template syntax in test name
    it("passes name: ${{ github.ref_name }} to softprops/action-gh-release@v3", () => {
      const workflow = readText(RELEASE_YML);

      // Sanity: the softprops call is the only `Create GitHub Release` step.
      expect(workflow).toContain("uses: softprops/action-gh-release@v3");

      // The release's `name:` field is set to the tag so the published artifact
      // matches the tag by construction. AGENTS.md line 85 calls this out as a
      // hard rule; this parameter makes it structural.
      // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions template syntax, not a JS template literal
      expect(workflow).toContain("name: ${{ github.ref_name }}");
    });
  });

  describe("release-title-guard.yml — defense-in-depth #2: drift fails the job", () => {
    it("exists", () => {
      expect(existsSync(GUARD_YML), `${GUARD_YML} must exist`).toBe(true);
    });

    it("triggers on release: [created, edited]", () => {
      const workflow = readText(GUARD_YML);

      expect(workflow).toMatch(
        /on:\s*\n\s*release:\s*\n\s*types:\s*\[\s*created\s*,\s*edited\s*\]/,
      );
    });

    it("declares a job on ubuntu-latest with minimal permissions", () => {
      const workflow = readText(GUARD_YML);

      expect(workflow).toContain("permissions:");
      expect(workflow).toContain("contents: read");
      expect(workflow).toMatch(/runs-on:\s*ubuntu-latest/);
    });

    it("compares github.event.release.title against github.event.release.tag_name", () => {
      const workflow = readText(GUARD_YML);

      // Both templated values MUST be referenced in the script so the guard
      // has the data it needs to do the comparison.
      // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions template syntax, not a JS template literal
      expect(workflow).toContain("${{ github.event.release.title }}");
      // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions template syntax, not a JS template literal
      expect(workflow).toContain("${{ github.event.release.tag_name }}");
    });

    it("exits 1 and prints both values to stderr on drift", () => {
      const workflow = readText(GUARD_YML);

      // The script MUST exit non-zero on drift (the only way the job fails).
      expect(workflow).toContain("exit 1");

      // The error output MUST name both values so a maintainer can see what
      // to fix without re-running the workflow.
      expect(workflow).toMatch(/title\s*=/);
      expect(workflow).toMatch(/tag_name\s*=/);
    });
  });

  describe("extracted guard script — actual shell semantics", () => {
    it.runIf(bashAvailable())("exits 1 with both values on stderr when title != tag_name", () => {
      const workflow = readText(GUARD_YML);
      const runBlock = extractRunBlock(workflow);

      const title = "Release 1.13.0";
      const tagName = "v1.13.0";
      const rendered = renderGuardScript(runBlock, title, tagName);

      const result = spawnSync("bash", ["-c", rendered], { encoding: "utf8" });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(title);
      expect(result.stderr).toContain(tagName);
    });

    it.runIf(bashAvailable())("exits 0 (no drift) when title == tag_name", () => {
      const workflow = readText(GUARD_YML);
      const runBlock = extractRunBlock(workflow);

      const title = "v1.13.0";
      const tagName = "v1.13.0";
      const rendered = renderGuardScript(runBlock, title, tagName);

      const result = spawnSync("bash", ["-c", rendered], { encoding: "utf8" });

      expect(result.status).toBe(0);
    });
  });
});
