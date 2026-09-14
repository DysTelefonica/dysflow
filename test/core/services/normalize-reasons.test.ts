import { describe, expect, it } from "vitest";

import {
  areReasonsCoherent,
  NORMALIZATION_REASON_ORDER,
  type NormalizationReason,
  primaryCategoryForReasons,
} from "../../../src/core/services/normalize-reasons";

describe("NORMALIZATION_REASON_ORDER", () => {
  it("is the 12-element ordered enum from the DESIGN contract", () => {
    expect(NORMALIZATION_REASON_ORDER).toEqual([
      "bomPrefix",
      "lineEnding",
      "leadingIndentation",
      "trailingWhitespace",
      "blankLogicalStatement",
      "interTokenWhitespace",
      "identifierCase",
      "commentText",
      "lineContinuationLayout",
      "statementBoundaryLayout",
      "cosmeticAttribute",
      "formSerialization",
    ]);
  });
});

describe("primaryCategoryForReasons — single-reason shortcuts", () => {
  it("empty list is actionable (no normalization means real drift)", () => {
    expect(primaryCategoryForReasons([])).toBe("actionable");
  });

  it("only bomPrefix → encodingOnly", () => {
    expect(primaryCategoryForReasons(["bomPrefix"])).toBe("encodingOnly");
  });

  it("only identifierCase → caseOnly", () => {
    expect(primaryCategoryForReasons(["identifierCase"])).toBe("caseOnly");
  });

  it("only cosmeticAttribute → attributeOnly", () => {
    expect(primaryCategoryForReasons(["cosmeticAttribute"])).toBe("attributeOnly");
  });

  it("only formSerialization → formSerializationOnly", () => {
    expect(primaryCategoryForReasons(["formSerialization"])).toBe("formSerializationOnly");
  });

  it("only commentText → commentOnly", () => {
    expect(primaryCategoryForReasons(["commentText"])).toBe("commentOnly");
  });

  it("only lineContinuationLayout → continuationOnly", () => {
    expect(primaryCategoryForReasons(["lineContinuationLayout"])).toBe("continuationOnly");
  });

  it("only statementBoundaryLayout → statementBoundaryOnly", () => {
    expect(primaryCategoryForReasons(["statementBoundaryLayout"])).toBe("statementBoundaryOnly");
  });
});

describe("primaryCategoryForReasons — whitespace family", () => {
  it("any single whitespace reason → whitespaceOnly", () => {
    for (const reason of [
      "lineEnding",
      "leadingIndentation",
      "trailingWhitespace",
      "blankLogicalStatement",
      "interTokenWhitespace",
    ] as NormalizationReason[]) {
      expect(primaryCategoryForReasons([reason])).toBe("whitespaceOnly");
    }
  });

  it("all five whitespace reasons together → whitespaceOnly", () => {
    expect(
      primaryCategoryForReasons([
        "lineEnding",
        "leadingIndentation",
        "trailingWhitespace",
        "blankLogicalStatement",
        "interTokenWhitespace",
      ]),
    ).toBe("whitespaceOnly");
  });
});

describe("primaryCategoryForReasons — mixed families", () => {
  it("comment + whitespace → nonActionableMixed", () => {
    expect(primaryCategoryForReasons(["commentText", "leadingIndentation"])).toBe(
      "nonActionableMixed",
    );
  });

  it("continuation + identifier case → nonActionableMixed", () => {
    expect(primaryCategoryForReasons(["lineContinuationLayout", "identifierCase"])).toBe(
      "nonActionableMixed",
    );
  });

  it("statement boundary + whitespace + case → nonActionableMixed", () => {
    expect(
      primaryCategoryForReasons([
        "statementBoundaryLayout",
        "interTokenWhitespace",
        "identifierCase",
      ]),
    ).toBe("nonActionableMixed");
  });

  it("bom + anything else → nonActionableMixed", () => {
    expect(primaryCategoryForReasons(["bomPrefix", "identifierCase"])).toBe("nonActionableMixed");
  });
});

describe("primaryCategoryForReasons — invalid input", () => {
  it("unknown reason → incomplete", () => {
    expect(primaryCategoryForReasons(["unknownReason" as NormalizationReason])).toBe("incomplete");
  });

  it("known reasons + unknown → incomplete", () => {
    expect(primaryCategoryForReasons(["identifierCase", "junk" as NormalizationReason])).toBe(
      "incomplete",
    );
  });
});

describe("areReasonsCoherent", () => {
  it("accepts empty list", () => {
    expect(areReasonsCoherent([])).toEqual({ ok: true });
  });

  it("accepts known reasons", () => {
    expect(areReasonsCoherent(["identifierCase", "lineEnding"])).toEqual({ ok: true });
  });

  it("rejects unknown reason", () => {
    const result = areReasonsCoherent(["bomPrefix", "madeUpReason"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("madeUpReason");
  });
});
