import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { diagnoseProjectConfig } from "../../../src/adapters/config/project-config-diagnostic.js";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import { successResult } from "../../../src/core/contracts/index.js";

const projects: string[] = [];

function makeProject(): { root: string; destinationRoot: string } {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "issue-1814-")));
  projects.push(root);
  writeFileSync(join(root, ".git"), "gitdir: fixture", "utf8");
  mkdirSync(join(root, ".dysflow"), { recursive: true });
  writeFileSync(join(root, "Frontend.accdb"), "", "utf8");
  writeFileSync(join(root, "Backend.accdb"), "", "utf8");
  return { root, destinationRoot: join(root, "src") };
}

function payload<T extends Record<string, unknown> = Record<string, unknown>>(result: {
  content: readonly { text: string }[];
}): T {
  return JSON.parse(result.content[0]?.text ?? "{}") as T;
}

type DiagnosePayload = {
  projectConfig: { status: string; writeReady: boolean; diagnostics?: unknown[] };
  filesystem: { destinationRoot: { path: string; exists: boolean } };
};

function requiredTool(tools: ReturnType<typeof createDysflowMcpTools>, name: string) {
  const tool = tools.find((candidate) => candidate.name === name);
  if (tool === undefined) throw new Error(`Missing tool: ${name}`);
  return tool;
}

function makeTools(root: string) {
  const exportRequests: unknown[] = [];
  const registered = createDysflowMcpTools({
    services: {
      vbaService: {
        execute: async (_operation: unknown, request: unknown) => {
          exportRequests.push(request);
          return successResult({ binaryMutated: false, returnValue: "ok" });
        },
      },
      vbaSyncToolService: {
        execute: async (_operation: unknown, request: unknown) => {
          exportRequests.push(request);
          return successResult({ binaryMutated: false, returnValue: "ok" });
        },
      },
      queryService: { execute: async () => successResult({ rows: [] }) },
      diagnosticsService: { run: async () => successResult({ checks: [] }) },
    },
    writes: true,
    allowWrites: true,
    cwd: root,
    projectConfigResolver: (input, cwd = root) =>
      diagnoseProjectConfig(cwd, input as Record<string, unknown>),
  });
  return { registered, exportRequests };
}

async function configureProject(
  tools: ReturnType<typeof createDysflowMcpTools>,
  root: string,
  destinationRoot: string,
): Promise<void> {
  const setup = requiredTool(tools, "setup_project");
  const result = await setup.handler({
    cwd: root,
    projectId: "issue-1814-fixture",
    frontendFile: "Frontend.accdb",
    backendPath: "Backend.accdb",
    destinationRoot,
    capabilities: { allowWrites: true },
    apply: true,
  });
  if (result.isError) throw new Error(JSON.stringify(payload(result)));
  expect(payload(result)).toMatchObject({ ok: true, mode: "apply", dryRun: false });
}

afterEach(() => {
  for (const root of projects.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Issue #1814 — destination readiness coherence", () => {
  it("rechecks cached missing readiness before configured and equivalent export destinations", async () => {
    const { root, destinationRoot } = makeProject();
    mkdirSync(destinationRoot, { recursive: true });
    const { registered, exportRequests } = makeTools(root);
    await configureProject(registered, root, destinationRoot);

    const getCapabilities = requiredTool(registered, "get_capabilities");
    const diagnose = requiredTool(registered, "diagnose");
    const exportAll = requiredTool(registered, "export_all");
    rmSync(destinationRoot, { recursive: true, force: true });
    const initial = payload(await getCapabilities.handler({ cwd: root, view: "full" }));
    expect(initial.projectConfig).toMatchObject({
      status: "destination-root-not-found",
      writeReady: false,
    });

    mkdirSync(join(destinationRoot, "classes"), { recursive: true });
    mkdirSync(join(destinationRoot, "modules"), { recursive: true });
    mkdirSync(join(destinationRoot, "forms"), { recursive: true });
    mkdirSync(join(destinationRoot, "reports"), { recursive: true });

    const diagnosis = payload<DiagnosePayload>(await diagnose.handler({ cwd: root }));
    expect(diagnosis.projectConfig).toMatchObject({
      status: "valid",
      writeReady: true,
      diagnostics: [],
    });
    const diagnosedDestination = diagnosis.filesystem.destinationRoot.path as string;
    expect(diagnosis.filesystem.destinationRoot).toMatchObject({
      path: diagnosedDestination,
      exists: true,
    });

    const configured = await exportAll.handler({
      cwd: root,
      allowConfiguredDestinationRoot: true,
      apply: true,
    });
    expect(configured.isError).toBe(false);
    expect(payload(configured)).toMatchObject({ binaryMutated: false });

    const legacyAlias = await exportAll.handler({
      cwd: root,
      exportPath: destinationRoot,
      apply: true,
    });
    const explicitOverride = await exportAll.handler({
      cwd: root,
      destinationRoot,
      apply: true,
    });
    expect(legacyAlias.isError).toBe(false);
    expect(explicitOverride.isError).toBe(false);
    expect(exportRequests).toHaveLength(3);
  });

  it("keeps a deleted configured destination fail-closed and retries after remediation", async () => {
    const { root, destinationRoot } = makeProject();
    mkdirSync(destinationRoot, { recursive: true });
    const { registered, exportRequests } = makeTools(root);
    await configureProject(registered, root, destinationRoot);

    const getCapabilities = requiredTool(registered, "get_capabilities");
    const diagnose = requiredTool(registered, "diagnose");
    const exportAll = requiredTool(registered, "export_all");
    await getCapabilities.handler({ cwd: root, view: "full" });
    rmSync(destinationRoot, { recursive: true, force: true });

    const missingDiagnosis = payload<DiagnosePayload>(await diagnose.handler({ cwd: root }));
    const missingDestination = missingDiagnosis.filesystem.destinationRoot.path as string;
    expect(missingDiagnosis.filesystem.destinationRoot).toMatchObject({
      path: missingDestination,
      exists: false,
    });
    const refused = await exportAll.handler({
      cwd: root,
      allowConfiguredDestinationRoot: true,
      apply: true,
    });
    expect(refused.isError).toBe(true);
    expect(refused.content[0]?.text).toContain(
      `destinationRoot directory does not exist: ${missingDestination}.`,
    );
    expect(exportRequests).toHaveLength(0);

    mkdirSync(destinationRoot, { recursive: true });
    const retried = await exportAll.handler({
      cwd: root,
      allowConfiguredDestinationRoot: true,
      apply: true,
    });
    expect(retried.isError).toBe(false);
    expect(exportRequests).toHaveLength(1);
  });

  it("keeps setup_project-authored existing destinations valid from the first diagnostic", async () => {
    const { root, destinationRoot } = makeProject();
    mkdirSync(destinationRoot, { recursive: true });
    const { registered, exportRequests } = makeTools(root);
    await configureProject(registered, root, destinationRoot);

    const diagnose = requiredTool(registered, "diagnose");
    const exportAll = requiredTool(registered, "export_all");
    const diagnosis = payload<DiagnosePayload>(await diagnose.handler({ cwd: root }));
    const exported = await exportAll.handler({
      cwd: root,
      allowConfiguredDestinationRoot: true,
      apply: true,
    });

    const diagnosedDestination = diagnosis.filesystem.destinationRoot.path as string;
    expect(diagnosis.filesystem.destinationRoot).toMatchObject({
      path: diagnosedDestination,
      exists: true,
    });
    expect(diagnosis.projectConfig).toMatchObject({ status: "valid", writeReady: true });
    expect(exported.isError).toBe(false);
    expect(exportRequests).toHaveLength(1);
  });
});
