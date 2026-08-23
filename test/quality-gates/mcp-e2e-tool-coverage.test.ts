/**
 * Issue #1502 — the coverage gate that `mcp-e2e-tool-existence.test.ts` is not.
 *
 * That test guards E2E -> registry: every tool an E2E scenario names must exist.
 * It catches a renamed or hidden tool. It stays, and this file does not touch it.
 *
 * Nothing guarded registry -> E2E. A new tool could ship with no end-to-end
 * scenario and no gate fired, so the gap grew unseen until 24 of 95 advertised
 * tools had no coverage anywhere — 18 of them form tools, most of which write
 * `.form.txt` files. The individual missing scenarios are #1504. The missing
 * *gate* is this file, and it is why the drift was invisible.
 *
 * Two assertions carry the design:
 *
 *   1. Every advertised tool is covered or explicitly exempted with a reason.
 *   2. No exemption survives once the tool is covered.
 *
 * The second is what stops the allow-list from rotting into a permanent amnesty.
 * A list that can only grow documents decay; a list that must shrink documents
 * progress.
 */

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveMcpE2eToolName } from "../../E2E_testing/_helpers/mcp-e2e-tool-aliases.mjs";
import { createDysflowMcpTools } from "../../src/adapters/mcp/tools.js";
import { successResult } from "../../src/core/contracts/index.js";

/**
 * Advertised tools with no end-to-end scenario, each with the reason it is
 * exempt. Removing an entry is the deliverable of covering that tool; the
 * "no stale exemption" assertion fails if an entry outlives its gap.
 */
const UNCOVERED_BY_DESIGN: Readonly<Record<string, string>> = Object.freeze({
  // #1504 — the form phase is a third of the advertised surface and has the
  // thinnest coverage. These mutate `.form.txt`, so they need a real Access
  // round trip rather than an IR-level unit test.
  form_add_control: "form mutation scenario pending #1504",
  form_move_control: "form mutation scenario pending #1504",
  form_rename_control: "form mutation scenario pending #1504",
  form_delete_control: "form mutation scenario pending #1504",
  form_duplicate_control: "form mutation scenario pending #1504",
  form_set_properties: "form mutation scenario pending #1504",
  form_align_controls: "form mutation scenario pending #1504",
  form_distribute_controls: "form mutation scenario pending #1504",
  form_serialize: "form round-trip scenario pending #1504",
  form_deserialize: "form round-trip scenario pending #1504",
  create_form_from_template: "form creation scenario pending #1504",
  // Non-form gaps.
  lint_module: "source-only linter; no Access round trip to exercise",
  register_worktree: "worktree pre-warm covered by adapters/config unit tests",
  bootstrap: "shipped in #1484 after the battery was last extended",
  diagnose: "diagnostic surface; scenario pending",
  clean_stale_markers: "recovery surface; scenario pending",
});

const REPO_ROOT = process.cwd();
const QUOTES = ['"', "'", "`"] as const;

/** Read every `.mjs` / `.ts` file under a directory, recursively. */
function readTree(dir: string): string {
  let body = "";
  try {
    for (const entry of readdirSync(resolve(REPO_ROOT, dir), { recursive: true })) {
      if (typeof entry !== "string") continue;
      if (!entry.endsWith(".mjs") && !entry.endsWith(".ts")) continue;
      try {
        body += `${readFileSync(resolve(REPO_ROOT, dir, entry), "utf8")}\n`;
      } catch {
        // A directory that matched the suffix, or an unreadable entry,
        // contributes nothing. Not a failure.
      }
    }
  } catch {
    // A missing surface is an empty corpus, not an error — the assertions then
    // report every tool as uncovered, which is the honest outcome.
  }
  return body;
}

/**
 * Second argument of a `record(area, tool, ...)` call.
 *
 * Scanned rather than pattern-matched. A regex is the obvious tool here and it
 * is a trap in this repository: the Windows shell toolchain strips backslashes
 * out of heredocs and `node -e`, so a pattern containing an escape arrives
 * mangled and throws at construction. Scanning has no escapes to lose.
 */
function secondArgument(source: string, from: number): string | undefined {
  const args: string[] = [];
  let depth = 0;
  let current = "";
  let quote: string | undefined;
  for (let i = from; i < source.length && args.length < 2; i += 1) {
    const ch = source[i] as string;
    if (quote !== undefined) {
      if (ch === quote) quote = undefined;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
    } else if (ch === "(" || ch === "[" || ch === "{") {
      depth += 1;
    } else if (ch === ")" || ch === "]" || ch === "}") {
      if (depth === 0) break;
      depth -= 1;
    } else if (ch === "," && depth === 0) {
      args.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  return args[1];
}

/** Tools named by a `record()` scenario in the real MCP E2E battery. */
function batteryCoveredTools(): Set<string> {
  const source = readTree("E2E_testing");
  const covered = new Set<string>();
  const marker = "record(";
  for (let i = source.indexOf(marker); i >= 0; i = source.indexOf(marker, i + 1)) {
    const label = secondArgument(source, i + marker.length);
    if (label === undefined || label.length === 0) continue;
    // `resolveMcpE2eToolName` already applies the alias table and strips the
    // `:scenario` suffix, so `verify_code:bulkImportable:import_modules`
    // resolves to `verify_code`. Do not split again here.
    covered.add(resolveMcpE2eToolName(label));
  }
  return covered;
}

/**
 * Tools named as a string literal in a vitest end-to-end or integration file.
 *
 * Deliberately looser than the `record()` parse: those suites reach tools
 * through several shapes, and per #1502 a scenario in `test/e2e` counts as much
 * as one in `E2E_testing`. Looseness only ever moves a tool OUT of the
 * allow-list, and the stale-exemption assertion turns an over-generous match
 * into a loud failure rather than a silent pass — so erring wide is safe here in
 * a way it would not be if this were the only signal.
 */
function vitestCoveredTools(names: readonly string[]): Set<string> {
  const source = readTree("test/e2e") + readTree("test/integration") + readTree("tests");
  return new Set(names.filter((name) => QUOTES.some((q) => source.includes(`${q}${name}${q}`))));
}

function advertisedToolNames(): string[] {
  const options = {
    services: {
      vbaService: { execute: async () => successResult({ returnValue: "ok" }) },
      queryService: { execute: async () => successResult({ rows: [] }) },
      diagnosticsService: { run: async () => successResult({ checks: [] }) },
    },
  } as unknown as Parameters<typeof createDysflowMcpTools>[0];
  return createDysflowMcpTools(options)
    .filter((tool) => !tool.hidden)
    .map((tool) => tool.name);
}

describe("#1502 every advertised MCP tool has an end-to-end scenario", () => {
  const advertised = advertisedToolNames();
  const covered = new Set([...batteryCoveredTools(), ...vitestCoveredTools(advertised)]);

  it("reads a non-empty surface and corpus, so nothing below can pass vacuously", () => {
    expect(advertised.length).toBeGreaterThan(0);
    expect(covered.size).toBeGreaterThan(0);
  });

  it("covers or explicitly exempts every advertised tool", () => {
    const unaccounted = advertised.filter(
      (name) => !covered.has(name) && UNCOVERED_BY_DESIGN[name] === undefined,
    );
    expect(
      unaccounted,
      `No E2E scenario for: ${unaccounted.join(", ")}. Add a record() scenario to the battery, or ` +
        "add an UNCOVERED_BY_DESIGN entry stating why it is exempt.",
    ).toEqual([]);
  });

  it("keeps no exemption for a tool that is now covered", () => {
    const stale = Object.keys(UNCOVERED_BY_DESIGN).filter((name) => covered.has(name));
    expect(
      stale,
      `Now covered but still exempted: ${stale.join(", ")}. Remove the UNCOVERED_BY_DESIGN entry ` +
        "in the same change that covers the tool — this list must shrink, never linger.",
    ).toEqual([]);
  });

  it("gives every exemption a reason", () => {
    const bare = Object.entries(UNCOVERED_BY_DESIGN)
      .filter(([, reason]) => reason.trim().length === 0)
      .map(([name]) => name);
    expect(bare, "An exemption without a reason is an oversight, not a decision.").toEqual([]);
  });

  it("exempts no tool the runtime no longer advertises", () => {
    const advertisedSet = new Set(advertised);
    const ghosts = Object.keys(UNCOVERED_BY_DESIGN).filter((name) => !advertisedSet.has(name));
    expect(
      ghosts,
      `Exempted but no longer advertised: ${ghosts.join(", ")}. Drop the entry.`,
    ).toEqual([]);
  });
});
