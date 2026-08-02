import { describe, expect, it } from "vitest";
import { parseInstallArgs, parseUpdateArgs } from "../../../../src/cli/commands/install/updater";

describe("skill target CLI filters (#1323)", () => {
  it("accepts equals-form --only and --exclude filters", () => {
    expect(parseInstallArgs(["--only=opencode,codex"])).toEqual({
      ok: true,
      options: expect.objectContaining({ onlySkills: ["opencode", "codex"], excludeSkills: [] }),
    });
    expect(parseUpdateArgs(["--exclude=claude,pi"])).toEqual({
      ok: true,
      options: expect.objectContaining({ onlySkills: [], excludeSkills: ["claude", "pi"] }),
    });
  });

  it("rejects unknown adapters and combining --only with --exclude", () => {
    expect(parseInstallArgs(["--only", "unknown"]).ok).toBe(false);
    expect(parseUpdateArgs(["--only", "codex", "--exclude", "codex"]).ok).toBe(false);
  });
});
