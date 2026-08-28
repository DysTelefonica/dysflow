// Issue #1668 (round 18, gap 2) — a rejected recovery trio must name the one
// field the caller has to change. The previous single "must include the exact
// projectId, projectChoiceReason, and recoveryToken trio" message covered six
// distinct causes, so a consumer that supplied all three fields could not tell
// which one the runtime had refused.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CHOICE_REASON,
  createWorktreeFleet,
  fleetTool,
  makeFleetTools,
  payload,
  SHARED_PROJECT_ID,
  type ToolHandler,
  type WorktreeFleet,
} from "../../_helpers/worktree-fleet-fixture.js";

let fleet: WorktreeFleet;
let resolveProject: ToolHandler;

beforeEach(() => {
  fleet = createWorktreeFleet();
  resolveProject = fleetTool(makeFleetTools(fleet.observer), "resolve_project");
});

afterEach(() => {
  fleet.cleanup();
});

async function issueEnvelope(): Promise<string> {
  const ambiguous = payload(await resolveProject.handler({}));
  return String(ambiguous.recoveryToken);
}

describe("a rejected recovery trio names the exact field at fault", () => {
  it("accepts the literal trio taken from availableProjects", async () => {
    const ambiguous = payload(await resolveProject.handler({}));
    const chosen = (ambiguous.availableProjects as { projectId: string; projectRoot: string }[])[0];
    if (chosen === undefined) throw new Error("Expected at least one available project");

    const resolved = payload(
      await resolveProject.handler({
        cwd: chosen.projectRoot,
        projectId: chosen.projectId,
        projectChoiceReason: CHOICE_REASON,
        recoveryToken: ambiguous.recoveryToken,
      }),
    );

    expect(resolved.outcome).toBe("resolved");
  });

  it("names an omitted projectId as missingParam", async () => {
    const token = await issueEnvelope();

    const rejected = await resolveProject.handler({
      cwd: fleet.worktrees[0],
      projectChoiceReason: CHOICE_REASON,
      recoveryToken: token,
    });

    expect(rejected.error?.code).toBe("MCP_INPUT_INVALID");
    expect(rejected.error?.missingParam).toBe("projectId");
  });

  it("names an omitted recoveryToken as missingParam", async () => {
    await issueEnvelope();

    const rejected = await resolveProject.handler({
      cwd: fleet.worktrees[0],
      projectId: SHARED_PROJECT_ID,
      projectChoiceReason: CHOICE_REASON,
    });

    expect(rejected.error?.code).toBe("MCP_INPUT_INVALID");
    expect(rejected.error?.missingParam).toBe("recoveryToken");
  });

  it("names a present-but-wrong projectChoiceReason as the rejected field", async () => {
    const token = await issueEnvelope();

    const rejected = await resolveProject.handler({
      cwd: fleet.worktrees[0],
      projectId: SHARED_PROJECT_ID,
      projectChoiceReason: "because-i-said-so",
      recoveryToken: token,
    });

    expect(rejected.error?.code).toBe("MCP_INPUT_INVALID");
    expect(rejected.error?.rejectedFlag).toBe("projectChoiceReason");
    // The message carries the literal the caller has to use.
    expect(String(rejected.error?.message)).toContain(CHOICE_REASON);
  });

  it("distinguishes a stale token from a malformed trio", async () => {
    await issueEnvelope();

    const stale = await resolveProject.handler({
      cwd: fleet.worktrees[0],
      projectId: SHARED_PROJECT_ID,
      projectChoiceReason: CHOICE_REASON,
      recoveryToken: "a-token-this-process-never-issued",
    });

    expect(stale.error?.code).toBe("MCP_INPUT_INVALID");
    expect(stale.error?.rejectedFlag).toBe("recoveryToken");
    expect(String(stale.error?.message)).toMatch(/unknown or has already been consumed/i);
  });

  it("names projectId when the chosen project is outside the envelope", async () => {
    const token = await issueEnvelope();

    const rejected = await resolveProject.handler({
      cwd: fleet.worktrees[0],
      projectId: "an-id-that-is-not-in-the-envelope",
      projectChoiceReason: CHOICE_REASON,
      recoveryToken: token,
    });

    expect(rejected.error?.code).toBe("MCP_INPUT_INVALID");
    expect(rejected.error?.rejectedFlag).toBe("projectId");
  });
});
