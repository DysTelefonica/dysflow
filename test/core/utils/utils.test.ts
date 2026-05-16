import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, afterAll } from "vitest";
import {
  REDACTED_SECRET,
  isRecord,
  stringValue,
  sanitizeSecrets,
  readJsonFileSync,
  readJsonFileAsync,
} from "../../../src/core/utils/index.js";

// Shared temp directory for file-read tests — cleaned up after all tests
const tmpDir = mkdtempSync(join(tmpdir(), "dysflow-utils-test-"));

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// REDACTED_SECRET
// ---------------------------------------------------------------------------
describe("REDACTED_SECRET", () => {
  it("has the expected sentinel value", () => {
    expect(REDACTED_SECRET).toBe("[REDACTED]");
  });
});

// ---------------------------------------------------------------------------
// isRecord
// ---------------------------------------------------------------------------
describe("isRecord", () => {
  it("returns true for a plain object", () => {
    expect(isRecord({ key: "value" })).toBe(true);
  });

  it("returns true for an empty object", () => {
    expect(isRecord({})).toBe(true);
  });

  it("returns false for null", () => {
    expect(isRecord(null)).toBe(false);
  });

  it("returns false for an array", () => {
    expect(isRecord([1, 2, 3])).toBe(false);
  });

  it("returns false for a string", () => {
    expect(isRecord("hello")).toBe(false);
  });

  it("returns false for a number", () => {
    expect(isRecord(42)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isRecord(undefined)).toBe(false);
  });

  it("returns false for a boolean", () => {
    expect(isRecord(true)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// stringValue
// ---------------------------------------------------------------------------
describe("stringValue", () => {
  it("returns the string when given a non-blank string", () => {
    expect(stringValue("hello")).toBe("hello");
  });

  it("trims leading and trailing whitespace", () => {
    expect(stringValue("  hello  ")).toBe("hello");
  });

  it("returns undefined for an empty string", () => {
    expect(stringValue("")).toBeUndefined();
  });

  it("returns undefined for a whitespace-only string", () => {
    expect(stringValue("   ")).toBeUndefined();
  });

  it("returns undefined for undefined input", () => {
    expect(stringValue(undefined)).toBeUndefined();
  });

  it("returns undefined for null input", () => {
    expect(stringValue(null)).toBeUndefined();
  });

  it("returns undefined for a number input", () => {
    expect(stringValue(42)).toBeUndefined();
  });

  it("returns undefined for an object input", () => {
    expect(stringValue({ key: "val" })).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// sanitizeSecrets
// ---------------------------------------------------------------------------
describe("sanitizeSecrets", () => {
  it("replaces a single secret in the value", () => {
    const result = sanitizeSecrets("Bearer tok123", ["tok123"]);
    expect(result).toBe(`Bearer ${REDACTED_SECRET}`);
  });

  it("replaces multiple occurrences of the same secret", () => {
    const result = sanitizeSecrets("tok123 tok123", ["tok123"]);
    expect(result).toBe(`${REDACTED_SECRET} ${REDACTED_SECRET}`);
  });

  it("replaces multiple different secrets", () => {
    const result = sanitizeSecrets("Bearer tok123 pass", ["tok123", "pass"]);
    expect(result).toBe(`Bearer ${REDACTED_SECRET} ${REDACTED_SECRET}`);
  });

  it("skips empty-string secrets without error", () => {
    const result = sanitizeSecrets("Bearer tok123", ["", "tok123"]);
    expect(result).toBe(`Bearer ${REDACTED_SECRET}`);
  });

  it("returns the original value when no secret matches", () => {
    const result = sanitizeSecrets("Bearer abc", ["xyz"]);
    expect(result).toBe("Bearer abc");
  });

  it("returns the value unchanged with an empty secrets array", () => {
    const result = sanitizeSecrets("Bearer tok123", []);
    expect(result).toBe("Bearer tok123");
  });

  it("handles an array containing only empty strings safely", () => {
    const result = sanitizeSecrets("Bearer tok123", ["", ""]);
    expect(result).toBe("Bearer tok123");
  });
});

// ---------------------------------------------------------------------------
// readJsonFileSync
// ---------------------------------------------------------------------------
describe("readJsonFileSync", () => {
  it("reads and parses a valid JSON file synchronously", () => {
    const filePath = join(tmpDir, "sync-valid.json");
    writeFileSync(filePath, JSON.stringify({ key: "val" }), "utf8");
    const result = readJsonFileSync<{ key: string }>(filePath);
    expect(result).toEqual({ key: "val" });
  });

  it("throws when the file does not exist", () => {
    const missingPath = join(tmpDir, "does-not-exist-sync.json");
    expect(() => readJsonFileSync(missingPath)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// readJsonFileAsync
// ---------------------------------------------------------------------------
describe("readJsonFileAsync", () => {
  it("reads and parses a valid JSON file asynchronously", async () => {
    const filePath = join(tmpDir, "async-valid.json");
    writeFileSync(filePath, JSON.stringify({ key: "val" }), "utf8");
    const result = await readJsonFileAsync<{ key: string }>(filePath);
    expect(result).toEqual({ key: "val" });
  });

  it("rejects when the file does not exist", async () => {
    const missingPath = join(tmpDir, "does-not-exist-async.json");
    await expect(readJsonFileAsync(missingPath)).rejects.toThrow();
  });
});
