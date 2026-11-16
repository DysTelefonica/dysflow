/**
 * #1993 R3-session-write-switch-wiring — the stdio composition root hands the
 * MCP session write switch to the detached `test_vba` route, which records it
 * in `request.json` so the runner replays with the same switch.
 *
 * Driven through `createConfiguredServices` (the services the stdio server
 * builds) and the real MCP `test_vba` tool over a temporary project. Only the
 * detached runner spawn is faked, so no process is started.
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConfiguredServices } from "../../../src/adapters/mcp/stdio";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools";
import type { DysflowConfig } from "../../../src/core/config/dysflow-config";
import { callTool, PROCEDURES_JSON } from "../../_helpers/detached-test-runs-1993";

vi.mock("../../../src/adapters/test-runs/index", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/adapters/test-runs/index")>()),
  spawnDetachedTestRunner: async () => ({ pid: 4242, method: "spawn" }),
}));

let projectDir: string;

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), "dysflow-1993-stdio-switch-"));
  mkdirSync(join(projectDir, "src"), { recursive: true });
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

/** The request.json of the one detached run prepared under the project. */
function recordedRequest(): Record<string, unknown> {
  const [requestPath] = readdirSync(projectDir, { recursive: true, encoding: "utf8" })
    .filter((path) => /test-runs[\\/][^\\/]+[\\/]request\.json$/.test(path))
    .map((path) => join(projectDir, path));
  if (requestPath === undefined) throw new Error("no detached run was prepared");
  return JSON.parse(readFileSync(requestPath, "utf8")) as Record<string, unknown>;
}

describe("stdio services wire the session write switch to the detached route", () => {
  for (const sessionWritesEnabled of [true, false]) {
    it(`records writesEnabled=${sessionWritesEnabled} for the runner`, async () => {
      const config: DysflowConfig = {
        configSource: "repo-config",
        allowWrites: true,
        accessDbPath: join(projectDir, "front.accdb"),
        destinationRoot: join(projectDir, "src"),
        projectRoot: projectDir,
        timeoutMs: 30_000,
      };
      const services = createConfiguredServices(config, {
        cwd: projectDir,
        sessionWritesEnabled,
      });
      const tools = createDysflowMcpTools({
        services,
        writes: true,
        writeExecutionPolicy: "developer",
        cwd: projectDir,
      });

      const started = await callTool(tools, "test_vba", {
        proceduresJson: PROCEDURES_JSON,
        apply: true,
        detach: true,
        accessPath: join(projectDir, "front.accdb"),
        destinationRoot: join(projectDir, "src"),
      });

      expect(started.structuredContent?.error).toBeUndefined();
      expect(started.isError).toBe(false);
      expect(recordedRequest().writesEnabled).toBe(sessionWritesEnabled);
    });
  }
});
