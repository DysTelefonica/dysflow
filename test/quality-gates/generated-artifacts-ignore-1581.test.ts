import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("generated tooling artifacts (#1581)", () => {
  it.each([
    ".tmp/tool-output.json",
    "scripts/fixtures/mcp-context-budget/.dysflow/runtime/invocations.jsonl",
  ])("keeps %s out of the working tree", (path) => {
    const result = spawnSync("git", ["check-ignore", "--quiet", "--no-index", path], {
      cwd: process.cwd(),
      encoding: "utf8",
      windowsHide: true,
    });

    expect(result.status, result.stderr).toBe(0);
  });
});
