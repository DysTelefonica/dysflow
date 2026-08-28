import { describe, expect, it } from "vitest";
import { classifyVbaPair } from "../../../src/core/services/vba-semantic-classifier.js";

/**
 * Issue #1669 — a consumer must be able to tell a formatting difference from a
 * semantic one by reading `classification` and `reason` alone.
 *
 * The classifier already folds line endings, trailing whitespace, and casing
 * into non-actionable buckets. What it did NOT do was name the fold honestly:
 * a pair differing only in leading indentation reached the case-folding step
 * and came back as `caseOnly` with the reason "texts differ only in identifier
 * or keyword casing" — a label that describes a difference the pair does not
 * have. An agent reading that reason cannot trust the taxonomy.
 *
 * These tests pin the observable classifier verdict (category, reason, and
 * actionability), never the internal normalizer order that produces it.
 */

const MODULE = [
  'Attribute VB_Name = "ModuleA"',
  "Option Explicit",
  "",
  "Public Sub Foo()",
  "    Debug.Assert True",
  "End Sub",
  "",
].join("\n");

function classify(sourceText: string, binaryText: string, fileType = "bas") {
  return classifyVbaPair({ sourceText, binaryText, fileType, mode: "semantic" });
}

describe("#1669 — semantic classifier names the noise it folded", () => {
  it("reports a leading-indentation-only difference as whitespace, not casing", () => {
    const reindented = MODULE.replace("    Debug.Assert True", "\t\t\tDebug.Assert True");

    const result = classify(reindented, MODULE);

    expect(result.actionable).toBe(false);
    expect(result.classification).toBe("whitespaceOnly");
    expect(result.reason).toMatch(/whitespace|indentation/i);
    expect(result.reason).not.toMatch(/casing/i);
  });

  it("still reports a genuine casing-only difference as caseOnly", () => {
    const recased = MODULE.replace("Public Sub Foo()", "public sub Foo()").replace(
      "Debug.Assert True",
      "debug.assert True",
    );

    const result = classify(recased, MODULE);

    expect(result.actionable).toBe(false);
    expect(result.classification).toBe("caseOnly");
    expect(result.reason).toMatch(/casing/i);
  });

  it("keeps a line-endings-only difference non-actionable whitespace", () => {
    const crlf = MODULE.replace(/\n/g, "\r\n");

    const result = classify(crlf, MODULE);

    expect(result.actionable).toBe(false);
    expect(result.classification).toBe("whitespaceOnly");
  });

  it("keeps a blank-line-only difference non-actionable", () => {
    const extraBlankLine = MODULE.replace("Option Explicit\n", "Option Explicit\n\n");

    const result = classify(extraBlankLine, MODULE);

    expect(result.actionable).toBe(false);
  });

  it("still reports a real body change as an actionable functional difference", () => {
    const changed = MODULE.replace("Debug.Assert True", "Debug.Assert False");

    const result = classify(changed, MODULE);

    expect(result.actionable).toBe(true);
    expect(result.classification).toBe("bothChanged");
    expect(result.reason).toMatch(/functional line/i);
  });

  it("does not fold indentation inside a string literal into whitespace noise", () => {
    const withPadding = [
      'Attribute VB_Name = "ModuleA"',
      "Public Sub Foo()",
      '    Debug.Print "  padded"',
      "End Sub",
      "",
    ].join("\n");
    const withoutPadding = withPadding.replace('"  padded"', '"padded"');

    const result = classify(withPadding, withoutPadding);

    expect(result.actionable).toBe(true);
  });

  it("leaves strict mode byte-exact for an indentation-only difference", () => {
    const reindented = MODULE.replace("    Debug.Assert True", "\t\t\tDebug.Assert True");

    const result = classifyVbaPair({
      sourceText: reindented,
      binaryText: MODULE,
      fileType: "bas",
      mode: "strict",
    });

    expect(result.classification).not.toBe("matched");
  });
});
