/**
 * Issue #1057 (Round-15 F8) — `dryRun` is a universal deprecated alias of
 * `!apply` on every write tool. `export_modules` / `export_all` already
 * honor `dryRun:true` as no-write in `VbaModulesAdapter` (#1055), but the
 * schemas rejected the flag at validation (`additionalProperties: false`),
 * so the alias was unreachable through MCP. This pins schema acceptance.
 */

import { describe, expect, it } from "vitest";
import { VBA_SYNC_TOOL_SCHEMAS } from "../../../../src/adapters/mcp/schemas/vba-sync-schemas";
import { validateInput } from "../../../../src/shared/validation/validator";

describe("export tools accept the dryRun alias (#1057 F8)", () => {
  it("export_modules({ moduleNames, dryRun: true }) passes schema validation", () => {
    const result = validateInput(
      { moduleNames: ["Mod1"], dryRun: true },
      VBA_SYNC_TOOL_SCHEMAS.export_modules,
    );
    expect(result).toBeUndefined();
  });

  it("export_modules({ moduleNames, diff: true }) passes schema validation (legacy alias)", () => {
    const result = validateInput(
      { moduleNames: ["Mod1"], diff: true },
      VBA_SYNC_TOOL_SCHEMAS.export_modules,
    );
    expect(result).toBeUndefined();
  });

  it("export_all({ dryRun: true }) passes schema validation", () => {
    const result = validateInput({ dryRun: true }, VBA_SYNC_TOOL_SCHEMAS.export_all);
    expect(result).toBeUndefined();
  });

  it("export_modules rejects contradictory apply:true + dryRun:true (#1057 F8)", () => {
    const result = validateInput(
      { moduleNames: ["Mod1"], apply: true, dryRun: true },
      VBA_SYNC_TOOL_SCHEMAS.export_modules,
    );
    expect(result).toMatch(/mutually exclusive/);
  });
});
