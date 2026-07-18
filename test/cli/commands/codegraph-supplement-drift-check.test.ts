/**
 * Issue #961 (B component) — composition root tests for the supplement
 * drift check. Mirrors the `opencode-mcp-wiring.test.ts` style: inject an
 * in-memory read port, drive the check against fixtures, assert the
 * diagnostic that the doctor command receives.
 *
 * The pure kernel is covered separately in
 * `test/core/services/codegraph-supplement-drift-detector.test.ts`. This
 * file pins the composition contract: the doctor formatter renders a
 * single ⚠ line, the diagnostic always carries the full scan result, and
 * a missing file is recorded as `errors[]` not a hard failure.
 */

import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatSupplementDriftDiagnostic,
  runSupplementDriftCheck,
  type SupplementDriftCheckOptions,
} from "../../../src/cli/commands/codegraph-supplement-drift-check.js";

const HOME = "/home/u";
const AGENTS_MD = join(HOME, ".config/opencode/AGENTS.md");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReadPort(files: ReadonlyMap<string, string>) {
  return async (filePath: string): Promise<string> => {
    const content = files.get(filePath);
    if (content === undefined) {
      throw Object.assign(new Error(`ENOENT: ${filePath}`), { code: "ENOENT" });
    }
    return content;
  };
}

function makeOptions(
  files: ReadonlyMap<string, string>,
  overrides: Partial<SupplementDriftCheckOptions> = {},
): SupplementDriftCheckOptions {
  return {
    home: HOME,
    readFile: makeReadPort(files),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Happy path — clean home directory
// ---------------------------------------------------------------------------

describe("runSupplementDriftCheck — clean home", () => {
  it("reports no drift when the supplied file is clean", async () => {
    const clean = [
      "<!-- user-supplement:foo -->",
      "Generic prose with no version reference.",
      "<!-- /user-supplement:foo -->",
    ].join("\n");
    const files = new Map<string, string>([[AGENTS_MD, clean]]);

    const diagnostic = await runSupplementDriftCheck(makeOptions(files));

    expect(diagnostic.name).toBe("codegraph-supplement-drift");
    expect(diagnostic.warnOnly).toBe(true);
    expect(diagnostic.result.driftDetected).toEqual([]);
    // Missing files are recorded as errors but do NOT flip ok=false
    // when the files that DO scan report no drift — the user's home
    // layout is out of dysflow's control.
    expect(diagnostic.message).toMatch(/no drift/i);
  });

  it("reports ok=true when zero drift findings AND only the AGENTS.md path was readable", async () => {
    // Drive the port so only AGENTS.md returns content; the other 9 default
    // paths throw. errors[] is populated, but `ok` tracks drift only.
    const port = async (filePath: string): Promise<string> => {
      if (filePath === AGENTS_MD) {
        return "<!-- user-supplement:clean -->no drift<!-- /user-supplement:clean -->";
      }
      throw Object.assign(new Error(`ENOENT: ${filePath}`), { code: "ENOENT" });
    };

    const diagnostic = await runSupplementDriftCheck({ home: HOME, readFile: port });

    expect(diagnostic.ok).toBe(true);
    expect(diagnostic.result.driftDetected).toEqual([]);
    expect(diagnostic.result.errors).toHaveLength(9);
  });
});

// ---------------------------------------------------------------------------
// Drift detected — surfaces the finding AND keeps `warnOnly: true`
// ---------------------------------------------------------------------------

describe("runSupplementDriftCheck — drift detected", () => {
  it("reports the offending file/line/snippet and remediation hint", async () => {
    const drifted = [
      "<!-- user-supplement:ardelperal:codegraph-extra-tools -->",
      "## CodeGraph extras",
      "codegraph-vba v1.10.0 semantics",
      "<!-- /user-supplement:ardelperal:codegraph-extra-tools -->",
    ].join("\n");
    const files = new Map<string, string>([[AGENTS_MD, drifted]]);

    const diagnostic = await runSupplementDriftCheck(makeOptions(files));

    expect(diagnostic.ok).toBe(false);
    expect(diagnostic.warnOnly).toBe(true);
    expect(diagnostic.result.driftDetected).toHaveLength(1);
    expect(diagnostic.result.driftDetected[0]).toMatchObject({
      filePath: AGENTS_MD,
      blockId: "ardelperal:codegraph-extra-tools",
      matchedVersion: "v1.10.0",
    });
    expect(diagnostic.message).toMatch(/1 stale codegraph-vba/i);
  });

  it("renders drift + malformed closing as a unified summary line", async () => {
    const drifted = [
      "<!-- user-supplement:foo -->",
      "codegraph-vba v1.10.0",
      "(no closing marker)",
    ].join("\n");
    const files = new Map<string, string>([[AGENTS_MD, drifted]]);

    const diagnostic = await runSupplementDriftCheck(makeOptions(files));

    expect(diagnostic.result.driftDetected).toHaveLength(2);
    expect(diagnostic.result.driftDetected.some((f) => f.malformedClosing === true)).toBe(true);
    expect(diagnostic.message).toMatch(/malformed/i);
  });
});

// ---------------------------------------------------------------------------
// Missing files — graceful skip via `errors[]`, not a hard failure
// ---------------------------------------------------------------------------

describe("runSupplementDriftCheck — missing files", () => {
  it("skips missing files gracefully and reports them in errors[]", async () => {
    // Empty map → every path throws ENOENT.
    const diagnostic = await runSupplementDriftCheck(makeOptions(new Map()));

    expect(diagnostic.result.errors).toHaveLength(10); // 10 default files, all missing
    for (const error of diagnostic.result.errors) {
      expect(error.code).toBe("FILE_READ_FAILED");
    }
    expect(diagnostic.message).toMatch(/skipped 10 unreadable/i);
    // ok=true because no drift was found; missing files alone do NOT
    // flip the verdict — dysflow can't be held responsible for files
    // the user hasn't laid down on disk.
    expect(diagnostic.ok).toBe(true);
  });

  it("scans exactly one file when only that path returns content", async () => {
    const port = async (filePath: string): Promise<string> => {
      if (filePath === AGENTS_MD) {
        return "<!-- user-supplement:clean -->no drift<!-- /user-supplement:clean -->";
      }
      throw Object.assign(new Error(`ENOENT: ${filePath}`), { code: "ENOENT" });
    };

    const diagnostic = await runSupplementDriftCheck({ home: HOME, readFile: port });

    expect(diagnostic.result.filesScanned).toBe(1);
    expect(diagnostic.result.errors).toHaveLength(9);
    expect(diagnostic.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Path resolution — default file list joined with `home`
// ---------------------------------------------------------------------------

describe("runSupplementDriftCheck — path resolution", () => {
  it("joins each default relative path with `home` to produce absolute paths", async () => {
    const seenPaths: string[] = [];
    const port = async (filePath: string): Promise<string> => {
      seenPaths.push(filePath);
      // AGENTS.md has drift; the rest are clean so we exercise the full list.
      if (filePath.endsWith("AGENTS.md")) {
        return [
          "<!-- user-supplement:foo -->",
          "codegraph-vba v1.10.0",
          "<!-- /user-supplement:foo -->",
        ].join("\n");
      }
      return "<!-- user-supplement:clean -->no drift<!-- /user-supplement:clean -->";
    };

    await runSupplementDriftCheck({ home: HOME, readFile: port });

    expect(seenPaths).toContain(join(HOME, ".config/opencode/AGENTS.md"));
    expect(seenPaths).toContain(join(HOME, ".config/opencode/CLAUDE.md"));
    expect(seenPaths).toContain(join(HOME, ".config/opencode/.codex/AGENTS.md"));
    expect(seenPaths).toHaveLength(10);
  });

  it("accepts a custom `relativePaths` override (for tests + opt-in project-local scans)", async () => {
    const seenPaths: string[] = [];
    const port = async (filePath: string): Promise<string> => {
      seenPaths.push(filePath);
      return "<!-- user-supplement:clean -->no drift<!-- /user-supplement:clean -->";
    };

    await runSupplementDriftCheck({
      home: HOME,
      readFile: port,
      relativePaths: ["docs/AGENTS.md"],
    });

    expect(seenPaths).toEqual([join(HOME, "docs/AGENTS.md")]);
  });
});

// ---------------------------------------------------------------------------
// formatSupplementDriftDiagnostic — pure formatter
// ---------------------------------------------------------------------------

describe("formatSupplementDriftDiagnostic", () => {
  it("always sets warnOnly=true so doctor can render ⚠ without flipping exit code", () => {
    const diagnostic = formatSupplementDriftDiagnostic({
      ok: true,
      filesScanned: 1,
      blocksScanned: 0,
      driftDetected: [],
      errors: [],
    });

    expect(diagnostic.warnOnly).toBe(true);
    expect(diagnostic.name).toBe("codegraph-supplement-drift");
  });

  it("surfaces drift count + malformed count + error count in the message", () => {
    const diagnostic = formatSupplementDriftDiagnostic({
      ok: false,
      filesScanned: 10,
      blocksScanned: 12,
      driftDetected: [
        {
          filePath: "a",
          blockId: "x",
          line: 1,
          snippet: "s",
          matchedVersion: "v1.0.0",
          remediation: "r",
        },
        {
          filePath: "a",
          blockId: "x",
          line: 2,
          snippet: "s",
          matchedVersion: "<malformed-closing-marker>",
          remediation: "r",
          malformedClosing: true,
        },
      ],
      errors: [{ filePath: "b", code: "FILE_READ_FAILED", message: "e" }],
    });

    expect(diagnostic.message).toMatch(/1 stale/i);
    expect(diagnostic.message).toMatch(/1 malformed/i);
    expect(diagnostic.message).toMatch(/skipped 1 unreadable/i);
  });
});
