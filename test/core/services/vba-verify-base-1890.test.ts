// Issue #1890 — pure rules of the last-synced base: when it may change a
// verdict, and how a write merges into the stored record.
import { describe, expect, it } from "vitest";
import { classifyVbaPair } from "../../../src/core/services/vba-semantic-classifier.js";
import {
  applyVerifyBaseWrite,
  hashCanonicalVbaText,
  resolveDirectionAgainstBase,
  VERIFY_BASE_CANON,
  type VerifyBaseEntry,
} from "../../../src/core/services/vba-verify-base.js";

const code = (value: number) =>
  `Attribute VB_Name = "Probe"\nOption Explicit\nPublic Function V() As Long\nV = ${value}\nEnd Function\n`;

function directionOf(source: string, binary: string, base: string) {
  const pair = classifyVbaPair({
    sourceText: source,
    binaryText: binary,
    fileType: "bas",
    mode: "semantic",
  });
  return resolveDirectionAgainstBase(pair, {
    base: hashCanonicalVbaText(base, "bas"),
    source: hashCanonicalVbaText(source, "bas"),
    binary: hashCanonicalVbaText(binary, "bas"),
  });
}

describe("resolveDirectionAgainstBase", () => {
  it("names the binary as the changed side when the source still matches the base", () => {
    const result = directionOf(code(1), code(2), code(1));
    expect(result).toMatchObject({
      classification: "binaryNewer",
      recommendation: "export_to_src",
    });
  });

  it("never overrides a two-text sourceNewer, even when the source matches the base", () => {
    // A false base (a lost import, a restored backup) must not turn new source
    // work into an export that deletes it.
    const source = `${code(1)}Public Sub Extra()\nEnd Sub\n`;
    expect(directionOf(source, code(1), source).classification).toBe("sourceNewer");
  });

  it("never overrides a two-text binaryNewer, even when the binary matches the base", () => {
    const binary = `${code(1)}Public Sub Extra()\nEnd Sub\n`;
    expect(directionOf(code(1), binary, binary).classification).toBe("binaryNewer");
  });

  it("never turns a non-actionable verdict into an actionable one", () => {
    const binary = code(1).toUpperCase().replace('"PROBE"', '"Probe"');
    const result = directionOf(code(1), binary, code(9));
    expect(result.actionable).toBe(false);
  });

  it("keeps bothChanged when neither side matches the base", () => {
    expect(directionOf(code(2), code(3), code(1)).classification).toBe("bothChanged");
  });
});

describe("hashCanonicalVbaText", () => {
  it("keeps string-literal content: a mojibake-only literal change is a different hash", () => {
    const literal = (text: string) => `${code(1)}Const T = "${text}"\n`;
    expect(hashCanonicalVbaText(literal("año"), "bas")).not.toBe(
      hashCanonicalVbaText(literal("aÃ±o"), "bas"),
    );
  });
});

describe("applyVerifyBaseWrite", () => {
  const entry = (sourceRoot: string, moduleName: string, hash: string): VerifyBaseEntry => ({
    sourceRoot,
    moduleName,
    fileType: "bas",
    hash,
    canon: VERIFY_BASE_CANON,
    recordedAt: "2026-10-27T00:00:00.000Z",
  });
  const record = {
    accessPath: "/db.accdb",
    entries: [
      entry("/a", "Probe", "old-a"),
      entry("/b", "Probe", "old-b"),
      entry("/a", "Other", "o"),
    ],
  };

  it("an export replaces only the exported source root's base, case-insensitively", () => {
    const next = applyVerifyBaseWrite(record, {
      sourceRoot: "/a",
      moduleNames: ["probe"],
      entries: [entry("/a", "Probe", "new")],
    });
    expect(next.entries.map((e) => `${e.sourceRoot}:${e.moduleName}:${e.hash}`).sort()).toEqual([
      "/a:Other:o",
      "/a:Probe:new",
      "/b:Probe:old-b",
    ]);
  });
});
