/**
 * Unit tests for the cross-form OpenArgs contract-mismatch engine
 * (`src/core/services/vba-project-openargs-lint-service.ts`).
 *
 * Issue #1006 — Access / VBA `DoCmd.OpenForm "X", …, <OpenArgsExpr>` producers
 * carry a silent contract with `Me.OpenArgs` consumers. When the producer
 * emits a named-key/semicolon grammar and the consumer only parses a
 * pipe-delimited grammar, the consumer falls back silently and the user sees
 * wrong data with no error surface. The engine classifies that as an
 * `OPENARGS_CONTRACT_MISMATCH` diagnostic and stays silent for dynamic /
 * indeterminate producer expressions.
 *
 * RED→GREEN contract:
 *   - fixture input is INLINE `.cls` strings (no on-disk fixtures).
 *   - assertion is on diagnostic code, severity, paths, lines, grammar
 *     strings, and the `fallbackRiskReachable` flag.
 *   - matching producer/consumer must remain clean.
 *   - dynamic / indeterminate producers must NOT emit a diagnostic.
 */

import { describe, expect, it } from "vitest";
import {
  lintVbaProjectOpenArgs,
  type OpenArgsContractMismatchDiagnostic,
} from "../../../src/core/services/vba-project-openargs-lint-service";

const cls = (path: string, text: string) => ({ path, text });

const PRODUCER_HEAD = [
  "VERSION 1.0 CLASS",
  "BEGIN",
  "  MultiUse = -1  'True",
  "END",
  'Attribute VB_Name = "Form_FormIndicador"',
  "Option Compare Database",
  "Option Explicit",
].join("\r\n");

const CONSUMER_HEAD = [
  "VERSION 1.0 CLASS",
  "BEGIN",
  "  MultiUse = -1  'True",
  "END",
  'Attribute VB_Name = "Form_formIndicadorProyectos"',
  "Option Compare Database",
  "Option Explicit",
].join("\r\n");

// ---------------------------------------------------------------------------
// RED diagnostics — producer / consumer grammars disagree
// ---------------------------------------------------------------------------

describe("OPENARGS_CONTRACT_MISMATCH — divergent producer / consumer", () => {
  it("detects a named-semicolon producer vs a pipe-only parser consumer", () => {
    const producer = cls(
      "src/forms/Form_FormIndicador.cls",
      [
        PRODUCER_HEAD,
        "Private Sub cmdAbrir_Click()",
        "    Dim openArgs As String",
        '    openArgs = "ANIO=" & CStr(anio) & ";SEM=" & sem',
        '    DoCmd.OpenForm "FormIndicadorProyectos", acNormal, , , acFormEdit, acDialog, openArgs',
        "End Sub",
      ].join("\r\n"),
    );

    const consumer = cls(
      "src/forms/Form_formIndicadorProyectos.cls",
      [
        CONSUMER_HEAD,
        "Private Sub Form_Load()",
        "    Dim s As String",
        '    s = Nz(Me.OpenArgs, "")',
        '    If InStr(1, s, "|") > 0 Then',
        '        A = Split(s, "|")',
        "    End If",
        "    If m_Anio = 0 Then m_Anio = CLng(Year(Date))",
        "End Sub",
      ].join("\r\n"),
    );

    const result = lintVbaProjectOpenArgs([producer, consumer]);

    expect(result.isClean).toBe(false);
    expect(result.diagnostics).toHaveLength(1);

    const diag = result.diagnostics[0] as OpenArgsContractMismatchDiagnostic;
    expect(diag.code).toBe("OPENARGS_CONTRACT_MISMATCH");
    expect(diag.severity).toBe("error");
    expect(diag.producerPath).toBe("src/forms/Form_FormIndicador.cls");
    expect(diag.consumerPath).toBe("src/forms/Form_formIndicadorProyectos.cls");
    expect(diag.fallbackRiskReachable).toBe(true);
    // Producer emits a named-key / semicolon-delimited contract.
    expect(diag.producerGrammar.toLowerCase()).toContain(";");
    expect(diag.producerGrammar.toLowerCase()).toMatch(/anio|sem/);
    // Consumer only recognizes the pipe delimiter — divergent.
    expect(diag.consumerGrammar).toContain("|");
    expect(diag.consumerGrammar).not.toContain(";");
  });

  it("reports the producer line of the DoCmd.OpenForm call", () => {
    const producer = cls(
      "src/forms/Form_FormIndicador.cls",
      [
        PRODUCER_HEAD,
        "Private Sub cmdAbrir_Click()",
        "    Dim openArgs As String",
        '    openArgs = "ANIO=" & CStr(anio) & ";SEM=" & sem',
        '    DoCmd.OpenForm "FormIndicadorProyectos", acNormal, , , acFormEdit, acDialog, openArgs',
        "End Sub",
      ].join("\r\n"),
    );

    const consumer = cls(
      "src/forms/Form_formIndicadorProyectos.cls",
      [
        CONSUMER_HEAD,
        "Private Sub Form_Load()",
        "    Dim s As String",
        '    s = Nz(Me.OpenArgs, "")',
        '    If InStr(1, s, "|") > 0 Then',
        "    End If",
        "End Sub",
      ].join("\r\n"),
    );

    const result = lintVbaProjectOpenArgs([producer, consumer]);
    const diag = result.diagnostics[0] as OpenArgsContractMismatchDiagnostic;

    // `PRODUCER_HEAD` contributes 6 lines; the `DoCmd.OpenForm` line is the
    // fifth executable line below the head, so its 1-indexed line is 6 + 5 = 11.
    expect(diag.producerLine).toBe(11);
  });

  it("reports the consumer line of the first Me.OpenArgs reference", () => {
    const producer = cls(
      "src/forms/Form_FormIndicador.cls",
      [
        PRODUCER_HEAD,
        "Private Sub cmdAbrir_Click()",
        '    DoCmd.OpenForm "FormIndicadorProyectos", , , , , , "ANIO=2025;SEM=2"',
        "End Sub",
      ].join("\r\n"),
    );

    const consumer = cls(
      "src/forms/Form_formIndicadorProyectos.cls",
      [
        CONSUMER_HEAD,
        "Private Sub Form_Load()",
        "    Dim s As String",
        '    s = Nz(Me.OpenArgs, "")',
        '    If InStr(1, s, "|") > 0 Then',
        '        A = Split(s, "|")',
        "        B = A(0)",
        "    End If",
        "End Sub",
      ].join("\r\n"),
    );

    const result = lintVbaProjectOpenArgs([producer, consumer]);
    const diag = result.diagnostics[0] as OpenArgsContractMismatchDiagnostic;

    // First `Me.OpenArgs` reference is on the `s = Nz(Me.OpenArgs, "")` line.
    // `CONSUMER_HEAD` is 7 lines (split by `\r\n`); the executable lines follow at 8..15.
    expect(diag.consumerLine).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// GREEN — matching grammars must remain clean
// ---------------------------------------------------------------------------

describe("OPENARGS_CONTRACT_MISMATCH — matching producer / consumer", () => {
  it("does NOT diagnose when producer and consumer agree on pipe-delimited grammar", () => {
    const producer = cls(
      "src/forms/Form_FormIndicador.cls",
      [
        PRODUCER_HEAD,
        "Private Sub cmdAbrir_Click()",
        "    Dim openArgs As String",
        '    openArgs = "2025|2"',
        '    DoCmd.OpenForm "FormIndicadorProyectos", acNormal, , , acFormEdit, acDialog, openArgs',
        "End Sub",
      ].join("\r\n"),
    );

    const consumer = cls(
      "src/forms/Form_formIndicadorProyectos.cls",
      [
        CONSUMER_HEAD,
        "Private Sub Form_Load()",
        "    Dim s As String",
        '    s = Nz(Me.OpenArgs, "")',
        '    If InStr(1, s, "|") > 0 Then',
        '        A = Split(s, "|")',
        "    End If",
        "End Sub",
      ].join("\r\n"),
    );

    const result = lintVbaProjectOpenArgs([producer, consumer]);
    expect(result.isClean).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("does NOT diagnose when producer and consumer agree on named-semicolon grammar", () => {
    const producer = cls(
      "src/forms/Form_FormIndicador.cls",
      [
        PRODUCER_HEAD,
        "Private Sub cmdAbrir_Click()",
        "    Dim openArgs As String",
        '    openArgs = "ANIO=" & CStr(anio) & ";SEM=" & sem',
        '    DoCmd.OpenForm "FormIndicadorProyectos", , , , , , openArgs',
        "End Sub",
      ].join("\r\n"),
    );

    const consumer = cls(
      "src/forms/Form_formIndicadorProyectos.cls",
      [
        CONSUMER_HEAD,
        "Private Sub Form_Load()",
        "    Dim s As String",
        '    s = Nz(Me.OpenArgs, "")',
        '    If InStr(1, s, ";") > 0 Then',
        '        k = Split(s, ";")',
        '        If UBound(k) >= 0 Then m_Anio = CLng(Split(k(0), "=")(1))',
        '        If UBound(k) >= 1 Then m_Semestre = Split(k(1), "=")(1)',
        "    End If",
        "End Sub",
      ].join("\r\n"),
    );

    const result = lintVbaProjectOpenArgs([producer, consumer]);
    expect(result.isClean).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// DYNAMIC / INDETERMINATE — must remain clean (do not invent dataflow)
// ---------------------------------------------------------------------------

describe("OPENARGS_CONTRACT_MISMATCH — dynamic / indeterminate producers", () => {
  it("does NOT diagnose when the OpenArgs expression is a non-literal variable name", () => {
    const producer = cls(
      "src/forms/Form_FormIndicador.cls",
      [
        PRODUCER_HEAD,
        "Private Sub cmdAbrir_Click()",
        "    Dim payload As String",
        "    payload = BuildPayload()",
        '    DoCmd.OpenForm "FormIndicadorProyectos", , , , , , payload',
        "End Sub",
      ].join("\r\n"),
    );

    const consumer = cls(
      "src/forms/Form_formIndicadorProyectos.cls",
      [
        CONSUMER_HEAD,
        "Private Sub Form_Load()",
        '    If InStr(Me.OpenArgs, "|") > 0 Then',
        '        A = Split(Me.OpenArgs, "|")',
        "    End If",
        "End Sub",
      ].join("\r\n"),
    );

    const result = lintVbaProjectOpenArgs([producer, consumer]);
    expect(result.isClean).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("does NOT diagnose when the consumer does not reference Me.OpenArgs", () => {
    const producer = cls(
      "src/forms/Form_FormIndicador.cls",
      [
        PRODUCER_HEAD,
        "Private Sub cmdAbrir_Click()",
        '    DoCmd.OpenForm "FormIndicadorProyectos", , , , , , "ANIO=2025;SEM=2"',
        "End Sub",
      ].join("\r\n"),
    );

    const consumer = cls(
      "src/forms/Form_formIndicadorProyectos.cls",
      [
        CONSUMER_HEAD,
        "Private Sub Form_Load()",
        "    ' No OpenArgs parsing at all.",
        '    Me.Caption = "Ready"',
        "End Sub",
      ].join("\r\n"),
    );

    const result = lintVbaProjectOpenArgs([producer, consumer]);
    expect(result.isClean).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("does NOT diagnose across an unrelated form (target form not in sources)", () => {
    const producer = cls(
      "src/forms/Form_FormIndicador.cls",
      [
        PRODUCER_HEAD,
        "Private Sub cmdAbrir_Click()",
        '    DoCmd.OpenForm "FormOtraPantalla", , , , , , "ANIO=2025;SEM=2"',
        "End Sub",
      ].join("\r\n"),
    );

    const consumer = cls(
      "src/forms/Form_formIndicadorProyectos.cls",
      [
        CONSUMER_HEAD,
        "Private Sub Form_Load()",
        '    If InStr(Me.OpenArgs, "|") > 0 Then',
        '        A = Split(Me.OpenArgs, "|")',
        "    End If",
        "End Sub",
      ].join("\r\n"),
    );

    const result = lintVbaProjectOpenArgs([producer, consumer]);
    expect(result.isClean).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Defensive — empty / degenerate inputs
// ---------------------------------------------------------------------------

describe("OPENARGS_CONTRACT_MISMATCH — defensive inputs", () => {
  it("returns a clean report for empty input", () => {
    const result = lintVbaProjectOpenArgs([]);
    expect(result.isClean).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it("ignores non-class files (.bas, .form.txt) without crashing", () => {
    const bas = cls(
      "src/modules/Helper.bas",
      ["Option Explicit", "Public Sub Run()", '    DoCmd.OpenForm "X"', "End Sub"].join("\r\n"),
    );
    const formTxt = cls("src/forms/Form_X.form.txt", "Version = 21.00\r\nBegin Form\r\nEnd\r\n");

    const result = lintVbaProjectOpenArgs([bas, formTxt]);
    expect(result.isClean).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });
});
