// Issue #1668 — a `worktree-per-change` fleet fixture.
//
// The consumer that reported round 18 drives fourteen sibling git worktrees
// that all commit the same `.dysflow/project.json` `id`. These helpers build a
// miniature version of that layout on the real filesystem so the resolver's
// sibling discovery, recovery envelope, and cwd anchoring are exercised
// through the public MCP handler surface rather than through fakes.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import type { DysflowMcpServices } from "../../src/adapters/mcp/result-translation.js";
import { createDysflowMcpTools } from "../../src/adapters/mcp/tools.js";
import { successResult } from "../../src/core/contracts/index.js";

/** The id every worktree in the fleet declares. */
export const SHARED_PROJECT_ID = "shared-worktree-id";
/** The exact literal the recovery contract requires. */
export const CHOICE_REASON = "user_selected_after_ambiguous_project";

export type ToolResult = {
  content: readonly { text: string }[];
  isError?: boolean;
  error?: Record<string, unknown>;
};

export type ToolHandler = { handler: (input: unknown) => Promise<ToolResult> };

export type WorktreeFleet = {
  /** Directory holding every worktree. */
  root: string;
  /** Configured worktree roots, all declaring `SHARED_PROJECT_ID`. */
  worktrees: string[];
  /**
   * A sibling directory that owns no `.dysflow/project.json`. It is the only
   * vantage point from which the fleet is still genuinely ambiguous, because
   * a cwd that IS one of the worktrees resolves to itself.
   */
  observer: string;
  cleanup: () => void;
};

export function createWorktreeFleet(
  names: readonly string[] = ["wt-1", "wt-2", "wt-3"],
): WorktreeFleet {
  // Sibling discovery deliberately refuses to scan the OS temp root, so the
  // fleet lives one directory below the mkdtemp root.
  const container = mkdtempSync(join(tmpdir(), "dysflow-fleet-"));
  const root = join(container, "fleet");
  mkdirSync(root, { recursive: true });

  const gitLink = (name: string): string => `gitdir: ${join(root, ".bare", "worktrees", name)}\n`;

  const worktrees = names.map((name) => {
    const worktree = join(root, name);
    mkdirSync(join(worktree, ".dysflow"), { recursive: true });
    mkdirSync(join(worktree, "src"), { recursive: true });
    writeFileSync(join(worktree, "app.accdb"), "");
    writeFileSync(join(worktree, ".git"), gitLink(name));
    writeFileSync(
      join(worktree, ".dysflow", "project.json"),
      JSON.stringify({
        id: SHARED_PROJECT_ID,
        frontendFile: "app.accdb",
        destinationRoot: "src",
      }),
    );
    return worktree;
  });

  const observer = join(root, "observer");
  mkdirSync(observer, { recursive: true });
  writeFileSync(join(observer, ".git"), gitLink("observer"));

  return {
    root,
    worktrees,
    observer,
    cleanup: () => rmSync(container, { recursive: true, force: true }),
  };
}

/** Parse an MCP tool result body, keeping the raw text when it is not JSON. */
export function payload(result: ToolResult): Record<string, unknown> {
  const raw = result.content.map((entry) => entry.text).join("\n");
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { raw };
  }
}

/** Canonical path comparison, matching the resolver's own worktree identity. */
export function samePath(left: unknown, right: string): boolean {
  return typeof left === "string" && resolve(left).toLowerCase() === resolve(right).toLowerCase();
}

/** The real MCP tool set with stub services, rooted at `cwd`. */
export function makeFleetTools(cwd: string) {
  const vbaSyncToolService = { execute: async () => successResult({ ok: true }) };
  return createDysflowMcpTools({
    services: {
      vbaService: vbaSyncToolService,
      vbaSyncToolService,
      queryService: { execute: async () => successResult({ rows: [] }) },
      diagnosticsService: { run: async () => successResult({ checks: [] }) },
    } as unknown as DysflowMcpServices,
    writes: true,
    cwd,
  });
}

export function fleetTool(
  tools: ReturnType<typeof createDysflowMcpTools>,
  name: string,
): ToolHandler {
  const found = tools.find((entry) => entry.name === name);
  if (found === undefined) throw new Error(`Missing MCP tool: ${name}`);
  return found as unknown as ToolHandler;
}
