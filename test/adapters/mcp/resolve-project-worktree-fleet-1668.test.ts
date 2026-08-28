// Issue #1668 (round 18, gaps 1, 3, 6, 7) — how `resolve_project` behaves in a
// `worktree-per-change` fleet where every sibling commits the same project id,
// and which neighbouring contracts that behaviour must leave untouched.
//
// Everything is exercised through the public MCP handler surface against real
// project configs on disk. Nothing asserts on internal call order or private
// collaborators.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CHOICE_REASON,
  createWorktreeFleet,
  fleetTool,
  makeFleetTools,
  payload,
  SHARED_PROJECT_ID,
  samePath,
  type WorktreeFleet,
} from "../../_helpers/worktree-fleet-fixture.js";

let fleet: WorktreeFleet;

beforeEach(() => {
  fleet = createWorktreeFleet();
});

afterEach(() => {
  fleet.cleanup();
});

describe("resolve_project anchors an ambiguous fleet to the requested cwd", () => {
  it("resolves the worktree the cwd points at even when siblings share the project id", async () => {
    const target = fleet.worktrees[0] as string;
    const tools = makeFleetTools(target);

    const result = payload(await fleetTool(tools, "resolve_project").handler({ cwd: target }));

    expect(result.outcome).toBe("resolved");
    expect(result.projectId).toBe(SHARED_PROJECT_ID);
    const projectConfig = result.projectConfig as Record<string, unknown>;
    expect(samePath(projectConfig.projectRoot, target)).toBe(true);
  });

  it("resolves each sibling independently from the same fleet", async () => {
    for (const target of fleet.worktrees) {
      const result = payload(
        await fleetTool(makeFleetTools(target), "resolve_project").handler({ cwd: target }),
      );
      expect(result.outcome).toBe("resolved");
      const projectConfig = result.projectConfig as Record<string, unknown>;
      expect(samePath(projectConfig.projectRoot, target)).toBe(true);
    }
  });

  it("still reports ambiguity when the cwd owns no project config of its own", async () => {
    const result = payload(
      await fleetTool(makeFleetTools(fleet.observer), "resolve_project").handler({}),
    );

    expect(result.outcome).toBe("ambiguous");
    expect(result.availableProjects).toHaveLength(fleet.worktrees.length);
    expect(typeof result.recoveryToken).toBe("string");
  });

  it("reports PROJECT_ID_COLLISION when a duplicated id is chosen without a cwd", async () => {
    const tools = makeFleetTools(fleet.observer);
    const ambiguous = payload(await fleetTool(tools, "resolve_project").handler({}));

    // A trio that names the shared id but no worktree cannot identify a single
    // candidate, and must fail closed rather than pick one.
    const collided = await fleetTool(tools, "migrate_project_config").handler({
      projectId: SHARED_PROJECT_ID,
      projectChoiceReason: CHOICE_REASON,
      recoveryToken: ambiguous.recoveryToken,
      apply: false,
    });

    expect(collided.isError).toBe(true);
    expect(collided.error?.code).toBe("PROJECT_ID_COLLISION");
  });
});

describe("migrate_project_config leaves resolver state alone on the plan path", () => {
  it("keeps the resolve_project outcome identical across a plan-only migration", async () => {
    const tools = makeFleetTools(fleet.observer);
    const resolveProject = fleetTool(tools, "resolve_project");

    const before = payload(await resolveProject.handler({}));
    await fleetTool(tools, "migrate_project_config").handler({
      cwd: fleet.worktrees[0],
      apply: false,
    });
    const after = payload(await resolveProject.handler({}));

    expect(after.outcome).toBe(before.outcome);
    expect((after.availableProjects as unknown[]).length).toBe(
      (before.availableProjects as unknown[]).length,
    );
  });

  it("returns the complete review payload through the recovery trio path", async () => {
    const tools = makeFleetTools(fleet.observer);
    const ambiguous = payload(await fleetTool(tools, "resolve_project").handler({}));

    const result = payload(
      await fleetTool(tools, "migrate_project_config").handler({
        cwd: fleet.worktrees[0],
        projectId: SHARED_PROJECT_ID,
        projectChoiceReason: CHOICE_REASON,
        recoveryToken: ambiguous.recoveryToken,
        apply: false,
      }),
    );

    expect(result.outcome).toBe("ok");
    expect(result.applied).toBe(false);
    expect(result.configPath).toBeDefined();
    expect(result.current).toBeDefined();
    expect(result.proposed).toBeDefined();
    // `diff` is a unified-diff string that is empty when nothing needs
    // migrating. It is always present — never undefined, never an object.
    expect(typeof result.diff).toBe("string");
    expect(result.diff).toBe("");
    expect(result.remediation).toEqual([]);
  });
});

describe("the recovery token is consumed by resolution, not by a rejection", () => {
  it("survives a rejected selection and still commits the correct one", async () => {
    const tools = makeFleetTools(fleet.observer);
    const resolveProject = fleetTool(tools, "resolve_project");
    const ambiguous = payload(await resolveProject.handler({}));

    const rejected = await resolveProject.handler({
      cwd: fleet.worktrees[0],
      projectId: "an-id-that-is-not-in-the-envelope",
      projectChoiceReason: CHOICE_REASON,
      recoveryToken: ambiguous.recoveryToken,
    });
    expect(rejected.isError).toBe(true);

    const accepted = payload(
      await resolveProject.handler({
        cwd: fleet.worktrees[0],
        projectId: SHARED_PROJECT_ID,
        projectChoiceReason: CHOICE_REASON,
        recoveryToken: ambiguous.recoveryToken,
      }),
    );
    expect(accepted.outcome).toBe("resolved");
  });

  it("refuses to replay a token that already committed a selection", async () => {
    const tools = makeFleetTools(fleet.observer);
    const resolveProject = fleetTool(tools, "resolve_project");
    const ambiguous = payload(await resolveProject.handler({}));
    const trio = {
      cwd: fleet.worktrees[0],
      projectId: SHARED_PROJECT_ID,
      projectChoiceReason: CHOICE_REASON,
      recoveryToken: ambiguous.recoveryToken,
    };

    expect(payload(await resolveProject.handler(trio)).outcome).toBe("resolved");

    const replay = await resolveProject.handler(trio);
    expect(replay.isError).toBe(true);
    expect(replay.error?.code).toBe("MCP_INPUT_INVALID");
  });
});
