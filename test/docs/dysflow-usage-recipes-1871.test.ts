/**
 * Issue #1871 — `dysflow-usage` starts with a Recipes table of copy-pasteable calls.
 * Every recipe must name a real tool, and every parameter it passes must be a
 * property of that tool's live input schema. The check runs against the schemas
 * the runtime advertises, so a rename or removal fails here.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { inputSchemaForTool } from "../../src/adapters/mcp/schema-tool.js";

const SKILL = "skills/dysflow-usage/SKILL.md";

function recipeRows(markdown: string): { action: string; call: string }[] {
  const start = markdown.indexOf("## Recipes\n");
  const end = markdown.indexOf("\n## ", start + 1);
  const section = markdown.slice(start, end === -1 ? undefined : end);
  return section
    .split("\n")
    .filter(
      (line) => line.startsWith("| ") && !line.startsWith("| Action") && !line.startsWith("| ---"),
    )
    .map((line) => {
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim());
      return { action: cells[0] ?? "", call: cells[1] ?? "" };
    });
}

/** Tool name and the top-level keys of each call in a recipe cell. */
function callsIn(cell: string): { tool: string; keys: string[] }[] {
  const calls: { tool: string; keys: string[] }[] = [];
  for (const span of cell.matchAll(/`([a-z_]+)\(([^`]*)\)`/g)) {
    const tool = span[1] ?? "";
    const args = span[2] ?? "";
    if (args.trim() === "") {
      calls.push({ tool, keys: [] });
      continue;
    }
    // Top-level keys: an object literal `{k:v, k2, ...}` or a bare identifier.
    const body = args.trim().replace(/^\{/, "").replace(/\}$/, "");
    const keys: string[] = [];
    let depth = 0;
    let current = "";
    for (const ch of body) {
      if ("[{(".includes(ch)) depth++;
      if ("]})".includes(ch)) depth--;
      if (ch === "," && depth === 0) {
        keys.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    if (current.trim() !== "") keys.push(current);
    calls.push({
      tool,
      keys: keys
        .map((entry) => entry.split(":")[0]?.trim() ?? "")
        .filter((key) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key)),
    });
  }
  return calls;
}

describe("dysflow-usage Recipes (#1871)", () => {
  const markdown = readFileSync(SKILL, "utf8");

  it("opens with a Recipes section before any other section", () => {
    const sections = [...markdown.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
    expect(sections[0]).toBe("Recipes");
  });

  it("keeps the recipe table to about twelve rows", () => {
    const rows = recipeRows(markdown);
    expect(rows.length).toBeGreaterThanOrEqual(10);
    expect(rows.length).toBeLessThanOrEqual(15);
  });

  it("passes cwd to every recipe whose tool schema takes one", () => {
    for (const row of recipeRows(markdown)) {
      for (const call of callsIn(row.call)) {
        const properties = Object.keys(inputSchemaForTool(call.tool)?.properties ?? {});
        if (!properties.includes("cwd")) continue;
        expect(call.keys, `${row.action}: ${call.tool}`).toContain("cwd");
      }
    }
  });

  it("names only tools and parameters the live schemas advertise", () => {
    for (const row of recipeRows(markdown)) {
      for (const call of callsIn(row.call)) {
        const schema = inputSchemaForTool(call.tool);
        expect(schema, `${row.action}: tool ${call.tool} has no schema`).toBeDefined();
        const properties = Object.keys(schema?.properties ?? {});
        for (const key of call.keys) {
          expect(properties, `${row.action}: ${call.tool}.${key}`).toContain(key);
        }
      }
    }
  });
});
