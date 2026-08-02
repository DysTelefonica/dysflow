import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ProjectConfigDiagnostic } from "../../../src/adapters/config/project-config-diagnostic.js";
import {
  createInvocationTelemetryContextResolver,
  type InvocationTelemetryContextResolver,
  type InvocationTelemetryEntry,
} from "../../../src/adapters/mcp/invocation-telemetry.js";
import type { DysflowMcpServices } from "../../../src/adapters/mcp/result-translation.js";
import { startWithSdkServer } from "../../../src/adapters/mcp/stdio.js";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import { successResult } from "../../../src/core/contracts/index.js";

let startupRoot: string;
let worktreeA: string;
let worktreeB: string;

beforeEach(() => {
  startupRoot = mkdtempSync(join(tmpdir(), "dysflow-recovery-telemetry-"));
  mkdirSync(join(startupRoot, ".dysflow"), { recursive: true });
  writeFileSync(
    join(startupRoot, ".dysflow", "project.json"),
    JSON.stringify({ id: "ambiguous-host", frontendFile: "host.accdb" }),
  );
  worktreeA = createCandidate("worktree-a", "a.accdb");
  worktreeB = createCandidate("worktree-b", "b.accdb");
});

afterEach(() => {
  rmSync(startupRoot, { recursive: true, force: true });
});

function createCandidate(name: string, frontendFile: string): string {
  const projectRoot = join(startupRoot, name);
  mkdirSync(join(projectRoot, ".dysflow"), { recursive: true });
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, frontendFile), "");
  writeFileSync(
    join(projectRoot, ".dysflow", "project.json"),
    JSON.stringify({ id: "shared-id", frontendFile, destinationRoot: "src" }),
  );
  return projectRoot;
}

function project(projectRoot: string, frontendFile: string) {
  return {
    id: "shared-id",
    projectRoot,
    accessPath: join(projectRoot, frontendFile),
    destinationRoot: join(projectRoot, "src"),
    configPath: join(projectRoot, ".dysflow", "project.json"),
    active: false,
  };
}

function diagnostic(cwd: string): ProjectConfigDiagnostic {
  const candidates = [project(worktreeA, "a.accdb"), project(worktreeB, "b.accdb")];
  const selected = candidates.find(
    (candidate) => resolve(candidate.projectRoot).toLowerCase() === resolve(cwd).toLowerCase(),
  );
  if (selected !== undefined) {
    return {
      status: "valid",
      cwd,
      configPath: selected.configPath,
      projectRoot: selected.projectRoot,
      projectId: selected.id,
      accessPath: selected.accessPath,
      backendPath: null,
      destinationRoot: selected.destinationRoot,
      writeReady: true,
      discoveredProjects: [selected],
      diagnostics: [],
      remediation: null,
    };
  }
  return {
    status: "ambiguous",
    cwd,
    configPath: join(cwd, ".dysflow", "project.json"),
    projectRoot: cwd,
    projectId: null,
    accessPath: null,
    backendPath: null,
    destinationRoot: null,
    writeReady: false,
    discoveredProjects: candidates,
    diagnostics: [
      {
        code: "PROJECT_ID_COLLISION",
        severity: "error",
        message: "The same project id is visible in two worktrees.",
      },
    ],
    remediation: "Choose one advertised worktree with the recovery trio.",
  };
}

function payload(result: { content: readonly { text: string }[] }) {
  return JSON.parse(result.content.map((entry) => entry.text).join("\n")) as Record<
    string,
    unknown
  >;
}

async function telemetryEntries(projectRoot: string): Promise<InvocationTelemetryEntry[]> {
  const text = await readFile(
    join(projectRoot, ".dysflow", "runtime", "invocations.jsonl"),
    "utf8",
  );
  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as InvocationTelemetryEntry);
}

describe("authenticated recovery telemetry rebinding (#1340)", () => {
  it("records a fresh setup_project trio only in the chosen worktree and never rebinds replay", async () => {
    const tools = createDysflowMcpTools({
      services: {
        vbaService: { execute: async () => successResult({ returnValue: null }) },
        queryService: { execute: async () => successResult({ rows: [] }) },
        diagnosticsService: { run: async () => successResult({ checks: [] }) },
      } as unknown as DysflowMcpServices,
      writes: true,
      cwd: startupRoot,
      projectConfigResolver: (_input, cwd = startupRoot) => diagnostic(cwd),
    });
    const invocationContextResolver = createInvocationTelemetryContextResolver({
      fallback: {
        cwd: startupRoot,
        enabled: true,
        writeExecutionPolicy: "safe-by-default",
      },
      resolveTarget: async (input) => {
        const args =
          input !== null && typeof input === "object" && !Array.isArray(input)
            ? (input as Record<string, unknown>)
            : {};
        // A raw recovery trio is not authenticated telemetry evidence. This
        // models the production resolver refusing the colliding pre-handler input.
        if (Object.hasOwn(args, "recoveryToken")) return undefined;
        const cwd = typeof args.cwd === "string" ? args.cwd : startupRoot;
        const selected = diagnostic(cwd);
        if (selected.status !== "valid") return undefined;
        return {
          cwd: selected.projectRoot,
          enabled: true,
          writeExecutionPolicy: "developer",
        };
      },
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const serverDone = startWithSdkServer(tools, serverTransport, {
      invocationContextResolver,
      resultValidationPolicy: "enforce",
    });
    const client = new Client({ name: "recovery-telemetry-test", version: "1" }, {});
    await client.connect(clientTransport);

    try {
      const ambiguous = await client.callTool({
        name: "resolve_project",
        arguments: { cwd: startupRoot },
      });
      const token = payload(ambiguous as { content: readonly { text: string }[] }).recoveryToken;
      expect(typeof token).toBe("string");
      const recoveryInput = {
        cwd: worktreeB,
        projectId: "shared-id",
        projectChoiceReason: "user_selected_after_ambiguous_project",
        recoveryToken: token,
      };

      const fresh = await client.callTool({ name: "setup_project", arguments: recoveryInput });
      expect(fresh.isError).not.toBe(true);
      await expect(telemetryEntries(worktreeA)).rejects.toThrow();
      await expect(telemetryEntries(startupRoot)).rejects.toThrow();
      expect(await telemetryEntries(worktreeB)).toEqual([
        expect.objectContaining({
          tool: "setup_project",
          outcome: "ok",
          writeIntent: "dryRun",
          auditEvents: ["trio-consumed:shared-id"],
        }),
      ]);

      const replay = await client.callTool({ name: "setup_project", arguments: recoveryInput });
      expect(replay.isError).toBe(true);
      expect(payload(replay as { content: readonly { text: string }[] })).toMatchObject({
        ok: false,
        error: { code: "MCP_INPUT_INVALID" },
      });
      expect(await telemetryEntries(worktreeB)).toHaveLength(1);
      await expect(telemetryEntries(startupRoot)).rejects.toThrow();
    } finally {
      await client.close();
      await serverDone.catch(() => undefined);
    }
  });

  it.each([
    "missing-capability",
    "undefined",
    "throw",
  ] as const)("fails closed instead of retaining a raw-input recorder when authenticated resolution is %s", async (failureMode) => {
    const tools = createDysflowMcpTools({
      services: {
        vbaService: { execute: async () => successResult({ returnValue: null }) },
        queryService: { execute: async () => successResult({ rows: [] }) },
        diagnosticsService: { run: async () => successResult({ checks: [] }) },
      } as unknown as DysflowMcpServices,
      writes: true,
      cwd: startupRoot,
      projectConfigResolver: (_input, cwd = startupRoot) => diagnostic(cwd),
    });
    const entriesFromRawInput: InvocationTelemetryEntry[] = [];
    const invocationContextResolver = (async () => ({
      recorder: {
        record: async (entry: InvocationTelemetryEntry) => {
          entriesFromRawInput.push(entry);
        },
      },
      writeExecutionPolicy: "safe-by-default" as const,
    })) as InvocationTelemetryContextResolver;
    if (failureMode !== "missing-capability") {
      invocationContextResolver.resolveAuthenticatedProjectRoot = async () => {
        if (failureMode === "throw") throw new Error("authenticated telemetry target unavailable");
        return undefined;
      };
    }

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const serverDone = startWithSdkServer(tools, serverTransport, {
      invocationContextResolver,
      resultValidationPolicy: "enforce",
    });
    const client = new Client({ name: "recovery-telemetry-fail-closed-test", version: "1" }, {});
    await client.connect(clientTransport);

    try {
      const ambiguous = await client.callTool({
        name: "resolve_project",
        arguments: { cwd: startupRoot },
      });
      const token = payload(ambiguous as { content: readonly { text: string }[] }).recoveryToken;
      entriesFromRawInput.length = 0;

      const fresh = await client.callTool({
        name: "setup_project",
        arguments: {
          cwd: worktreeB,
          projectId: "shared-id",
          projectChoiceReason: "user_selected_after_ambiguous_project",
          recoveryToken: token,
        },
      });

      expect(fresh.isError).not.toBe(true);
      expect(entriesFromRawInput).toEqual([]);
    } finally {
      await client.close();
      await serverDone.catch(() => undefined);
    }
  });
});
