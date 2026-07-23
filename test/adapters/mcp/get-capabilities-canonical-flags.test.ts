/**
 * Issue #1057 (Round-15 F7) — `get_capabilities.tools[]` exposes the
 * homogenized single-flag design explicitly:
 *
 *   - `canonicalCommitFlag` — the ONE flag whose `true` value commits.
 *   - `legacyAliases` — deprecated aliases still honored (desugared by
 *     the adapter), e.g. `dryRun` (≡ !apply) and export's historic `diff`.
 *
 * Pre-#1057 the snapshot carried `commitFlag`/`noWriteAlias`/`defaultBehavior`
 * only, and `effectiveDryRunDefault: true` could not be distinguished from
 * a tool whose alias polarity had been inverted (#1055). The additive fields
 * make the contract self-describing.
 */

import { describe, expect, it } from "vitest";
import { getCapabilitiesAll } from "../../../src/adapters/mcp/get-capabilities-tool";

function snapshot() {
  return getCapabilitiesAll({
    writesEnabled: true,
    writeAccessResolver: undefined,
    allowedProcedures: undefined,
    projectId: undefined,
    allowWrites: true,
  });
}

describe("get_capabilities — canonicalCommitFlag + legacyAliases (#1057 F7)", () => {
  it("delete_module reports apply as canonical with dryRun as legacy alias", () => {
    const tools = snapshot().tools as Record<
      string,
      { canonicalCommitFlag?: string; legacyAliases?: readonly string[] }
    >;
    expect(tools.delete_module?.canonicalCommitFlag).toBe("apply");
    expect(tools.delete_module?.legacyAliases).toContain("dryRun");
  });

  it("export_modules reports apply as canonical with diff AND dryRun as legacy aliases", () => {
    const tools = snapshot().tools as Record<
      string,
      { canonicalCommitFlag?: string; legacyAliases?: readonly string[] }
    >;
    expect(tools.export_modules?.canonicalCommitFlag).toBe("apply");
    expect(tools.export_modules?.legacyAliases).toEqual(expect.arrayContaining(["diff", "dryRun"]));
  });

  it("read-only tools report an empty legacyAliases list", () => {
    const tools = snapshot().tools as Record<string, { legacyAliases?: readonly string[] }>;
    expect(tools.verify_code?.legacyAliases).toEqual([]);
  });

  it("every advertised tool carries both additive fields", () => {
    const tools = snapshot().tools as Record<
      string,
      { canonicalCommitFlag?: string; legacyAliases?: readonly string[] }
    >;
    for (const [name, entry] of Object.entries(tools)) {
      expect(entry.canonicalCommitFlag, `${name} canonicalCommitFlag`).toBeDefined();
      expect(Array.isArray(entry.legacyAliases), `${name} legacyAliases`).toBe(true);
    }
  });

  it("keeps the pre-#1057 fields for backward compatibility", () => {
    const tools = snapshot().tools as Record<
      string,
      { commitFlag?: string; noWriteAlias?: string | null; defaultBehavior?: string }
    >;
    expect(tools.delete_module?.commitFlag).toBe("apply");
    expect(tools.delete_module?.noWriteAlias).toBe("dryRun");
    expect(tools.delete_module?.defaultBehavior).toBe("noop");
  });
});
