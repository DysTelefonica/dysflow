// Issue #1668 (round 18, gap 4) — a mistyped parameter must be rejected by
// name. The consumer reported `lint_module({ moduleName })` as a silent
// success; it was in fact rejected, but the rejection said "module is
// required." and carried no structured field, which sent the caller looking
// for a second parameter to add instead of a misspelling to fix.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createWorktreeFleet,
  fleetTool,
  makeFleetTools,
  type ToolHandler,
  type WorktreeFleet,
} from "../../_helpers/worktree-fleet-fixture.js";

let fleet: WorktreeFleet;
let lintModule: ToolHandler;

beforeEach(() => {
  fleet = createWorktreeFleet(["wt-1"]);
  lintModule = fleetTool(makeFleetTools(fleet.worktrees[0] as string), "lint_module");
});

afterEach(() => {
  fleet.cleanup();
});

describe("an unknown parameter is reported before a missing required one", () => {
  it("rejects lint_module's mistyped moduleName by name and suggests the real parameter", async () => {
    const result = await lintModule.handler({ cwd: fleet.worktrees[0], moduleName: "Anything" });

    expect(result.isError).toBe(true);
    expect(result.error?.code).toBe("MCP_INPUT_INVALID");
    expect(String(result.error?.message)).toContain("moduleName is not allowed.");
    expect(String(result.error?.message)).toContain("Did you mean 'module'?");
    expect(result.error?.rejectedFlag).toBe("moduleName");
  });

  it("still names module as missingParam when nothing unknown was passed", async () => {
    const result = await lintModule.handler({ cwd: fleet.worktrees[0] });

    expect(result.isError).toBe(true);
    expect(result.error?.code).toBe("MCP_INPUT_INVALID");
    expect(result.error?.missingParam).toBe("module");
  });

  it("accepts the documented parameter and produces a real lint report", async () => {
    const result = await lintModule.handler({
      cwd: fleet.worktrees[0],
      module: "Sample",
      source: "Option Compare Database\r\nOption Explicit\r\n\r\nPublic Sub Noop()\r\nEnd Sub\r\n",
    });

    expect(result.isError).toBe(false);
    const report = JSON.parse(result.content.map((entry) => entry.text).join("\n")) as {
      isClean: boolean;
      summary: { errors: number };
    };
    expect(report.isClean).toBe(true);
    expect(report.summary.errors).toBe(0);
  });
});

describe("the same enrichment reaches the rest of the analysis family", () => {
  it("names an unknown parameter on get_procedure", async () => {
    const getProcedure = fleetTool(makeFleetTools(fleet.worktrees[0] as string), "get_procedure");

    const result = await getProcedure.handler({
      cwd: fleet.worktrees[0],
      module: "Sample",
      procedureName: "Noop",
    });

    expect(result.isError).toBe(true);
    expect(result.error?.code).toBe("MCP_INPUT_INVALID");
    expect(result.error?.rejectedFlag).toBe("procedureName");
  });
});
