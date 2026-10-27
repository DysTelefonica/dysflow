// Issue #1890 — pure rules of the last-synced base: when it may change a
// verdict, and which writes invalidate it.
import { describe, expect, it } from "vitest";
import { classifyVbaPair } from "../../../src/core/services/vba-semantic-classifier.js";
import {
  hashCanonicalVbaText,
  resolveDirectionAgainstBase,
} from "../../../src/core/services/vba-verify-base.js";
import { verifyBaseWriteScope } from "../../../src/core/services/vba-verify-base-recording.js";

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
      resolvedBy: "base",
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

describe("verifyBaseWriteScope", () => {
  it("invalidates the named modules of an applied import, delete or export", () => {
    expect(verifyBaseWriteScope("import_modules", { moduleNames: ["A", "B"] })).toEqual(["A", "B"]);
    expect(verifyBaseWriteScope("delete_module", { moduleName: "A" })).toEqual(["A"]);
    expect(verifyBaseWriteScope("export_modules", { moduleNames: ["A"], apply: true })).toEqual([
      "A",
    ]);
  });

  it("invalidates every module when the write cannot name them", () => {
    expect(verifyBaseWriteScope("import_all", {})).toBe("all");
    expect(verifyBaseWriteScope("import_modules", { sourceDir: "src" })).toBe("all");
    expect(verifyBaseWriteScope("export_all", { apply: true })).toBe("all");
  });

  it("leaves the base alone for plans and read-only tools", () => {
    expect(verifyBaseWriteScope("import_modules", { moduleNames: ["A"], dryRun: true })).toBe(
      undefined,
    );
    expect(verifyBaseWriteScope("export_modules", { moduleNames: ["A"] })).toBe(undefined);
    expect(verifyBaseWriteScope("verify_code", { moduleNames: ["A"] })).toBe(undefined);
  });
});
