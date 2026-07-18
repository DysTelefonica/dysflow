/**
 * Issue #961 (B component) — codegraph-supplement-drift-detector
 *
 * Pure kernel: detects stale `codegraph-vba` runtime version references
 * inside `<!-- user-supplement:* --> ... <!-- /user-supplement:* -->` blocks
 * of user-global instruction files (e.g. `~/.config/opencode/AGENTS.md`).
 *
 * The kernel is port-injected so the core layer stays free of `node:fs`
 * imports. The composition root at `src/cli/commands/codegraph-supplement-drift-check.ts`
 * supplies the Node `readFile` adapter for the live user-home scan that the
 * `dysflow doctor` pre-flight invokes.
 *
 * Acceptance: any line inside a `<!-- user-supplement:* -->` block whose
 * prose contains a literal `codegraph-vba vN.M.K` or `codegraph-vba vN.M`
 * (major.minor[.patch]) reference is flagged with the file path, the line
 * number, the offending snippet, and a remediation hint.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_INSTRUCTION_FILE_PATHS,
  detectSupplementDrift,
  type InstructionFileReadPort,
  type SupplementDriftFinding,
  scanSupplementDriftInContent,
} from "../../../src/core/services/codegraph-supplement-drift-detector";

// ---------------------------------------------------------------------------
// Pure kernel — content-level drift detection
// ---------------------------------------------------------------------------

describe("codegraph-supplement-drift-detector — pure kernel", () => {
  it("flags a literal `codegraph-vba v1.10.0` reference inside a supplement block", () => {
    const content = [
      "<!-- user-supplement:foo:bar -->",
      "## Heading",
      "For the full contract, see skill `codegraph-usage` v1.2 — runtime version codegraph-vba v1.10.0.",
      "<!-- /user-supplement:foo:bar -->",
    ].join("\n");

    const findings = scanSupplementDriftInContent(content, "/home/u/.config/opencode/AGENTS.md");

    expect(findings).toHaveLength(1);
    const finding = findings[0] as SupplementDriftFinding;
    expect(finding).toMatchObject({
      filePath: "/home/u/.config/opencode/AGENTS.md",
      blockId: "foo:bar",
      line: 3,
      snippet: expect.stringContaining("codegraph-vba v1.10.0"),
    });
    expect(finding.remediation).toMatch(/codegraph --version/i);
    expect(finding.matchedVersion).toBe("v1.10.0");
  });

  it("flags a major.minor-only reference (no patch) inside a supplement block", () => {
    const content = [
      "<!-- user-supplement:ardelperal:codegraph-extra-tools -->",
      "Live runtime version: codegraph-vba v1.10",
      "<!-- /user-supplement:ardelperal:codegraph-extra-tools -->",
    ].join("\n");

    const findings = scanSupplementDriftInContent(content, "C:/u/AGENTS.md");

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      blockId: "ardelperal:codegraph-extra-tools",
      matchedVersion: "v1.10",
      line: 2,
    });
  });

  it("flags prose like 'v1.10.0 semantics' inside a supplement block", () => {
    const content = [
      "<!-- user-supplement:ardelperal:codegraph-extra-tools -->",
      "the user-owned source of truth for v1.10.0 semantics",
      "<!-- /user-supplement:ardelperal:codegraph-extra-tools -->",
    ].join("\n");

    const findings = scanSupplementDriftInContent(content, "AGENTS.md");

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      matchedVersion: "v1.10.0",
      line: 2,
    });
    expect(findings[0]?.snippet).toContain("v1.10.0 semantics");
  });

  it("ignores references OUTSIDE user-supplement blocks", () => {
    const content = [
      "# Heading",
      "Pre-block prose: codegraph-vba v1.10.0",
      "<!-- user-supplement:foo -->",
      "Inside block: nothing flagged here.",
      "<!-- /user-supplement:foo -->",
      "Post-block prose: codegraph-vba v1.9.5",
    ].join("\n");

    const findings = scanSupplementDriftInContent(content, "AGENTS.md");

    expect(findings).toEqual([]);
  });

  it("ignores references inside `<!-- gentle-ai:* -->` blocks (managed by gentle-ai sync)", () => {
    const content = [
      "<!-- gentle-ai:codegraph-guidance -->",
      "codegraph-vba v1.10.0 should not flag here.",
      "<!-- /gentle-ai:codegraph-guidance -->",
    ].join("\n");

    const findings = scanSupplementDriftInContent(content, "AGENTS.md");

    expect(findings).toEqual([]);
  });

  it("ignores skill-version references (e.g. `codegraph-usage v1.2`) — only `codegraph-vba vX.Y[.Z]` flags", () => {
    const content = [
      "<!-- user-supplement:foo -->",
      "Skill codegraph-usage v1.2 lives at C:/skills/codegraph-usage/SKILL.md.",
      "<!-- /user-supplement:foo -->",
    ].join("\n");

    const findings = scanSupplementDriftInContent(content, "AGENTS.md");

    expect(findings).toEqual([]);
  });

  it("reports every match inside a multi-block file (one finding per offending line)", () => {
    const content = [
      "<!-- user-supplement:a -->",
      "first drift: codegraph-vba v1.10.0",
      "<!-- /user-supplement:a -->",
      "",
      "<!-- user-supplement:b -->",
      "no drift here.",
      "second drift: codegraph-vba v2.0.0",
      "<!-- /user-supplement:b -->",
    ].join("\n");

    const findings = scanSupplementDriftInContent(content, "AGENTS.md");

    expect(findings.map((f) => f.matchedVersion)).toEqual(["v1.10.0", "v2.0.0"]);
    expect(findings[0]).toMatchObject({ blockId: "a", line: 2 });
    expect(findings[1]).toMatchObject({ blockId: "b", line: 7 });
  });

  it("handles a missing closing marker gracefully — emits a warning finding and does not throw", () => {
    const content = ["<!-- user-supplement:malformed -->", "codegraph-vba v1.10.0"].join("\n");

    const findings = scanSupplementDriftInContent(content, "AGENTS.md");

    expect(findings.some((f) => f.matchedVersion === "v1.10.0")).toBe(true);
    expect(findings.some((f) => f.malformedClosing === true)).toBe(true);
  });

  it("returns no findings for a clean content", () => {
    const content = [
      "# AGENTS.md",
      "",
      "<!-- user-supplement:foo -->",
      "Generic documentation prose with no version reference.",
      "<!-- /user-supplement:foo -->",
    ].join("\n");

    expect(scanSupplementDriftInContent(content, "AGENTS.md")).toEqual([]);
  });

  it("ignores files whose scan returns empty content (zero-byte file is clean)", () => {
    expect(scanSupplementDriftInContent("", "AGENTS.md")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Multi-file scan with a port — error / skip semantics
// ---------------------------------------------------------------------------

describe("codegraph-supplement-drift-detector — port-based multi-file scan", () => {
  it("scans a fixed file list, collects per-file drift, and reports filesScanned / blocksScanned", async () => {
    const port: InstructionFileReadPort = {
      readFile: async (filePath) => {
        if (filePath.endsWith("a.md")) {
          return [
            "<!-- user-supplement:a -->",
            "codegraph-vba v1.10.0",
            "<!-- /user-supplement:a -->",
          ].join("\n");
        }
        if (filePath.endsWith("b.md")) {
          return ["<!-- user-supplement:b -->", "clean block", "<!-- /user-supplement:b -->"].join(
            "\n",
          );
        }
        throw new Error(`unexpected path ${filePath}`);
      },
    };

    const result = await detectSupplementDrift({
      filePaths: ["a.md", "b.md"],
      port,
    });

    expect(result.filesScanned).toBe(2);
    expect(result.blocksScanned).toBe(2);
    expect(result.driftDetected).toHaveLength(1);
    expect(result.driftDetected[0]).toMatchObject({
      filePath: "a.md",
      matchedVersion: "v1.10.0",
      blockId: "a",
    });
    expect(result.errors).toEqual([]);
  });

  it("skips a missing file gracefully — adds to `errors` with code FILE_READ_FAILED", async () => {
    const port: InstructionFileReadPort = {
      readFile: async (filePath) => {
        if (filePath.endsWith("exists.md")) {
          return "<!-- user-supplement:clean -->no drift<!-- /user-supplement:clean -->";
        }
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      },
    };

    const result = await detectSupplementDrift({
      filePaths: ["exists.md", "missing.md"],
      port,
    });

    expect(result.filesScanned).toBe(1);
    expect(result.driftDetected).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      filePath: "missing.md",
      code: "FILE_READ_FAILED",
    });
  });

  it("counts blocks correctly when a file has multiple supplement blocks", async () => {
    const port: InstructionFileReadPort = {
      readFile: async () =>
        [
          "<!-- user-supplement:a -->",
          "codegraph-vba v1.10.0",
          "<!-- /user-supplement:a -->",
          "<!-- user-supplement:b -->",
          "codegraph-vba v1.11.0",
          "<!-- /user-supplement:b -->",
        ].join("\n"),
    };

    const result = await detectSupplementDrift({
      filePaths: ["multi.md"],
      port,
    });

    expect(result.filesScanned).toBe(1);
    expect(result.blocksScanned).toBe(2);
    expect(result.driftDetected).toHaveLength(2);
  });

  it("returns ok=false when drift is detected (so doctor can flip exit code)", async () => {
    const port: InstructionFileReadPort = {
      readFile: async () =>
        ["<!-- user-supplement:a -->", "codegraph-vba v1.10.0", "<!-- /user-supplement:a -->"].join(
          "\n",
        ),
    };

    const result = await detectSupplementDrift({
      filePaths: ["x.md"],
      port,
    });

    expect(result.ok).toBe(false);
    expect(result.driftDetected).toHaveLength(1);
  });

  it("returns ok=true when no drift is found across the supplied file list", async () => {
    const port: InstructionFileReadPort = {
      readFile: async () =>
        ["<!-- user-supplement:a -->", "clean prose", "<!-- /user-supplement:a -->"].join("\n"),
    };

    const result = await detectSupplementDrift({
      filePaths: ["clean.md"],
      port,
    });

    expect(result.ok).toBe(true);
    expect(result.driftDetected).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Default file list — well-known user-global instruction files
// ---------------------------------------------------------------------------

describe("codegraph-supplement-drift-detector — default file list", () => {
  it("exposes a non-empty default list rooted at .config/opencode", () => {
    expect(DEFAULT_INSTRUCTION_FILE_PATHS.length).toBeGreaterThan(0);
    for (const relative of DEFAULT_INSTRUCTION_FILE_PATHS) {
      expect(relative.replace(/\\/g, "/")).toMatch(/^\.config\/opencode\//);
    }
  });

  it("includes AGENTS.md as a baseline reference", () => {
    expect(DEFAULT_INSTRUCTION_FILE_PATHS).toContain(".config/opencode/AGENTS.md");
  });
});
