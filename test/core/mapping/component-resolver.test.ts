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
