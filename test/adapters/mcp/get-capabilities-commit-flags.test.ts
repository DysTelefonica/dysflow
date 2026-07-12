/**
 * Issue #757 (C2) — `get_capabilities` exposes per-tool commit metadata.
 *
 * Before #757, an AI consumer had to read schema docs / the dysflow-usage
 * skill to learn which flag (`apply`, `dryRun`, `diff`) commits a tool.
 * Now the snapshot carries a structured map so the consumer can branch
 * programmatically without consulting documentation.
 *
 * ## Snapshot shape (additive — preexisting fields unchanged)
 *
 *   `snapshot.tools`:
 *     Record<toolName, {
 *       commitFlag: "apply" | "dryRun" | "diff",
 *       noWriteAlias: "dryRun" | "diff" | null,
 *       defaultBehavior: "writes" | "plan" | "noop",
 *     }>
 *
 * ## Acceptance criteria
 *
 *   1. The snapshot is a `Readonly<Record<string, ToolCommitMetadata>>`
 *      keyed by every tool registered in MCP_TOOL_CONTRACTS.
 *   2. Each entry exposes the three fields the issue pins.
 *   3. `commitFlagRegistry` is the single source of truth — adding a tool
 *      to the registry makes it appear in the snapshot.
 */

import { describe, expect, it } from "vitest";
import { getCapabilitiesAll } from "../../../src/adapters/mcp/get-capabilities-tool";
import { MCP_TOOL_CONTRACTS } from "../../../src/adapters/mcp/mcp-tool-contracts";
import type { CommitFlagMetadata } from "../../../src/core/runtime/commit-flag-registry";
import { COMMIT_FLAG_REGISTRY } from "../../../src/core/runtime/commit-flag-registry";

describe("getCapabilitiesAll() — per-tool commit metadata (#757 C2)", () => {
  it("snapshot.tools is present and keyed by every MCP_TOOL_CONTRACTS entry", () => {
    const snapshot = getCapabilitiesAll({
      writesEnabled: true,
      writeAccessResolver: undefined,
      allowedProcedures: ["Test_A"],
      projectId: "p",
      allowWrites: true,
    });

    expect(snapshot.tools).toBeDefined();
    const tools = snapshot.tools as Readonly<Record<string, CommitFlagMetadata>>;
    // Every registered MCP tool gets a tool-entry.
    for (const toolName of Object.keys(MCP_TOOL_CONTRACTS)) {
      expect(tools[toolName], `snapshot.tools["${toolName}"] must be present`).toBeDefined();
    }
  });

  it("each tool-entry exposes the documented three fields with the right shape", () => {
    const snapshot = getCapabilitiesAll({
      writesEnabled: true,
      writeAccessResolver: undefined,
      allowedProcedures: ["Test_A"],
      projectId: "p",
      allowWrites: true,
    });

    const tools = snapshot.tools as Readonly<Record<string, CommitFlagMetadata>>;
    for (const [toolName, entry] of Object.entries(tools)) {
      expect(typeof entry.commitFlag, `${toolName}.commitFlag must be a string`).toBe("string");
      expect(["apply", "dryRun", "diff"]).toContain(entry.commitFlag);
      // noWriteAlias is `string | null` — narrow it.
      expect(
        entry.noWriteAlias === null || typeof entry.noWriteAlias === "string",
        `${toolName}.noWriteAlias must be null or a string`,
      ).toBe(true);
      expect(["writes", "plan", "noop"]).toContain(entry.defaultBehavior);
    }
  });

  it("the registry is the single source of truth — entries agree with COMMIT_FLAG_REGISTRY", () => {
    // Acceptance: every tool name that appears in MCP_TOOL_CONTRACTS
    // has an entry in COMMIT_FLAG_REGISTRY that is propagated verbatim
    // into the snapshot. The registry is the contract.
    const snapshot = getCapabilitiesAll({
      writesEnabled: true,
      writeAccessResolver: undefined,
      allowedProcedures: ["Test_A"],
      projectId: "p",
      allowWrites: true,
    });
    const tools = snapshot.tools as Readonly<Record<string, CommitFlagMetadata>>;

    for (const toolName of Object.keys(MCP_TOOL_CONTRACTS)) {
      const registryEntry = COMMIT_FLAG_REGISTRY[toolName];
      expect(registryEntry, `${toolName} must be in COMMIT_FLAG_REGISTRY`).toBeDefined();
      expect(tools[toolName]).toEqual(registryEntry);
    }
  });

  it("explicitly pins the example envelopes from the issue (export_all / import_modules / delete_module)", () => {
    // The issue text quotes these three as canonical. Pin them so a
    // future refactor that quietly drops them is caught.
    const snapshot = getCapabilitiesAll({
      writesEnabled: true,
      writeAccessResolver: undefined,
      allowedProcedures: ["Test_A"],
      projectId: "p",
      allowWrites: true,
    });
    const tools = snapshot.tools as Readonly<Record<string, CommitFlagMetadata>>;

    // Issue acceptance: export_all, import_modules, delete_module.
    expect(tools.export_all).toEqual({
      commitFlag: "apply",
      noWriteAlias: "diff",
      defaultBehavior: "writes",
    });
    expect(tools.import_modules).toEqual({
      commitFlag: "apply",
      noWriteAlias: "dryRun",
      defaultBehavior: "plan",
    });
    expect(tools.delete_module).toEqual({
      commitFlag: "apply",
      noWriteAlias: "dryRun",
      defaultBehavior: "noop",
    });
  });

  it("preserve-and-extend: existing snapshot shape (adapterVersion / writesProject / dryRunDefault / …) is unchanged", () => {
    // The C2 change is additive: all preexisting fields keep their
    // shape so the consumers that grep `get_capabilities(...).dryRunDefault`
    // keep working.
    const snapshot = getCapabilitiesAll({
      writesEnabled: true,
      writeAccessResolver: undefined,
      allowedProcedures: ["Test_A"],
      projectId: "p",
      allowWrites: true,
    });

    expect(snapshot).toMatchObject({
      adapterVersion: expect.any(String),
      surface: expect.any(String),
      writesProcess: expect.any(Object),
      writesProject: expect.any(Object),
      projectIdResolution: expect.any(Object),
      dryRunDefault: expect.any(Boolean),
      writeExecutionPolicy: expect.any(String),
      effectiveDryRunDefault: expect.any(Object),
      toolsVisible: expect.any(Number),
      writeClassToolsPermitted: expect.any(Array),
      humanCompilePending: expect.any(Boolean),
    });
  });
});
