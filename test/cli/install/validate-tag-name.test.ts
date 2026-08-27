/**
 * Issue #1521 — the release tag grammar is now shared by three channels, so it
 * lives in its own module with its own coverage instead of riding along with
 * the download path. The grammar is a security boundary: the tag is
 * interpolated into a `releases/download/<tag>/...` URL.
 */
import { describe, expect, it } from "vitest";
import {
  isPrereleaseTagName,
  isStableReleaseTagName,
  isValidReleaseTagName,
  normalizeReleaseVersion,
  validateReleaseTagName,
} from "../../../src/cli/commands/install/validate-tag-name";

const ACCEPTED = [
  "v2.39.0",
  "v0.0.1",
  "v10.20.30",
  "v2.39.0-rc.1",
  "v2.39.0-beta.3",
  "v2.39.0-alpha.10",
  "v2.39.0-prerelease.2",
] as const;

const REJECTED = [
  "2.39.0",
  "v2.39",
  "v2.39.0-rc1",
  "v2.39.0-final",
  "v2.39.0-rc.",
  "v2.39.0-rc.1.2",
  "main",
  "v1.2.3;calc",
  "",
  " v1.2.3",
  "v1.2.3 ",
  "v1.2.3/../../etc",
] as const;

describe("validateReleaseTagName", () => {
  it.each(ACCEPTED)("accepts %s", (tagName) => {
    expect(validateReleaseTagName(tagName)).toBe(tagName);
    expect(isValidReleaseTagName(tagName)).toBe(true);
  });

  it.each(REJECTED)("rejects %j", (tagName) => {
    expect(() => validateReleaseTagName(tagName)).toThrow("Invalid Dysflow release tag");
    expect(isValidReleaseTagName(tagName)).toBe(false);
  });
});

describe("tag classification", () => {
  it("separates stable tags from prerelease tags", () => {
    expect(isStableReleaseTagName("v2.39.0")).toBe(true);
    expect(isPrereleaseTagName("v2.39.0")).toBe(false);

    expect(isStableReleaseTagName("v2.39.0-rc.1")).toBe(false);
    expect(isPrereleaseTagName("v2.39.0-rc.1")).toBe(true);
  });

  it("does not classify a malformed tag as a prerelease", () => {
    expect(isPrereleaseTagName("v2.39.0-rc1")).toBe(false);
    expect(isPrereleaseTagName("v2.39.0-final")).toBe(false);
  });
});

describe("normalizeReleaseVersion", () => {
  it("drops the leading v and keeps a prerelease suffix", () => {
    expect(normalizeReleaseVersion("v2.39.0")).toBe("2.39.0");
    expect(normalizeReleaseVersion("v2.39.0-rc.1")).toBe("2.39.0-rc.1");
    expect(normalizeReleaseVersion("2.39.0")).toBe("2.39.0");
  });
});
