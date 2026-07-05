import { describe, expect, it } from "vitest";
import { lintVbaModule } from "../../../src/core/services/vba-module-lint-service";

describe("vba-module-lint-service", () => {
  it("reports missing Option Compare Database and Option Explicit in the leading header", async () => {
    const report = await lintVbaModule({
      module: "MissingOptions",
      source: ['Attribute VB_Name = "MissingOptions"', "Public Sub Run()", "End Sub"].join("\r\n"),
    });

    expect(report.isClean).toBe(false);
    expect(report.flatDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: "option-declaration",
          line: 2,
          severity: "error",
          message: expect.stringContaining("Option Compare Database"),
        }),
        expect.objectContaining({
          rule: "option-declaration",
          line: 2,
          severity: "error",
          message: expect.stringContaining("Option Explicit"),
        }),
      ]),
    );
    expect(report.diagnostics["option-declaration"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: "option-declaration",
          line: 2,
          severity: "error",
        }),
      ]),
    );
    expect(report.summary).toMatchObject({ errors: 2, warnings: 0 });
  });

  it("accepts a module with the required Access option declarations", async () => {
    const report = await lintVbaModule({
      module: "CleanModule",
      source: [
        'Attribute VB_Name = "CleanModule"',
        "Option Compare Database",
        "Option Explicit",
        "",
        "Public Sub Run()",
        "End Sub",
      ].join("\r\n"),
    });

    expect(report).toMatchObject({
      module: "CleanModule",
      rules: ["option-declaration", "identifier-safety", "declaration-order", "arg-type-match"],
      isClean: true,
      flatDiagnostics: [],
      summary: { errors: 0, warnings: 0 },
    });
    for (const rule of report.rules) {
      expect(report.diagnostics[rule]).toEqual([]);
    }
  });

  it("flags dot-underscore, non-ASCII identifiers, and reserved-word identifiers", async () => {
    const report = await lintVbaModule({
      module: "BadIdentifiers",
      rules: ["identifier-safety"],
      source: [
        "Option Compare Database",
        "Option Explicit",
        "Private Dim As Long",
        "Public Sub GuardarÑ()",
        "    Me._Value = 1",
        "End Sub",
      ].join("\r\n"),
    });

    expect(report.flatDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: "identifier-safety", line: 3, severity: "error" }),
        expect.objectContaining({ rule: "identifier-safety", line: 4, severity: "error" }),
        expect.objectContaining({ rule: "identifier-safety", line: 5, severity: "error" }),
      ]),
    );
    expect(report.diagnostics["identifier-safety"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: "identifier-safety", line: 3, severity: "error" }),
        expect.objectContaining({ rule: "identifier-safety", line: 4, severity: "error" }),
        expect.objectContaining({ rule: "identifier-safety", line: 5, severity: "error" }),
      ]),
    );
    expect(report.summary.errors).toBe(3);
  });

  it("flags module-level declarations after the first procedure without flagging local declarations", async () => {
    const report = await lintVbaModule({
      module: "BadOrder",
      rules: ["declaration-order"],
      source: [
        "Option Compare Database",
        "Option Explicit",
        "Public Sub Run()",
        "    Dim localValue As Long",
        "End Sub",
        "Private lateValue As Long",
      ].join("\r\n"),
    });

    expect(report.flatDiagnostics).toEqual([
      expect.objectContaining({
        rule: "declaration-order",
        line: 6,
        severity: "error",
        message: expect.stringContaining("before the first procedure"),
      }),
    ]);
    expect(report.diagnostics["declaration-order"]).toEqual([
      expect.objectContaining({
        rule: "declaration-order",
        line: 6,
        severity: "error",
      }),
    ]);
  });

  it("conservatively warns when a literal argument is incompatible with a same-module signature", async () => {
    const report = await lintVbaModule({
      module: "BadArgs",
      rules: ["arg-type-match"],
      source: [
        "Option Compare Database",
        "Option Explicit",
        "Public Sub Run()",
        '    SaveCount "not-a-number"',
        "End Sub",
        "Private Sub SaveCount(ByVal count As Long)",
        "End Sub",
      ].join("\r\n"),
    });

    expect(report.flatDiagnostics).toEqual([
      expect.objectContaining({
        rule: "arg-type-match",
        line: 4,
        severity: "warning",
        message: expect.stringContaining("SaveCount"),
      }),
    ]);
    expect(report.diagnostics["arg-type-match"]).toEqual([
      expect.objectContaining({
        rule: "arg-type-match",
        line: 4,
        severity: "warning",
      }),
    ]);
    expect(report.summary).toMatchObject({ errors: 0, warnings: 1 });
  });

  it("produces a clean report when rules is explicitly an empty array", async () => {
    const report = await lintVbaModule({
      module: "AnyModule",
      rules: [],
      source: ['Attribute VB_Name = "AnyModule"', "Public Sub Run()", "End Sub"].join("\r\n"),
    });

    expect(report.isClean).toBe(true);
    expect(report.rules).toEqual([]);
    expect(report.flatDiagnostics).toEqual([]);
    expect(report.summary).toMatchObject({ errors: 0, warnings: 0 });
  });

  it("runs all rules and finds issues when rules is omitted", async () => {
    const report = await lintVbaModule({
      module: "MissingOptions",
      source: ['Attribute VB_Name = "MissingOptions"', "Public Sub Run()", "End Sub"].join("\r\n"),
    });

    expect(report.rules).toEqual([
      "option-declaration",
      "identifier-safety",
      "declaration-order",
      "arg-type-match",
    ]);
    expect(report.isClean).toBe(false);
    expect(report.flatDiagnostics.length).toBeGreaterThan(0);
  });

  it("arg-type-match produces no false positive for variable arguments", async () => {
    const report = await lintVbaModule({
      module: "VarArgs",
      rules: ["arg-type-match"],
      source: [
        "Option Compare Database",
        "Option Explicit",
        "Public Sub Run()",
        "    Dim count As Long",
        "    count = 42",
        "    SaveCount count",
        "End Sub",
        "Private Sub SaveCount(ByVal n As Long)",
        "End Sub",
      ].join("\r\n"),
    });

    expect(report.flatDiagnostics).toEqual([]);
    expect(report.isClean).toBe(true);
  });

  it("arg-type-match produces no false positive for cross-module / unresolved calls", async () => {
    const report = await lintVbaModule({
      module: "CrossModule",
      rules: ["arg-type-match"],
      source: [
        "Option Compare Database",
        "Option Explicit",
        "Public Sub Run()",
        '    DoSomething "text"',
        "    ExternalFunc 1, 2",
        "    DoCmd.OpenForm",
        "End Sub",
      ].join("\r\n"),
    });

    // No signature for these in-module → no diagnostics
    expect(report.flatDiagnostics).toEqual([]);
    expect(report.isClean).toBe(true);
  });

  it("arg-type-match still warns for same-module literal mismatch", async () => {
    const report = await lintVbaModule({
      module: "LiteralMismatch",
      rules: ["arg-type-match"],
      source: [
        "Option Compare Database",
        "Option Explicit",
        "Public Sub Run()",
        "    FormatStr True",
        "End Sub",
        "Private Function FormatStr(ByVal s As String) As String",
        "End Function",
      ].join("\r\n"),
    });

    // Boolean literal passed to String parameter → type mismatch → warning
    expect(report.flatDiagnostics).toEqual([
      expect.objectContaining({
        rule: "arg-type-match",
        severity: "warning",
      }),
    ]);
    expect(report.isClean).toBe(false);
  });

  // #731 — identifier-safety overrides and legacy auto-detection.
  describe("identifier-safety overrides (#731)", () => {
    it("Path A: explicit operator opt-out emits a single LINT_SUPPRESSED info diagnostic and no per-identifier findings", async () => {
      const source = [
        "Attribute VB_Name = \"LegacyForm\"",
        "Public Sub AdaptarTamañoFormulario()",
        "End Sub",
      ].join("\r\n");
      const report = await lintVbaModule({
        module: "LegacyForm",
        source,
        rules: ["identifier-safety"],
        lintRulesOverride: {
          "identifier-safety": {
            enabled: false,
            reason: "legacy Spanish-language identifiers",
          },
        },
      });

      // Exactly one diagnostic, with the LINT_SUPPRESSED code and the reason surfaced.
      expect(report.flatDiagnostics).toHaveLength(1);
      expect(report.flatDiagnostics[0]).toMatchObject({
        rule: "identifier-safety",
        code: "LINT_SUPPRESSED",
        severity: "warning",
      });
      expect(String(report.flatDiagnostics[0]?.message)).toContain("legacy Spanish-language identifiers");
      // No per-identifier findings leak through the opt-out.
      expect(report.isClean).toBe(true);
    });

    it("Path B: legacy auto-detection downgrades non-ASCII identifier findings to 'warning'", async () => {
      const source = [
        "Attribute VB_Name = \"LegacyForm\"",
        "Public Sub AdaptarTamañoFormulario()",
        "End Sub",
      ].join("\r\n");
      const report = await lintVbaModule({
        module: "LegacyForm",
        source,
        rules: ["identifier-safety"],
        hasNonAsciiIdentifierInProject: () => true,
      });

      expect(report.flatDiagnostics).toEqual([
        expect.objectContaining({
          rule: "identifier-safety",
          severity: "warning",
        }),
      ]);
      // The legacy downgrade must not mask dot-underscore / reserved-word errors.
      expect(report.isClean).toBe(false);
    });

    it("Path C: project-root marker `.dysflow-no-auto-allow` keeps 'error' severity even when the legacy signal fires", async () => {
      // Create a temporary project root with the marker file so the production
      // fs.existsSync branch in the lint service sees it.
      const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const root = mkdtempSync(join(tmpdir(), "dysflow-lint-marker-"));
      writeFileSync(join(root, ".dysflow-no-auto-allow"), "");

      const source = [
        "Attribute VB_Name = \"StrictForm\"",
        "Public Sub AdaptarTamañoFormulario()",
        "End Sub",
      ].join("\r\n");
      const report = await lintVbaModule({
        module: "StrictForm",
        source,
        rules: ["identifier-safety"],
        projectRoot: root,
        hasNonAsciiIdentifierInProject: () => true,
      });

      // Marker forces the strict path — non-ASCII identifiers stay at "error".
      expect(report.flatDiagnostics).toEqual([
        expect.objectContaining({
          rule: "identifier-safety",
          severity: "error",
        }),
      ]);

      // Cleanup the temp dir.
      rmSync(root, { recursive: true, force: true });
    });
  });
});
