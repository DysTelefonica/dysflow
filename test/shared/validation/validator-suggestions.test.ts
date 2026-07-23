/**
 * Issue #1057 (Round-15 F1 + F4 + F8) — validation UX.
 *
 * F4: `MCP_INPUT_INVALID` rejections for unknown keys must list the
 * schema's valid params and, when a near-match exists, suggest it
 * ("Did you mean ...?"). Pre-#1057 the message was the bare
 * `"<key> is not allowed."` and the consumer had to probe param names
 * by trial and error (F1: `module` vs `moduleName` vs `moduleNames`).
 *
 * F8: when a schema declares BOTH `apply` and `dryRun` and the caller
 * passes contradictory values (apply === dryRun as booleans, since
 * dryRun ≡ !apply), the validator rejects with a mutually-exclusive
 * error instead of silently letting one flag win. Consistent
 * redundancy (apply:true + dryRun:false) stays accepted for
 * backward compatibility with the documented precedence contract.
 */

import { describe, expect, it } from "vitest";
import type { JsonObjectSchema } from "../../../src/shared/validation/schemas";
import { validateInput } from "../../../src/shared/validation/validator";

const deleteModuleLikeSchema: JsonObjectSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    moduleName: { type: "string" },
    apply: { type: "boolean" },
    dryRun: { type: "boolean" },
    projectId: { type: "string" },
  },
};

const exportModulesLikeSchema: JsonObjectSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    moduleNames: { type: "array", items: { type: "string" } },
    apply: { type: "boolean" },
    diff: { type: "boolean" },
  },
};

describe("validateInput — unknown-key rejection lists valid params (F4)", () => {
  it("includes the valid params in the rejection message", () => {
    const result = validateInput({ module: "X" }, deleteModuleLikeSchema);
    expect(result).toBeDefined();
    expect(result).toMatch(/is not allowed/);
    expect(result).toMatch(/moduleName/);
    expect(result).toMatch(/Valid params/i);
  });

  it("suggests the closest valid param when a near-match exists (module → moduleName)", () => {
    const result = validateInput({ module: "X" }, deleteModuleLikeSchema);
    expect(result).toMatch(/Did you mean ['"]moduleName['"]\?/);
  });

  it("suggests moduleNames when the caller passes moduleName to a plural-array tool", () => {
    const result = validateInput({ moduleName: "X" }, exportModulesLikeSchema);
    expect(result).toMatch(/Did you mean ['"]moduleNames['"]\?/);
  });

  it("omits the suggestion when no near-match exists but still lists valid params", () => {
    const result = validateInput({ zzz: 1 }, deleteModuleLikeSchema);
    expect(result).toMatch(/zzz is not allowed/);
    expect(result).toMatch(/Valid params/i);
    expect(result).not.toMatch(/Did you mean/);
  });

  it("keeps the legacy prefix '<key> is not allowed.' so regex consumers keep working", () => {
    const result = validateInput({ module: "X" }, deleteModuleLikeSchema);
    expect(result?.startsWith("module is not allowed.")).toBe(true);
  });
});

describe("validateInput — apply/dryRun contradiction (F8)", () => {
  it("rejects apply:true + dryRun:true as mutually exclusive", () => {
    const result = validateInput({ apply: true, dryRun: true }, deleteModuleLikeSchema);
    expect(result).toMatch(/mutually exclusive/);
  });

  it("rejects apply:false + dryRun:false as mutually exclusive", () => {
    const result = validateInput({ apply: false, dryRun: false }, deleteModuleLikeSchema);
    expect(result).toMatch(/mutually exclusive/);
  });

  it("accepts the consistent redundant combination apply:true + dryRun:false", () => {
    const result = validateInput({ apply: true, dryRun: false }, deleteModuleLikeSchema);
    expect(result).toBeUndefined();
  });

  it("accepts the consistent redundant combination apply:false + dryRun:true", () => {
    const result = validateInput({ apply: false, dryRun: true }, deleteModuleLikeSchema);
    expect(result).toBeUndefined();
  });

  it("does not apply the rule when the schema declares only one of the two flags", () => {
    const applyOnly: JsonObjectSchema = {
      type: "object",
      additionalProperties: false,
      properties: { apply: { type: "boolean" } },
    };
    // dryRun is simply an unknown key here — rejected by the standard rule.
    const result = validateInput({ apply: true, dryRun: true }, applyOnly);
    expect(result).toMatch(/dryRun is not allowed/);
    expect(result).not.toMatch(/mutually exclusive/);
  });
});
