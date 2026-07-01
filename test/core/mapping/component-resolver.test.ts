import { describe, expect, it } from "vitest";
import {
  resolveComponent,
  resolveComponentPath,
} from "../../../src/core/mapping/component-resolver.js";

describe("Component Resolver", () => {
  describe("resolveComponent", () => {
    it("should resolve Form_ prefixed components as forms", () => {
      const result = resolveComponent("Form_Menu");
      expect(result).toEqual({
        folder: "forms",
        extension: ".form.txt",
        type: "form",
      });
    });

    it("should resolve frm prefixed components as forms", () => {
      const result = resolveComponent("frmMain");
      expect(result).toEqual({
        folder: "forms",
        extension: ".form.txt",
        type: "form",
      });
    });

    it("should resolve Report_ prefixed components as reports", () => {
      const result = resolveComponent("Report_Invoice");
      expect(result).toEqual({
        folder: "reports",
        extension: ".report.txt",
        type: "report",
      });
    });

    it("should resolve type 1 as modules", () => {
      const result = resolveComponent("someName", 1);
      expect(result).toEqual({
        folder: "modules",
        extension: ".bas",
        type: "module",
      });
    });

    it("should resolve type 2 as classes", () => {
      const result = resolveComponent("someName", 2);
      expect(result).toEqual({
        folder: "classes",
        extension: ".cls",
        type: "class",
      });
    });

    it("should resolve type 3 as forms", () => {
      const result = resolveComponent("someName", 3);
      expect(result).toEqual({
        folder: "forms",
        extension: ".form.txt",
        type: "form",
      });
    });

    it("should resolve type 100 with Report_ prefix as reports", () => {
      const result = resolveComponent("Report_Daily", 100);
      expect(result).toEqual({
        folder: "reports",
        extension: ".report.txt",
        type: "report",
      });
    });

    it("should resolve type 100 with rpt prefix as reports — prefix wins over fallback (issue #622 #A)", () => {
      // REGRESSION GUARD: the prefix check MUST run BEFORE the
      // `vbaType === 100` form-default fallback. If someone reorders the
      // function or moves the prefix block after the fallback, this test
      // goes red — `rptDaily, 100` would fall through to the form-default.
      const result = resolveComponent("rptDaily", 100);
      expect(result).toEqual({
        folder: "reports",
        extension: ".report.txt",
        type: "report",
      });
    });

    it("should resolve type 100 with rpt_ prefix as reports (issue #622 #A)", () => {
      const result = resolveComponent("rpt_Foo", 100);
      expect(result).toEqual({
        folder: "reports",
        extension: ".report.txt",
        type: "report",
      });
    });

    it("should resolve type 100 with report_ prefix as reports — existing behavior preserved (issue #622 #A)", () => {
      // Regression guard for the legacy `report_` prefix. The widened
      // prefix set MUST keep the existing `report_` contract intact.
      const result = resolveComponent("report_X", 100);
      expect(result).toEqual({
        folder: "reports",
        extension: ".report.txt",
        type: "report",
      });
    });

    it("should resolve lowercase rpt prefix as reports (case-insensitive) (issue #622 #A)", () => {
      // DESIGN DECISION (issue #622 #A edge case): the prefix check uses
      // `nameLower.startsWith(prefix)` with lowercase prefixes, so
      // `rptlowercase` matches the `rpt` prefix and resolves to reports.
      //
      // We DELIBERATELY do NOT narrow to `rpt[A-Z]` (uppercase-required).
      // In legacy Access naming, `rpt` is conventionally lowercase (same
      // as `frm`, `mod`, `cls`); requiring uppercase would reject the
      // natural form. If false-positives bite on real `rpt*` modules in
      // a future project, the design reserves narrowing as a future
      // mitigation — the current behavior is case-insensitive match.
      const result = resolveComponent("rptlowercase", 100);
      expect(result).toEqual({
        folder: "reports",
        extension: ".report.txt",
        type: "report",
      });
    });

    it("should resolve type 100 with Form_ prefix as forms", () => {
      const result = resolveComponent("Form_Options", 100);
      expect(result).toEqual({
        folder: "forms",
        extension: ".form.txt",
        type: "form",
      });
    });

    it("should fallback type 100 without prefixes to forms", () => {
      const result = resolveComponent("NoPrefixDocument", 100);
      expect(result).toEqual({
        folder: "forms",
        extension: ".form.txt",
        type: "form",
      });
    });

    it("should fallback unknown components without type or prefixes to modules", () => {
      const result = resolveComponent("utils");
      expect(result).toEqual({
        folder: "modules",
        extension: ".bas",
        type: "module",
      });
    });
  });

  describe("resolveComponentPath", () => {
    it("should build path relative to destination root", () => {
      const path = resolveComponentPath("C:\\src", "Form_Menu");
      // Separator-agnostic: resolveComponentPath uses the OS separator, and CI
      // runs on Linux while developers run on Windows.
      expect(path.replace(/\\/g, "/")).toBe("C:/src/forms/Form_Menu.form.txt");
    });
  });
});
