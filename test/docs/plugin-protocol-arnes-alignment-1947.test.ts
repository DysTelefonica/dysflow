import { readFileSync } from "node:fs";
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
