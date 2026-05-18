import { describe, expect, it } from "vitest";
import { WindowsProcessKiller } from "../../../src/core/operations/windows-processes";

describe("WindowsProcessKiller", () => {
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid process id before building PowerShell command: %s",
    async (pid) => {
      const killer = new WindowsProcessKiller();

      await expect(killer.kill(pid)).rejects.toThrow("Process id must be a positive safe integer.");
    },
  );
});
