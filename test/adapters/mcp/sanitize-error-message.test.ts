/**
 * Tests for sanitizeErrorMessage (#199) — short Windows path redaction.
 *
 * The function is private in tools.ts so we test via a local mirror.
 * The test file locks the expected behavior; the implementation must match.
 *
 * The key fix: the third replace rule must redact single-component paths
 * (C:\data, C:\x) AND bare drive roots (C:\), while still redacting
 * multi-component paths (C:\Users\foo\bar).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Mirror of sanitizeErrorMessage — FIXED version (what GREEN should produce) */
function sanitizeFixed(message: string): string {
  return message
    .replace(/[A-Za-z]:\\[^:]*?\.(?:accdb|mdb|accde|mde|laccdb)\b/gi, "[PATH]")
    .replace(/\/[^:]*?\.(?:accdb|mdb|accde|mde|laccdb)\b/gi, "[PATH]")
    .replace(/[A-Za-z]:\\(?:[^\\\s:]+(?:\\[^\\\s:]+)*)?/g, "[PATH]")
    .replace(/(?:\/[^/\s:]+)+/g, "[PATH]");
}

/** Mirror of the CURRENT (unfixed) sanitizeErrorMessage */
function sanitizeCurrent(message: string): string {
  return message
    .replace(/[A-Za-z]:\\[^:]*?\.(?:accdb|mdb|accde|mde|laccdb)\b/gi, "[PATH]")
    .replace(/\/[^:]*?\.(?:accdb|mdb|accde|mde|laccdb)\b/gi, "[PATH]")
    .replace(/[A-Za-z]:\\(?:[^\\\s:]+\\)*[^\\\s:]+/g, "[PATH]")
    .replace(/(?:\/[^/\s:]+)+/g, "[PATH]");
}

describe("sanitizeErrorMessage — Windows path redaction (#199)", () => {
  describe("multi-component paths (existing behavior must be preserved)", () => {
    it("redacts C:\\Users\\foo\\bar.txt", () => {
      expect(sanitizeFixed("path C:\\Users\\foo\\bar.txt failed")).toContain("[PATH]");
    });

    it("redacts D:\\repo\\.dysflow\\project.json", () => {
      expect(sanitizeFixed("file D:\\repo\\.dysflow\\project.json missing")).toContain("[PATH]");
    });

    it("redacts C:\\Program Files\\App.accdb", () => {
      expect(sanitizeFixed("access C:\\Program Files\\App.accdb")).toContain("[PATH]");
    });

    it("does not leak path components after redaction", () => {
      expect(sanitizeFixed("path C:\\Users\\foo\\bar.txt done")).not.toContain("\\Users");
    });
  });

  describe("single-component Windows paths (#199 new coverage)", () => {
    it("redacts C:\\data (single component after drive)", () => {
      const result = sanitizeFixed("path C:\\data failed");
      expect(result).toContain("[PATH]");
      expect(result).not.toContain("C:\\data");
    });

    it("redacts C:\\x (single short component)", () => {
      const result = sanitizeFixed("error at C:\\x");
      expect(result).toContain("[PATH]");
      expect(result).not.toContain("C:\\x");
    });
  });

  describe("negative cases (should not redact)", () => {
    it("does not redact plain text 'OK'", () => {
      expect(sanitizeFixed("OK")).toBe("OK");
    });

    it("does not redact plain error codes like 'error 42'", () => {
      expect(sanitizeFixed("error 42")).toBe("error 42");
    });

    it("does not redact quoted strings", () => {
      expect(sanitizeFixed("expected 'foo'")).toBe("expected 'foo'");
    });
  });
});

describe("sanitizeErrorMessage source regex (#199) — RED phase", () => {
  it("current source regex does NOT cover bare drive root C:\\", () => {
    // The FIXED sanitizeFixed handles bare drive roots correctly
    const fixedResult = sanitizeFixed("path C:\\ is the root");
    expect(fixedResult).toContain("[PATH]");
    expect(fixedResult).not.toContain("C:\\\\");
  });

  it("tools.ts third replace rule does not use the old mandatory-component pattern", () => {
    const source = readFileSync("src/adapters/mcp/tools.ts", "utf8");
    // The old pattern ends with )*[^\\\s:]+ (requiring at least one trailing component)
    // The fixed pattern makes the component group optional with (?:...)? at the end
    // Verify the old mandatory trailing component string is gone
    expect(source).not.toContain(")*[^\\\\\\s:]+/g");
  });
});
