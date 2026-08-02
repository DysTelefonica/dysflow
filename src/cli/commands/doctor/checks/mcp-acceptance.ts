import { statSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { ProjectConfigDiagnostic } from "../../../../adapters/config/project-config-diagnostic.js";
import { RESULT_SCHEMA_VERSION } from "../../../../adapters/mcp/response-envelope.js";
import type {
  DysflowMcpServices,
  DysflowMcpTool,
} from "../../../../adapters/mcp/result-translation.js";
import { startWithSdkServer } from "../../../../adapters/mcp/stdio.js";
import { createDysflowMcpTools } from "../../../../adapters/mcp/tools.js";
import { successResult } from "../../../../core/contracts/index.js";
import { type DoctorCategoryCheck, doctorCheckMetadata } from "./types.js";

export type McpAcceptanceProbeResult =
  | { status: "pass"; message: string }
  | { status: "fail" | "unavailable"; message: string };

export type McpAcceptanceProbe = {
  responseSchema(): Promise<McpAcceptanceProbeResult>;
  ambiguityRecovery(): Promise<McpAcceptanceProbeResult>;
  setupProjectId(): Promise<McpAcceptanceProbeResult>;
};

function unavailable(error: unknown): McpAcceptanceProbeResult {
  return {
    status: "unavailable",
    message: error instanceof Error ? error.message : String(error),
  };
}

function services(vbaRequests: unknown[] = []): DysflowMcpServices {
  const vbaSyncToolService = {
    execute: async (_name: unknown, request?: unknown) => {
      vbaRequests.push(request);
      const record =
        typeof request === "object" && request !== null ? (request as Record<string, unknown>) : {};
      return successResult({
        ok: true,
        mode: "plan",
        dryRun: true,
        resolvedProjectId: record.projectId ?? null,
        resolvedCwd: record.cwd ?? null,
      });
    },
  };
  return {
    vbaService: vbaSyncToolService,
    vbaSyncToolService,
    queryService: { execute: async () => successResult({ rows: [] }) },
    diagnosticsService: { run: async () => successResult({ checks: [] }) },
    orphanCleanupService: {
      listOrphans: async () => successResult([]),
      cleanupOrphan: async () => successResult({ killed: [], refused: [], errors: [] }),
    },
  } as unknown as DysflowMcpServices;
}

function payload(result: { content: readonly { text: string }[] }): Record<string, unknown> {
  return JSON.parse(result.content.map((entry) => entry.text).join("\n")) as Record<
    string,
    unknown
  >;
}

function sameFilesystemPath(left: unknown, right: string): boolean {
  if (typeof left !== "string") return false;
  if (path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase()) return true;
  try {
    const leftStat = statSync(left, { bigint: true });
    const rightStat = statSync(right, { bigint: true });
    return leftStat.ino !== 0n && leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino;
  } catch {
    return false;
  }
}

async function withFixture<T>(prefix: string, run: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  try {
    return await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function withMcpClient<T>(
  tools: DysflowMcpTool[],
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const serverDone = startWithSdkServer(tools, serverTransport);
  const client = new Client({ name: "dysflow-doctor", version: "1.0.0" }, {});
  await client.connect(clientTransport);
  try {
    return await run(client);
  } finally {
    await client.close();
    await serverDone.catch(() => undefined);
  }
}

async function probeResponseSchema(): Promise<McpAcceptanceProbeResult> {
  try {
    return await withFixture("dysflow-doctor-schema-", async (root) => {
      const tool = createDysflowMcpTools({ services: services(), writes: false, cwd: root }).find(
        (candidate) => candidate.name === "get_capabilities",
      );
      if (tool === undefined)
        return { status: "fail", message: "get_capabilities is not registered" };

      return withMcpClient([tool], async (client) => {
        const result = await client.callTool({ name: "get_capabilities", arguments: {} });
        const envelope = result.structuredContent as Record<string, unknown> | undefined;
        return envelope?.schemaVersion === RESULT_SCHEMA_VERSION
          ? {
              status: "pass",
              message: `get_capabilities transport exposes schemaVersion:${RESULT_SCHEMA_VERSION}`,
            }
          : {
              status: "fail",
              message: `get_capabilities transport omitted schemaVersion:${RESULT_SCHEMA_VERSION}`,
            };
      });
    });
  } catch (error) {
    return unavailable(error);
  }
}

async function probeAmbiguityRecovery(): Promise<McpAcceptanceProbeResult> {
  try {
    return await withFixture("dysflow-doctor-recovery-", async (root) => {
      await mkdir(path.join(root, ".dysflow"), { recursive: true });
      await writeFile(
        path.join(root, ".dysflow", "project.json"),
        JSON.stringify({ id: "ambiguous-host", frontendFile: "host.accdb" }),
        "utf8",
      );
      const worktreeA = path.join(root, "worktree-a");
      const worktreeB = path.join(root, "worktree-b");
      for (const [worktree, frontendFile] of [
        [worktreeA, "a.accdb"],
        [worktreeB, "b.accdb"],
      ] as const) {
        await mkdir(path.join(worktree, ".dysflow"), { recursive: true });
        await mkdir(path.join(worktree, "src"), { recursive: true });
        await writeFile(path.join(worktree, frontendFile), "", "utf8");
        await writeFile(
          path.join(worktree, ".dysflow", "project.json"),
          JSON.stringify({ id: "shared-id", frontendFile, destinationRoot: "src" }),
          "utf8",
        );
      }

      const candidate = (projectRoot: string, frontendFile: string) => ({
        id: "shared-id",
        projectRoot,
        accessPath: path.join(projectRoot, frontendFile),
        destinationRoot: path.join(projectRoot, "src"),
        configPath: path.join(projectRoot, ".dysflow", "project.json"),
        active: false,
      });
      const candidates = [candidate(worktreeA, "a.accdb"), candidate(worktreeB, "b.accdb")];
      const projectConfigResolver = (_input: unknown, cwd = root): ProjectConfigDiagnostic => {
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
          configPath: path.join(cwd, ".dysflow", "project.json"),
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
      };

      const requests: unknown[] = [];
      const tools = createDysflowMcpTools({
        services: services(requests),
        writes: true,
        cwd: root,
        projectConfigResolver,
        accessContextResolver: async (request) => {
          const record = request as Record<string, unknown>;
          const projectRoot = typeof record.cwd === "string" ? record.cwd : root;
          return successResult({ projectRoot, accessPath: path.join(projectRoot, "a.accdb") });
        },
      });
      if (
        !tools.some((tool) => tool.name === "resolve_project") ||
        !tools.some((tool) => tool.name === "test_vba")
      )
        return { status: "fail", message: "recovery probe tools are not registered" };

      const resolveProject = tools.find((tool) => tool.name === "resolve_project");
      const testVba = tools.find((tool) => tool.name === "test_vba");
      if (resolveProject === undefined || testVba === undefined)
        return { status: "fail", message: "recovery probe tools are not registered" };

      {
        const ambiguous = payload(await resolveProject.handler({ cwd: root }));
        const recoveryToken = ambiguous?.recoveryToken;
        if (ambiguous?.outcome !== "ambiguous" || typeof recoveryToken !== "string")
          return { status: "fail", message: "sibling ambiguity did not issue a recovery token" };

        const recoveryArgs = {
          cwd: worktreeA,
          projectId: "shared-id",
          projectChoiceReason: "user_selected_after_ambiguous_project",
          recoveryToken,
          proceduresJson: JSON.stringify([{ procedure: "Test_Doctor", args: [] }]),
          apply: false,
        };
        const consumed = await testVba.handler(recoveryArgs);
        const consumedPayload = payload(consumed);
        const replay = await testVba.handler(recoveryArgs);
        const routed = requests.at(-1) as Record<string, unknown> | undefined;
        const ok =
          consumed.isError !== true &&
          consumedPayload.resolvedProjectId === "shared-id" &&
          sameFilesystemPath(consumedPayload.resolvedCwd, worktreeA) &&
          sameFilesystemPath(routed?.cwd, worktreeA) &&
          replay.isError === true &&
          replay.error?.code === "MCP_INPUT_INVALID";
        return ok
          ? {
              status: "pass",
              message: "sibling ambiguity token routes once through the chosen WorktreeContext",
            }
          : {
              status: "fail",
              message: "recovery trio was not consumed exactly once by the dispatch seam",
            };
      }
    });
  } catch (error) {
    return unavailable(error);
  }
}

async function probeSetupProjectId(): Promise<McpAcceptanceProbeResult> {
  try {
    return await withFixture("dysflow-doctor-setup-id-", async (root) => {
      await writeFile(path.join(root, ".git"), "gitdir: doctor-fixture", "utf8");
      await writeFile(path.join(root, "Frontend.accdb"), "", "utf8");
      const setupTools = () =>
        createDysflowMcpTools({ services: services(), writes: true, cwd: root });
      if (!setupTools().some((candidate) => candidate.name === "setup_project"))
        return { status: "fail", message: "setup_project is not registered" };
      const refused = await withMcpClient(setupTools(), (client) =>
        client.callTool({
          name: "setup_project",
          arguments: { cwd: root, frontendFile: "Frontend.accdb", apply: false },
        }),
      );
      const refusedEnvelope = refused.structuredContent as Record<string, unknown> | undefined;
      const refusedError = refusedEnvelope?.error as Record<string, unknown> | undefined;

      await mkdir(path.join(root, ".dysflow"), { recursive: true });
      await writeFile(
        path.join(root, ".dysflow", "project.json"),
        JSON.stringify({
          id: "configured-project",
          frontendFile: "Frontend.accdb",
          destinationRoot: "src",
          capabilities: { allowWrites: true },
        }),
        "utf8",
      );
      const reused = await withMcpClient(setupTools(), (client) =>
        client.callTool({
          name: "setup_project",
          arguments: { cwd: root, frontendFile: "Frontend.accdb", apply: false },
        }),
      );
      const reusedPayload = reused.structuredContent as Record<string, unknown> | undefined;
      const reusedConfig = reusedPayload?.resolvedConfig as Record<string, unknown> | undefined;
      const ok =
        refused.isError === true &&
        refusedEnvelope?.schemaVersion === RESULT_SCHEMA_VERSION &&
        refusedError?.code === "MCP_INPUT_INVALID" &&
        String(refusedError?.message).includes("projectId is required") &&
        reused.isError !== true &&
        reusedConfig?.id === "configured-project" &&
        reusedConfig.id !== path.basename(root);
      return ok
        ? {
            status: "pass",
            message:
              "setup_project requires an explicit id or reuses the existing WorktreeContext id",
          }
        : {
            status: "fail",
            message: "setup_project accepted an invented id or failed to reuse the configured id",
          };
    });
  } catch (error) {
    return unavailable(error);
  }
}

export const nodeMcpAcceptanceProbe: McpAcceptanceProbe = {
  responseSchema: probeResponseSchema,
  ambiguityRecovery: probeAmbiguityRecovery,
  setupProjectId: probeSetupProjectId,
};

export async function runMcpAcceptanceContractChecks(
  probe: McpAcceptanceProbe = nodeMcpAcceptanceProbe,
): Promise<DoctorCategoryCheck[]> {
  const definitions = [
    {
      name: "MCP response schema discriminator",
      checkId: "mcp_response_schema_version",
      run: () => probe.responseSchema(),
    },
    {
      name: "sibling worktree recovery token",
      checkId: "mcp_recovery_token_dispatch",
      run: () => probe.ambiguityRecovery(),
    },
    {
      name: "setup_project projectId fail-closed",
      checkId: "setup_project_id_fail_closed",
      run: () => probe.setupProjectId(),
    },
  ] as const;

  const checks: DoctorCategoryCheck[] = [];
  for (const definition of definitions) {
    const result = await definition.run().catch(unavailable);
    checks.push({
      ok: result.status === "pass",
      name: definition.name,
      message: result.status === "unavailable" ? `unavailable: ${result.message}` : result.message,
      severity: "critical",
      ...doctorCheckMetadata(definition.checkId),
    });
  }
  return checks;
}
