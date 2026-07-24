import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import {
  defineEnvelopeOnlyResultContract,
  defineResultContract,
  type InferResultPayload,
  toToolResultContract,
} from "../../../../src/adapters/mcp/contracts/result-contract.js";
import { defineToolContract } from "../../../../src/adapters/mcp/contracts/tool-contract.js";

describe("executable result-contract foundation", () => {
  it("derives payload typing and the existing introspection shape from one schema", async () => {
    const schema = z
      .object({
        mode: z.enum(["plan", "apply"]),
        outputMode: z.enum(["summary", "file", "full"]),
        changed: z.number(),
      })
      .strict();
    const contract = defineResultContract({
      schema,
      description: "Representative write result.",
      modes: ["plan", "apply"],
      outputModes: ["summary", "file", "full"],
    });

    type Payload = InferResultPayload<typeof contract>;
    expectTypeOf<Payload>().toEqualTypeOf<{
      mode: "plan" | "apply";
      outputMode: "summary" | "file" | "full";
      changed: number;
    }>();

    expect(contract.schema).toBe(schema);
    expect(toToolResultContract(contract)).toEqual({
      kind: "dataSchema",
      description: "Representative write result.",
      dataSchema: {
        type: "object",
        properties: {
          mode: { type: "string", enum: ["plan", "apply"] },
          outputMode: { type: "string", enum: ["summary", "file", "full"] },
          changed: { type: "number" },
        },
        required: ["mode", "outputMode", "changed"],
        additionalProperties: false,
      },
      modes: ["plan", "apply"],
      outputModes: ["summary", "file", "full"],
      errorEnvelope: {
        shape: {
          code: { type: "string" },
          message: { type: "string" },
          remediation: { type: "string", optional: true },
        },
      },
    });

    const tool = defineToolContract({
      inputSchema: z.object({ apply: z.boolean() }),
      resultContract: contract,
      metadata: { description: "Test tool" },
      handler: async ({ apply }) => ({
        mode: apply ? ("apply" as const) : ("plan" as const),
        outputMode: "summary" as const,
        changed: 1,
      }),
    });
    expectTypeOf(tool.handler).returns.resolves.toEqualTypeOf<Payload>();
    await expect(tool.handler({ apply: true })).resolves.toMatchObject({ mode: "apply" });
  });

  it("rejects a data contract without a structured payload schema", () => {
    expect(() =>
      defineResultContract({
        schema: z.string() as unknown as z.ZodType<object>,
      }),
    ).toThrow(/structured object payload/i);
  });

  it("rejects an envelope-only contract without an explicit justification", () => {
    expect(() => defineEnvelopeOnlyResultContract({ justification: "  " })).toThrow(
      /justification/i,
    );
  });
});
