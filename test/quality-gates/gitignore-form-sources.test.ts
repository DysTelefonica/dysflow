import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function isIgnored(path: string): boolean {
  const result = spawnSync("git", ["check-ignore", "--no-index", "--quiet", "--", path], {
    cwd: process.cwd(),
    windowsHide: true,
  });

  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`git check-ignore failed for ${path}: ${result.stderr.toString()}`);
  }

  return result.status === 0;
}

describe("repository ignore policy", () => {
  it.each([
    "src/forms/NewForm.cls",
    "E2E_testing/src/forms/NewForm.form.txt",
  ])("keeps canonical Access form source visible at %s", (path) => {
    expect(isIgnored(path)).toBe(false);
  });

  it.each([
    ["bench-cache/artifact.json", true],
    ["nested/bench-cache/artifact.json", false],
    ["test-output-msg/artifact.txt", true],
    ["nested/test-output-msg/artifact.txt", false],
  ])("limits the %s scratch rule to the repository root", (path, expected) => {
    expect(isIgnored(path)).toBe(expected);
  });

  it.each([
    ["SHA256SUMS", true],
    ["dysflow-v9.9.9.tar.gz", true],
    ["fixtures/SHA256SUMS", false],
    ["fixtures/dysflow-v9.9.9.tar.gz", false],
    ["SHA256SUMS.sig", false],
    ["dysflow-v9.9.9.zip", false],
  ])("limits generated release artifact ignores to the repository root: %s", (path, expected) => {
    expect(isIgnored(path)).toBe(expected);
  });
});
