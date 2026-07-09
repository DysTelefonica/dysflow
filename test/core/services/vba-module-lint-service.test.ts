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
      rules: [
        "option-declaration",
        "identifier-safety",
        "declaration-order",
        "arg-type-match",
        "forbidden-name",
        "logical-short-circuit",
        "implicit-variant",
        "missing-exit-handler",
        "invalid-static-class-call",
      ],
      isClean: true,
      flatDiagnostics: [],
      summary: { errors: 0, warnings: 0 },
    });
    for (const rule of report.rules) {
      expect(report.diagnostics[rule]).toEqual([]);
    }
  });

  // Issue #789 — when `strictNonAscii` is NOT requested (the default),
  // non-ASCII identifiers (Spanish/Portuguese/French/German/Italian) are
  // `warning`, NOT `error`. `._` dot-underscore and reserved words stay
  // at `error` because those are real syntactic defects that block
  // import-modules even when the human compile succeeds.
  it("defaults non-ASCII identifiers to 'warning' while keeping ._ and reserved words at 'error' (#789)", async () => {
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

    // Line 3 — `Dim` is a reserved word → error.
    expect(report.flatDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: "identifier-safety", line: 3, severity: "error" }),
      ]),
    );
    // Line 4 — `GuardarÑ` is non-ASCII → warning (default, no strict opt-in).
    expect(report.flatDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: "identifier-safety", line: 4, severity: "warning" }),
      ]),
    );
    // Line 5 — `._Value` is the ._ dot-underscore form → error always.
    expect(report.flatDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: "identifier-safety", line: 5, severity: "error" }),
      ]),
    );

    // Grouped-by-rule view mirrors the same severities.
    expect(report.diagnostics["identifier-safety"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: "identifier-safety", line: 3, severity: "error" }),
        expect.objectContaining({ rule: "identifier-safety", line: 4, severity: "warning" }),
        expect.objectContaining({ rule: "identifier-safety", line: 5, severity: "error" }),
      ]),
    );

    expect(report.summary).toMatchObject({ errors: 2, warnings: 1 });
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
      "forbidden-name",
      "logical-short-circuit",
      "implicit-variant",
      "missing-exit-handler",
      "invalid-static-class-call",
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

    // Boolean literal passed to String parameter → type mismatch → warning.
    expect(report.flatDiagnostics).toEqual([
      expect.objectContaining({
        rule: "arg-type-match",
        severity: "warning",
      }),
    ]);
    // Issue #789 — arg-type-match is advisory. A warning does NOT block
    // `isClean`; only error-severity findings do.
    expect(report.summary).toMatchObject({ errors: 0, warnings: 1 });
    expect(report.isClean).toBe(true);
  });

  // F22 (2026-07-06) — forbidden-name rule.
  describe("forbidden-name rule (F22)", () => {
    it("flags `Dim err As String` with the FORBIDDEN_NAME diagnostic and a recommendation", async () => {
      const report = await lintVbaModule({
        module: "BadErr",
        rules: ["forbidden-name"],
        source: [
          "Option Compare Database",
          "Option Explicit",
          "",
          "Public Sub Run()",
          "    Dim err As String",
          "End Sub",
        ].join("\r\n"),
      });

      expect(report.isClean).toBe(false);
      expect(report.flatDiagnostics).toEqual([
        expect.objectContaining({
          rule: "forbidden-name",
          line: 5,
          severity: "error",
          code: "FORBIDDEN_NAME",
        }),
      ]);
      const message = String(report.flatDiagnostics[0]?.message ?? "");
      expect(message).toContain("'err'");
      expect(message).toContain("errMsg");
      expect(message).toContain("mensajeError");
    });

    it("flags the rule case-insensitively (DIM ERR, dim Err, etc.)", async () => {
      for (const declaration of [
        "    Dim err As String",
        "    Dim ERR As String",
        "    dim Err As String",
        "    DIM err AS STRING",
      ]) {
        const report = await lintVbaModule({
          module: "CaseInsensitive",
          rules: ["forbidden-name"],
          source: [
            "Option Compare Database",
            "Option Explicit",
            "",
            "Public Sub Run()",
            declaration,
            "End Sub",
          ].join("\r\n"),
        });

        expect(report.isClean).toBe(false);
        expect(report.flatDiagnostics).toEqual([
          expect.objectContaining({
            rule: "forbidden-name",
            severity: "error",
            code: "FORBIDDEN_NAME",
          }),
        ]);
      }
    });

    it("does NOT flag valid alternative names like errMsg, fechaAlta, db, rs, qdf", async () => {
      const report = await lintVbaModule({
        module: "CleanNames",
        rules: ["forbidden-name"],
        source: [
          "Option Compare Database",
          "Option Explicit",
          "",
          "Public Sub Run()",
          "    Dim errMsg As String",
          "    Dim fechaAlta As Date",
          "    Dim db As DAO.Database",
          "    Dim rs As DAO.Recordset",
          "    Dim qdf As DAO.QueryDef",
          "End Sub",
        ].join("\r\n"),
      });

      expect(report.isClean).toBe(true);
      expect(report.flatDiagnostics).toEqual([]);
    });

    it("flags forbidden names in parameter lists and procedure names", async () => {
      const report = await lintVbaModule({
        module: "BadParams",
        rules: ["forbidden-name"],
        source: [
          "Option Compare Database",
          "Option Explicit",
          "",
          "Public Sub SaveRecord(ByVal name As String, ByVal error As Long)",
          "    Dim fecha As Date",
          "End Sub",
        ].join("\r\n"),
      });

      // Procedure name `SaveRecord` is fine; `name` and `error` are
      // forbidden, and the local `fecha` is allowed (not in the list).
      const messages = report.flatDiagnostics.map((d) => String(d.message));
      expect(messages.some((m) => m.includes("'name'"))).toBe(true);
      expect(messages.some((m) => m.includes("'error'"))).toBe(true);
      expect(messages.some((m) => m.includes("'fecha'"))).toBe(false);
      expect(report.isClean).toBe(false);
    });

    it("flags forbidden names in Function / Property / Type / Enum / Const declarations", async () => {
      const report = await lintVbaModule({
        module: "BadDeclarations",
        rules: ["forbidden-name"],
        source: [
          "Option Compare Database",
          "Option Explicit",
          "",
          "Public Type Name",
          "    value As Long",
          "End Type",
          "",
          "Public Enum Type",
          "    First",
          "End Enum",
          "",
          "Public Const Error = 42",
          "",
          "Public Function Format() As String",
          '    Format = "x"',
          "End Function",
        ].join("\r\n"),
      });

      const flagged = report.flatDiagnostics.map((d) => String(d.message));
      // `Name` is forbidden in Type declarations.
      expect(flagged.some((m) => m.includes("'Name'"))).toBe(true);
      // `Type` is forbidden in Enum declarations.
      expect(flagged.some((m) => m.includes("'Type'"))).toBe(true);
      // `Error` is forbidden in Const declarations.
      expect(flagged.some((m) => m.includes("'Error'"))).toBe(true);
      // `Format` is forbidden in Function declarations.
      expect(flagged.some((m) => m.includes("'Format'"))).toBe(true);
      expect(report.isClean).toBe(false);
    });

    it("does not flag identifiers that merely contain a forbidden word (e.g. ErrorMessage, dbBackup)", async () => {
      const report = await lintVbaModule({
        module: "LongerNames",
        rules: ["forbidden-name"],
        source: [
          "Option Compare Database",
          "Option Explicit",
          "",
          "Public Sub Run()",
          "    Dim errMsg As String",
          "    Dim errorMessage As String",
          "    Dim dbBackup As DAO.Database",
          "    Dim rsRiesgos As DAO.Recordset",
          "End Sub",
        ].join("\r\n"),
      });

      expect(report.isClean).toBe(true);
    });
  });

  // #731 — identifier-safety overrides and legacy auto-detection.
  describe("identifier-safety overrides (#731)", () => {
    it("Path A: explicit operator opt-out emits a single LINT_SUPPRESSED info diagnostic and no per-identifier findings", async () => {
      const source = [
        'Attribute VB_Name = "LegacyForm"',
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
      expect(String(report.flatDiagnostics[0]?.message)).toContain(
        "legacy Spanish-language identifiers",
      );
      // No per-identifier findings leak through the opt-out.
      expect(report.isClean).toBe(true);
    });

    it("Path B: legacy auto-detection downgrades non-ASCII identifier findings to 'warning'", async () => {
      const source = [
        'Attribute VB_Name = "LegacyForm"',
        "Public Sub AdaptarTamañoFormulario()",
        "End Sub",
      ].join("\r\n");
      const report = await lintVbaModule({
        module: "LegacyForm",
        source,
        rules: ["identifier-safety"],
        hasNonAsciiIdentifierInProject: () => true,
      });

      // The non-ASCII finding is downgraded to warning under Path B.
      expect(report.flatDiagnostics).toEqual([
        expect.objectContaining({
          rule: "identifier-safety",
          severity: "warning",
        }),
      ]);
      // Issue #789 — warnings don't block clean; only errors do.
      expect(report.summary).toMatchObject({ errors: 0, warnings: 1 });
      expect(report.isClean).toBe(true);
    });

    it("Path B: legacy downgrade must NOT mask dot-underscore or reserved-word errors (#789 contract preservation)", async () => {
      // Auto-detection downgrades non-ASCII to warning, but real syntactic
      // defects (dot-underscore, reserved words) stay at error. This locks
      // down the "must not mask real defects" half of the Path B contract.
      const source = [
        'Attribute VB_Name = "MixedLegacy"',
        "Option Compare Database",
        "Option Explicit",
        "Public Sub AdaptarTamañoFormulario()",
        "    Me._Value = 1",
        "End Sub",
        "Private Dim As Long",
      ].join("\r\n");
      const report = await lintVbaModule({
        module: "MixedLegacy",
        source,
        rules: ["identifier-safety"],
        hasNonAsciiIdentifierInProject: () => true,
      });

      // Real defects stay error.
      expect(report.flatDiagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            rule: "identifier-safety",
            line: 5,
            severity: "error", // dot-underscore — not masked
          }),
          expect.objectContaining({
            rule: "identifier-safety",
            line: 7,
            severity: "error", // reserved word — not masked
          }),
          expect.objectContaining({
            rule: "identifier-safety",
            line: 4,
            severity: "warning", // non-ASCII — downgraded
          }),
        ]),
      );
      // Real defects keep isClean false.
      expect(report.isClean).toBe(false);
      expect(report.summary.errors).toBe(2);
    });

    it("Path C: project-root marker `.dysflow-no-auto-allow` keeps greenfield default — non-ASCII defaults to 'warning' under #789 (was 'error' pre-#789)", async () => {
      // Create a temporary project root with the marker file. The
      // adapter combines the marker check with the legacy-signal walk
      // and exposes the combined result through the
      // `hasNonAsciiIdentifierInProject` callback. This test simulates
      // the adapter contract: when the marker is present, the callback
      // returns `false` even though the project tree contains non-ASCII
      // identifiers — the operator opted out of auto-detection.
      //
      // Pre-#789 the marker was effectively a "force strict" hook. Under
      // #789 the marker keeps the project out of Path B's auto-downgrade;
      // the resulting Path C greenfield check respects the project-level
      // `strictNonAscii` opt-in. The default is `false`, so non-ASCII
      // identifiers emit `warning`, NOT `error`.
      const { existsSync, mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const root = mkdtempSync(join(tmpdir(), "dysflow-lint-marker-"));
      writeFileSync(join(root, ".dysflow-no-auto-allow"), "");

      const source = [
        'Attribute VB_Name = "StrictForm"',
        "Public Sub AdaptarTamañoFormulario()",
        "End Sub",
      ].join("\r\n");
      const report = await lintVbaModule({
        module: "StrictForm",
        source,
        rules: ["identifier-safety"],
        projectRoot: root,
        hasNonAsciiIdentifierInProject: () => !existsSync(join(root, ".dysflow-no-auto-allow")),
      });

      // Path C without the strict opt-in: non-ASCII → warning (inverted from "error").
      expect(report.flatDiagnostics).toEqual([
        expect.objectContaining({
          rule: "identifier-safety",
          severity: "warning",
        }),
      ]);

      // Cleanup the temp dir.
      rmSync(root, { recursive: true, force: true });
    });
  });

  // Issue #789 — non-ASCII identifiers default to `warning`; an explicit
  // `strictNonAscii: true` opt-in (project-level) restores the old
  // `error` behavior. `._` and reserved-word findings stay at `error`
  // regardless of the flag.
  describe("identifier-safety non-ASCII default + strict opt-in (#789)", () => {
    it("greenfield: non-ASCII identifier without strictNonAscii is 'warning' and does NOT block clean (#789)", async () => {
      const source = [
        'Attribute VB_Name = "SpanishModule"',
        "Option Compare Database",
        "Option Explicit",
        "",
        'Public Const ConstanteConTilde As String = "Sí"',
        "Public Function AñoActual() As Integer",
        "    AñoActual = 2026",
        "End Function",
      ].join("\r\n");
      const report = await lintVbaModule({
        module: "SpanishModule",
        source,
        rules: ["identifier-safety"],
      });

      // Non-ASCII findings downgrade to warning.
      const nonAscii = report.flatDiagnostics.filter((d) =>
        String(d.message).includes("non-ASCII characters"),
      );
      expect(nonAscii.length).toBeGreaterThan(0);
      for (const d of nonAscii) {
        expect(d.severity).toBe("warning");
      }
      // No real errors block the module — only warnings remain.
      expect(report.isClean).toBe(true);
      expect(report.summary.errors).toBe(0);
      expect(report.summary.warnings).toBeGreaterThan(0);
    });

    it("greenfield + strictNonAscii=true: non-ASCII identifier is 'error' and blocks clean (#789)", async () => {
      const source = [
        'Attribute VB_Name = "SpanishModule"',
        "Option Compare Database",
        "Option Explicit",
        "",
        "Public Function AñoActual() As Integer",
        "    AñoActual = 2026",
        "End Function",
      ].join("\r\n");
      const report = await lintVbaModule({
        module: "SpanishModule",
        source,
        rules: ["identifier-safety"],
        strictNonAscii: true,
      });

      const nonAscii = report.flatDiagnostics.filter((d) =>
        String(d.message).includes("non-ASCII characters"),
      );
      expect(nonAscii.length).toBeGreaterThan(0);
      for (const d of nonAscii) {
        expect(d.severity).toBe("error");
      }
      // The strict opt-in re-raises non-ASCII to error — `isClean` flips
      // back to false so the import-modules pre-import gate fires.
      expect(report.isClean).toBe(false);
      expect(report.summary.errors).toBeGreaterThan(0);
    });

    it("Path A (enabled:false override) still emits LINT_SUPPRESSED and never yields per-identifier findings, even with strictNonAscii=true (#789)", async () => {
      const source = [
        'Attribute VB_Name = "LegacyForm"',
        "Public Sub AdaptarTamañoFormulario()",
        "    Me._Value = 1",
        "End Sub",
      ].join("\r\n");
      const report = await lintVbaModule({
        module: "LegacyForm",
        source,
        rules: ["identifier-safety"],
        lintRulesOverride: {
          "identifier-safety": { enabled: false, reason: "legacy Spanish-language identifiers" },
        },
        // Path A wins everything — strictNonAscii:true must NOT bypass the
        // explicit operator opt-out.
        strictNonAscii: true,
      });

      // Exactly one audit marker; no per-identifier findings leak through.
      expect(report.flatDiagnostics).toHaveLength(1);
      expect(report.flatDiagnostics[0]).toMatchObject({
        rule: "identifier-safety",
        code: "LINT_SUPPRESSED",
        severity: "warning",
      });
      expect(report.isClean).toBe(true);
    });

    it("._ dot-underscore stays at 'error' regardless of the strictNonAscii opt-in (#789)", async () => {
      const source = [
        'Attribute VB_Name = "DotUnderscoreModule"',
        "Public Sub Run()",
        "    Me._Value = 1",
        "End Sub",
      ].join("\r\n");
      // With strictNonAscii OFF — ._ still error.
      const reportOff = await lintVbaModule({
        module: "DotUnderscoreModule",
        source,
        rules: ["identifier-safety"],
      });
      const dotOff = reportOff.flatDiagnostics.find((d) =>
        String(d.message).includes("dot-underscore"),
      );
      expect(dotOff?.severity).toBe("error");

      // With strictNonAscii ON — ._ still error.
      const reportOn = await lintVbaModule({
        module: "DotUnderscoreModule",
        source,
        rules: ["identifier-safety"],
        strictNonAscii: true,
      });
      const dotOn = reportOn.flatDiagnostics.find((d) =>
        String(d.message).includes("dot-underscore"),
      );
      expect(dotOn?.severity).toBe("error");
    });

    it("reserved-word identifier stays at 'error' regardless of the strictNonAscii opt-in (#789)", async () => {
      const source = [
        'Attribute VB_Name = "ReservedWordModule"',
        "Option Compare Database",
        "Option Explicit",
        "Private Dim As Long",
      ].join("\r\n");
      // With strictNonAscii OFF — reserved word still error.
      const reportOff = await lintVbaModule({
        module: "ReservedWordModule",
        source,
        rules: ["identifier-safety"],
      });
      const reservedOff = reportOff.flatDiagnostics.find((d) =>
        String(d.message).includes("reserved word"),
      );
      expect(reservedOff?.severity).toBe("error");

      // With strictNonAscii ON — reserved word still error.
      const reportOn = await lintVbaModule({
        module: "ReservedWordModule",
        source,
        rules: ["identifier-safety"],
        strictNonAscii: true,
      });
      const reservedOn = reportOn.flatDiagnostics.find((d) =>
        String(d.message).includes("reserved word"),
      );
      expect(reservedOn?.severity).toBe("error");
    });

    it("Path B (auto-detection) keeps non-ASCII at 'warning' even when strictNonAscii=true is requested (#789)", async () => {
      // Auto-detection already proves the project ships non-ASCII in
      // production. Even with the strict opt-in, Path B keeps the legacy
      // warning downgrade — flagging the project's existing identifiers
      // as errors would create churn for code that compiles and ships.
      const source = [
        'Attribute VB_Name = "LegacyForm"',
        "Public Sub AdaptarTamañoFormulario()",
        "End Sub",
      ].join("\r\n");
      const report = await lintVbaModule({
        module: "LegacyForm",
        source,
        rules: ["identifier-safety"],
        hasNonAsciiIdentifierInProject: () => true,
        strictNonAscii: true,
      });

      expect(report.flatDiagnostics).toEqual([
        expect.objectContaining({
          rule: "identifier-safety",
          severity: "warning",
        }),
      ]);
    });
  });
  describe("logical-short-circuit rule", () => {
    it("flags standard short-circuit object existence checks with member access", async () => {
      const report = await lintVbaModule({
        module: "ShortCircuitBad",
        rules: ["logical-short-circuit"],
        source: [
          "Public Sub Run()",
          '    If Not myObj Is Nothing And myObj.Name = "Test" Then',
          '        Debug.Print "Hi"',
          "    End If",
          "    If myObj Is Nothing Or myObj.Value = 1 Then",
          '        Debug.Print "Hi"',
          "    End If",
          "    If IsNull(otherObj) And otherObj.Property Then",
          '        Debug.Print "Hi"',
          "    End If",
          "End Sub",
        ].join("\r\n"),
      });

      expect(report.isClean).toBe(false);
      expect(report.flatDiagnostics).toHaveLength(3);
      expect(report.flatDiagnostics[0]?.line).toBe(2);
      expect(report.flatDiagnostics[1]?.line).toBe(5);
      expect(report.flatDiagnostics[2]?.line).toBe(8);
      expect(report.flatDiagnostics.every((d) => d.rule === "logical-short-circuit")).toBe(true);
    });

    it("does not flag nested Ifs or multi-line statements that do not mix them incorrectly", async () => {
      const report = await lintVbaModule({
        module: "ShortCircuitGood",
        rules: ["logical-short-circuit"],
        source: [
          "Public Sub Run()",
          "    If Not myObj Is Nothing Then",
          '        If myObj.Name = "Test" Then',
          '            Debug.Print "Hi"',
          "        End If",
          "    End If",
          "End Sub",
        ].join("\r\n"),
      });

      expect(report.isClean).toBe(true);
      expect(report.flatDiagnostics).toHaveLength(0);
    });
  });

  describe("implicit-variant rule", () => {
    it("flags multiple variable declarations on a single line where some lack As clause", async () => {
      const report = await lintVbaModule({
        module: "ImplicitVariantBad",
        rules: ["implicit-variant"],
        source: [
          "Public Sub Run()",
          "    Dim x, y As Long",
          "    Public a, b, c As String",
          "    Private foo, bar",
          "End Sub",
        ].join("\r\n"),
      });

      expect(report.isClean).toBe(true);
      expect(report.summary.warnings).toBe(3);
      expect(report.summary.errors).toBe(0);
      expect(report.flatDiagnostics).toHaveLength(3);
      expect(report.flatDiagnostics[0]?.line).toBe(2);
      expect(report.flatDiagnostics[1]?.line).toBe(3);
      expect(report.flatDiagnostics[2]?.line).toBe(4);
      expect(
        report.flatDiagnostics.every(
          (d) => d.rule === "implicit-variant" && d.severity === "warning",
        ),
      ).toBe(true);
    });

    it("does not flag single declarations or multiple fully typed declarations", async () => {
      const report = await lintVbaModule({
        module: "ImplicitVariantGood",
        rules: ["implicit-variant"],
        source: [
          "Public Sub Run()",
          "    Dim x As Long",
          "    Dim a As String, b As String",
          "    Dim arrayVar(1 To 5, 1 To 10) As Double",
          "End Sub",
        ].join("\r\n"),
      });

      expect(report.isClean).toBe(true);
      expect(report.flatDiagnostics).toHaveLength(0);
    });
  });

  describe("missing-exit-handler rule", () => {
    it("flags procedures missing Exit Sub/Function/Property before the error label", async () => {
      const report = await lintVbaModule({
        module: "MissingExitBad",
        rules: ["missing-exit-handler"],
        source: [
          "Public Sub Run()",
          "    On Error GoTo ErrHandler",
          "    Dim x As Long",
          "    x = 1",
          "ErrHandler:",
          '    MsgBox "Error"',
          "End Sub",
        ].join("\r\n"),
      });

      expect(report.isClean).toBe(false);
      expect(report.flatDiagnostics).toHaveLength(1);
      expect(report.flatDiagnostics[0]?.line).toBe(4); // Line before the label
      expect(report.flatDiagnostics[0]?.rule).toBe("missing-exit-handler");
    });

    it("does not flag procedures with proper exit paths or no On Error GoTo", async () => {
      const report = await lintVbaModule({
        module: "MissingExitGood",
        rules: ["missing-exit-handler"],
        source: [
          "Public Sub RunOk()",
          "    On Error GoTo ErrHandler",
          "    Dim x As Long",
          "    Exit Sub",
          "ErrHandler:",
          '    MsgBox "Error"',
          "End Sub",
          "Public Function RunOkFunc() As Boolean",
          "    On Error GoTo ErrHandler",
          "    Exit Function",
          "ErrHandler:",
          "    Resume Next",
          "End Function",
        ].join("\r\n"),
      });

      expect(report.isClean).toBe(true);
      expect(report.flatDiagnostics).toHaveLength(0);
    });
  });

  describe("invalid-static-class-call rule", () => {
    it("flags static calls to project class modules when not declared as variables", async () => {
      const report = await lintVbaModule({
        module: "StaticCallBad",
        rules: ["invalid-static-class-call"],
        classModules: ["Edicion", "ModuloRiesgo"],
        source: [
          "Public Sub Run()",
          "    Edicion.versionar 1",
          "    Dim x As Long",
          "    x = ModuloRiesgo.Calcular()",
          "End Sub",
        ].join("\r\n"),
      });

      expect(report.isClean).toBe(false);
      expect(report.flatDiagnostics).toHaveLength(2);
      expect(report.flatDiagnostics[0]?.line).toBe(2);
      expect(report.flatDiagnostics[1]?.line).toBe(4);
      expect(report.flatDiagnostics.every((d) => d.rule === "invalid-static-class-call")).toBe(
        true,
      );
    });

    it("does not flag class module calls when the prefix is declared as local variable or parameter", async () => {
      const report = await lintVbaModule({
        module: "StaticCallGood",
        rules: ["invalid-static-class-call"],
        classModules: ["Edicion", "ModuloRiesgo"],
        source: [
          "Public Sub Run(ByVal Edicion As Object)",
          "    Edicion.versionar 1",
          "    Dim ModuloRiesgo As New ModuloRiesgo",
          "    ModuloRiesgo.Calcular",
          "End Sub",
        ].join("\r\n"),
      });

      expect(report.isClean).toBe(true);
      expect(report.flatDiagnostics).toHaveLength(0);
    });
  });
});
