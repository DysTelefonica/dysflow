/**
 * Issue #961 (A component) — supplement drift auto-rewrite kernel.
 *
 * Pure kernel: rewrites stale `codegraph-vba` runtime version references
 * inside `<!-- user-supplement:* -->` blocks to runtime-neutral phrasing
 * with a `codegraph --version` pointer. This is the preferred fix (a) from
 * the issue: it removes per-release churn from the human instead of only
 * flagging it (B component, shipped in #999).
 *
 * Behavior contract:
 * - Only prose INSIDE user-supplement blocks is rewritten; gentle-ai
 *   managed blocks and prose outside any block are untouched.
 * - A file whose supplement block never closes (malformed closing marker)
 *   is NOT rewritten — fail closed on structural damage, mirroring the
 *   import-side philosophy of #958.
 * - The rewrite is idempotent and detector-clean: running the detector on
 *   rewritten content yields zero findings, and re-rewriting yields zero
 *   further rewrites.
 * - Line endings (CRLF vs LF) and untouched lines are preserved verbatim.
 */

import { describe, expect, it } from "vitest";
import {
  applySupplementDriftFix,
  type InstructionFileReadWritePort,
  rewriteSupplementDriftInContent,
  scanSupplementDriftInContent,
} from "../../../src/core/services/codegraph-supplement-drift-detector";

describe("rewriteSupplementDriftInContent — pure kernel", () => {
  it("rewrites a strict `codegraph-vba vX.Y.Z` reference to a runtime-neutral pointer", () => {
    const content = [
      "<!-- user-supplement:ardelperal:codegraph-extra-tools -->",
      "Runtime version codegraph-vba v1.10.0 documents the tool surface.",
      "<!-- /user-supplement:ardelperal:codegraph-extra-tools -->",
    ].join("\n");

    const result = rewriteSupplementDriftInContent(content, "AGENTS.md");

    expect(result.malformedClosing).toBe(false);
    expect(result.rewrites).toHaveLength(1);
    expect(result.rewrites[0]).toMatchObject({
      filePath: "AGENTS.md",
      blockId: "ardelperal:codegraph-extra-tools",
      line: 2,
      matchedVersion: "v1.10.0",
    });
    expect(result.content).not.toContain("v1.10.0");
    expect(result.content).toContain("codegraph --version");
    // Markers and surrounding lines stay verbatim.
    expect(result.content.split("\n")[0]).toBe(
      "<!-- user-supplement:ardelperal:codegraph-extra-tools -->",
    );
  });

  it("rewrites loose prose like 'v1.10.0 semantics' to neutral phrasing keeping the keyword", () => {
    const content = [
      "<!-- user-supplement:a:b -->",
      "the user-owned source of truth for v1.10.0 semantics",
      "<!-- /user-supplement:a:b -->",
    ].join("\n");

    const result = rewriteSupplementDriftInContent(content, "AGENTS.md");

    expect(result.rewrites).toHaveLength(1);
    const line = result.content.split("\n")[1] ?? "";
    expect(line).not.toContain("v1.10.0");
    expect(line).toContain("semantics");
    expect(line).toContain("codegraph --version");
  });

  it("leaves skill-version references (e.g. `codegraph-usage` v1.2) untouched", () => {
    const content = [
      "<!-- user-supplement:a:b -->",
      "See skill `codegraph-usage` v1.2 in the skills catalog.",
      "<!-- /user-supplement:a:b -->",
    ].join("\n");

    const result = rewriteSupplementDriftInContent(content, "AGENTS.md");

    expect(result.rewrites).toHaveLength(0);
    expect(result.content).toBe(content);
  });

  it("does not rewrite outside supplement blocks or inside gentle-ai managed blocks", () => {
    const content = [
      "codegraph-vba v1.10.0 outside any block",
      "<!-- user-supplement:a:b -->",
      "<!-- gentle-ai:managed -->",
      "codegraph-vba v1.10.0 inside gentle-ai",
      "<!-- /gentle-ai:managed -->",
      "<!-- /user-supplement:a:b -->",
    ].join("\n");

    const result = rewriteSupplementDriftInContent(content, "AGENTS.md");

    expect(result.rewrites).toHaveLength(0);
    expect(result.content).toBe(content);
  });

  it("fails closed on a malformed closing marker: content untouched, zero rewrites", () => {
    const content = [
      "<!-- user-supplement:a:b -->",
      "codegraph-vba v1.10.0 stale reference",
      "no closing marker before EOF",
    ].join("\n");

    const result = rewriteSupplementDriftInContent(content, "AGENTS.md");

    expect(result.malformedClosing).toBe(true);
    expect(result.rewrites).toHaveLength(0);
    expect(result.content).toBe(content);
  });

  it("rewrites every qualifying reference on a line, including mixed strict + loose", () => {
    const content = [
      "<!-- user-supplement:a:b -->",
      "codegraph-vba v1.10.0 and also v1.9 runtime notes plus v1.8.2 spec hints",
      "<!-- /user-supplement:a:b -->",
    ].join("\n");

    const result = rewriteSupplementDriftInContent(content, "AGENTS.md");

    const line = result.content.split("\n")[1] ?? "";
    expect(line).not.toMatch(/v\d+\.\d+/);
  });

  it("is detector-clean and idempotent after rewriting", () => {
    const content = [
      "<!-- user-supplement:ardelperal:codegraph-extra-tools -->",
      "the user-owned source of truth for v1.10.0 semantics",
      "Runtime version codegraph-vba v1.11 drives behaviour.",
      "<!-- /user-supplement:ardelperal:codegraph-extra-tools -->",
    ].join("\n");

    const first = rewriteSupplementDriftInContent(content, "AGENTS.md");
    expect(scanSupplementDriftInContent(first.content, "AGENTS.md")).toHaveLength(0);

    const second = rewriteSupplementDriftInContent(first.content, "AGENTS.md");
    expect(second.rewrites).toHaveLength(0);
    expect(second.content).toBe(first.content);
  });

  it("preserves CRLF line endings on rewritten and untouched lines", () => {
    const content = [
      "<!-- user-supplement:a:b -->",
      "codegraph-vba v1.10.0 stale",
      "untouched line",
      "<!-- /user-supplement:a:b -->",
      "",
    ].join("\r\n");

    const result = rewriteSupplementDriftInContent(content, "AGENTS.md");

    expect(result.rewrites).toHaveLength(1);
    expect(result.content).toContain("codegraph --version");
    expect(result.content.split("\r\n")).toHaveLength(5);
    expect(result.content).not.toMatch(/[^\r]\n/);
  });
});

describe("applySupplementDriftFix — multi-file port orchestration", () => {
  function makePort(files: Map<string, string>): InstructionFileReadWritePort & {
    writes: Map<string, string>;
  } {
    const writes = new Map<string, string>();
    return {
      writes,
      readFile: async (filePath: string) => {
        const content = files.get(filePath);
        if (content === undefined) throw new Error(`ENOENT: ${filePath}`);
        return content;
      },
      writeFile: async (filePath: string, content: string) => {
        writes.set(filePath, content);
      },
    };
  }

  const dirty = [
    "<!-- user-supplement:a:b -->",
    "codegraph-vba v1.10.0 stale",
    "<!-- /user-supplement:a:b -->",
  ].join("\n");
  const clean = [
    "<!-- user-supplement:a:b -->",
    "nothing stale here",
    "<!-- /user-supplement:a:b -->",
  ].join("\n");

  it("dry-run (apply:false) reports rewrites but writes nothing", async () => {
    const port = makePort(new Map([["A.md", dirty]]));

    const result = await applySupplementDriftFix({ filePaths: ["A.md"], port, apply: false });

    expect(result.ok).toBe(true);
    expect(result.apply).toBe(false);
    expect(result.filesChanged).toBe(1);
    expect(result.rewrites).toHaveLength(1);
    expect(port.writes.size).toBe(0);
  });

  it("apply:true writes only the files that changed", async () => {
    const port = makePort(
      new Map([
        ["A.md", dirty],
        ["B.md", clean],
      ]),
    );

    const result = await applySupplementDriftFix({
      filePaths: ["A.md", "B.md"],
      port,
      apply: true,
    });

    expect(result.ok).toBe(true);
    expect(result.filesScanned).toBe(2);
    expect(result.filesChanged).toBe(1);
    expect(port.writes.has("A.md")).toBe(true);
    expect(port.writes.has("B.md")).toBe(false);
    expect(port.writes.get("A.md")).toContain("codegraph --version");
  });

  it("surfaces unreadable files as FILE_READ_FAILED without aborting the sweep", async () => {
    const port = makePort(new Map([["B.md", dirty]]));

    const result = await applySupplementDriftFix({
      filePaths: ["missing.md", "B.md"],
      port,
      apply: true,
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ filePath: "missing.md", code: "FILE_READ_FAILED" });
    expect(result.ok).toBe(false);
    expect(port.writes.has("B.md")).toBe(true);
  });

  it("skips files with malformed closing markers fail-closed and reports them", async () => {
    const malformed = ["<!-- user-supplement:a:b -->", "codegraph-vba v1.10.0 stale"].join("\n");
    const port = makePort(new Map([["M.md", malformed]]));

    const result = await applySupplementDriftFix({ filePaths: ["M.md"], port, apply: true });

    expect(result.skippedMalformed).toEqual(["M.md"]);
    expect(result.ok).toBe(false);
    expect(port.writes.size).toBe(0);
  });

  it("surfaces a failing write as FILE_WRITE_FAILED", async () => {
    const port = makePort(new Map([["A.md", dirty]]));
    port.writeFile = async () => {
      throw new Error("EACCES: read-only filesystem");
    };

    const result = await applySupplementDriftFix({ filePaths: ["A.md"], port, apply: true });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ filePath: "A.md", code: "FILE_WRITE_FAILED" });
    expect(result.ok).toBe(false);
  });
});
