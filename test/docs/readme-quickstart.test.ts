import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();

function readRepoFile(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), "utf8");
}

function fileExists(relativePath: string): boolean {
  return existsSync(join(REPO_ROOT, relativePath));
}

describe("README AI-agent quickstart (Round-12 #974)", () => {
  it("README has a 'Quickstart (AI agent)' section", () => {
    const readme = readRepoFile("README.md");
    expect(readme).toMatch(/^##\s+Quickstart\s+\(AI agent\)/m);
  });

  it("README Quickstart (AI agent) has a 3-command hello world workflow", () => {
    const readme = readRepoFile("README.md");
    const section = extractSection(readme, "Quickstart (AI agent)");
    const commandCount = countCommandBlocks(section);
    expect(
      commandCount,
      "Quickstart must contain at least 3 command blocks",
    ).toBeGreaterThanOrEqual(3);
    // Each command block must come from a known read-only tool surface so an AI agent can rely on it.
    expect(section).toMatch(/resolve_project|get_capabilities|list_vba_modules|diagnose|doctor/);
  });

  it("README Quickstart (AI agent) has the 'Primer proyecto' recipe", () => {
    const readme = readRepoFile("README.md");
    expect(readme).toContain("Primer proyecto");
  });

  it("README has a 'Common pitfalls cheat-sheet' section", () => {
    const readme = readRepoFile("README.md");
    expect(readme).toMatch(/^##\s+Common pitfalls(?:\s+cheat-sheet)?/m);
  });

  it("Common pitfalls cheat-sheet has at least 5 entries mapping error codes to remediation", () => {
    const readme = readRepoFile("README.md");
    const cheatSheet = extractSection(readme, "Common pitfalls");
    const entries = cheatSheet.match(
      /`(?:[A-Z][A-Z0-9_]*_(?:ERROR_[A-Z0-9_]+|NOT_FOUND|MISMATCH|DISALLOW_WRITE)|DESTINATION_ROOT_NOT_FOUND|OUTSIDE_PROJECT_ROOT|WRITE_LOCKED_BY_RUNNING_OP|CAPABILITIES_DISALLOW_WRITE|PROJECT_ID_MISMATCH|MCP_WRITES_DISABLED|MCP_ALLOWLIST_NOT_CONFIGURED|MCP_PROCEDURE_NOT_ALLOWED|LACCDB_STALE_DETECTED|LIVE_PROCESS_HOLDS_LACCDB|CONFIG_TARGET_NOT_FOUND|RUNNER_INVALID_JSON)`/g,
    );
    expect(
      entries?.length ?? 0,
      "Common pitfalls cheat-sheet must list at least 5 typed error codes",
    ).toBeGreaterThanOrEqual(5);
  });

  it("Common pitfalls cheat-sheet references at least 3 Round-12 issue numbers", () => {
    const readme = readRepoFile("README.md");
    const cheatSheet = extractSection(readme, "Common pitfalls");
    const issues = cheatSheet.match(/#\d{3,4}/g) ?? [];
    const uniqueIssues = new Set(issues);
    expect(
      uniqueIssues.size,
      "Common pitfalls must cross-reference at least 3 Round-12 issues",
    ).toBeGreaterThanOrEqual(3);
  });

  it("Quickstart (AI agent) cross-references the canonical skills", () => {
    const readme = readRepoFile("README.md");
    const section = extractSection(readme, "Quickstart (AI agent)");
    // At least two canonical skills must be linked by name
    const skillRefs = section.match(
      /`?(access-vba-tdd|vba-binary-drift|dysflow-arnes|dysflow-usage|access-form-ui-builder|vba-binary-sync)`?/g,
    );
    expect(
      new Set(skillRefs ?? []).size,
      "Quickstart must reference at least 2 named skills",
    ).toBeGreaterThanOrEqual(2);
  });

  it("docs/ai-agent-onboarding.md exists with the 'what can go wrong' guide", () => {
    expect(fileExists("docs/ai-agent-onboarding.md")).toBe(true);
    const content = readRepoFile("docs/ai-agent-onboarding.md");
    expect(content).toMatch(/what can go wrong/i);
  });
});

function extractSection(content: string, heading: string): string {
  // Match the heading literally, anchored to start-of-line `## `.
  const headingAnchor = `## ${heading}`;
  const start = content.indexOf(headingAnchor);
  if (start < 0) return "";
  const afterHeading = content.indexOf("\n", start) + 1;
  const rest = content.slice(afterHeading);
  const nextHeading = rest.search(/^##\s+/m);
  if (nextHeading < 0) return rest;
  return rest.slice(0, nextHeading);
}

function countCommandBlocks(section: string): number {
  // Count any fenced code block (powershell, bash, sh, text, json).
  // Accept both LF and CRLF line endings — repo-authored files use CRLF on Windows.
  const fenced = section.match(/```(?:powershell|bash|sh|text|json)(?:\r?\n)[\s\S]*?(?:\r?\n)```/g);
  return fenced?.length ?? 0;
}
