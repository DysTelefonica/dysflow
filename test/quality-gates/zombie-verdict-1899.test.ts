import { describe, expect, it } from "vitest";
import { zombieVerdict } from "../../E2E_testing/_helpers/zombie-liveness.mjs";

describe("issue #1899: the zombie verdict waits for a child that is still exiting", () => {
  it("passes when the child no longer answers at the moment of the check", () => {
    expect(zombieVerdict({ aliveAtCheck: false, liveness: null })).toBe("pass");
  });

  it("passes a child that was alive at the check but stopped answering inside the window (late exit)", () => {
    const liveness = { firstDeadAtMs: 0, aliveAtEnd: false, sampleCount: 1 };
    expect(zombieVerdict({ aliveAtCheck: true, liveness })).toBe("late-exit");
  });

  it("fails a child that still answers at the end of the window (real lingering child)", () => {
    const liveness = { firstDeadAtMs: null, aliveAtEnd: true, sampleCount: 60 };
    expect(zombieVerdict({ aliveAtCheck: true, liveness })).toBe("zombie");
  });
});
