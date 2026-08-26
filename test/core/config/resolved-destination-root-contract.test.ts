import { describe, expectTypeOf, it } from "vitest";
import type { ExecutionTarget } from "../../../src/core/config/execution-target.js";
import type { VbaExecutionTarget } from "../../../src/core/services/vba-source-comparison.js";

describe("resolved destinationRoot type contract (#1582)", () => {
  it("accepts resolver output at filesystem consumers but rejects a raw request root", () => {
    expectTypeOf<ExecutionTarget>().toMatchTypeOf<VbaExecutionTarget>();

    const rawRequestTarget = { destinationRoot: "src" };

    // @ts-expect-error A request string has not crossed resolveExecutionTarget.
    const consumerTarget: VbaExecutionTarget = rawRequestTarget;
    void consumerTarget;
  });
});
