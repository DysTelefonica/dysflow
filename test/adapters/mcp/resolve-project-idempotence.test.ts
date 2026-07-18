import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createResolveProjectTool } from "../../../src/adapters/mcp/resolve-project-tool.js";
import type { McpToolResult } from "../../../src/adapters/mcp/result-translation.js";

/**
 * Issue #963 — `resolve_project` MUST be idempotent.
 *
 * The tool is documented as read-only; consumers (AI agents) rely on it as
 * a health-check primitive. The contract:
 *
 *   AC1 — 10 sequential calls with the same input return identical JSON.
 *   AC2 — filesystem changes between calls are reflected in subsequent calls.
 *   AC3 — there is no caching layer at the `resolve_project` level; each
 *          call performs a fresh filesystem validation.
 *
 * These tests exercise the tool through its factory (`createResolveProjectTool`)
 * so they stay refactor-safe: the handler is the contract surface, not its
 * internals. The fixture pattern mirrors `project-config-write-guard.test.ts`
 * and `resolve-project-tool.test.ts` — a tmpdir with `.git` marker so
 * `diagnoseProjectConfig` recognises it as a Git worktree.
 */

interface ResolvedPayload {
  projectId: string | null;
  outcome: "resolved" | "unresolved";
  reason: string;
  accessPath: string | null;
  projectRoot: string | null;
  sourceRoot: string | null;
  projectConfig: {
    status: string;
    writeReady: boolean;
    diagnostics: readonly { code: string; severity: string; message: string }[];
  };
}

function parsePayload(result: McpToolResult): ResolvedPayload {
  const text = result.content[0]?.text ?? "{}";
  return JSON.parse(text) as ResolvedPayload;
}

let workdir: string;

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), "dysflow-963-"));
  writeFileSync(join(workdir, ".git"), "gitdir: isolated-fixture");
});

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
});

function seedValidProject(destinationRootName = "src"): void {
  mkdirSync(join(workdir, ".dysflow"));
  mkdirSync(join(workdir, destinationRootName));
  writeFileSync(join(workdir, "app.accdb"), "");
  writeFileSync(
    join(workdir, ".dysflow", "project.json"),
    JSON.stringify({
      id: "app",
      accessPath: "app.accdb",
      destinationRoot: destinationRootName,
      capabilities: { allowWrites: true },
    }),
  );
}

describe("resolve_project idempotence (Round-12 #963)", () => {
  it("AC1: 10 sequential calls with same input return identical JSON", async () => {
    seedValidProject();
    const tool = createResolveProjectTool({ cwd: workdir });

    const responses: ResolvedPayload[] = [];
    for (let i = 0; i < 10; i += 1) {
      const result = await tool.handler({ projectId: "app" });
      expect(result.isError).toBe(false);
      responses.push(parsePayload(result));
    }

    // Every response must match the first one byte-for-byte.
    const first = responses[0];
    expect(first).toBeDefined();
    for (const [index, response] of responses.entries()) {
      expect(response, `call #${index + 1} should equal call #1`).toEqual(first);
    }
  });

  it("AC2: reflects filesystem changes between calls (delete destinationRoot → writeReady:false)", async () => {
    seedValidProject();
    const tool = createResolveProjectTool({ cwd: workdir });

    // Call 1: valid setup → writeReady:true.
    const first = parsePayload(await tool.handler({ projectId: "app" }));
    expect(first.outcome).toBe("resolved");
    expect(first.projectConfig.status).toBe("valid");
    expect(first.projectConfig.writeReady).toBe(true);

    // Mutate the filesystem: delete destinationRoot.
    rmSync(join(workdir, "src"), { recursive: true, force: true });

    // Call 2: must reflect the change.
    const second = parsePayload(await tool.handler({ projectId: "app" }));
    expect(second.projectConfig.writeReady).toBe(false);
    const failureCodes = second.projectConfig.diagnostics.map((d) => d.code);
    expect(failureCodes).toContain("DESTINATION_ROOT_NOT_FOUND");

    // Recreate destinationRoot.
    mkdirSync(join(workdir, "src"));

    // Call 3: must reflect the recovery.
    const third = parsePayload(await tool.handler({ projectId: "app" }));
    expect(third.projectConfig.writeReady).toBe(true);
    expect(third.projectConfig.status).toBe("valid");
  });

  it("AC3: no caching at the resolve_project level (each call re-reads the filesystem)", async () => {
    seedValidProject();
    const tool = createResolveProjectTool({ cwd: workdir });

    // Behavioural probe: mutate the config BETWEEN calls and confirm the
    // next call surfaces the new value. If a cache were active, the second
    // call would still report the old `accessPath` (or the first call's
    // diagnostic state). The mutation here changes the project's `id`,
    // which is read fresh from disk by `tryResolveProject` on every call.
    const first = parsePayload(await tool.handler({ projectId: "app" }));
    expect(first.outcome).toBe("resolved");
    expect(first.projectId).toBe("app");

    // Rewrite the file with a different `id`.
    writeFileSync(
      join(workdir, ".dysflow", "project.json"),
      JSON.stringify({
        id: "app-v2",
        accessPath: "app.accdb",
        destinationRoot: "src",
        capabilities: { allowWrites: true },
      }),
    );

    // Same input `{ projectId: "app" }` should now mismatch — if it didn't,
    // a stale cache is short-circuiting the disk read.
    const second = parsePayload(await tool.handler({ projectId: "app" }));
    expect(second.outcome).toBe("unresolved");
    expect(second.reason).toBe("id mismatch");

    // Sanity: passing the new id succeeds — confirming the read happened.
    const third = parsePayload(await tool.handler({ projectId: "app-v2" }));
    expect(third.outcome).toBe("resolved");
    expect(third.projectId).toBe("app-v2");
  });
});
