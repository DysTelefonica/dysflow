import { describe, expect, it } from "vitest";

import {
  canonicalizeVba,
  normalizeLineEndings,
  selectCodec,
  stripBom,
} from "../../../src/core/services/canonicalize-vba";

const enc = new TextEncoder();

function bytes(
  text: string,
  codec: "utf-8" | "utf-16le" | "utf-16be" | "windows-1252" = "utf-8",
): Uint8Array {
  if (codec === "utf-8") return enc.encode(text);
  if (codec === "utf-16le") {
    const buf = new Uint8Array(text.length * 2);
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      buf[i * 2] = code & 0xff;
      buf[i * 2 + 1] = (code >> 8) & 0xff;
    }
    return buf;
  }
  if (codec === "utf-16be") {
    const buf = new Uint8Array(text.length * 2);
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      buf[i * 2] = (code >> 8) & 0xff;
      buf[i * 2 + 1] = code & 0xff;
    }
    return buf;
  }
  // windows-1252: ASCII subset is identical
  const buf = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) {
    buf[i] = text.charCodeAt(i) & 0xff;
  }
  return buf;
}

describe("selectCodec", () => {
  it("UTF-8 BOM → utf-8 with source 'bom'", () => {
    const b = new Uint8Array([0xef, 0xbb, 0xbf, ...enc.encode("hi")]);
    expect(selectCodec({ bytes: b })).toEqual({ codec: "utf-8", source: "bom" });
  });

  it("UTF-16LE BOM → utf-16le with source 'bom'", () => {
    const b = new Uint8Array([0xff, 0xfe, 0x68, 0x00]);
    expect(selectCodec({ bytes: b })).toEqual({ codec: "utf-16le", source: "bom" });
  });

  it("UTF-16BE BOM → utf-16be with source 'bom'", () => {
    const b = new Uint8Array([0xfe, 0xff, 0x00, 0x68]);
    expect(selectCodec({ bytes: b })).toEqual({ codec: "utf-16be", source: "bom" });
  });

  it("UTF-32 BOM → UNSUPPORTED_BOM error", () => {
    const b = new Uint8Array([0xff, 0xfe, 0x00, 0x00]);
    const result = selectCodec({ bytes: b });
    expect("error" in result).toBe(true);
    if (!("error" in result)) return;
    expect(result.error.code).toBe("UNSUPPORTED_BOM");
  });

  it("BOM + matching manifestCodec is accepted", () => {
    const b = new Uint8Array([0xef, 0xbb, 0xbf, ...enc.encode("hi")]);
    expect(selectCodec({ bytes: b, manifestCodec: "utf-8" })).toEqual({
      codec: "utf-8",
      source: "bom",
    });
  });

  it("BOM + conflicting manifestCodec → DECLARED_CODEC_CONFLICT", () => {
    const b = new Uint8Array([0xef, 0xbb, 0xbf, ...enc.encode("hi")]);
    const result = selectCodec({ bytes: b, manifestCodec: "utf-16le" });
    expect("error" in result).toBe(true);
    if (!("error" in result)) return;
    expect(result.error.code).toBe("DECLARED_CODEC_CONFLICT");
  });

  it("no BOM, manifestCodec declared → source 'manifest'", () => {
    expect(selectCodec({ bytes: enc.encode("hi"), manifestCodec: "windows-1252" })).toEqual({
      codec: "windows-1252",
      source: "manifest",
    });
  });

  it("no BOM, no manifest → utf-8 with source 'source-default'", () => {
    expect(selectCodec({ bytes: enc.encode("hi") })).toEqual({
      codec: "utf-8",
      source: "source-default",
    });
  });

  it("explicit sourceDefault wins over the built-in fallback", () => {
    expect(selectCodec({ bytes: enc.encode("hi"), sourceDefault: "windows-1252" })).toEqual({
      codec: "windows-1252",
      source: "source-default",
    });
  });
});

describe("stripBom", () => {
  it("strips UTF-8 BOM when codec is utf-8", () => {
    const b = new Uint8Array([0xef, 0xbb, 0xbf, 0x68, 0x69]);
    expect(stripBom(b, "utf-8")).toEqual(new Uint8Array([0x68, 0x69]));
  });

  it("strips UTF-16LE BOM when codec is utf-16le", () => {
    const b = new Uint8Array([0xff, 0xfe, 0x68, 0x00]);
    expect(stripBom(b, "utf-16le")).toEqual(new Uint8Array([0x68, 0x00]));
  });

  it("does NOT strip when codec does not match the BOM", () => {
    const b = new Uint8Array([0xef, 0xbb, 0xbf, 0x68, 0x69]);
    expect(stripBom(b, "utf-16le")).toEqual(b);
  });
});

describe("normalizeLineEndings", () => {
  it("collapses CRLF to LF and flags changed=true", () => {
    const result = normalizeLineEndings("a\r\nb");
    expect(result.text).toBe("a\nb");
    expect(result.changed).toBe(true);
  });

  it("leaves LF untouched and flags changed=false", () => {
    const result = normalizeLineEndings("a\nb");
    expect(result.text).toBe("a\nb");
    expect(result.changed).toBe(false);
  });

  it("collapses bare CR to LF", () => {
    const result = normalizeLineEndings("a\rb");
    expect(result.text).toBe("a\nb");
    expect(result.changed).toBe(true);
  });
});

describe("canonicalizeVba — supported productions", () => {
  it("lexes identifiers, keywords, and operators without concatenating", () => {
    const result = canonicalizeVba({
      bytes: bytes("Public Foo As Bar\n"),
      codec: "utf-8",
      fileType: "bas",
    });
    expect(result.status).toBe("supported");
    if (result.status !== "supported") return;
    expect(result.logicalStatements).toHaveLength(1);
    const tokens = result.logicalStatements[0]?.tokens ?? [];
    expect(tokens.map((t) => t.kind)).toContain("keyword");
    expect(tokens.map((t) => t.kind)).toContain("identifier");
    expect(tokens.map((t) => t.text.toLowerCase())).toContain("public");
    expect(tokens.map((t) => t.text)).toContain("Foo");
    expect(tokens.map((t) => t.text)).toContain("Bar");
  });

  it("lexes a numeric literal with decimal and exponent", () => {
    const result = canonicalizeVba({
      bytes: bytes("x = 1.5e-2\n"),
      codec: "utf-8",
      fileType: "bas",
    });
    expect(result.status).toBe("supported");
    if (result.status !== "supported") return;
    const tokens = result.logicalStatements[0]?.tokens ?? [];
    const lit = tokens.find((t) => t.kind === "literal");
    expect(lit?.text).toBe("1.5e-2");
  });

  it("lexes a string literal with escaped double-quotes as a single token", () => {
    const result = canonicalizeVba({
      bytes: bytes('s = "He said ""ready"""\n'),
      codec: "utf-8",
      fileType: "bas",
    });
    expect(result.status).toBe("supported");
    if (result.status !== "supported") return;
    const tokens = result.logicalStatements[0]?.tokens ?? [];
    const lit = tokens.find((t) => t.kind === "literal");
    expect(lit?.text).toBe('"He said ""ready"""');
  });

  it("recognizes a date literal as a literal token", () => {
    const result = canonicalizeVba({
      bytes: bytes("d = #2024-01-15#\n"),
      codec: "utf-8",
      fileType: "bas",
    });
    expect(result.status).toBe("supported");
    if (result.status !== "supported") return;
    const tokens = result.logicalStatements[0]?.tokens ?? [];
    const lit = tokens.find((t) => t.kind === "literal");
    expect(lit?.text).toBe("#2024-01-15#");
  });

  it("recognizes the := named-argument marker", () => {
    const result = canonicalizeVba({
      bytes: bytes("Call Foo(x:=1)\n"),
      codec: "utf-8",
      fileType: "bas",
    });
    expect(result.status).toBe("supported");
    if (result.status !== "supported") return;
    const tokens = result.logicalStatements[0]?.tokens ?? [];
    expect(tokens.some((t) => t.kind === "name-arg" && t.text === ":=")).toBe(true);
  });

  it("drops comment-only lines (per DESIGN step 9) and emits COMMENT_LINE_OBSERVED", () => {
    const result = canonicalizeVba({
      bytes: bytes("' Business note\n"),
      codec: "utf-8",
      fileType: "bas",
    });
    expect(result.status).toBe("supported");
    if (result.status !== "supported") return;
    // Per DESIGN step 9 comment tokens are removed from functional comparison
    // and produce no logical statement; an informational diagnostic is retained.
    expect(result.logicalStatements).toHaveLength(0);
    expect(result.diagnostics.some((d) => d.code === "COMMENT_LINE_OBSERVED")).toBe(true);
  });

  it("drops Rem comments", () => {
    const result = canonicalizeVba({
      bytes: bytes("REM Business note\n"),
      codec: "utf-8",
      fileType: "bas",
    });
    expect(result.status).toBe("supported");
    if (result.status !== "supported") return;
    expect(result.logicalStatements).toHaveLength(0);
    expect(result.diagnostics.some((d) => d.code === "COMMENT_LINE_OBSERVED")).toBe(true);
  });

  it("preserves colon-separated statements as two logical statements", () => {
    const result = canonicalizeVba({
      bytes: bytes("Dim a As Long: Dim b As Long\n"),
      codec: "utf-8",
      fileType: "bas",
    });
    expect(result.status).toBe("supported");
    if (result.status !== "supported") return;
    expect(result.logicalStatements).toHaveLength(2);
  });

  it("preserves single-line If as a single statement", () => {
    const result = canonicalizeVba({
      bytes: bytes("If x = 1 Then y = 2\n"),
      codec: "utf-8",
      fileType: "bas",
    });
    expect(result.status).toBe("supported");
    if (result.status !== "supported") return;
    expect(result.logicalStatements).toHaveLength(1);
    expect(result.logicalStatements[0]?.kind).toBe("if");
  });

  it("joins a physical-line continuation into a single logical statement", () => {
    const result = canonicalizeVba({
      bytes: bytes("x = 1 + _\n  2\n"),
      codec: "utf-8",
      fileType: "bas",
    });
    expect(result.status).toBe("supported");
    if (result.status !== "supported") return;
    expect(result.logicalStatements).toHaveLength(1);
    const tokens = result.logicalStatements[0]?.tokens ?? [];
    expect(tokens.some((t) => t.text === "1")).toBe(true);
    expect(tokens.some((t) => t.text === "2")).toBe(true);
  });

  it("recognizes module-header lines and the following attribute block", () => {
    const source = [
      "VERSION 1.0 CLASS",
      "BEGIN",
      "  MultiUse = -1  'True",
      "END",
      'Attribute VB_Name = "Cambio"',
    ].join("\n");
    const result = canonicalizeVba({
      bytes: bytes(source),
      codec: "utf-8",
      fileType: "cls",
    });
    expect(result.status).toBe("supported");
    if (result.status !== "supported") return;
    const kinds = result.logicalStatements.map((s) => s.kind);
    expect(kinds).toContain("module-header");
    expect(kinds).toContain("attribute");
  });

  it("recognizes Option Explicit", () => {
    const result = canonicalizeVba({
      bytes: bytes("Option Explicit\n"),
      codec: "utf-8",
      fileType: "bas",
    });
    expect(result.status).toBe("supported");
    if (result.status !== "supported") return;
    expect(result.logicalStatements[0]?.kind).toBe("option");
  });

  it("recognizes balanced #If/#End If directives with Declare/PtrSafe/LongPtr keywords", () => {
    const source = [
      "#If VBA7 Then",
      'Public Declare PtrSafe Function Foo Lib "x" () As LongPtr',
      "#End If",
    ].join("\n");
    const result = canonicalizeVba({
      bytes: bytes(source),
      codec: "utf-8",
      fileType: "bas",
    });
    if (result.status !== "supported") {
      throw new Error(`diagnostics=${JSON.stringify(result.diagnostics, null, 2)}`);
    }
    expect(result.status).toBe("supported");
    if (result.status !== "supported") return;
    const kinds = result.logicalStatements.map((s) => s.kind);
    expect(kinds.filter((k) => k === "directive")).toHaveLength(2);
    expect(kinds).toContain("procedure");
    const procedure = result.logicalStatements.find((s) => s.kind === "procedure");
    expect(procedure).toBeDefined();
    const tokenTexts = procedure?.tokens.map((t) => t.text.toLowerCase()) ?? [];
    expect(tokenTexts).toContain("declare");
    expect(tokenTexts).toContain("ptrsafe");
    expect(tokenTexts).toContain("longptr");
  });
});

describe("canonicalizeVba — incomplete / malformed shapes", () => {
  it("invalid continuation (no _) returns INVALID_CONTINUATION + incomplete", () => {
    const result = canonicalizeVba({
      bytes: bytes("x = 1 +\n  2\n"),
      codec: "utf-8",
      fileType: "bas",
    });
    expect(result.status).toBe("incomplete");
    if (result.status !== "incomplete") return;
    expect(result.diagnostics.some((d) => d.code === "INVALID_CONTINUATION")).toBe(true);
  });

  it("trailing comment after _ is rejected per DESIGN step 6", () => {
    const result = canonicalizeVba({
      bytes: bytes("x = 1 + _ ' trailing\n  2\n"),
      codec: "utf-8",
      fileType: "bas",
    });
    expect(result.status).toBe("incomplete");
    if (result.status !== "incomplete") return;
    expect(result.diagnostics.some((d) => d.code === "INVALID_CONTINUATION")).toBe(true);
  });

  it("invalid date literal (#2024-13-99#) returns INVALID_DATE_LITERAL + incomplete", () => {
    const result = canonicalizeVba({
      bytes: bytes("d = #2024-13-99#\n"),
      codec: "utf-8",
      fileType: "bas",
    });
    expect(result.status).toBe("incomplete");
    if (result.status !== "incomplete") return;
    expect(result.diagnostics.some((d) => d.code === "INVALID_DATE_LITERAL")).toBe(true);
  });

  it("Rem followed by '=' is AMBIGUOUS_REM", () => {
    const result = canonicalizeVba({
      bytes: bytes("Rem = 5\n"),
      codec: "utf-8",
      fileType: "bas",
    });
    expect(result.status).toBe("incomplete");
    if (result.status !== "incomplete") return;
    expect(result.diagnostics.some((d) => d.code === "AMBIGUOUS_REM")).toBe(true);
  });

  it("unbalanced conditional (#End without #If) returns UNBALANCED_CONDITIONAL", () => {
    const result = canonicalizeVba({
      bytes: bytes("#End If\n"),
      codec: "utf-8",
      fileType: "bas",
    });
    expect(result.status).toBe("incomplete");
    expect(result.status).toBe("incomplete");
    if (result.status !== "incomplete") return;
    expect(result.diagnostics.some((d) => d.code === "UNBALANCED_CONDITIONAL")).toBe(true);
  });

  it("unterminated string literal returns INVALID_STRING_LITERAL", () => {
    const result = canonicalizeVba({
      bytes: bytes('x = "unterminated\n'),
      codec: "utf-8",
      fileType: "bas",
    });
    if (result.status === "supported") {
      // The parser still returns a tokenized statement but flags the unterminated
      // string via diagnostic; "supported" is acceptable when diagnostics surface
      // the issue. The strict contract is "diagnostic must be present".
      expect(result.diagnostics.some((d) => d.code === "INVALID_STRING_LITERAL")).toBe(true);
    } else {
      expect(result.diagnostics.some((d) => d.code === "INVALID_STRING_LITERAL")).toBe(true);
    }
  });
});

describe("canonicalizeVba — UTF-16 round-trip", () => {
  it("decodes utf-16le BOM-prefixed payload", () => {
    const text = "Public Foo As Bar\n";
    const buf = new Uint8Array(text.length * 2 + 2);
    buf[0] = 0xff;
    buf[1] = 0xfe;
    for (let i = 0; i < text.length; i += 1) {
      const c = text.charCodeAt(i);
      buf[2 + i * 2] = c & 0xff;
      buf[2 + i * 2 + 1] = (c >> 8) & 0xff;
    }
    const result = canonicalizeVba({
      bytes: buf,
      codec: "utf-16le",
      fileType: "bas",
    });
    expect(result.status).toBe("supported");
    if (result.status !== "supported") return;
    expect(result.logicalStatements[0]?.tokens.some((t) => t.text === "Foo")).toBe(true);
  });
});
