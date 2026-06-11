import { describe, expect, it } from "vitest";
import type { JsonObjectSchema } from "../../../src/shared/validation";
import { validateInput } from "../../../src/adapters/mcp/validator.js";
import { validateInput as sharedValidateInput } from "../../../src/shared/validation";

// Contract guard: the MCP validator module must keep exporting the same
// `validateInput` it always did, even though the implementation now lives in
// src/shared/validation. This test pins the public surface so an accidental
// re-export removal or accidental inline copy will fail the suite.

describe("src/adapters/mcp/validator.ts — re-export contract", () => {
  it("exports the same validateInput function reference as the shared module", () => {
    expect(validateInput).toBe(sharedValidateInput);
  });

  it("still validates inputs against schemas after the re-export", () => {
    const schema: JsonObjectSchema = {
      type: "object",
      required: ["name"],
      additionalProperties: false,
      properties: { name: { type: "string" } },
    };
    expect(validateInput({ name: "ok" }, schema)).toBeUndefined();
    expect(validateInput({}, schema)).toBe("name is required.");
  });
});
