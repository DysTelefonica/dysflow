// Issue #1668 (round 18, gap 5) — `bootstrap` reporting
// `humanCompilePending: false` next to an ambiguous `resolve_project` read as
// "the workflow is unblocked" when in fact no project had been evaluated at
// all. `bootstrap` deliberately never resolves a project, so the fix is to
// make the two very different `false` values distinguishable rather than to
// give `bootstrap` a resolver it is documented not to have.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getCapabilitiesAll } from "../../../src/adapters/mcp/get-capabilities-tool.js";
import {
  createWorktreeFleet,
  fleetTool,
  makeFleetTools,
  payload,
  type WorktreeFleet,
} from "../../_helpers/worktree-fleet-fixture.js";

let fleet: WorktreeFleet;

beforeEach(() => {
  fleet = createWorktreeFleet();
});

afterEach(() => {
  fleet.cleanup();
});

describe("bootstrap discloses the scope its compile-pending flag was evaluated in", () => {
  it("reports no-project-in-scope when the process started without a frontend", async () => {
    const tools = makeFleetTools(fleet.worktrees[0] as string);

    const snapshot = payload(
      await fleetTool(tools, "bootstrap").handler({ cwd: fleet.worktrees[0] }),
    );

    expect(snapshot.humanCompilePending).toBe(false);
    expect(snapshot.humanCompilePendingScope).toBe("no-project-in-scope");
  });

  it("does not claim the cwd is resolvable — resolve_project remains the authority", async () => {
    const tools = makeFleetTools(fleet.observer);

    const snapshot = payload(await fleetTool(tools, "bootstrap").handler({}));
    const resolution = payload(await fleetTool(tools, "resolve_project").handler({}));

    // The two answers are allowed to disagree: bootstrap never resolves a
    // project, and its scope field is what tells the consumer so.
    expect(snapshot.humanCompilePendingScope).toBe("no-project-in-scope");
    expect(resolution.outcome).toBe("ambiguous");
  });

  it("reports project-in-scope once a frontend is in scope", () => {
    const snapshot = getCapabilitiesAll({
      writesEnabled: true,
      allowWrites: true,
      writeAccessResolver: undefined,
      allowedProcedures: undefined,
      projectId: undefined,
      accessDbPath: `${fleet.worktrees[0]}/app.accdb`,
    });

    expect(snapshot.humanCompilePendingScope).toBe("project-in-scope");
    expect(typeof snapshot.humanCompilePending).toBe("boolean");
  });
});
