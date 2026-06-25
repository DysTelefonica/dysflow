import { describe, expect, it } from "vitest";
import { isWithinRuntime } from "../../src/shared/runtime-dir";

/**
 * #548: isWithinRuntime is the guard that lets write operations refuse to mutate
 * the dysflow production runtime (AGENTS.md hard rule).
 */
describe("isWithinRuntime (#548)", () => {
  const env = { DYSFLOW_HOME: "C:/runtime/dysflow" } as NodeJS.ProcessEnv;

  it("is true for the runtime dir itself and anything inside it", () => {
    expect(isWithinRuntime("C:/runtime/dysflow", env)).toBe(true);
    expect(isWithinRuntime("C:/runtime/dysflow/app/scripts", env)).toBe(true);
    expect(isWithinRuntime("C:\\runtime\\dysflow\\app", env)).toBe(true);
  });

  it("is false for project paths outside the runtime", () => {
    expect(isWithinRuntime("C:/projects/myapp/src", env)).toBe(false);
    expect(isWithinRuntime("C:/runtime/dysflow-other/src", env)).toBe(false);
  });
});
