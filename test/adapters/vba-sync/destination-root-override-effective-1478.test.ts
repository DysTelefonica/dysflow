import { describe, expect, it } from "vitest";
import {
  type DestinationRootOrchestratorLike,
  resolveDestinationRoot,
} from "../../../src/adapters/vba-sync/destination-root-override.js";
import { successResult } from "../../../src/core/contracts/index.js";

/**
 * Issue #1478 — `resolvedDestinationRoot` echoed the caller's raw input, so a
 * relative override read back as `"src"` in the success envelope while the
 * write actually landed in `<root>/src/src/forms/`. The reported value must be
 * the EFFECTIVE root the resolver produced, or the envelope hides the defect
 * from the consumer's logs.
 */
function orchestratorResolving(destinationRoot: string): DestinationRootOrchestratorLike {
  return {
    cwd: "C:/repo",
    destinationRoot: "C:/repo/src",
    resolveExecutionTarget: async () =>
      successResult({ destinationRoot, projectRoot: destinationRoot }),
  };
}

describe("resolveDestinationRoot — effective value reporting (#1478)", () => {
  it("reports the resolved absolute root for a relative override, not the raw input", async () => {
    const resolution = await resolveDestinationRoot(
      { destinationRoot: "src" },
      orchestratorResolving("C:/repo/src"),
    );

    expect(resolution.resolved).toBe("C:/repo/src");
    expect(resolution.resolved).not.toBe("src");
    expect(resolution.source).toBe("override");
  });

  it("keeps an absolute override byte-identical and still tags it as an override", async () => {
    const resolution = await resolveDestinationRoot(
      { destinationRoot: "D:/exports/tmp" },
      orchestratorResolving("D:/exports/tmp"),
    );

    expect(resolution.resolved).toBe("D:/exports/tmp");
    expect(resolution.source).toBe("override");
  });

  it("falls back to the raw override when the orchestrator cannot resolve a target", async () => {
    const unresolvable: DestinationRootOrchestratorLike = {
      cwd: "C:/repo",
      resolveExecutionTarget: async () => undefined as never,
    };

    const resolution = await resolveDestinationRoot({ destinationRoot: "src" }, unresolvable);

    expect(resolution.resolved).toBe("src");
    expect(resolution.source).toBe("override");
  });
});
