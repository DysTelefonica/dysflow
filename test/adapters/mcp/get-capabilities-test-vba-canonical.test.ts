/**
 * Issue #1167 — unify `test_vba` canonical commit flag to `apply`.
 *
 * Before #1167, `test_vba` was the ONLY tool in the MCP registry that
 * committed with `dryRun: false` — every other write-class tool used
 * `apply: true` as the canonical commit signal (and `dryRun: true` as
 * the no-write alias). The inconsistency forced every AI consumer to
 * either memorize the per-tool rule or look it up via
 * `get_capabilities.tools[toolName].canonicalCommitFlag` per call.
 *
 * After #1167, `test_vba` joins the homogenized single-flag design:
 *
 *   `apply: true`                          → commit
 *   `apply: false`                         → plan
 *   `dryRun: false`                        → commit (legacy alias, accepted)
 *   `dryRun: true`                         → plan (legacy alias, accepted)
 *
 * `assets/examples/test-vba.md` is the canonical example
 * (mirrored in `dysflow-usage` skill) — its example call uses
 * `apply: true`. `get_capabilities().tools.test_vba.canonicalCommitFlag`
 * now reports `"apply"`, and the `legacyAliases` list carries `dryRun`.
 *
 * Acceptance criteria the test pins:
 *
 *   1. `get_capabilities.tools.test_vba.canonicalCommitFlag === "apply"`.
 *   2. `apply: true` commits a `test_vba` run (or returns the
 *      committed result if no side-effect).
 *   3. `dryRun: false` continues to work as a backward-compatible alias.
 *   4. CI smoke test asserts `canonicalCommitFlag === "apply"` for every
 *      advertised tool (a single test that loops `get_capabilities().tools`).
 *
 * The tests live in two files:
 *
 *   - This file — registry + adapter-level invariant.
 *   - `vba-execution-adapter-apply-flag.test.ts` — adapter-level
 *     behavioral test (apply:true commits, dryRun:false still commits,
 *     dryRun:true still plans, apply:false also plans).
 */

import { describe, expect, it } from "vitest";
import { getCapabilitiesAll } from "../../../src/adapters/mcp/get-capabilities-tool";
import { MCP_TOOL_CONTRACTS } from "../../../src/adapters/mcp/mcp-tool-contracts";
import {
  COMMIT_FLAG_REGISTRY,
  commitFlagMetadataForOrNoop,
  legacyAliasesFor,
} from "../../../src/core/runtime/commit-flag-registry";

function snapshot() {
  return getCapabilitiesAll({
    writesEnabled: true,
    writeAccessResolver: undefined,
    allowedProcedures: undefined,
    projectId: undefined,
    allowWrites: true,
  });
}

describe("get_capabilities — test_vba canonical commit flag unification (#1167)", () => {
  it("registry: test_vba reports commitFlag 'apply' and noWriteAlias 'dryRun' (parity with the rest of the write tools)", () => {
    const entry = COMMIT_FLAG_REGISTRY.test_vba;
    expect(entry).toBeDefined();
    expect(entry?.commitFlag).toBe("apply");
    expect(entry?.noWriteAlias).toBe("dryRun");
  });

  it("snapshot: test_vba.canonicalCommitFlag === 'apply' and legacyAliases includes 'dryRun'", () => {
    const tools = snapshot().tools as Record<
      string,
      { canonicalCommitFlag?: string; legacyAliases?: readonly string[] }
    >;
    expect(tools.test_vba?.canonicalCommitFlag).toBe("apply");
    expect(tools.test_vba?.legacyAliases).toContain("dryRun");
  });

  it("CI smoke: every advertised MCP tool reports canonicalCommitFlag === 'apply' (#1167 acceptance criterion 6)", () => {
    // Single test that loops `get_capabilities().tools` so a future tool
    // addition that accidentally reverts to the `dryRun` polarity is
    // caught at the registry / snapshot boundary. Mirrors the doctor
    // `apply polarity` category check but at the registry layer (pure,
    // no I/O).
    const tools = snapshot().tools as Record<string, { canonicalCommitFlag?: string }>;
    for (const name of Object.keys(MCP_TOOL_CONTRACTS)) {
      expect(
        tools[name]?.canonicalCommitFlag,
        `${name} canonicalCommitFlag must be 'apply' (#1167 unification)`,
      ).toBe("apply");
    }
  });

  it("registry helper commitFlagMetadataForOrNoop agrees with the snapshot for test_vba", () => {
    // The registry is the single source of truth — the snapshot
    // mirrors it. Pin both paths to be in lockstep.
    const entry = commitFlagMetadataForOrNoop("test_vba");
    expect(entry.commitFlag).toBe("apply");
    expect(entry.noWriteAlias).toBe("dryRun");
    expect(legacyAliasesFor("test_vba")).toContain("dryRun");
  });
});
