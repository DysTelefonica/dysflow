// Two more contract pins for the e2e battery, both born from release failures
// that cost a full 30-minute self-hosted run each to discover.
//
// 1. PAYLOAD CHANNEL. #1471 stopped copying the full payload into the text
//    channel once it exceeds LARGE_RESULT_TEXT_THRESHOLD_BYTES; past that, text
//    carries a summary stub and the payload lives in `structuredContent`. A
//    `JSON.parse(result.text)` assertion is therefore SIZE-DEPENDENT — it passes
//    on a small sandbox and fails on a large one, which is the worst kind of
//    red. The battery reads through one `payloadOf()` helper instead.
//
// 2. BOUNDED TEARDOWN. `teardown_fixture` refuses an unbounded DELETE and
//    requires a predicate range at or above the runner's TEST_ID_BASE floor.
//    The floor is read out of the PowerShell runner rather than restated, so a
//    change there is enforced against the battery without editing this file.

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LARGE_RESULT_TEXT_THRESHOLD_BYTES } from "../../src/adapters/mcp/response-envelope.js";

const MCP_E2E_PATH = resolve(process.cwd(), "E2E_testing/mcp-e2e.mjs");
const RUNNER_PATH = resolve(process.cwd(), "scripts/dysflow-access-runner.ps1");
const HELPERS_DIR = resolve(process.cwd(), "E2E_testing/_helpers");

/**
 * The transport's job IS to surface the raw channels: it returns the whole
 * `response`, so every consumer can reach `structuredContent` itself. Requiring
 * it to choose a channel would defeat the purpose of exposing both.
 */
const TRANSPORT_HELPERS = new Set(["mcp-harness.mjs"]);

const source = readFileSync(MCP_E2E_PATH, "utf8");

/** The runner's fixture floor, read from the guard itself. */
function runnerTestIdFloor(): number {
  const runner = readFileSync(RUNNER_PATH, "utf8");
  const match = /\$fixtureTestIdMin\s*=\s*\[int64\](\d+)/.exec(runner);
  if (match?.[1] === undefined) throw new Error("could not read $fixtureTestIdMin from the runner");
  return Number(match[1]);
}

describe("mcp-e2e payload channel (#1471)", () => {
  it("keeps a threshold worth defending", () => {
    expect(LARGE_RESULT_TEXT_THRESHOLD_BYTES).toBeGreaterThan(0);
  });

  it("prefers structuredContent in every helper that unwraps a tool result", () => {
    // The battery is not the only reader. Its helpers unwrap results too, and
    // the contract validator read `content[].text` — which is exactly how a
    // 16 KB-plus describe_tool payload came back without its resultContract.
    const offenders = readdirSync(HELPERS_DIR)
      .filter((entry) => entry.endsWith(".mjs") && !TRANSPORT_HELPERS.has(entry))
      .flatMap((entry) => {
        const helper = readFileSync(join(HELPERS_DIR, entry), "utf8");
        const unwrapsContent = /result\??\.\s*content|\.result\??\.content/.test(helper);
        if (!unwrapsContent) return [];
        return helper.includes("structuredContent") ? [] : [entry];
      });

    expect(
      offenders,
      "a helper unwraps result.content without checking structuredContent first",
    ).toEqual([]);
  });

  it("keeps the transport handing back the raw response", () => {
    // The exemption above is only safe while the transport returns `response`
    // untouched; without it no consumer could reach structuredContent at all.
    for (const entry of TRANSPORT_HELPERS) {
      const helper = readFileSync(join(HELPERS_DIR, entry), "utf8");
      expect(helper, `${entry} must return the raw response`).toMatch(/^\s*response,$/m);
    }
  });

  it("reads tool payloads through payloadOf, never by parsing text", () => {
    // The helper itself owns the text fallback; every other site must go
    // through it, so exclude exactly the helper's own line range.
    const helper = /function payloadOf\(result\)\s*\{[\s\S]*?\n\}/.exec(source);
    const helperFirst = helper === null ? -1 : source.slice(0, helper.index).split("\n").length;
    const helperLast = helper === null ? -1 : helperFirst + helper[0].split("\n").length - 1;

    const offenders = source
      .split("\n")
      .map((line, index) => ({ line: line.trim(), number: index + 1 }))
      .filter(
        (entry) =>
          /(?:JSON\.parse|safeJsonParse)\(\s*\w+\??\.text/.test(entry.line) &&
          !entry.line.startsWith("*") &&
          !entry.line.startsWith("//") &&
          !(entry.number >= helperFirst && entry.number <= helperLast),
      )
      .map((entry) => `${MCP_E2E_PATH}:${entry.number} — ${entry.line}`);

    expect(
      offenders,
      "parsing a result's text channel is size-dependent since #1471; use payloadOf(result)",
    ).toEqual([]);
  });

  it("defines payloadOf and prefers structuredContent inside it", () => {
    const body = /function payloadOf\(result\)\s*\{([\s\S]*?)\n\}/.exec(source)?.[1];
    expect(body, "payloadOf helper is missing from the battery").toBeDefined();
    expect(body).toContain("structuredContent");
    expect(body).toContain("safeJsonParse");
  });
});

describe("mcp-e2e bounded teardown", () => {
  const floor = runnerTestIdFloor();

  // Every applied teardown_fixture call in the battery, with its predicate range.
  const applied = [...source.matchAll(/record\(\s*"[^"]*"\s*,\s*"teardown_fixture"[^\n]*\n?/g)]
    .map((match) => ({ text: match[0], number: source.slice(0, match.index).split("\n").length }))
    .filter((call) => /apply:\s*true/.test(call.text));

  it("finds the applied teardown calls it is meant to guard", () => {
    expect(applied.length).toBeGreaterThan(0);
  });

  it("bounds every applied teardown at or above the runner's TEST_ID_BASE", () => {
    const offenders: string[] = [];

    for (const call of applied) {
      const min = /min:\s*([A-Za-z_$][\w$]*|\d+)/.exec(call.text)?.[1];
      const max = /max:\s*([A-Za-z_$][\w$]*[^,}]*|\d+)/.exec(call.text)?.[1];
      if (min === undefined || max === undefined) {
        offenders.push(`${MCP_E2E_PATH}:${call.number} — applied teardown has no predicate range`);
        continue;
      }
      // The battery expresses the range through TEST_ID_BASE; a bare literal is
      // only acceptable when it already clears the floor.
      const resolved = min === "TEST_ID_BASE" ? floor : Number(min);
      if (!Number.isFinite(resolved) || resolved < floor) {
        offenders.push(`${MCP_E2E_PATH}:${call.number} — predicate min '${min}' is below ${floor}`);
      }
    }

    expect(
      offenders,
      "teardown_fixture refuses an unbounded DELETE and any range below TEST_ID_BASE",
    ).toEqual([]);
  });

  it("seeds fixture rows inside the range a bounded teardown can reach", () => {
    const constant = /const TEST_ID_BASE = (\d+);/.exec(source)?.[1];
    expect(constant, "battery does not declare TEST_ID_BASE").toBeDefined();
    expect(Number(constant)).toBe(floor);
  });
});
