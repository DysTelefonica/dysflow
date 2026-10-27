import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Issue #1947 — the plugin protocols and the MCP workflow registry are the
 * text agents receive in their prompts. They must describe the same rules as
 * the canonical arnés block in `skills/dysflow-arnes/SKILL.md`, and never
 * inject a rule the arnés retired (the compile gate, the pre-flight before
 * every write, HR-4).
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const START = "<!-- dysflow:arnés -->";
const END = "<!-- /dysflow:arnés -->";

function read(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8").replaceAll("\r\n", "\n");
}

/** The lines strictly between the standalone arnés markers. */
function canonicalArnesBody(): string {
  const lines = read("skills/dysflow-arnes/SKILL.md").split("\n");
  const start = lines.indexOf(START);
  const end = lines.indexOf(END);
  if (start < 0 || end <= start) throw new Error("arnés marker pair not found");
  return lines.slice(start + 1, end).join("\n");
}

/** `HR-n` -> rule title, as written in the canonical arnés. */
function canonicalRuleTitles(): Map<string, string> {
  const titles = new Map<string, string>();
  for (const match of canonicalArnesBody().matchAll(/^- \*\*(HR-\d+) — (.+?)\*\*/gm)) {
    titles.set(match[1] as string, match[2] as string);
  }
  return titles;
}

/** The runtime value of the `DYSFLOW_PROTOCOL` template literal. */
function opencodeProtocol(): string {
  const source = read("plugin/opencode/dysflow.ts");
  const match = /const DYSFLOW_PROTOCOL = `([\s\S]*?)`\n/.exec(source);
  if (!match) throw new Error("DYSFLOW_PROTOCOL template literal not found");
  const literal = match[1] as string;
  expect(literal).not.toMatch(/\$\{/);
  return literal.replaceAll("\\`", "`");
}

const INJECTED_SURFACES = [
  "plugin/opencode/dysflow.ts",
  "plugin/claude-code/scripts/session-start.sh",
  "plugin/claude-code/scripts/post-compaction.sh",
  "plugin/claude-code/scripts/user-prompt-submit.sh",
  "plugin/codex/scripts/session-start.sh",
  "plugin/codex/scripts/post-compaction.sh",
  "plugin/codex/scripts/user-prompt-submit.sh",
  "src/adapters/mcp/agent-workflow-registry.ts",
  "src/adapters/mcp/tool-advertisement.ts",
] as const;

const RETIRED_PHRASES = [
  /human-compile gate/i,
  /manual compile gate/i,
  /while `?humanCompilePending: ?true/i,
  /Pre-flight BEFORE every write/i,
  /8-step/i,
  /TDD-green without/i,
  /skills\/dysflow-protocol/,
] as const;

/** The plugin-owned surfaces injected into an agent's prompt or log. */
const PLUGIN_SURFACES = [
  "plugin/opencode/dysflow.ts",
  "plugin/claude-code/scripts/session-start.sh",
  "plugin/claude-code/scripts/post-compaction.sh",
  "plugin/claude-code/scripts/user-prompt-submit.sh",
  "plugin/claude-code/scripts/subagent-stop.sh",
  "plugin/claude-code/scripts/session-stop.sh",
  "plugin/codex/scripts/session-start.sh",
  "plugin/codex/scripts/post-compaction.sh",
  "plugin/codex/scripts/user-prompt-submit.sh",
  "plugin/codex/scripts/subagent-stop.sh",
  "plugin/codex/scripts/session-stop.sh",
] as const;

/**
 * Every skill a plugin surface sends the agent to: `skills/<name>` paths,
 * "Load `<name>`" instructions, and the rows of the opencode "Skills companion"
 * table.
 */
function referencedSkills(text: string): Set<string> {
  const names = new Set<string>();
  for (const match of text.matchAll(/skills\/([a-z0-9]+(?:-[a-z0-9]+)*)/g))
    names.add(match[1] as string);
  for (const match of text.matchAll(/\bLoad `([a-z0-9]+(?:-[a-z0-9]+)*)`/g))
    names.add(match[1] as string);
  const companion = /### Skills companion\n([\s\S]*?)(?:\n\n|$)/.exec(text);
  for (const row of companion?.[1]?.split("\n") ?? []) {
    const cell = /\| `([a-z0-9]+(?:-[a-z0-9]+)*)` \|\s*$/.exec(row);
    if (cell) names.add(cell[1] as string);
  }
  return names;
}

describe("plugin surfaces name only real skills and carry no stale marker (#1957)", () => {
  it("the skills companion table is extracted from the opencode protocol", () => {
    // Guards the extractor: an empty set would make the existence check vacuous.
    expect(referencedSkills(opencodeProtocol()).size).toBeGreaterThanOrEqual(5);
  });

  it.each(PLUGIN_SURFACES)("%s names only skills that exist in skills/", (relativePath) => {
    const text = read(relativePath).replaceAll("\\`", "`");
    for (const name of referencedSkills(text)) {
      expect(
        existsSync(path.join(repoRoot, "skills", name, "SKILL.md")),
        `${relativePath}: ${name}`,
      ).toBe(true);
    }
  });

  it.each(PLUGIN_SURFACES)("%s stamps no hand-written plugin version", (relativePath) => {
    const text = read(relativePath);
    // A literal version in the marker or the file header goes stale on the next release.
    expect(text).not.toMatch(/\[dysflow-plugin v\d/);
    expect(text).not.toMatch(/dysflow-plugin:[\w-]+(?: \(\w+\))? v\d/);
    expect(text).not.toMatch(/plugin adapter v\d/);
  });

  it("the opencode protocol marker is derived from the protocol text", () => {
    const source = read("plugin/opencode/dysflow.ts");
    const declaration = /const DYSFLOW_PROTOCOL_MARKER = ([\s\S]*?)\n\n/.exec(source)?.[1];
    expect(declaration, "DYSFLOW_PROTOCOL_MARKER declaration").toBeDefined();
    // Computed from DYSFLOW_PROTOCOL, so a changed protocol yields a changed marker.
    expect(declaration).toMatch(/\bDYSFLOW_PROTOCOL\b/);
    expect(declaration).not.toMatch(/\d+\.\d+\.\d+/);
  });
});

describe("plugin protocol and workflow registry match the canonical arnés (#1947)", () => {
  it("the opencode protocol embeds the canonical arnés block verbatim", () => {
    expect(opencodeProtocol()).toContain(canonicalArnesBody());
  });

  it.each(INJECTED_SURFACES)("%s injects no retired rule", (relativePath) => {
    const text = read(relativePath);
    for (const phrase of RETIRED_PHRASES) expect(text).not.toMatch(phrase);
  });

  it.each(INJECTED_SURFACES)(
    "%s names only HR rules that exist in the arnés, with their canonical titles",
    (relativePath) => {
      const titles = canonicalRuleTitles();
      expect(titles.has("HR-1")).toBe(true);
      expect(titles.has("HR-4")).toBe(false);
      // The arnés itself announces "HR-4 is retired"; only that sentence may name it.
      const text = read(relativePath).replaceAll("HR-4 is retired", "");
      for (const match of text.matchAll(/\bHR-(\d+)\b/g)) {
        expect(titles.has(`HR-${match[1]}`), `${relativePath}: HR-${match[1]}`).toBe(true);
      }
      for (const match of text.replaceAll("\\`", "`").matchAll(/\*\*(HR-\d+) — (.+?)\*\*/g)) {
        expect(match[2], `${relativePath}: ${match[1]}`).toBe(titles.get(match[1] as string));
      }
    },
  );
});
