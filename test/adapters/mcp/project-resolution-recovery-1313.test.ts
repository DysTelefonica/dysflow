import { spawnSync } from "node:child_process";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ProjectConfigDiagnostic } from "../../../src/adapters/config/project-config-diagnostic.js";
import { MCP_TOOL_CONTRACTS } from "../../../src/adapters/mcp/mcp-tool-contracts.js";
import { createProjectResolutionRecovery } from "../../../src/adapters/mcp/project-resolution-recovery.js";
import { createResolveProjectTool } from "../../../src/adapters/mcp/resolve-project-tool.js";
import type {
  DysflowMcpServices,
  DysflowMcpTool,
} from "../../../src/adapters/mcp/result-translation.js";
import { inputSchemaForTool } from "../../../src/adapters/mcp/schema-tool.js";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import { successResult } from "../../../src/core/contracts/index.js";

class FakeService {
  readonly requests: unknown[] = [];

  async execute(request: unknown) {
    this.requests.push(request);
    return successResult({ ok: true });
  }

  async run() {
    return successResult({ checks: [] });
  }
}

let root: string;
let alphaRoot: string;
let betaRoot: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "dysflow-1313-"));
  alphaRoot = createCandidate("alpha", "Alpha.accdb");
  betaRoot = createCandidate("beta", "Beta.accdb");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  delete process.env.DYSFLOW_RESOLUTION_CACHE_TTL_MS;
});

function createCandidate(projectId: string, frontendFile: string): string {
  const projectRoot = join(root, projectId);
  mkdirSync(join(projectRoot, ".dysflow"), { recursive: true });
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, frontendFile), "");
  writeFileSync(
    join(projectRoot, ".dysflow", "project.json"),
    JSON.stringify({ id: projectId, frontendFile, destinationRoot: "src" }),
  );
  return projectRoot;
}

function candidate(
  projectId: string,
  projectRoot: string,
): NonNullable<ProjectConfigDiagnostic["discoveredProjects"]>[number] {
  return {
    id: projectId,
    projectRoot,
    accessPath: join(projectRoot, `${projectId === "alpha" ? "Alpha" : "Beta"}.accdb`),
    destinationRoot: join(projectRoot, "src"),
    configPath: join(projectRoot, ".dysflow", "project.json"),
    active: false,
  };
}

function diagnostic(projectId?: string): ProjectConfigDiagnostic {
  const projects = [candidate("alpha", alphaRoot), candidate("beta", betaRoot)];
  if (projectId === "alpha" || projectId === "beta") {
    const selected = projects.find((entry) => entry.id === projectId);
    if (selected === undefined) throw new Error(`Missing fixture project ${projectId}`);
    return {
      status: "valid",
      cwd: root,
      configPath: selected.configPath,
      projectRoot: selected.projectRoot,
      projectId,
      accessPath: selected.accessPath,
      backendPath: null,
      destinationRoot: selected.destinationRoot,
      writeReady: true,
      discoveredProjects: projects,
      diagnostics: [],
      remediation: null,
    };
  }
  return {
    status: "ambiguous",
    cwd: root,
    configPath: join(root, ".dysflow", "project.json"),
    projectRoot: root,
    projectId: null,
    accessPath: null,
    backendPath: null,
    destinationRoot: null,
    writeReady: false,
    discoveredProjects: projects,
    diagnostics: [
      {
        code: "FRONTEND_TARGET_AMBIGUOUS",
        severity: "error",
        message: "Multiple projects are visible.",
      },
    ],
    remediation: "Choose a project.",
  };
}

function payload(result: { content: readonly { text: string }[] }) {
  return JSON.parse(result.content.map((entry) => entry.text).join("\n")) as Record<
    string,
    unknown
  > & { recoveryToken?: string };
}

function toolByName(tools: readonly DysflowMcpTool[], name: string): DysflowMcpTool {
  const tool = tools.find((candidate) => candidate.name === name);
  if (tool === undefined) throw new Error(`Missing tool ${name}`);
  return tool;
}

function git(cwd: string, ...args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
}

function createRealSiblingWorktrees(options: { duplicateIds?: boolean } = {}) {
  const container = mkdtempSync(join(tmpdir(), "dysflow-1313-git-"));
  const main = join(container, "main");
  const sibling = join(container, "sibling");
  mkdirSync(main);
  git(main, "init", "-q");
  git(main, "config", "user.email", "tests@dysflow.invalid");
  git(main, "config", "user.name", "Dysflow Tests");
  writeFileSync(join(main, "seed.txt"), "seed");
  git(main, "add", "seed.txt");
  git(main, "commit", "-qm", "test seed");
  git(main, "worktree", "add", "-q", "-b", "test-sibling", sibling);
  const mainId = options.duplicateIds ? "duplicate" : "main-project";
  const siblingId = options.duplicateIds ? "duplicate" : "sibling-project";
  for (const [projectRoot, projectId, frontend] of [
    [main, mainId, "Main.accdb"],
    [sibling, siblingId, "Sibling.accdb"],
  ] as const) {
    mkdirSync(join(projectRoot, ".dysflow"), { recursive: true });
    mkdirSync(join(projectRoot, "src"));
    writeFileSync(join(projectRoot, frontend), "");
    writeFileSync(
      join(projectRoot, ".dysflow", "project.json"),
      JSON.stringify({ id: projectId, frontendFile: frontend, destinationRoot: "src" }),
    );
  }
  // Issue #1668 — `resolve_project` now anchors an ambiguous fleet to the
  // worktree the cwd names, so a cwd that IS a candidate resolves directly.
  // The observer is a sibling directory owning no project config; it is the
  // only vantage point from which the fleet is still genuinely ambiguous.
  const observer = join(container, "observer");
  mkdirSync(observer);
  return { container, main, observer, sibling, mainId, siblingId };
}

async function removeRealSiblingWorktrees(
  fixture: ReturnType<typeof createRealSiblingWorktrees>,
): Promise<void> {
  spawnSync("git", ["worktree", "remove", "--force", fixture.sibling], {
    cwd: fixture.main,
    encoding: "utf8",
  });
  await new Promise((resolve) => setTimeout(resolve, 250));
  makeWritableRecursively(fixture.sibling);
  await rm(fixture.sibling, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  git(fixture.main, "worktree", "prune");
  makeWritableRecursively(fixture.container);
  await rm(fixture.container, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
}

function makeWritableRecursively(path: string): void {
  try {
    chmodSync(path, 0o700);
    if (!lstatSync(path).isDirectory()) return;
    for (const entry of readdirSync(path)) {
      makeWritableRecursively(join(path, entry));
    }
  } catch {
    // The path may already have been removed successfully by git worktree remove.
  }
}

function makeTools() {
  const service = new FakeService();
  const tools = createDysflowMcpTools({
    services: {
      vbaService: service,
      vbaSyncToolService: service,
      queryService: service,
      diagnosticsService: service,
    } as unknown as DysflowMcpServices,
    writes: true,
    cwd: root,
    projectConfigResolver: (input) =>
      diagnostic(
        typeof input === "object" && input !== null
          ? ((input as Record<string, unknown>).projectId as string | undefined)
          : undefined,
      ),
  });
  return { service, tools };
}

describe("issue #1313 project recovery token", () => {
  it("discovers real sibling worktrees and resolves the human-selected candidate", async () => {
    const fixture = createRealSiblingWorktrees();
    try {
      const resolveProject = createResolveProjectTool({ cwd: fixture.observer });
      const ambiguous = payload(await resolveProject.handler({}));
      expect(ambiguous).toMatchObject({
        outcome: "ambiguous",
        availableProjects: expect.arrayContaining([
          expect.objectContaining({ projectId: fixture.mainId, projectRoot: fixture.main }),
          expect.objectContaining({ projectId: fixture.siblingId, projectRoot: fixture.sibling }),
        ]),
      });

      const selected = payload(
        await resolveProject.handler({
          cwd: fixture.sibling,
          projectId: fixture.siblingId,
          projectChoiceReason: "user_selected_after_ambiguous_project",
          recoveryToken: String(ambiguous.recoveryToken),
        }),
      );
      expect(selected).toMatchObject({
        outcome: "resolved",
        projectId: fixture.siblingId,
        projectConfig: expect.objectContaining({
          status: "valid",
        }),
      });
      const selectedProjectConfig = selected.projectConfig as { projectRoot: string };
      expect(realpathSync.native(selectedProjectConfig.projectRoot).toLowerCase()).toBe(
        realpathSync.native(fixture.sibling).toLowerCase(),
      );
    } finally {
      await removeRealSiblingWorktrees(fixture);
    }
  });

  it("honors a worktree context pre-warmed by register_worktree", async () => {
    const fixture = createRealSiblingWorktrees();
    const service = new FakeService();
    const tools = createDysflowMcpTools({
      services: {
        vbaService: service,
        vbaSyncToolService: service,
        queryService: service,
        diagnosticsService: service,
      } as unknown as DysflowMcpServices,
      cwd: fixture.main,
    });
    const registerWorktree = toolByName(tools, "register_worktree");
    const resolveProject = toolByName(tools, "resolve_project");
    const clearWorktreeCache = toolByName(tools, "clear_worktree_cache");

    try {
      const registered = payload(await registerWorktree.handler({ cwd: fixture.main }));
      expect(registered).toMatchObject({
        ok: true,
        context: {
          projectId: fixture.mainId,
          discoveredProjects: [expect.objectContaining({ id: fixture.mainId })],
        },
      });

      const resolved = payload(await resolveProject.handler({ cwd: fixture.main }));
      expect(resolved).toMatchObject({
        outcome: "resolved",
        projectId: fixture.mainId,
        projectConfig: expect.objectContaining({ status: "valid" }),
      });
      expect(
        realpathSync
          .native((resolved.projectConfig as { projectRoot: string }).projectRoot)
          .toLowerCase(),
      ).toBe(realpathSync.native(fixture.main).toLowerCase());
    } finally {
      await clearWorktreeCache.handler({ cwd: fixture.main });
      await removeRealSiblingWorktrees(fixture);
    }
  });

  it("uses cwd to disambiguate duplicate IDs in real sibling worktrees", async () => {
    const fixture = createRealSiblingWorktrees({ duplicateIds: true });
    try {
      // Issue #1668 — the cwd names one worktree of the duplicate-id fleet, so
      // the resolver commits to it without routing through a recovery envelope
      // whose N identical choices could not discriminate anyway.
      const resolveProject = createResolveProjectTool({ cwd: fixture.main });
      const selected = payload(await resolveProject.handler({}));
      expect(selected).toMatchObject({
        outcome: "resolved",
        projectId: "duplicate",
        projectConfig: expect.objectContaining({ status: "valid" }),
      });
      expect(
        realpathSync
          .native((selected.projectConfig as { projectRoot: string }).projectRoot)
          .toLowerCase(),
      ).toBe(realpathSync.native(fixture.main).toLowerCase());
    } finally {
      await removeRealSiblingWorktrees(fixture);
    }
  });

  it("reports real multiple-frontend ambiguity without pretending a project choice picks a file", async () => {
    const container = mkdtempSync(join(tmpdir(), "dysflow-1313-frontends-"));
    const projectRoot = join(container, "project");
    mkdirSync(projectRoot);
    git(projectRoot, "init", "-q");
    mkdirSync(join(projectRoot, ".dysflow"));
    mkdirSync(join(projectRoot, "src"));
    writeFileSync(join(projectRoot, "A.accdb"), "");
    writeFileSync(join(projectRoot, "B.accdb"), "");
    writeFileSync(
      join(projectRoot, ".dysflow", "project.json"),
      JSON.stringify({ id: "frontend-project", destinationRoot: "src" }),
    );
    try {
      const resolveProject = createResolveProjectTool({ cwd: projectRoot });
      const result = payload(await resolveProject.handler({}));
      expect(result.outcome).toBe("ambiguous");
      expect(result.availableProjects).toEqual([
        expect.objectContaining({ projectId: "frontend-project", accessPath: null }),
      ]);
    } finally {
      rmSync(container, { recursive: true, force: true });
    }
  });

  it("returns an opaque recovery envelope for an ambiguous resolution", async () => {
    const { tools } = makeTools();
    const resolveProject = toolByName(tools, "resolve_project");

    const result = payload(await resolveProject.handler({}));

    expect(result).toMatchObject({
      outcome: "ambiguous",
      availableProjects: [
        { projectId: "alpha", projectRoot: alphaRoot },
        { projectId: "beta", projectRoot: betaRoot },
      ],
    });
    expect(result.recoveryToken).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(result.recoveryInstruction).toContain("projectChoiceReason");
  });

  it("commits a valid human choice through resolve_project and reuses its cache", async () => {
    const { tools } = makeTools();
    const resolveProject = toolByName(tools, "resolve_project");
    const ambiguous = payload(await resolveProject.handler({}));

    const selected = payload(
      await resolveProject.handler({
        projectId: "beta",
        projectChoiceReason: "user_selected_after_ambiguous_project",
        recoveryToken: String(ambiguous.recoveryToken),
      }),
    );
    const cached = payload(await resolveProject.handler({}));

    expect(selected).toMatchObject({ outcome: "resolved", projectId: "beta" });
    expect(cached).toMatchObject({ outcome: "resolved", projectId: "beta" });
  });

  it("fails closed with MCP_INPUT_INVALID for a bad token", async () => {
    const { tools } = makeTools();
    const resolveProject = toolByName(tools, "resolve_project");

    const result = await resolveProject.handler({
      projectId: "beta",
      projectChoiceReason: "user_selected_after_ambiguous_project",
      recoveryToken: "not-the-issued-token",
    });

    expect(result.isError).toBe(true);
    expect(result.error?.code).toBe("MCP_INPUT_INVALID");
    expect(result.error?.remediation).toContain("fresh recoveryToken");
  });

  it("consumes the trio at write dispatch and injects the cached projectId", async () => {
    const { service, tools } = makeTools();
    const resolveProject = toolByName(tools, "resolve_project");
    const queryExecute = toolByName(tools, "query_execute");
    const ambiguous = payload(await resolveProject.handler({}));

    const applied = await queryExecute.handler({
      sql: "UPDATE T SET A = 1",
      mode: "write",
      apply: true,
      projectId: "alpha",
      projectChoiceReason: "user_selected_after_ambiguous_project",
      recoveryToken: String(ambiguous.recoveryToken),
    });

    expect(applied.isError).toBe(false);
    expect(service.requests.at(-1)).toMatchObject({ projectId: "alpha" });
    const cachedDispatch = await queryExecute.handler({
      sql: "SELECT * FROM T",
      mode: "read",
    });
    expect(cachedDispatch.isError).toBe(false);
    expect(service.requests.at(-1)).toMatchObject({ projectId: "alpha" });
    expect(queryExecute.inputSchema?.properties).toHaveProperty("projectChoiceReason");
    expect(queryExecute.inputSchema?.properties).toHaveProperty("recoveryToken");
  });

  it("clears and invalidates cached choices when project config bytes change", async () => {
    const { tools } = makeTools();
    const resolveProject = toolByName(tools, "resolve_project");
    const ambiguous = payload(await resolveProject.handler({}));
    await resolveProject.handler({
      projectId: "alpha",
      projectChoiceReason: "user_selected_after_ambiguous_project",
      recoveryToken: String(ambiguous.recoveryToken),
    });

    writeFileSync(
      join(alphaRoot, ".dysflow", "project.json"),
      JSON.stringify({ id: "alpha", frontendFile: "Alpha.accdb", destinationRoot: "changed" }),
    );
    const invalidated = payload(await resolveProject.handler({}));
    expect(invalidated.outcome).toBe("ambiguous");

    const freshToken = invalidated.recoveryToken;
    await resolveProject.handler({
      projectId: "beta",
      projectChoiceReason: "user_selected_after_ambiguous_project",
      recoveryToken: String(freshToken),
    });
    const cleared = payload(await resolveProject.handler({ clearResolution: true }));
    expect(cleared.outcome).toBe("ambiguous");
    expect(cleared.recoveryToken).not.toBe(freshToken);
  });

  it("uses the 10-minute default TTL and honors DYSFLOW_RESOLUTION_CACHE_TTL_MS", () => {
    expect(createProjectResolutionRecovery({ env: {} }).ttlMs).toBe(600_000);
    expect(
      createProjectResolutionRecovery({
        env: { DYSFLOW_RESOLUTION_CACHE_TTL_MS: "2500" },
      }).ttlMs,
    ).toBe(2_500);
    expect(
      createProjectResolutionRecovery({
        env: { DYSFLOW_RESOLUTION_CACHE_TTL_MS: "unsafe" },
      }).ttlMs,
    ).toBe(600_000);
    for (const value of ["0", "999", "1.5", "3600001", "Infinity", "NaN"]) {
      expect(
        createProjectResolutionRecovery({
          env: { DYSFLOW_RESOLUTION_CACHE_TTL_MS: value },
        }).ttlMs,
        value,
      ).toBe(600_000);
    }
    expect(
      createProjectResolutionRecovery({
        env: { DYSFLOW_RESOLUTION_CACHE_TTL_MS: "1000" },
      }).ttlMs,
    ).toBe(1_000);
    expect(
      createProjectResolutionRecovery({
        env: { DYSFLOW_RESOLUTION_CACHE_TTL_MS: "3600000" },
      }).ttlMs,
    ).toBe(3_600_000);
  });

  it("expires both outstanding tokens and cached choices at the configured TTL", () => {
    let now = 0;
    const recovery = createProjectResolutionRecovery({
      env: { DYSFLOW_RESOLUTION_CACHE_TTL_MS: "1000" },
      now: () => now,
      token: () => `token-${now}`,
    });
    const first = recovery.issue(diagnostic());
    now = 1_001;
    expect(
      recovery.consume({
        projectId: "alpha",
        projectChoiceReason: "user_selected_after_ambiguous_project",
        recoveryToken: first.recoveryToken,
      }),
    ).toMatchObject({ ok: false, code: "MCP_INPUT_INVALID" });

    const second = recovery.issue(diagnostic());
    expect(
      recovery.consume({
        projectId: "beta",
        projectChoiceReason: "user_selected_after_ambiguous_project",
        recoveryToken: second.recoveryToken,
      }),
    ).toMatchObject({ ok: true });
    now = 2_002;
    expect(recovery.getCached()).toBeNull();
  });

  it("preserves PROJECT_ID_COLLISION when the chosen id is not unique", () => {
    const recovery = createProjectResolutionRecovery({ token: () => "opaque-token" });
    const ambiguous = diagnostic();
    ambiguous.discoveredProjects = [
      candidate("alpha", alphaRoot),
      { ...candidate("beta", betaRoot), id: "alpha" },
    ];
    const envelope = recovery.issue(ambiguous);

    const result = recovery.consume({
      projectId: "alpha",
      projectChoiceReason: "user_selected_after_ambiguous_project",
      recoveryToken: envelope.recoveryToken,
    });

    expect(result).toMatchObject({ ok: false, code: "PROJECT_ID_COLLISION" });
  });

  it("advertises recovery fields on every write-class runtime and catalog schema", () => {
    const { tools } = makeTools();
    for (const tool of tools) {
      const contract = MCP_TOOL_CONTRACTS[tool.name as keyof typeof MCP_TOOL_CONTRACTS];
      if (contract?.access === "read-only") continue;
      expect(tool.inputSchema?.properties, tool.name).toHaveProperty("projectId");
      expect(tool.inputSchema?.properties, tool.name).toHaveProperty("projectChoiceReason");
      expect(tool.inputSchema?.properties, tool.name).toHaveProperty("recoveryToken");
      expect(inputSchemaForTool(tool.name).properties, tool.name).toHaveProperty(
        "projectChoiceReason",
      );
      expect(inputSchemaForTool(tool.name).properties, tool.name).toHaveProperty("recoveryToken");
    }
  });

  it("routes setup_project recovery to a safe cached-resolution result without overwrite", async () => {
    const { tools } = makeTools();
    const resolveProject = toolByName(tools, "resolve_project");
    const setupProject = toolByName(tools, "setup_project");
    const ambiguous = payload(await resolveProject.handler({}));
    const before = JSON.parse(
      await import("node:fs/promises").then(({ readFile }) =>
        readFile(join(alphaRoot, ".dysflow", "project.json"), "utf8"),
      ),
    );

    const result = await setupProject.handler({
      projectId: "alpha",
      projectChoiceReason: "user_selected_after_ambiguous_project",
      recoveryToken: String(ambiguous.recoveryToken),
    });
    const after = JSON.parse(
      await import("node:fs/promises").then(({ readFile }) =>
        readFile(join(alphaRoot, ".dysflow", "project.json"), "utf8"),
      ),
    );

    expect(result.isError).toBe(false);
    expect(payload(result)).toMatchObject({
      ok: true,
      mode: "resolution",
      projectId: "alpha",
      cached: true,
    });
    expect(after).toEqual(before);
  });

  it("keeps the example and HR-11 harness aligned with the runtime schema", () => {
    const example = readFileSync("assets/examples/resolve-project-recovery.md", "utf8");
    const harness = readFileSync("skills/dysflow-protocol/SKILL.md", "utf8");
    const embeddedHarness = readFileSync("AGENTS.md", "utf8");
    const resolveSchema = inputSchemaForTool("resolve_project").properties ?? {};

    for (const field of ["projectId", "projectChoiceReason", "recoveryToken", "clearResolution"]) {
      expect(resolveSchema, field).toHaveProperty(field);
      expect(example, field).toContain(field);
    }
    expect(example).toContain("DYSFLOW_RESOLUTION_CACHE_TTL_MS");
    expect(harness).toContain("HR-11 — Bootstrap and ambiguity recovery are different operations");
    expect(harness).toContain("user_selected_after_ambiguous_project");
    expect(embeddedHarness).toContain("HR-11 — Recover ambiguity without overwriting config");
    expect(embeddedHarness).toContain("user_selected_after_ambiguous_project");
  });
});
