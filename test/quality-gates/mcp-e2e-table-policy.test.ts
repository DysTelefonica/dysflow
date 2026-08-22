// Pinner for the #1452 contract inside the e2e battery.
//
// `exec_sql`, `run_script`, and `query_execute` reject every table-policy key,
// because arbitrary Access SQL cannot prove which tables it touches without a
// complete Jet/ACE parser. The battery used to pass `allowTable` to `exec_sql`,
// which turned into a hard `MCP_INPUT_INVALID` plus an UNSAFE-STOP abort — and
// because that only surfaced in the 30-minute release run, three consecutive
// release workflows failed at the same line before anyone read the log.
//
// `mcp-e2e-tool-existence.test.ts` cannot catch this: it pins that a tool
// EXISTS, and documents schema-level breaks as explicitly out of its scope.
// This test closes that specific hole in <100ms.
//
// The rejection rule is not restated here. Each parsed call's key set is fed to
// the live `rejectArbitrarySqlTablePolicy`, so a new policy key added to the
// runtime is enforced against the battery on the next run with no edit here.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { rejectArbitrarySqlTablePolicy } from "../../src/adapters/mcp/dispatch-common.js";

const MCP_E2E_PATH = resolve(process.cwd(), "E2E_testing/mcp-e2e.mjs");

const ARBITRARY_SQL_TOOLS = ["exec_sql", "run_script", "query_execute"] as const;
type ArbitrarySqlTool = (typeof ARBITRARY_SQL_TOOLS)[number];

type ParsedArgumentCall = {
  tool: ArbitrarySqlTool;
  line: number;
  keys: string[];
};

/** Capture the balanced `{...}` argument literal that starts at `start`. */
function readObjectLiteral(source: string, start: number): string | null {
  if (source[start] !== "{") return null;
  let depth = 0;
  for (let index = start; index < source.length; index++) {
    const char = source[index];
    if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return null;
}

/**
 * Every `record("<area>", "<tool>[:<variant>]", { ... })` call for a tool that
 * refuses table policies. Only top-level key NAMES are collected; values are
 * irrelevant to the rule and may be template literals.
 */
function parseArbitrarySqlCalls(source: string): ParsedArgumentCall[] {
  const calls: ParsedArgumentCall[] = [];
  const pattern = /record\(\s*"[^"]*"\s*,\s*"([a-z_]+)(?::[^"]*)?"\s*,\s*/g;

  for (const match of source.matchAll(pattern)) {
    const tool = match[1] as ArbitrarySqlTool;
    if (!ARBITRARY_SQL_TOOLS.includes(tool)) continue;

    const literal = readObjectLiteral(source, (match.index ?? 0) + match[0].length);
    if (literal === null) continue;

    calls.push({
      tool,
      line: source.slice(0, match.index).split("\n").length,
      keys: [...literal.matchAll(/(?:^|[{,])\s*([A-Za-z_$][\w$]*)\s*:/g)].flatMap((key) =>
        key[1] === undefined ? [] : [key[1]],
      ),
    });
  }
  return calls;
}

describe("mcp-e2e table-policy contract (#1452)", () => {
  const source = readFileSync(MCP_E2E_PATH, "utf8");
  const calls = parseArbitrarySqlCalls(source);

  it("finds the arbitrary-SQL calls it is meant to guard", () => {
    // A silent zero would make every assertion below vacuously true.
    expect(calls.length).toBeGreaterThan(0);
    expect(new Set(calls.map((call) => call.tool)).size).toBeGreaterThan(1);
  });

  it("passes no key the live runtime rejects for arbitrary SQL", () => {
    const rejected = calls
      .map((call) => ({
        call,
        rejection: rejectArbitrarySqlTablePolicy(
          Object.fromEntries(call.keys.map((key) => [key, "probe"])),
          call.tool,
        ),
      }))
      .filter((entry) => entry.rejection !== undefined)
      .map((entry) => `${MCP_E2E_PATH}:${entry.call.line} — ${entry.call.tool}`);

    expect(
      rejected,
      "mcp-e2e.mjs passes a table-policy key the MCP boundary rejects; the battery would abort with MCP_INPUT_INVALID mid-run",
    ).toEqual([]);
  });
});
