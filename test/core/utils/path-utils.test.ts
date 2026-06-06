import { describe, expect, it } from "vitest";
import { isAbsolutePath } from "../../../src/core/utils/index.js";

// ---------------------------------------------------------------------------
// isAbsolutePath — pure-function tests (no I/O)
// These must survive any internal refactor that keeps the behavior the same.
// ---------------------------------------------------------------------------

describe("isAbsolutePath", () => {
  describe("Windows drive-letter paths (absolute)", () => {
    it("recognizes a forward-slash Windows path", () => {
      expect(isAbsolutePath("C:/db/project.accdb")).toBe(true);
    });

    it("recognizes a backslash Windows path", () => {
      expect(isAbsolutePath("C:\\db\\project.accdb")).toBe(true);
    });

    it("recognizes a lower-case drive letter", () => {
      expect(isAbsolutePath("c:/foo/bar")).toBe(true);
    });

    it("recognizes a path with only the drive root C:/", () => {
      expect(isAbsolutePath("C:/")).toBe(true);
    });

    it("recognizes a path with only the drive root C:\\", () => {
      expect(isAbsolutePath("C:\\")).toBe(true);
    });
  });

  describe("UNC paths (absolute)", () => {
    it("recognizes a UNC path", () => {
      expect(isAbsolutePath("\\\\server\\share\\file.accdb")).toBe(true);
    });
  });

  describe("POSIX paths (absolute)", () => {
    it("recognizes a POSIX root path", () => {
      expect(isAbsolutePath("/unix/path/to/file")).toBe(true);
    });

    it("recognizes the bare root /", () => {
      expect(isAbsolutePath("/")).toBe(true);
    });
  });

  describe("relative paths (not absolute)", () => {
    it("returns false for a bare relative path", () => {
      expect(isAbsolutePath("relative/path")).toBe(false);
    });

    it("returns false for a dot-relative path", () => {
      expect(isAbsolutePath("./relative")).toBe(false);
    });

    it("returns false for a parent-relative path", () => {
      expect(isAbsolutePath("../up/one")).toBe(false);
    });

    it("returns false for an empty string", () => {
      expect(isAbsolutePath("")).toBe(false);
    });

    it("returns false for a filename with no directory", () => {
      expect(isAbsolutePath("project.accdb")).toBe(false);
    });
  });
});
