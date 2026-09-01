import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "../..");
const packageVersion = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8")) as {
  version: string;
};

const STAMPED_DOCS = [
  "skills/dysflow-usage/references/error-codes.md",
  "skills/dysflow-usage/assets/write-flags-matrix.md",
] as const;

describe("dysflow-usage version stamps", () => {
  it.each(STAMPED_DOCS)("matches the package version in %s", (relativePath) => {
    const document = readFileSync(resolve(repoRoot, relativePath), "utf8");
    expect(document).toContain(`verified for the v${packageVersion.version} release`);
  });

  // #1694 — the stamp is ONE claim: "verified for vX on DATE". release-prepare
  // rewrote only the version, so every release left the date asserting a
  // verification that predated the release it named, and nothing checked it.
  it.each(STAMPED_DOCS)("carries a well-formed verification date in %s", (relativePath) => {
    const document = readFileSync(resolve(repoRoot, relativePath), "utf8");
    const escapedVersion = packageVersion.version.replace(/\./g, "\\.");
    expect(document).toMatch(
      new RegExp(`verified for the v${escapedVersion} release on \\d{4}-\\d{2}-\\d{2}`),
    );
  });

  it("rewrites the stamp date alongside the version in release-prepare", () => {
    const script = readFileSync(resolve(repoRoot, "scripts/release-prepare.ps1"), "utf8");
    // The capture must name the date, or a bump can silently leave it behind.
    expect(script).toContain("(?<date>");
    expect(script).toContain("$dateToken");
  });
});
