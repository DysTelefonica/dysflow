import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ProjectConfigDiagnostic } from "../../../src/adapters/config/project-config-diagnostic.js";
import { setupProjectResultContract } from "../../../src/adapters/mcp/contracts/bootstrap-result-contracts.js";
import { validateToolResult } from "../../../src/adapters/mcp/contracts/result-validation.js";
import type { DysflowMcpServices } from "../../../src/adapters/mcp/result-translation.js";
import { startWithSdkServer } from "../../../src/adapters/mcp/stdio.js";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import type { McpToolContext } from "../../../src/adapters/mcp/types.js";
import { successResult } from "../../../src/core/contracts/index.js";

class FakeVbaSyncService {
  readonly requests: unknown[] = [];

  async execute(_name: unknown, request?: unknown) {
    this.requests.push(request);
    return successResult({
      ok: true,
      mode: "plan",
      dryRun: true,
      resolvedProjectId:
        typeof request === "object" && request !== null
          ? ((request as Record<string, unknown>).projectId ?? null)
          : null,
    });
  }
}

let repoRoot: string;
let worktreeA: string;
let worktreeB: string;

beforeEach(() => {
  repoRoot = mkdtempSync(join(tmpdir(), "dysflow-recovery-trio-"));
  mkdirSync(join(repoRoot, ".dysflow"), { recursive: true });
  writeFileSync(
    join(repoRoot, ".dysflow", "project.json"),
    JSON.stringify({ id: "ambiguous-host", frontendFile: "host.accdb" }),
  );
  worktreeA = createCandidate("worktree-a", "a.accdb");
  worktreeB = createCandidate("worktree-b", "b.accdb");
});

afterEach(() => {
  rmSync(repoRoot, { recursive: true, force: true });
});

function createCandidate(name: string, frontendFile: string): string {
  const projectRoot = join(repoRoot, name);
  mkdirSync(join(projectRoot, ".dysflow"), { recursive: true });
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, frontendFile), "");
  writeFileSync(
    join(projectRoot, ".dysflow", "project.json"),
    JSON.stringify({ id: "shared-id", frontendFile, destinationRoot: "src" }),
  );
  return projectRoot;
}

function candidate(projectRoot: string, frontendFile: string) {
  return {
    id: "shared-id",
    projectRoot,
    accessPath: join(projectRoot, frontendFile),
    destinationRoot: join(projectRoot, "src"),
    configPath: join(projectRoot, ".dysflow", "project.json"),
    active: false,
  };
}

function sameFilesystemPath(left: string, right: string): boolean {
  const normalizedLeft = resolve(left).toLowerCase();
  const normalizedRight = resolve(right).toLowerCase();
  if (normalizedLeft === normalizedRight) return true;
  try {
    const leftStat = statSync(left, { bigint: true });
    const rightStat = statSync(right, { bigint: true });
    return leftStat.ino !== 0n && leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino;
  } catch {
    return false;
  }
}

function diagnostic(cwd: string): ProjectConfigDiagnostic {
  const candidates = [candidate(worktreeA, "a.accdb"), candidate(worktreeB, "b.accdb")];
  const selected = candidates.find((entry) => sameFilesystemPath(entry.projectRoot, cwd));
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

function makeTools() {
  const vbaSyncToolService = new FakeVbaSyncService();
  const resolverCwds: string[] = [];
  const orphanListRequests: unknown[] = [];
  const orphanCleanupService = {
    listOrphans: async (request: unknown) => {
      orphanListRequests.push(request);
      return successResult([]);
    },
    cleanupOrphan: async () => successResult({ killed: [], refused: [], errors: [] }),
  };
  const tools = createDysflowMcpTools({
    services: {
      vbaService: vbaSyncToolService,
      vbaSyncToolService,
      queryService: { execute: async () => successResult({ rows: [] }) },
      diagnosticsService: { run: async () => successResult({ checks: [] }) },
      orphanCleanupService,
    } as unknown as DysflowMcpServices,
    writes: true,
    cwd: repoRoot,
    accessContextResolver: async (request) => {
      const record =
        typeof request === "object" && request !== null ? (request as Record<string, unknown>) : {};
      const projectRoot = typeof record.cwd === "string" ? record.cwd : repoRoot;
      return successResult({
        projectRoot,
        accessPath: join(projectRoot, projectRoot === worktreeB ? "b.accdb" : "a.accdb"),
      });
    },
    projectConfigResolver: (_input, cwd = repoRoot) => {
      resolverCwds.push(cwd);
      return diagnostic(cwd);
    },
  });
  return { orphanListRequests, resolverCwds, tools, vbaSyncToolService };
}

async function createSdkHarness(tools: ReturnType<typeof createDysflowMcpTools>) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const serverDone = startWithSdkServer(tools, serverTransport);
  const client = new Client({ name: "recovery-security-test", version: "0.0.1" }, {});
  await client.connect(clientTransport);
  return {
    client,
    close: async () => {
      await client.close();
      await serverDone.catch(() => undefined);
    },
  };
}

describe("recovery_token trio disambiguates projectId at write-class tool sites", () => {
  it("consumes the recovery trio on test_vba before collision detection and routes by cwd", async () => {
    const { tools, vbaSyncToolService } = makeTools();
    const resolveProject = tools.find((tool) => tool.name === "resolve_project");
    const testVba = tools.find((tool) => tool.name === "test_vba");
    if (resolveProject === undefined || testVba === undefined) throw new Error("Missing MCP tools");

    const ambiguous = payload(await resolveProject.handler({ cwd: repoRoot }));
    expect(ambiguous.outcome).toBe("ambiguous");
    expect(ambiguous.availableProjects).toHaveLength(2);
    expect(typeof ambiguous.recoveryToken).toBe("string");

    const context: McpToolContext = { auditEvents: [] };
    const result = await testVba.handler(
      {
        cwd: worktreeA,
        projectId: "shared-id",
        projectChoiceReason: "user_selected_after_ambiguous_project",
        recoveryToken: ambiguous.recoveryToken,
        proceduresJson: JSON.stringify([{ procedure: "Test_Recovery", args: [] }]),
        apply: false,
      },
      context,
    );

    expect(result.error).toBeUndefined();
    expect(result.isError).toBe(false);
    expect(payload(result)).toMatchObject({
      ok: true,
      mode: "plan",
      dryRun: true,
      resolvedProjectId: "shared-id",
    });
    expect(vbaSyncToolService.requests.at(-1)).toMatchObject({
      cwd: worktreeA,
      projectId: "shared-id",
    });
    expect(context.auditEvents).toEqual(["trio-consumed:shared-id"]);

    const replay = await testVba.handler({
      cwd: worktreeA,
      projectId: "shared-id",
      projectChoiceReason: "user_selected_after_ambiguous_project",
      recoveryToken: ambiguous.recoveryToken,
      proceduresJson: JSON.stringify([{ procedure: "Test_Recovery", args: [] }]),
      apply: false,
    });
    expect(replay.isError).toBe(true);
    expect(replay.error?.code).toBe("MCP_INPUT_INVALID");
  });

  it("routes apply:true through the chosen worktree cache instead of a fresh collision check", async () => {
    const { resolverCwds, tools } = makeTools();
    const resolveProject = tools.find((tool) => tool.name === "resolve_project");
    const testVba = tools.find((tool) => tool.name === "test_vba");
    if (resolveProject === undefined || testVba === undefined) throw new Error("Missing MCP tools");
    const ambiguous = payload(await resolveProject.handler({ cwd: repoRoot }));

    const applied = await testVba.handler({
      cwd: worktreeA,
      projectId: "shared-id",
      projectChoiceReason: "user_selected_after_ambiguous_project",
      recoveryToken: ambiguous.recoveryToken,
      proceduresJson: JSON.stringify([{ procedure: "Test_Recovery", args: [] }]),
      apply: true,
    });

    expect(applied.isError).toBe(false);
    expect(resolverCwds.some((cwd) => sameFilesystemPath(cwd, worktreeA))).toBe(true);
  });

  it("routes setup_project and resolve_project through the same cwd-bound recovery selection", async () => {
    const first = makeTools().tools;
    const firstResolve = first.find((tool) => tool.name === "resolve_project");
    const setupProject = first.find((tool) => tool.name === "setup_project");
    if (firstResolve === undefined || setupProject === undefined)
      throw new Error("Missing MCP tools");
    const setupToken = payload(await firstResolve.handler({ cwd: repoRoot })).recoveryToken;
    const recoveryInput = {
      cwd: worktreeB,
      projectId: "shared-id",
      projectChoiceReason: "user_selected_after_ambiguous_project",
      recoveryToken: setupToken,
    };
    const setupResult = await setupProject.handler(recoveryInput);
    const setup = payload(setupResult);
    expect(
      validateToolResult({
        toolName: "setup_project",
        contract: setupProjectResultContract,
        payload: setup,
        policy: "enforce",
      }),
    ).toEqual({ ok: true });
    expect(setup).toMatchObject({
      ok: true,
      mode: "resolution",
      projectId: "shared-id",
      resolvedProjectId: "shared-id",
      resolvedConfig: expect.objectContaining({ id: "shared-id" }),
    });
    expect(sameFilesystemPath(String(setup.projectRoot), worktreeB)).toBe(true);

    const replay = await setupProject.handler(recoveryInput);
    expect(replay.isError).toBe(true);
    expect(replay.error?.code).toBe("MCP_INPUT_INVALID");

    const second = makeTools().tools;
    const secondResolve = second.find((tool) => tool.name === "resolve_project");
    if (secondResolve === undefined) throw new Error("Missing resolve_project");
    const resolveToken = payload(await secondResolve.handler({ cwd: repoRoot })).recoveryToken;
    const resolved = payload(
      await secondResolve.handler({
        cwd: worktreeA,
        projectId: "shared-id",
        projectChoiceReason: "user_selected_after_ambiguous_project",
        recoveryToken: resolveToken,
      }),
    );
    expect(resolved).toMatchObject({
      outcome: "resolved",
      projectId: "shared-id",
      projectConfig: expect.any(Object),
    });
    const resolvedProjectConfig = resolved.projectConfig as Record<string, unknown>;
    expect(sameFilesystemPath(String(resolvedProjectConfig.projectRoot), worktreeA)).toBe(true);
  });

  it("projects only public resolved config fields through the MCP transport", async () => {
    writeFileSync(
      join(worktreeB, ".dysflow", "project.json"),
      JSON.stringify({
        id: "shared-id",
        frontendFile: "b.accdb",
        destinationRoot: "src",
        timeoutMs: 12_345,
        httpToken: "literal-secret",
        unknownExtension: "unknown-secret",
        capabilities: {
          allowWrites: true,
          writeExecutionPolicy: "developer",
          credentials: { token: "nested-secret" },
          unknownNested: { value: "nested-extension-secret" },
        },
      }),
    );
    const { tools } = makeTools();
    const { client, close } = await createSdkHarness(tools);

    try {
      const ambiguousResponse = await client.callTool({
        name: "resolve_project",
        arguments: { cwd: repoRoot },
      });
      const ambiguousText =
        (ambiguousResponse.content as Array<{ text?: string }>)[0]?.text ?? "{}";
      const ambiguous = JSON.parse(ambiguousText) as Record<string, unknown>;
      const setupResponse = await client.callTool({
        name: "setup_project",
        arguments: {
          cwd: worktreeB,
          projectId: "shared-id",
          projectChoiceReason: "user_selected_after_ambiguous_project",
          recoveryToken: ambiguous.recoveryToken,
        },
      });
      const setupText = (setupResponse.content as Array<{ text?: string }>)[0]?.text ?? "{}";
      const setup = JSON.parse(setupText) as Record<string, unknown>;

      expect(setupResponse.isError).toBeFalsy();
      expect(setup.resolvedConfig).toEqual({
        id: "shared-id",
        frontendFile: "b.accdb",
        destinationRoot: "src",
        timeoutMs: 12_345,
        capabilities: { allowWrites: true, writeExecutionPolicy: "developer" },
      });
      expect(JSON.stringify(setupResponse)).not.toMatch(
        /literal-secret|unknown-secret|nested-secret|nested-extension-secret/,
      );
      expect(setup.resolvedConfig).not.toHaveProperty("httpToken");
      expect(setup.resolvedConfig).not.toHaveProperty("unknownExtension");
      expect(setup.resolvedConfig).not.toHaveProperty("capabilities.credentials");
      expect(setup.resolvedConfig).not.toHaveProperty("capabilities.unknownNested");
    } finally {
      await close();
    }
  });

  it.each([
    { toolName: "migrate_project_config", selected: "a" },
    { toolName: "access_force_cleanup_orphaned", selected: "b" },
  ] as const)("routes $toolName through the chosen worktree", async ({ toolName, selected }) => {
    const chosenRoot = selected === "a" ? worktreeA : worktreeB;
    const { orphanListRequests, tools } = makeTools();
    const resolveProject = tools.find((tool) => tool.name === "resolve_project");
    const target = tools.find((tool) => tool.name === toolName);
    if (resolveProject === undefined || target === undefined) throw new Error("Missing MCP tools");
    const ambiguous = payload(await resolveProject.handler({ cwd: repoRoot }));

    const result = await target.handler({
      cwd: chosenRoot,
      projectId: "shared-id",
      projectChoiceReason: "user_selected_after_ambiguous_project",
      recoveryToken: ambiguous.recoveryToken,
      ...(toolName === "migrate_project_config" ? { apply: false } : {}),
    });

    expect(result.error?.code).not.toBe("PROJECT_ID_COLLISION");
    expect(result.isError).toBe(false);
    const resultPayload = payload(result);
    if (toolName === "migrate_project_config") {
      expect(resolve(String(resultPayload.configPath))).toBe(
        resolve(join(chosenRoot, ".dysflow", "project.json")),
      );
    } else {
      expect(orphanListRequests.at(-1)).toMatchObject({
        accessPath: join(chosenRoot, "b.accdb"),
      });
    }
  });
});
