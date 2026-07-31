import { describe, expect, it } from "vitest";

import { validateVbaTestManifest } from "../../../src/core/services/vba-test-manifest-service";

const manifest = {
  tests: [{ procedure: "Test_Example", args: [], tags: ["unit"] }],
};
const modules = {
  Tests: "Public Sub Test_Example()\nEnd Sub",
};

describe("validate_manifest allowlist check", () => {
  it("surfaces an explicit note when the active allowlist is empty", () => {
    const withoutCheck = validateVbaTestManifest(manifest, modules, {
      includeAllowlistCheck: false,
      allowedProcedures: [],
    });
    const withCheck = validateVbaTestManifest(manifest, modules, {
      includeAllowlistCheck: true,
      allowedProcedures: [],
    });

    expect(withCheck).not.toEqual(withoutCheck);
    expect(withCheck.warnings.some((warning) => /allowlist/i.test(warning.message))).toBe(true);
  });
});
