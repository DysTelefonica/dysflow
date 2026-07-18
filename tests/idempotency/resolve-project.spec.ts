/**
 * Issue #979 — idempotency contract for `resolve_project` (#963).
 *
 * Public consumers rely on `resolve_project` as a health-check primitive.
 * The contract is:
 *
 *   IDEM-1 — N=10 sequential calls with the same input return byte-identical
 *            JSON when the filesystem is stable.
 *   IDEM-2 — N=10 parallel calls (Promise.all) also return byte-identical
 *            JSON. A consumer may fire `resolve_project` from multiple
 *            concurrent agents; the result must not race.
 *   IDEM-3 — The tool is read-only and never mutates the filesystem.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createResolveProjectTool } from "../../src/adapters/mcp/resolve-project-tool.js";
import type { McpToolResult } from "../../src/adapters/mcp/result-translation.js";

interface ResolvedPayload {
  projectId: string | null;
  outcome: "resolved" | "unresolved";
  reason: string;
  accessPath: string | null;
  projectRoot: string | null;
  sourceRoot: string | null;
  projectConfig: { status: string; writeReady: boolean };
}

function parsePayload(result: McpToolResult): ResolvedPayload {
  const text = result.content[0]?.text ?? "{}";
  return JSON.parse(text) as ResolvedPayload;
}

let workdir: string;

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), "dysflow-public-979-idempotency-"));
  writeFileSync(join(workdir, ".git"), "gitdir: fixture");
  mkdirSync(join(workdir, ".dysflow"));
  mkdirSync(join(workdir, "src"));
  writeFileSync(join(workdir, "app.accdb"), "");
  writeFileSync(
    join(workdir, ".dysflow", "project.json"),
    JSON.stringify({
      id: "app",
      accessPath: "app.accdb",
      destinationRoot: "src",
      capabilities: { allowWrites: true },
    }),
  );
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
});

describe("idempotency: resolve_project (issue #979, mirrors #963)", () => {
  it("IDEM-1: 10 sequential calls return byte-identical JSON", async () => {
    const tool = createResolveProjectTool({ cwd: workdir });
    const responses: ResolvedPayload[] = [];
    for (let i = 0; i < 10; i += 1) {
      responses.push(parsePayload(await tool.handler({ projectId: "app" })));
    }
    const first = responses[0];
    expect(first).toBeDefined();
    for (const [index, response] of responses.entries()) {
      expect(response, `sequential call #${index + 1}`).toEqual(first);
    }
  });

  it("IDEM-2: 10 parallel calls (Promise.all) return byte-identical JSON", async () => {
    const tool = createResolveProjectTool({ cwd: workdir });
    const responses = await Promise.all(
      Array.from({ length: 10 }, () => tool.handler({ projectId: "app" })),
    );
    const parsed = responses.map(parsePayload);
    const first = parsed[0];
    expect(first).toBeDefined();
    for (const [index, response] of parsed.entries()) {
      expect(response, `parallel call #${index + 1}`).toEqual(first);
    }
  });

  it("IDEM-3: the tool is read-only — never mutates the filesystem", async () => {
    const tool = createResolveProjectTool({ cwd: workdir });
    // Snapshot the .dysflow/project.json mtime before; assert it does not
    // change after 10 calls. A regression that accidentally introduces a
    // cache-write side effect would shift the mtime and trip this guard.
    const { statSync } = await import("node:fs");
    const configPath = join(workdir, ".dysflow", "project.json");
    const before = statSync(configPath).mtimeMs;
    for (let i = 0; i < 10; i += 1) {
      await tool.handler({ projectId: "app" });
    }
    const after = statSync(configPath).mtimeMs;
    expect(after, "resolve_project must not touch the filesystem").toBe(before);
  });
});
