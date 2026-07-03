/**
 * #674 — Per-input allowedProcedures resolution.
 *
 * The gate (canonical-handlers.ts:ensureProcedureAllowed) was driven by a
 * frozen `allowedProcedures` array captured at MCP server startup. That let
 * a caller pass the gate with project A's allowlist and execute against
 * project B's binary.
 *
 * `resolveAllowedProceduresFor` accepts either the legacy array (backward
 * compatible) or a resolver function that is called per-input. The resolver
 * returns the allowlist of the project the input targets.
 */

import { describe, expect, it, vi } from "vitest";
import {
  type AllowedProcedures,
  resolveAllowedProceduresFor,
} from "../../../src/adapters/mcp/allowed-procedures-resolver";

describe("resolveAllowedProceduresFor (#674 per-input allowlist)", () => {
  it("returns undefined when allowed is undefined (default-deny)", async () => {
    expect(await resolveAllowedProceduresFor(undefined, {})).toBeUndefined();
  });

  it("returns the array verbatim when allowed is the legacy array form", async () => {
    const allowed: AllowedProcedures = ["Test_A", "Test_B"];
    expect(await resolveAllowedProceduresFor(allowed, {})).toEqual(["Test_A", "Test_B"]);
  });

  it("calls the resolver with the input and returns its value", async () => {
    const resolver = vi.fn(async (input: unknown) => {
      const i = input as { project: string };
      return i.project === "A" ? ["Test_A"] : ["Test_B"];
    });
    const allowed: AllowedProcedures = resolver;
    expect(await resolveAllowedProceduresFor(allowed, { project: "A" })).toEqual(["Test_A"]);
    expect(await resolveAllowedProceduresFor(allowed, { project: "B" })).toEqual(["Test_B"]);
    expect(resolver).toHaveBeenCalledTimes(2);
  });

  it("returns the resolver's value per input — the cross-project leak fix", async () => {
    // Two projects with different allowlists. The resolver returns the
    // allowlist of the project the input targets. Project A's allowlist
    // does NOT grant access to Test_B; the gate should refuse a call that
    // targets project A with procedureName=Test_B even when project B
    // would allow it.
    const allowed: AllowedProcedures = async (input: unknown) => {
      const i = input as { project: string };
      if (i.project === "A") return ["Test_A"];
      if (i.project === "B") return ["Test_A", "Test_B"];
      return undefined;
    };
    // Input targets project A with Test_B — gate should see A's allowlist
    // and refuse. Previously (frozen array) the gate would have used the
    // startup union of both allowlists and passed.
    const result = await resolveAllowedProceduresFor(allowed, {
      project: "A",
      procedureName: "Test_B",
    });
    expect(result).toEqual(["Test_A"]);
    // And the gate's logic: "Test_B" is NOT in ["Test_A"] → refused.
    expect(result?.includes("Test_B")).toBe(false);
  });

  it("returns undefined on resolver throw (fail-closed)", async () => {
    const allowed: AllowedProcedures = async () => {
      throw new Error("resolver blew up");
    };
    expect(await resolveAllowedProceduresFor(allowed, {})).toBeUndefined();
  });
});
