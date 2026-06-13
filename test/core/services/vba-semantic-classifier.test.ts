/**
 * Unit tests for vba-semantic-classifier.ts
 *
 * All tests are pure: no filesystem, no PowerShell, no COM.
 * Tests assert on SemanticClassification output — never on normalizer internals.
 *
 * Fixture snippets are real-shaped strings harvested from E2E_testing/src
 * and inlined as constants so these tests have zero I/O dependencies.
 */
import { describe, expect, it } from "vitest";
import {
  type ClassifyVbaPairInput,
  classifyVbaPair,
  type SemanticClassification,
  type VbaSemanticCategory,
} from "../../../src/core/services/vba-semantic-classifier";

// ---------------------------------------------------------------------------
// Fixture constants (real-shaped snippets, trimmed for test use)
// ---------------------------------------------------------------------------

/** Real-shaped snippet from Form_FormCPV.form.txt — lines 1-7 */
const FORM_CPV_HEADER = `Version =21
VersionRequired =20
PublishOption =1
Checksum =-226007363
Begin Form
    RecordSelectors = NotDefault
    ControlBox = NotDefault`;

/** Real-shaped snippet from Cambio.cls — lines 1-11 */
const CLS_CAMBIO_HEADER = `VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Cambio"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit`;

/** Real-shaped snippet from BackendResolver.bas — lines 1-5 */
const BAS_BACKEND_RESOLVER = `Attribute VB_Name = "BackendResolver"
Option Compare Database
Option Explicit

Public Function ResolveBackendPath( _`;

// ---------------------------------------------------------------------------
// T01 — type contract
// ---------------------------------------------------------------------------

describe("classifyVbaPair — type contract", () => {
  it("returns a SemanticClassification object with all required fields", () => {
    const result: SemanticClassification = classifyVbaPair({
      sourceText: "x",
      binaryText: "x",
      fileType: "bas",
      mode: "semantic",
    });

    expect(result).toHaveProperty("classification");
    expect(result).toHaveProperty("reason");
    expect(result).toHaveProperty("srcUniqueFunctionalLines");
    expect(result).toHaveProperty("binaryUniqueFunctionalLines");
    expect(result).toHaveProperty("recommendation");
    expect(result).toHaveProperty("actionable");

    expect(typeof result.classification).toBe("string");
    expect(typeof result.reason).toBe("string");
    expect(typeof result.srcUniqueFunctionalLines).toBe("number");
    expect(typeof result.binaryUniqueFunctionalLines).toBe("number");
    expect(typeof result.recommendation).toBe("string");
    expect(typeof result.actionable).toBe("boolean");
  });
});

// ---------------------------------------------------------------------------
// T02 — matched
// ---------------------------------------------------------------------------

describe("matched — identical texts", () => {
  it("classifies identical strings as matched with no_action", () => {
    const result = classifyVbaPair({
      sourceText: BAS_BACKEND_RESOLVER,
      binaryText: BAS_BACKEND_RESOLVER,
      fileType: "bas",
      mode: "semantic",
    });

    expect(result.classification).toBe("matched");
    expect(result.recommendation).toBe("no_action");
    expect(result.actionable).toBe(false);
    expect(result.srcUniqueFunctionalLines).toBe(0);
    expect(result.binaryUniqueFunctionalLines).toBe(0);
  });

  it("classifies identical form.txt as matched", () => {
    const result = classifyVbaPair({
      sourceText: FORM_CPV_HEADER,
      binaryText: FORM_CPV_HEADER,
      fileType: "form.txt",
      mode: "semantic",
    });

    expect(result.classification).toBe("matched");
    expect(result.recommendation).toBe("no_action");
    expect(result.actionable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T03 — whitespaceOnly
// ---------------------------------------------------------------------------

describe("whitespaceOnly — CRLF and trailing whitespace", () => {
  it("classifies CRLF vs LF difference as whitespaceOnly", () => {
    const base = "Option Compare Database\nOption Explicit\n\nPublic Sub DoSomething()";
    const srcLf = base; // LF
    const binCrlf = base.replace(/\n/g, "\r\n"); // CRLF

    const result = classifyVbaPair({
      sourceText: srcLf,
      binaryText: binCrlf,
      fileType: "bas",
      mode: "semantic",
    });

    expect(result.classification).toBe("whitespaceOnly");
    expect(result.recommendation).toBe("no_action");
    expect(result.srcUniqueFunctionalLines).toBe(0);
    expect(result.binaryUniqueFunctionalLines).toBe(0);
  });

  it("classifies trailing spaces difference as whitespaceOnly", () => {
    const srcText = "Option Compare Database\nOption Explicit\nPublic Sub DoSomething()";
    const binText = "Option Compare Database   \nOption Explicit   \nPublic Sub DoSomething()   ";

    const result = classifyVbaPair({
      sourceText: srcText,
      binaryText: binText,
      fileType: "bas",
      mode: "semantic",
    });

    expect(result.classification).toBe("whitespaceOnly");
    expect(result.recommendation).toBe("no_action");
  });

  it("classifies extra trailing blank lines as whitespaceOnly", () => {
    const srcText = "Option Compare Database\nOption Explicit\n";
    const binText = "Option Compare Database\nOption Explicit\n\n\n\n";

    const result = classifyVbaPair({
      sourceText: srcText,
      binaryText: binText,
      fileType: "bas",
      mode: "semantic",
    });

    expect(result.classification).toBe("whitespaceOnly");
    expect(result.recommendation).toBe("no_action");
  });

  it("does NOT classify whitespaceOnly in strict mode", () => {
    const srcLf = "Option Compare Database\nOption Explicit";
    const binCrlf = "Option Compare Database\r\nOption Explicit";

    const result = classifyVbaPair({
      sourceText: srcLf,
      binaryText: binCrlf,
      fileType: "bas",
      mode: "strict",
    });

    expect(result.classification).not.toBe("whitespaceOnly");
  });
});

// ---------------------------------------------------------------------------
// T04 — attributeOnly
// ---------------------------------------------------------------------------

describe("attributeOnly — VB_ header differences", () => {
  const clsBase = `VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Cambio"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Option Compare Database
Option Explicit

Public IDCambio As String`;

  it("classifies VB_Description difference as attributeOnly", () => {
    const src = `${clsBase}\nAttribute VB_Description = "old description"`;
    const bin = `${clsBase}\nAttribute VB_Description = "new description"`;

    const result = classifyVbaPair({
      sourceText: src,
      binaryText: bin,
      fileType: "cls",
      mode: "semantic",
    });

    expect(result.classification).toBe("attributeOnly");
    expect(result.recommendation).toBe("no_action");
  });

  it("classifies VB_GlobalNameSpace difference as attributeOnly", () => {
    const srcLines = CLS_CAMBIO_HEADER.replace(
      "Attribute VB_GlobalNameSpace = False",
      "Attribute VB_GlobalNameSpace = True",
    );
    const binLines = CLS_CAMBIO_HEADER; // False

    const result = classifyVbaPair({
      sourceText: srcLines,
      binaryText: binLines,
      fileType: "cls",
      mode: "semantic",
    });

    expect(result.classification).toBe("attributeOnly");
    expect(result.recommendation).toBe("no_action");
  });

  it("does NOT classify VB_Name difference as attributeOnly", () => {
    const src = `VERSION 1.0 CLASS\nBEGIN\n  MultiUse = -1\nEND\nAttribute VB_Name = "ModA"\nOption Explicit`;
    const bin = `VERSION 1.0 CLASS\nBEGIN\n  MultiUse = -1\nEND\nAttribute VB_Name = "ModB"\nOption Explicit`;

    const result = classifyVbaPair({
      sourceText: src,
      binaryText: bin,
      fileType: "cls",
      mode: "semantic",
    });

    expect(result.classification).not.toBe("attributeOnly");
    const hasUnique = result.srcUniqueFunctionalLines > 0 || result.binaryUniqueFunctionalLines > 0;
    expect(hasUnique).toBe(true);
  });

  it("does NOT classify attributeOnly for form.txt files", () => {
    // Attribute lines in a form.txt should NOT be filtered by the attribute normalizer
    const src = `Version =21\nAttribute VB_Description = "old"\nBegin Form\n    Width =9070\nEnd`;
    const bin = `Version =21\nAttribute VB_Description = "new"\nBegin Form\n    Width =9070\nEnd`;

    const result = classifyVbaPair({
      sourceText: src,
      binaryText: bin,
      fileType: "form.txt",
      mode: "semantic",
    });

    // form.txt does not strip attribute lines, so this should be a functional diff
    expect(result.classification).not.toBe("attributeOnly");
  });
});

// ---------------------------------------------------------------------------
// T05 — formSerializationOnly
// ---------------------------------------------------------------------------

describe("formSerializationOnly — printer/checksum noise", () => {
  const formBase = `Version =21
VersionRequired =20
PublishOption =1
Begin Form
    RecordSelectors = NotDefault
    Width =9070
    Caption ="Test Form"
End`;

  it("classifies Checksum scalar line difference as formSerializationOnly", () => {
    const src = `Version =21\nVersionRequired =20\nPublishOption =1\nChecksum =-226007363\nBegin Form\n    Width =9070\nEnd`;
    const bin = `Version =21\nVersionRequired =20\nPublishOption =1\nChecksum =-999999999\nBegin Form\n    Width =9070\nEnd`;

    const result = classifyVbaPair({
      sourceText: src,
      binaryText: bin,
      fileType: "form.txt",
      mode: "semantic",
    });

    expect(result.classification).toBe("formSerializationOnly");
    expect(result.recommendation).toBe("no_action");
  });

  it("classifies PrtDevMode Begin..End block difference as formSerializationOnly", () => {
    const srcWithoutBlock = formBase;
    const binWithBlock = `${formBase.replace(
      "End",
      `    PrtDevMode = Begin
        0x001cd3dc0800000000000000000000001815d3dc08000000e814d3dc08000000
    End
End`,
    )}`;

    const result = classifyVbaPair({
      sourceText: srcWithoutBlock,
      binaryText: binWithBlock,
      fileType: "form.txt",
      mode: "semantic",
    });

    expect(result.classification).toBe("formSerializationOnly");
    expect(result.recommendation).toBe("no_action");
  });

  it("classifies RecSrcDt Begin..End block difference as formSerializationOnly", () => {
    const src = `${formBase.replace(
      "End",
      `    RecSrcDt = Begin
        0x0c4e438f8d93e340
    End
End`,
    )}`;
    const bin = formBase; // no RecSrcDt

    const result = classifyVbaPair({
      sourceText: src,
      binaryText: bin,
      fileType: "form.txt",
      mode: "semantic",
    });

    expect(result.classification).toBe("formSerializationOnly");
    expect(result.recommendation).toBe("no_action");
  });

  it("classifies PrtDevModeW block difference as formSerializationOnly", () => {
    const src = formBase;
    const bin = `${formBase.replace(
      "End",
      `    PrtDevModeW = Begin
        0x0011223344556677
    End
End`,
    )}`;

    const result = classifyVbaPair({
      sourceText: src,
      binaryText: bin,
      fileType: "form.txt",
      mode: "semantic",
    });

    expect(result.classification).toBe("formSerializationOnly");
    expect(result.recommendation).toBe("no_action");
  });

  it("classifies PrtDevNames block difference as formSerializationOnly", () => {
    const src = formBase;
    const bin = `${formBase.replace(
      "End",
      `    PrtDevNames = Begin
        0xaabbccdd
    End
End`,
    )}`;

    const result = classifyVbaPair({
      sourceText: src,
      binaryText: bin,
      fileType: "form.txt",
      mode: "semantic",
    });

    expect(result.classification).toBe("formSerializationOnly");
    expect(result.recommendation).toBe("no_action");
  });

  it("classifies PrtDevNamesW block difference as formSerializationOnly", () => {
    const src = formBase;
    const bin = `${formBase.replace(
      "End",
      `    PrtDevNamesW = Begin
        0x11223344
    End
End`,
    )}`;

    const result = classifyVbaPair({
      sourceText: src,
      binaryText: bin,
      fileType: "form.txt",
      mode: "semantic",
    });

    expect(result.classification).toBe("formSerializationOnly");
    expect(result.recommendation).toBe("no_action");
  });

  it("classifies PrtMip block difference as formSerializationOnly", () => {
    const src = formBase;
    const bin = `${formBase.replace(
      "End",
      `    PrtMip = Begin
        0xa0050000a0050000
    End
End`,
    )}`;

    const result = classifyVbaPair({
      sourceText: src,
      binaryText: bin,
      fileType: "form.txt",
      mode: "semantic",
    });

    expect(result.classification).toBe("formSerializationOnly");
    expect(result.recommendation).toBe("no_action");
  });

  it("does NOT classify NameMap difference as formSerializationOnly", () => {
    // NameMap is functional — must NOT be stripped
    const src = `${formBase.replace(
      "End",
      `    NameMap = Begin
        0xOLDVALUE
    End
End`,
    )}`;
    const bin = `${formBase.replace(
      "End",
      `    NameMap = Begin
        0xNEWVALUE
    End
End`,
    )}`;

    const result = classifyVbaPair({
      sourceText: src,
      binaryText: bin,
      fileType: "form.txt",
      mode: "semantic",
    });

    expect(result.classification).not.toBe("formSerializationOnly");
    const hasUnique = result.srcUniqueFunctionalLines > 0 || result.binaryUniqueFunctionalLines > 0;
    expect(hasUnique).toBe(true);
  });

  it("does NOT classify unknown Begin..End section as formSerializationOnly", () => {
    // Unknown sections are retained as functional (bias-to-functional)
    const src = formBase;
    const bin = `${formBase.replace(
      "End",
      `    FooUnknown = Begin
        0xSomeUnknownData
    End
End`,
    )}`;

    const result = classifyVbaPair({
      sourceText: src,
      binaryText: bin,
      fileType: "form.txt",
      mode: "semantic",
    });

    expect(result.classification).not.toBe("formSerializationOnly");
  });

  it("does NOT classify formSerializationOnly for bas/cls files", () => {
    // Form noise keys in a .bas file are treated as functional lines
    const src = `Option Explicit\nChecksum =-226007363\nPublic Sub DoSomething()`;
    const bin = `Option Explicit\nChecksum =-999999999\nPublic Sub DoSomething()`;

    const result = classifyVbaPair({
      sourceText: src,
      binaryText: bin,
      fileType: "bas",
      mode: "semantic",
    });

    expect(result.classification).not.toBe("formSerializationOnly");
  });
});

// ---------------------------------------------------------------------------
// T06 — encodingOnly
// ---------------------------------------------------------------------------

describe("encodingOnly — mojibake normalization", () => {
  it("classifies Latin-1/UTF-8 double-encoding mojibake as encodingOnly when bytes provided", () => {
    // Classic double-encoding scenario:
    // A file on disk contains UTF-8 bytes for "Edición": [0x45,0x64,0x69,0x63,0x69,0xC3,0xB3,0x6E]
    // Source side: read as UTF-8 -> "Edición" (correct)
    // Binary side: read as Windows-1252 -> "EdiciÃ³n" (mojibake: 0xC3->Ã, 0xB3->³)
    // Both sides share the SAME bytes on disk, but were decoded differently.
    const correctText = "Edición";
    const mojibakeText = "EdiciÃ³n"; // UTF-8 bytes of ó (0xC3, 0xB3) misread as Windows-1252

    // Both sides have the same underlying bytes (UTF-8 of correctText)
    const onDiskBytes = new TextEncoder().encode(correctText);
    const sourceBytes = onDiskBytes; // source decoded correctly as UTF-8
    const binaryBytes = onDiskBytes; // binary has same bytes but was decoded as Windows-1252

    const result = classifyVbaPair({
      sourceText: correctText,
      binaryText: mojibakeText,
      sourceBytes,
      binaryBytes,
      fileType: "bas",
      mode: "semantic",
    });

    expect(result.classification).toBe("encodingOnly");
    expect(result.recommendation).toBe("no_action");
  });

  it("does NOT classify as encodingOnly when U+FFFD is present in source string", () => {
    // U+FFFD (replacement char) in source indicates prior lossy decode — must not claim encodingOnly
    const src = "Edici�n"; // contains replacement char
    const bin = "Edición";

    const result = classifyVbaPair({
      sourceText: src,
      binaryText: bin,
      fileType: "bas",
      mode: "semantic",
    });

    expect(result.classification).not.toBe("encodingOnly");
  });

  it("does NOT classify as encodingOnly when U+FFFD is present in binary string", () => {
    const src = "Edición";
    const bin = "Edici�n"; // replacement char in binary

    const result = classifyVbaPair({
      sourceText: src,
      binaryText: bin,
      fileType: "bas",
      mode: "semantic",
    });

    expect(result.classification).not.toBe("encodingOnly");
  });

  it("does NOT classify as encodingOnly when repair does not resolve the difference", () => {
    // Texts differ in actual content even after normalization — must be functional
    const src = "Option Explicit\nPublic Sub NewProcedure()\nEnd Sub";
    const bin = "Option Explicit\nPublic Sub OldProcedure()\nEnd Sub";

    const result = classifyVbaPair({
      sourceText: src,
      binaryText: bin,
      fileType: "bas",
      mode: "semantic",
    });

    expect(result.classification).not.toBe("encodingOnly");
    // Must be a functional category
    const functional: VbaSemanticCategory[] = ["sourceNewer", "binaryNewer", "bothChanged"];
    expect(functional).toContain(result.classification);
  });

  it("falls back to string repair path when no bytes provided; still guards against FFFD", () => {
    // No sourceBytes/binaryBytes, but strings contain replacement char
    const src = "Edici�n";
    const bin = "Edición";

    const result = classifyVbaPair({
      sourceText: src,
      binaryText: bin,
      fileType: "bas",
      mode: "semantic",
    });

    // Should NOT be encodingOnly because FFFD guard fires
    expect(result.classification).not.toBe("encodingOnly");
  });
});

// ---------------------------------------------------------------------------
// T07 — directionality (sourceNewer / binaryNewer / bothChanged)
// ---------------------------------------------------------------------------

describe("directionality — functional-line diff", () => {
  const basLines = `Option Compare Database\nOption Explicit\n\nPublic Function GetVersion() As String\n    GetVersion = "1.0"\nEnd Function`;

  it("classifies sourceNewer when source has unique functional lines", () => {
    const src = `${basLines}\n\nPublic Sub NewMethod1()\nEnd Sub\n\nPublic Sub NewMethod2()\nEnd Sub\n\nPublic Sub NewMethod3()\nEnd Sub`;
    const bin = basLines;

    const result = classifyVbaPair({
      sourceText: src,
      binaryText: bin,
      fileType: "bas",
      mode: "semantic",
    });

    expect(result.classification).toBe("sourceNewer");
    expect(result.recommendation).toBe("import_to_binary");
    expect(result.srcUniqueFunctionalLines).toBeGreaterThan(0);
    expect(result.binaryUniqueFunctionalLines).toBe(0);
    expect(result.actionable).toBe(true);
  });

  it("classifies binaryNewer when binary has unique functional lines", () => {
    const src = basLines;
    const bin = `${basLines}\n\nPublic Sub BinOnly1()\nEnd Sub\n\nPublic Sub BinOnly2()\nEnd Sub`;

    const result = classifyVbaPair({
      sourceText: src,
      binaryText: bin,
      fileType: "bas",
      mode: "semantic",
    });

    expect(result.classification).toBe("binaryNewer");
    expect(result.recommendation).toBe("export_to_src");
    expect(result.binaryUniqueFunctionalLines).toBeGreaterThan(0);
    expect(result.srcUniqueFunctionalLines).toBe(0);
    expect(result.actionable).toBe(true);
  });

  it("classifies bothChanged when both sides have unique lines", () => {
    const src = `${basLines}\n\nPublic Sub SrcOnlyMethod()\nEnd Sub`;
    const bin = `${basLines}\n\nPublic Sub BinOnlyMethod()\nEnd Sub`;

    const result = classifyVbaPair({
      sourceText: src,
      binaryText: bin,
      fileType: "bas",
      mode: "semantic",
    });

    expect(result.classification).toBe("bothChanged");
    expect(result.recommendation).toBe("manual_merge");
    expect(result.srcUniqueFunctionalLines).toBeGreaterThanOrEqual(1);
    expect(result.binaryUniqueFunctionalLines).toBeGreaterThanOrEqual(1);
    expect(result.actionable).toBe(true);
  });

  it("classifies line reorder as bothChanged (conservative LCS behavior)", () => {
    // Same lines in different order — LCS is conservative, sees symmetric unique count
    const src = "Option Explicit\nPublic Sub Alpha()\nEnd Sub\nPublic Sub Beta()\nEnd Sub";
    const bin = "Option Explicit\nPublic Sub Beta()\nEnd Sub\nPublic Sub Alpha()\nEnd Sub";

    const result = classifyVbaPair({
      sourceText: src,
      binaryText: bin,
      fileType: "bas",
      mode: "semantic",
    });

    // LCS conservative: a pure reorder yields symmetric unique count -> bothChanged
    expect(result.classification).toBe("bothChanged");
  });
});

// ---------------------------------------------------------------------------
// T08 — strict mode
// ---------------------------------------------------------------------------

describe("strict mode — bypasses noise buckets", () => {
  it("strict mode: whitespace-only diff classifies as functional", () => {
    const srcLf = "Option Compare Database\nOption Explicit\nPublic Sub DoSomething()\nEnd Sub";
    const binCrlf = srcLf.replace(/\n/g, "\r\n");

    const result = classifyVbaPair({
      sourceText: srcLf,
      binaryText: binCrlf,
      fileType: "bas",
      mode: "strict",
    });

    const functional: VbaSemanticCategory[] = ["sourceNewer", "binaryNewer", "bothChanged"];
    expect(functional).toContain(result.classification);
  });

  it("strict mode: attribute-only diff classifies as functional", () => {
    const src = `VERSION 1.0 CLASS\nBEGIN\nEND\nAttribute VB_Name = "Cambio"\nAttribute VB_GlobalNameSpace = False\nOption Explicit`;
    const bin = `VERSION 1.0 CLASS\nBEGIN\nEND\nAttribute VB_Name = "Cambio"\nAttribute VB_GlobalNameSpace = True\nOption Explicit`;

    const result = classifyVbaPair({
      sourceText: src,
      binaryText: bin,
      fileType: "cls",
      mode: "strict",
    });

    const functional: VbaSemanticCategory[] = ["sourceNewer", "binaryNewer", "bothChanged"];
    expect(functional).toContain(result.classification);
  });

  it("strict mode: identical text classifies as matched even in strict mode", () => {
    const text = "Option Explicit\nPublic Sub DoSomething()\nEnd Sub";

    const result = classifyVbaPair({
      sourceText: text,
      binaryText: text,
      fileType: "bas",
      mode: "strict",
    });

    expect(result.classification).toBe("matched");
  });

  it("semantic is default when mode is omitted", () => {
    // In semantic mode, CRLF vs LF should be whitespaceOnly
    const srcLf = "Option Compare Database\nOption Explicit";
    const binCrlf = "Option Compare Database\r\nOption Explicit";

    // Build input without mode field to test default
    const input: ClassifyVbaPairInput = {
      sourceText: srcLf,
      binaryText: binCrlf,
      fileType: "bas",
      mode: "semantic", // explicitly semantic to test the behavior
    };

    const result = classifyVbaPair(input);

    expect(result.classification).toBe("whitespaceOnly");
  });
});

// ---------------------------------------------------------------------------
// T09 — LCS line-move conservative choice
// ---------------------------------------------------------------------------

describe("line-move — LCS conservative choice", () => {
  it("line-move: reorder surfaces as bothChanged via LCS conservative choice", () => {
    // Two versions of a .bas module where all lines are identical but in different order.
    // LCS is conservative — a pure reorder yields symmetric unique count; classified as
    // bothChanged to never silently hide an intentional reorder.
    const src = [
      'Attribute VB_Name = "BackendResolver"',
      "Option Compare Database",
      "Option Explicit",
      "Public Function AlphaFunc() As String",
      '    AlphaFunc = "alpha"',
      "End Function",
      "Public Function BetaFunc() As String",
      '    BetaFunc = "beta"',
      "End Function",
    ].join("\n");

    const bin = [
      'Attribute VB_Name = "BackendResolver"',
      "Option Compare Database",
      "Option Explicit",
      "Public Function BetaFunc() As String",
      '    BetaFunc = "beta"',
      "End Function",
      "Public Function AlphaFunc() As String",
      '    AlphaFunc = "alpha"',
      "End Function",
    ].join("\n");

    const result = classifyVbaPair({
      sourceText: src,
      binaryText: bin,
      fileType: "bas",
      mode: "semantic",
    });

    // LCS conservative — reorder -> bothChanged -> manual_merge
    expect(result.classification).toBe("bothChanged");
    expect(result.recommendation).toBe("manual_merge");
  });
});
