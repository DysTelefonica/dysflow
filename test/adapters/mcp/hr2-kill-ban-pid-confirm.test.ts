import { describe, expect, it } from "vitest";

import { buildToolSchemaCatalog } from "../../../src/adapters/mcp/schema-tool";
import { ORPHAN_CLEANUP_SCHEMA } from "../../../src/adapters/mcp/schemas/dysflow-schemas";
import { validateInput } from "../../../src/shared/validation/validator";

describe("HR-2 access_force_cleanup_orphaned confirmation contract", () => {
  it("advertises and validates the confirmation required with pid", () => {
    const catalog = buildToolSchemaCatalog({ toolName: "access_force_cleanup_orphaned" });
    const tool = catalog.tools.find(
      (candidate) => candidate.name === "access_force_cleanup_orphaned",
    );
    const pid = tool?.parameters.pid;

    expect(pid?.compositionConstraints?.requiredWith).toContain("confirmedRequiresConfirmation");
    expect(
      validateInput({ pid: 999_999, confirmedRequiresConfirmation: true }, ORPHAN_CLEANUP_SCHEMA),
    ).toBeUndefined();
    expect(validateInput({ pid: 999_999 }, ORPHAN_CLEANUP_SCHEMA)).toContain(
      "confirmedRequiresConfirmation",
    );
  });
});
