import { describe, expect, it } from "vitest";
import { VBA_SYNC_TOOL_SCHEMAS } from "../../../src/adapters/mcp/schemas/vba-sync-schemas.js";
import { validateInput } from "../../../src/shared/validation/index.js";

describe("export_all prune schema", () => {
  const schema = VBA_SYNC_TOOL_SCHEMAS.export_all;

  it("accepts prune: true", () => {
    expect(validateInput({ prune: true }, schema)).toBeUndefined();
  });

  it("rejects a non-boolean prune", () => {
    expect(validateInput({ prune: "yes" }, schema)).toBeDefined();
  });
});
