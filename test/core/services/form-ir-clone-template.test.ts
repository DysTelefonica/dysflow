// Slice 5 (issue #618) — pure-IR tests for `applyTokenMap` and `cloneFormFromTemplate`.
// No filesystem. No Access. No mocks needed: the engine is a pure data transformation.

import { describe, expect, it } from "vitest";
import type { FormIR } from "../../../src/core/models/form-ir";
import {
  applyTokenMap,
  cloneFormFromTemplate,
  parseFormTxt,
  serializeFormTxt,
} from "../../../src/core/services/form-ir-service";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * A minimal SaveAsText source form with:
 *  - one {{FormName}} token in a layout scalar (Caption, RowSource)
 *  - one opaque metadata key (Checksum) that does NOT contain the token
 *  - one opaque blob (PrtDevMode) whose body lines do NOT contain the token
 * The PrtDevMode body intentionally does NOT carry the token — that is the
 * invariant: token replacement never walks preserved metadata.
 *
 * NOTE: no trailing newline. `serializeFormTxt` does NOT emit a trailing
 * newline, so fixtures used with `manualReplace` byte-equivalence assertions
 * must match that convention to keep the comparison apples-to-apples.
 */
const SOURCE_FORM_WITH_TOKEN = `Version =21
VersionRequired =20
Checksum =123456789
Begin Form
    RecordSource ="SELECT * FROM tbl{{FormName}}"
    Caption ="Form for {{FormName}}"
    PrtDevMode = Begin
        0xDEADBEEF
    End
    Begin TextBox
        Name ="txt{{FormName}}"
        DefaultValue ="hello {{FormName}}"
    End
End`;

/**
 * Source carrying a preserved metadata blob whose body lines DO carry the
 * token text. The expectation is that those body lines stay byte-equivalent —
 * token replacement does NOT walk preserved keys.
 *
 * NOTE: no trailing newline (see SOURCE_FORM_WITH_TOKEN).
 */
const SOURCE_WITH_TOKEN_IN_PRTDEV = `Version =21
Checksum =42
Begin Form
    Caption ="{{FormName}}"
    PrtDevMode = Begin
        {{FormName}}_blob_line_one
        {{FormName}}_blob_line_two
    End
End`;

/**
 * Source with the token only inside a quoted scalar. The token here is a
 * runtime-visible string (Caption) and SHOULD be replaced.
 */
const SOURCE_TOKEN_IN_QUOTED_SCALAR = `Version =21
Begin Form
    Caption ="Replace {{FormName}} please"
End`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadIr(text: string, name: string): FormIR {
  return parseFormTxt(text, { name });
}

/**
 * Manual clone-and-replace baseline: apply every token via global regex.
 * Used to assert byte-equivalence between the engine's result and a manual
 * string replace on the same input (slice 5 spec scenario 1).
 */
function manualReplace(text: string, tokenMap: Record<string, string>): string {
  let out = text;
  for (const [token, value] of Object.entries(tokenMap)) {
    out = out.split(`{{${token}}}`).join(value);
  }
  return out;
}

// ---------------------------------------------------------------------------
// applyTokenMap — low-level IR transformation
// ---------------------------------------------------------------------------

describe("applyTokenMap (low-level IR transformation)", () => {
  it("replaces a {{Token}} occurrence in a scalar value with the mapped value", () => {
    const ir = loadIr(SOURCE_TOKEN_IN_QUOTED_SCALAR, "SourceForm");

    const result = applyTokenMap(ir, { FormName: "FormNuevaAuditoria" });

    expect(serializeFormTxt(result.ir)).toContain('Caption ="Replace FormNuevaAuditoria please"');
    expect(result.appliedTokens).toContain("FormName");
    expect(result.missingTokens).not.toContain("FormName");
  });

  it("does NOT walk scalar values of preserved metadata keys (Checksum / Format / PrtDevMode)", () => {
    const ir = loadIr(
      `Version =21
Checksum ="{{FormName}}_checksum_value"
Begin Form
    Caption ="{{FormName}}"
    Format ="{{FormName}}_format"
End
`,
      "SourceForm",
    );

    const result = applyTokenMap(ir, { FormName: "FormNuevaAuditoria" });

    // Caption is a layout key — the token IS replaced.
    expect(serializeFormTxt(result.ir)).toContain('Caption ="FormNuevaAuditoria"');
    // Checksum and Format scalars are preserved verbatim.
    expect(serializeFormTxt(result.ir)).toContain('Checksum ="{{FormName}}_checksum_value"');
    expect(serializeFormTxt(result.ir)).toContain('Format ="{{FormName}}_format"');
    // Sanity: no preserved-metadata entry was rewritten to the replaced value.
    expect(serializeFormTxt(result.ir)).not.toContain(
      'Checksum ="FormNuevaAuditoria_checksum_value"',
    );
  });

  it("does NOT walk body lines of preserved metadata blobs (PrtDevMode)", () => {
    const ir = loadIr(SOURCE_WITH_TOKEN_IN_PRTDEV, "SourceForm");

    const result = applyTokenMap(ir, { FormName: "FormNuevaAuditoria" });

    const serialized = serializeFormTxt(result.ir);
    // Caption (layout scalar) is replaced.
    expect(serialized).toContain('Caption ="FormNuevaAuditoria"');
    // PrtDevMode body lines stay verbatim — the token text remains inside.
    expect(serialized).toContain("{{FormName}}_blob_line_one");
    expect(serialized).toContain("{{FormName}}_blob_line_two");
    expect(serialized).not.toContain("FormNuevaAuditoria_blob_line_one");
  });

  it("leaves unmapped tokens verbatim under warn-pass-through and records them as missing", () => {
    const ir = loadIr(SOURCE_TOKEN_IN_QUOTED_SCALAR, "SourceForm");

    // Only one of two tokens has a mapping. Under default policy the unmapped
    // token is left as-is and the operation returns success.
    const result = applyTokenMap(ir, { OtherToken: "X" });

    // Source token {{FormName}} is left verbatim.
    expect(serializeFormTxt(result.ir)).toContain('Caption ="Replace {{FormName}} please"');
    // The mapped token was NOT present in the source, so appliedTokens excludes
    // it (semantics: applied = replaced; present-in-source = missing).
    expect(result.appliedTokens).not.toContain("OtherToken");
    // FormName IS present in the source and IS missing from the map.
    expect(result.missingTokens).toEqual(["FormName"]);
    expect(result.warnings.some((w) => w.includes("FormName"))).toBe(true);
  });

  it("throws FORM_MUTATION_INVALID on any unmapped source token under strict policy", () => {
    const ir = loadIr(SOURCE_TOKEN_IN_QUOTED_SCALAR, "SourceForm");

    expect(() =>
      applyTokenMap(ir, { OtherToken: "X" }, { missingTokenPolicy: "strict" }),
    ).toThrowError(expect.objectContaining({ code: "FORM_MUTATION_INVALID" }));
  });

  it("throws FORM_TOKEN_MAP_INVALID on empty-string token key", () => {
    const ir = loadIr(SOURCE_TOKEN_IN_QUOTED_SCALAR, "SourceForm");

    expect(() => applyTokenMap(ir, { "": "X" })).toThrowError(
      expect.objectContaining({ code: "FORM_TOKEN_MAP_INVALID" }),
    );
  });

  it("throws FORM_TOKEN_MAP_INVALID on non-string token value", () => {
    const ir = loadIr(SOURCE_TOKEN_IN_QUOTED_SCALAR, "SourceForm");

    // The `as unknown as string` cast below is intentional — the test exercises
    // the runtime check that rejects a non-string token value.
    expect(() => applyTokenMap(ir, { FormName: 42 as unknown as string })).toThrowError(
      expect.objectContaining({ code: "FORM_TOKEN_MAP_INVALID" }),
    );
  });
});

// ---------------------------------------------------------------------------
// cloneFormFromTemplate — orchestration around applyTokenMap + metadata guard
// ---------------------------------------------------------------------------

describe("cloneFormFromTemplate (template cloning service)", () => {
  it("returns a serialized result that is byte-equivalent to a manual clone-and-replace", () => {
    // Spec scenario 1: "manual clone-and-replace on the same source MUST be
    // byte-equivalent to the service result". We assert this explicitly by
    // running the manual replace and comparing it to `result.source`.
    const tokenMap = { FormName: "FormNuevaAuditoria" };
    const ir = loadIr(SOURCE_FORM_WITH_TOKEN, "SourceForm");

    const result = cloneFormFromTemplate(ir, { tokenMap, targetFormName: "FormNuevaAuditoria" });

    const expected = manualReplace(SOURCE_FORM_WITH_TOKEN, tokenMap);
    expect(result.source).toBe(expected);
  });

  it("preserves opaque metadata bytes (Checksum, PrtDevMode) byte-equivalent after cloning", () => {
    // Spec scenario 2: even when the source contains tokens, the reserved
    // metadata (Checksum in preamble + PrtDevMode blob) MUST remain
    // byte-equivalent AFTER the clone. A naive `manualReplace` (text-level
    // string.replace) would rewrite tokens inside PrtDevMode and break this
    // guarantee — the engine's whole point is that it does NOT walk the
    // preserved keys. So the assertion is structural:
    //
    //   - preserved-metadata lines in `result.source` match the SOURCE bytes
    //     (NOT `manualReplace`'s output, which leaks tokens into metadata).
    //   - layout scalars in `result.source` match `manualReplace`'s output
    //     (this is the part where token replacement IS expected).
    const ir = loadIr(SOURCE_WITH_TOKEN_IN_PRTDEV, "SourceForm");

    const result = cloneFormFromTemplate(ir, {
      tokenMap: { FormName: "FormNuevaAuditoria" },
      targetFormName: "FormNuevaAuditoria",
    });

    // Preserved-metadata lines stay byte-equivalent to the SOURCE.
    expect(result.source).toContain("Checksum =42");
    expect(result.source).toContain("    PrtDevMode = Begin");
    expect(result.source).toContain("        {{FormName}}_blob_line_one");
    expect(result.source).toContain("        {{FormName}}_blob_line_two");
    // Negative: the engine did NOT rewrite tokens inside PrtDevMode.
    expect(result.source).not.toContain("FormNuevaAuditoria_blob_line_one");
    expect(result.source).not.toContain("FormNuevaAuditoria_blob_line_two");

    // Layout scalars ARE replaced — and they match what `manualReplace`
    // produces on the same source with the same token map.
    const expectedLayout = manualReplace(SOURCE_WITH_TOKEN_IN_PRTDEV, {
      FormName: "FormNuevaAuditoria",
    });
    // Pull the Caption line from manualReplace to confirm parity on the
    // layout side only (the PrtDevMode lines diverge on purpose).
    expect(result.source).toContain('Caption ="FormNuevaAuditoria"');
    expect(expectedLayout).toContain('Caption ="FormNuevaAuditoria"');
    // The recorded preservedKeys from the engine still include PrtDevMode.
    expect(result.preservedKeys).toEqual(expect.arrayContaining(["Checksum", "PrtDevMode"]));
  });

  it("sets the cloned IR's name to targetFormName and reports appliedTokens", () => {
    const ir = loadIr(SOURCE_TOKEN_IN_QUOTED_SCALAR, "SourceForm");

    const result = cloneFormFromTemplate(ir, {
      tokenMap: { FormName: "FormNuevaAuditoria" },
      targetFormName: "FormNuevaAuditoria",
    });

    expect(result.ir.name).toBe("FormNuevaAuditoria");
    expect(result.appliedTokens).toContain("FormName");
    expect(result.missingTokens).toEqual([]);
  });

  it("does not mutate the source IR (immutability invariant)", () => {
    const ir = loadIr(SOURCE_FORM_WITH_TOKEN, "SourceForm");
    const before = serializeFormTxt(ir);

    const result = cloneFormFromTemplate(ir, {
      tokenMap: { FormName: "FormNuevaAuditoria" },
      targetFormName: "FormNuevaAuditoria",
    });

    expect(serializeFormTxt(ir)).toBe(before);
    // Sanity: the clone DOES carry the replacement.
    expect(serializeFormTxt(result.ir)).not.toBe(before);
    // Slice 4 byte-equivalence property is preserved.
    expect(serializeFormTxt(ir)).toBe(before);
  });

  it("throws FORM_MUTATION_INVALID under strict policy on unmapped tokens; source IR not mutated", () => {
    const ir = loadIr(SOURCE_TOKEN_IN_QUOTED_SCALAR, "SourceForm");
    const before = serializeFormTxt(ir);

    expect(() =>
      cloneFormFromTemplate(ir, {
        tokenMap: { OtherToken: "X" },
        targetFormName: "FormNuevaAuditoria",
        missingTokenPolicy: "strict",
      }),
    ).toThrowError(expect.objectContaining({ code: "FORM_MUTATION_INVALID" }));

    // Source IR is unchanged after the rejected call.
    expect(serializeFormTxt(ir)).toBe(before);
  });
});
