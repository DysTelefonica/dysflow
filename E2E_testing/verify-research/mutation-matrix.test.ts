import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyVbaPair,
  type VbaRecommendation,
  type VbaSemanticCategory,
} from "../../src/core/services/vba-semantic-classifier.js";

type MutationCase = {
  id: string;
  scope: "bas" | "cls" | "form.txt";
  sourceText: string;
  binaryText: string;
  expectedFunctional: boolean;
  expectedCategories: VbaSemanticCategory[];
  note: string;
};

const expectedRecommendationByCategory: Record<VbaSemanticCategory, VbaRecommendation> = {
  matched: "no_action",
  whitespaceOnly: "no_action",
  attributeOnly: "no_action",
  caseOnly: "no_action",
  formSerializationOnly: "no_action",
  encodingOnly: "no_action",
  // WU-3 v2-categories (Refs #1724): the four new non-actionable buckets
  // share the same no_action recommendation as their v1 siblings.
  commentOnly: "no_action",
  continuationOnly: "no_action",
  statementBoundaryOnly: "no_action",
  nonActionableMixed: "no_action",
  sourceNewer: "import_to_binary",
  binaryNewer: "export_to_src",
  bothChanged: "manual_merge",
};

const moduleBody = [
  'Attribute VB_Name = "Probe"',
  "Option Explicit",
  "Public Function Calculate(ByVal ItemCount As Long) As Long",
  "    Calculate = ItemCount + 1",
  "End Function",
  "",
].join("\n");

const stringBody = (value: string) =>
  [
    'Attribute VB_Name = "Probe"',
    "Option Explicit",
    "Public Function LabelText() As String",
    `    LabelText = "${value}"`,
    "End Function",
    "",
  ].join("\n");

const formBody = (width: number, checksum: number, code: string) =>
  [
    "Version =21",
    `Checksum =${checksum}`,
    "Begin Form",
    `    Width =${width}`,
    "End",
    "CodeBehindForm",
    code,
    "",
  ].join("\n");

const cases: MutationCase[] = [
  {
    id: "baseline-identical",
    scope: "bas",
    sourceText: moduleBody,
    binaryText: moduleBody,
    expectedFunctional: false,
    expectedCategories: ["matched"],
    note: "Unchanged source and binary.",
  },
  {
    id: "keyword-case-only",
    scope: "bas",
    sourceText: moduleBody.replace("Public Function", "public function").replace("End Function", "end function"),
    binaryText: moduleBody,
    expectedFunctional: false,
    expectedCategories: ["caseOnly"],
    note: "VBA keywords are case-insensitive.",
  },
  {
    id: "identifier-case-only",
    scope: "bas",
    sourceText: moduleBody.replaceAll("Calculate", "calculate").replaceAll("ItemCount", "ITEMCOUNT"),
    binaryText: moduleBody,
    expectedFunctional: false,
    expectedCategories: ["caseOnly"],
    note: "VBA identifiers are case-insensitive.",
  },
  {
    id: "string-case",
    scope: "bas",
    sourceText: stringBody("ready now"),
    binaryText: stringBody("Ready Now"),
    expectedFunctional: true,
    expectedCategories: ["bothChanged"],
    note: "String contents are runtime-visible and case-sensitive.",
  },
  {
    id: "string-whitespace",
    scope: "bas",
    sourceText: stringBody("Ready  Now"),
    binaryText: stringBody("Ready Now"),
    expectedFunctional: true,
    expectedCategories: ["bothChanged"],
    note: "Whitespace inside a string is data.",
  },
  {
    id: "string-value",
    scope: "bas",
    sourceText: stringBody("Blocked"),
    binaryText: stringBody("Ready"),
    expectedFunctional: true,
    expectedCategories: ["bothChanged"],
    note: "Changed literal value is functional.",
  },
  {
    id: "string-escaped-quotes-case",
    scope: "bas",
    sourceText: stringBody('He said ""ready""'),
    binaryText: stringBody('He said ""READY""'),
    expectedFunctional: true,
    expectedCategories: ["bothChanged"],
    note: "Case inside an escaped-quote VBA string remains runtime-visible.",
  },
  {
    id: "string-apostrophe-case",
    scope: "bas",
    sourceText: stringBody("O'reilly"),
    binaryText: stringBody("O'Reilly"),
    expectedFunctional: true,
    expectedCategories: ["bothChanged"],
    note: "An apostrophe inside a quoted string is data, not a comment marker.",
  },
  {
    id: "comment-case-goal",
    scope: "bas",
    sourceText: `${moduleBody}' Business Note\n`,
    binaryText: `${moduleBody}' business note\n`,
    expectedFunctional: false,
    expectedCategories: ["commentOnly"],
    note: "WU-3 v2-categories (Refs #1724): a case-only difference inside a comment body is non-functional. Classified as `commentOnly`.",
  },
  {
    id: "combined-case-indent-comment-goal",
    scope: "bas",
    sourceText: `${moduleBody.replaceAll("Calculate", "calculate").replace("    calculate =", "\tcalculate =")}' Business Note\n`,
    binaryText: `${moduleBody}' business note\n`,
    expectedFunctional: false,
    expectedCategories: ["nonActionableMixed"],
    note: "WU-3 v2-categories (Refs #1724): identifier case + indentation + comment case combined is non-functional. Classified as `nonActionableMixed` because two or more non-actionable families contributed.",
  },
  {
    id: "rem-comment-case",
    scope: "bas",
    sourceText: `${moduleBody}Rem BUSINESS NOTE\n`,
    binaryText: `${moduleBody}rem business note\n`,
    expectedFunctional: false,
    expectedCategories: ["caseOnly"],
    note: "REM keyword and comment casing are non-functional.",
  },
  {
    id: "rem-comment-content-goal",
    scope: "bas",
    sourceText: `${moduleBody}Rem Old note\n`,
    binaryText: `${moduleBody}Rem New note\n`,
    expectedFunctional: false,
    expectedCategories: ["commentOnly"],
    note: "WU-3 v2-categories (Refs #1724): whole-line REM comment text differences are non-functional. Classified as `commentOnly`.",
  },
  {
    id: "leading-indentation",
    scope: "bas",
    sourceText: moduleBody.replace("    Calculate =", "\t\tCalculate ="),
    binaryText: moduleBody,
    expectedFunctional: false,
    expectedCategories: ["whitespaceOnly"],
    note: "Leading VBA indentation is formatting.",
  },
  {
    id: "line-endings-and-trailing-space",
    scope: "bas",
    sourceText: moduleBody.replaceAll("\n", "\r\n").replace(" + 1", " + 1   "),
    binaryText: moduleBody,
    expectedFunctional: false,
    expectedCategories: ["whitespaceOnly"],
    note: "CRLF/LF and trailing whitespace are formatting.",
  },
  {
    id: "internal-blank-line",
    scope: "bas",
    sourceText: moduleBody.replace("Option Explicit\n", "Option Explicit\n\n"),
    binaryText: moduleBody,
    expectedFunctional: false,
    expectedCategories: ["matched", "whitespaceOnly"],
    note: "A blank line does not alter execution.",
  },
  {
    id: "operator-spacing-goal",
    scope: "bas",
    sourceText: moduleBody.replace("ItemCount + 1", "ItemCount+1"),
    binaryText: moduleBody,
    expectedFunctional: false,
    expectedCategories: ["whitespaceOnly"],
    note: "WU-3 v2-categories (Refs #1724): operator/operand whitespace is a presentation reflow. Classified as `whitespaceOnly` (interTokenWhitespace reason).",
  },
  {
    id: "continuation-reflow-goal",
    scope: "bas",
    sourceText: "Option Explicit\nPublic Function Total() As Long\n    Total = 1 + _\n        2\nEnd Function\n",
    binaryText: "Option Explicit\nPublic Function Total() As Long\n    Total = 1 + 2\nEnd Function\n",
    expectedFunctional: false,
    expectedCategories: ["continuationOnly"],
    note: "WU-3 v2-categories (Refs #1724): equivalent `_<EOL>` reflow between physical lines is non-functional. Classified as `continuationOnly`.",
  },
  {
    id: "statement-order-swapped",
    scope: "bas",
    sourceText: "Option Explicit\nPublic Function Run() As Long\n    Run = 1\n    Run = Run + 2\nEnd Function\n",
    binaryText: "Option Explicit\nPublic Function Run() As Long\n    Run = Run + 2\n    Run = 1\nEnd Function\n",
    expectedFunctional: true,
    expectedCategories: ["bothChanged"],
    note: "Statement order can change observable behavior.",
  },
  {
    id: "duplicate-statement-count",
    scope: "bas",
    sourceText: "Option Explicit\nPublic Function Run() As Long\n    Run = Run + 1\n    Run = Run + 1\nEnd Function\n",
    binaryText: "Option Explicit\nPublic Function Run() As Long\n    Run = Run + 1\nEnd Function\n",
    expectedFunctional: true,
    expectedCategories: ["sourceNewer"],
    note: "Duplicate executable statement cardinality is functional.",
  },
  {
    id: "colon-to-newline-goal",
    scope: "bas",
    sourceText: "Option Explicit\nPublic Function Run() As Long\n    Dim first As Long: Dim second As Long\n    first = 1: second = 2\n    Run = first + second\nEnd Function\n",
    binaryText: "Option Explicit\nPublic Function Run() As Long\n    Dim first As Long\n    Dim second As Long\n    first = 1\n    second = 2\n    Run = first + second\nEnd Function\n",
    expectedFunctional: false,
    expectedCategories: ["statementBoundaryOnly"],
    note: "WU-3 v2-categories (Refs #1724): equivalent colon-separated vs newline-separated statement boundaries. Classified as `statementBoundaryOnly`.",
  },
  {
    id: "dangerous-merged-tokens",
    scope: "bas",
    sourceText: "Option Explicit\nPublic Function Run() As Long\n    Dim value As Long\n    value = 1 value = value + 1\n    Run = value\nEnd Function\n",
    binaryText: "Option Explicit\nPublic Function Run() As Long\n    Dim value As Long\n    value = 1: value = value + 1\n    Run = value\nEnd Function\n",
    expectedFunctional: true,
    expectedCategories: ["bothChanged"],
    note: "Removing a statement boundary and merging tokens is functional.",
  },
  {
    id: "numeric-value",
    scope: "bas",
    sourceText: moduleBody.replace("+ 1", "+ 2"),
    binaryText: moduleBody,
    expectedFunctional: true,
    expectedCategories: ["bothChanged"],
    note: "Numeric value change is functional.",
  },
  {
    id: "operator-change",
    scope: "bas",
    sourceText: moduleBody.replace("+ 1", "- 1"),
    binaryText: moduleBody,
    expectedFunctional: true,
    expectedCategories: ["bothChanged"],
    note: "Operator change is functional.",
  },
  {
    id: "parameter-type-change",
    scope: "bas",
    sourceText: moduleBody.replace("ItemCount As Long", "ItemCount As Integer"),
    binaryText: moduleBody,
    expectedFunctional: true,
    expectedCategories: ["bothChanged"],
    note: "Parameter type change is functional.",
  },
  {
    id: "signature-byval-byref",
    scope: "bas",
    sourceText: moduleBody.replace("ByVal ItemCount", "ByRef ItemCount"),
    binaryText: moduleBody,
    expectedFunctional: true,
    expectedCategories: ["bothChanged"],
    note: "Calling convention change is functional.",
  },
  {
    id: "option-explicit-removed",
    scope: "bas",
    sourceText: "Public Function UsesImplicitName() As Long\n    missingValue = 1\n    UsesImplicitName = missingValue\nEnd Function\n",
    binaryText: "Option Explicit\nPublic Function UsesImplicitName() As Long\n    missingValue = 1\n    UsesImplicitName = missingValue\nEnd Function\n",
    expectedFunctional: true,
    expectedCategories: ["binaryNewer"],
    note: "Lexical policy probe keeps Option Explicit significant where the body uses an undeclared name; snippets are not compiled by this battery.",
  },
  {
    id: "option-compare-change",
    scope: "bas",
    sourceText: "Option Compare Text\nOption Explicit\nPublic Function SameText() As Boolean\n    SameText = (\"a\" = \"A\")\nEnd Function\n",
    binaryText: "Option Compare Database\nOption Explicit\nPublic Function SameText() As Boolean\n    SameText = (\"a\" = \"A\")\nEnd Function\n",
    expectedFunctional: true,
    expectedCategories: ["bothChanged"],
    note: "Lexical policy probe keeps Option Compare significant where the body compares differently-cased strings.",
  },
  {
    id: "option-base-change",
    scope: "bas",
    sourceText: "Option Base 1\nOption Explicit\nPublic Function ArrayStart() As Long\n    Dim values(2) As Long\n    ArrayStart = LBound(values)\nEnd Function\n",
    binaryText: "Option Base 0\nOption Explicit\nPublic Function ArrayStart() As Long\n    Dim values(2) As Long\n    ArrayStart = LBound(values)\nEnd Function\n",
    expectedFunctional: true,
    expectedCategories: ["bothChanged"],
    note: "Lexical policy probe keeps Option Base significant where an implicit lower-bound array is inspected.",
  },
  {
    id: "conditional-constant-change",
    scope: "bas",
    sourceText: "#Const FeatureEnabled = True\nOption Explicit\nPublic Function FeatureValue() As Long\n#If FeatureEnabled Then\n    FeatureValue = 1\n#Else\n    FeatureValue = 2\n#End If\nEnd Function\n",
    binaryText: "#Const FeatureEnabled = False\nOption Explicit\nPublic Function FeatureValue() As Long\n#If FeatureEnabled Then\n    FeatureValue = 1\n#Else\n    FeatureValue = 2\n#End If\nEnd Function\n",
    expectedFunctional: true,
    expectedCategories: ["bothChanged"],
    note: "Lexical policy probe keeps #Const significant where #If selects a branch.",
  },
  {
    id: "attribute-description",
    scope: "cls",
    sourceText: `${moduleBody}Attribute VB_Description = "A"\n`,
    binaryText: `${moduleBody}Attribute VB_Description = "B"\n`,
    expectedFunctional: false,
    expectedCategories: ["attributeOnly"],
    note: "Description metadata is cosmetic.",
  },
  {
    id: "attribute-vb-name",
    scope: "cls",
    sourceText: moduleBody,
    binaryText: moduleBody.replace('Attribute VB_Name = "Probe"', 'Attribute VB_Name = "Probe2"'),
    expectedFunctional: true,
    expectedCategories: ["bothChanged"],
    note: "Module identity is meaningful.",
  },
  {
    id: "attribute-vb-name-missing",
    scope: "cls",
    sourceText: moduleBody.replace('Attribute VB_Name = "Probe"\n', ""),
    binaryText: moduleBody,
    expectedFunctional: true,
    expectedCategories: ["binaryNewer"],
    note: "One-sided missing module identity is functional under the current contract.",
  },
  {
    id: "attribute-vb-name-case-goal",
    scope: "cls",
    sourceText: moduleBody.replace('Attribute VB_Name = "Probe"', 'Attribute VB_Name = "probe"'),
    binaryText: moduleBody,
    expectedFunctional: false,
    expectedCategories: ["attributeOnly"],
    note: "WU-3 v2-categories (Refs #1724): VBA is case-insensitive for identifiers, including the module name. A case-only VB_Name difference is treated as attribute metadata drift; classified as `attributeOnly`.",
  },
  {
    id: "attribute-member-user-mem-id-goal",
    scope: "cls",
    sourceText: `${moduleBody}Attribute Calculate.VB_UserMemId = 0\n`,
    binaryText: `${moduleBody}Attribute Calculate.VB_UserMemId = 1\n`,
    expectedFunctional: true,
    expectedCategories: ["bothChanged"],
    note: "VB_UserMemId remains actionable because the broad Attribute VB_* pattern does not match member-qualified attributes; this is pattern retention, not semantic understanding or Access runtime proof.",
  },
  {
    id: "attribute-predeclared-id-goal",
    scope: "cls",
    sourceText: `${moduleBody}Attribute VB_PredeclaredId = True\n`,
    binaryText: `${moduleBody}Attribute VB_PredeclaredId = False\n`,
    expectedFunctional: true,
    expectedCategories: ["attributeOnly"],
    note: "This proves only that broad module-level Attribute VB_* stripping removes VB_PredeclaredId. The significant-code policy expectation is not proof of default-instance runtime impact.",
  },
  {
    id: "form-checksum",
    scope: "form.txt",
    sourceText: formBody(9070, 1, "Private Sub Run()\nEnd Sub"),
    binaryText: formBody(9070, 2, "Private Sub Run()\nEnd Sub"),
    expectedFunctional: false,
    expectedCategories: ["formSerializationOnly"],
    note: "Synthetic SaveAsText-shaped text characterizes Checksum stripping; the snippet is not proven to be a valid Access export.",
  },
  {
    id: "form-codebehind-only",
    scope: "form.txt",
    sourceText: formBody(9070, 1, "Private Sub Run()\n    DoThing 1\nEnd Sub"),
    binaryText: formBody(9070, 1, "Private Sub Run()\n    DoThing 2\nEnd Sub"),
    expectedFunctional: false,
    expectedCategories: ["matched", "formSerializationOnly"],
    note: "Synthetic SaveAsText-shaped text characterizes embedded-code stripping only; safety additionally requires a successfully read and compared sibling .cls.",
  },
  {
    id: "form-layout-width",
    scope: "form.txt",
    sourceText: formBody(9071, 1, "Private Sub Run()\nEnd Sub"),
    binaryText: formBody(9070, 1, "Private Sub Run()\nEnd Sub"),
    expectedFunctional: true,
    expectedCategories: ["bothChanged"],
    note: "Synthetic SaveAsText-shaped text keeps Width significant; the snippet is not validated or imported as an Access form.",
  },
      {
        id: "form-cls-code",
        scope: "cls",
        sourceText: "Option Explicit\nPrivate Sub Run()\n    DoThing 1\nEnd Sub\n",
        binaryText: "Option Explicit\nPrivate Sub Run()\n    DoThing 2\nEnd Sub\n",
        expectedFunctional: true,
        expectedCategories: ["bothChanged"],
        note: "The sibling .cls is authoritative for form behavior.",
      },
      // -------------------------------------------------------------------------
      // WU-3 v2-categories: positive probes for the four new non-actionable
      // buckets. Each entry isolates ONE normalizer so the observed category
      // is unambiguously that bucket (not a coincidence of overlapping
      // normalizers). They complement the *_goal cases above (which mix two or
      // more non-actionable families and collapse to `nonActionableMixed`).
      // -------------------------------------------------------------------------
      {
        id: "v2-comment-case-only-positive",
        scope: "bas",
        sourceText: `${moduleBody}' NOTE\n`,
        binaryText: `${moduleBody}' note\n`,
        expectedFunctional: false,
        expectedCategories: ["commentOnly"],
        note: "Positive probe for the commentOnly bucket: only a case-only difference inside a whole-line comment.",
      },
      {
        id: "v2-inter-token-whitespace-positive",
        scope: "bas",
        sourceText: moduleBody.replace("ItemCount + 1", "ItemCount+1"),
        binaryText: moduleBody,
        expectedFunctional: false,
        expectedCategories: ["whitespaceOnly"],
        note: "Positive probe for the inter-token-whitespace sub-bucket of whitespaceOnly.",
      },
      {
        id: "v2-continuation-only-positive",
        scope: "bas",
        sourceText:
          "Option Explicit\nPublic Function Total() As Long\n    Total = 1 + _\n        2\nEnd Function\n",
        binaryText: "Option Explicit\nPublic Function Total() As Long\n    Total = 1 + 2\nEnd Function\n",
        expectedFunctional: false,
        expectedCategories: ["continuationOnly"],
        note: "Positive probe for the continuationOnly bucket: same expression, one side uses `_<EOL>` reflow.",
      },
      {
        id: "v2-statement-boundary-only-positive",
        scope: "bas",
        sourceText:
          "Option Explicit\nPublic Function Run() As Long\n    a = 1: b = 2\n    Run = a + b\nEnd Function\n",
        binaryText:
          "Option Explicit\nPublic Function Run() As Long\n    a = 1\n    b = 2\n    Run = a + b\nEnd Function\n",
        expectedFunctional: false,
        expectedCategories: ["statementBoundaryOnly"],
        note: "Positive probe for the statementBoundaryOnly bucket: same statements, one side uses `: ` separator.",
      },
      {
        id: "v2-non-actionable-mixed-positive",
        scope: "bas",
        sourceText: `${moduleBody.replaceAll("Calculate", "calculate")}' Business Note\n`,
        binaryText: `${moduleBody}' business note\n`,
        expectedFunctional: false,
        expectedCategories: ["nonActionableMixed"],
        note: "Positive probe for the nonActionableMixed bucket: identifier case + comment case together equalize only under two normalizers.",
      },
    ];

const observations = cases.map((entry) => {
  const result = classifyVbaPair({
    sourceText: entry.sourceText,
    binaryText: entry.binaryText,
    fileType: entry.scope,
    mode: "semantic",
  });
  return {
    id: entry.id,
    scope: entry.scope,
    expectedFunctional: entry.expectedFunctional,
    expectedCategories: entry.expectedCategories,
    observedActionable: result.actionable,
    observedClassification: result.classification,
    observedRecommendation: result.recommendation,
    srcUniqueFunctionalLines: result.srcUniqueFunctionalLines,
    binaryUniqueFunctionalLines: result.binaryUniqueFunctionalLines,
    goalPass: result.actionable === entry.expectedFunctional,
    categoryPass: entry.expectedCategories.includes(result.classification),
    recommendationPass:
      result.recommendation === expectedRecommendationByCategory[result.classification],
    note: entry.note,
  };
});

const resultsDir = resolve(process.cwd(), "E2E_testing/verify-research/results");
mkdirSync(resultsDir, { recursive: true });
writeFileSync(
  resolve(resultsDir, "mutation-matrix.json"),
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      runtime: "lexical source-classifier probes only; snippets are not compiled, imported, or runtime-equivalence evidence", 
      totals: {
        cases: observations.length,
        goalPassed: observations.filter((entry) => entry.goalPass).length,
        goalFailed: observations.filter((entry) => !entry.goalPass).length,
        categoryPassed: observations.filter((entry) => entry.categoryPass).length,
        categoryFailed: observations.filter((entry) => !entry.categoryPass).length,
        recommendationPassed: observations.filter((entry) => entry.recommendationPass).length,
        recommendationFailed: observations.filter((entry) => !entry.recommendationPass).length,
      },
      observations,
      unexecutedRealAccessCases: [
        "missing/extra module directionality",
        "duplicate module identity",
        "incomplete binary export fail-closed behavior",
        "whole-project repeat/cache freshness",
        "form .cls plus .form.txt paired result",
      ],
    },
    null,
    2,
  )}\n`,
  "utf8",
);

describe("lexical classifier characterization", () => {
  it.each(observations)("records $id without inventing a verdict", (observation) => {
    expect(typeof observation.observedActionable).toBe("boolean");
    expect(observation.observedClassification.length).toBeGreaterThan(0);
    expect(observation.observedRecommendation.length).toBeGreaterThan(0);
  });

  it("is deterministic across repeated classifications", () => {
    const repeat = cases.map((entry) =>
      classifyVbaPair({
        sourceText: entry.sourceText,
        binaryText: entry.binaryText,
        fileType: entry.scope,
        mode: "semantic",
      }),
    );
    expect(repeat).toEqual(
      observations.map((entry) => ({
        classification: entry.observedClassification,
        reason: classifyVbaPair({
          sourceText: cases.find((candidate) => candidate.id === entry.id)?.sourceText ?? "",
          binaryText: cases.find((candidate) => candidate.id === entry.id)?.binaryText ?? "",
          fileType: entry.scope,
          mode: "semantic",
        }).reason,
        srcUniqueFunctionalLines: entry.srcUniqueFunctionalLines,
        binaryUniqueFunctionalLines: entry.binaryUniqueFunctionalLines,
        recommendation: entry.observedRecommendation,
        actionable: entry.observedActionable,
        // WU-3 v2-categories: `normalizationReasons` is an additive field on
        // every SemanticClassification; mirror it here so the comparison
        // compares the full result rather than the legacy 6-field shape.
        normalizationReasons: classifyVbaPair({
          sourceText: cases.find((candidate) => candidate.id === entry.id)?.sourceText ?? "",
          binaryText: cases.find((candidate) => candidate.id === entry.id)?.binaryText ?? "",
          fileType: entry.scope,
          mode: "semantic",
        }).normalizationReasons,
      })),
    );
  });
});

describe("GOAL functional behavior", () => {
  it.each(observations)("$id actionable matches expected functional behavior", (observation) => {
    expect(observation.observedActionable).toBe(observation.expectedFunctional);
  });
});

describe("classification characterization contract", () => {
  it.each(observations)("$id uses an expected diagnostic category", (observation) => {
    expect(observation.expectedCategories).toContain(observation.observedClassification);
  });
});

describe("recommendation consistency contract", () => {
  it.each(observations)("$id recommendation agrees with its category", (observation) => {
    expect(observation.observedRecommendation).toBe(
      expectedRecommendationByCategory[observation.observedClassification],
    );
  });
});
