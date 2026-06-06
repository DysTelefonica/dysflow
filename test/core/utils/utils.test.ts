import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  detectWriteSqlKeyword,
  isRecord,
  looksLikeReadOnlySql,
  REDACTED_SECRET,
  readJsonFileAsync,
  readJsonFileSync,
  sanitizeConnectStrings,
  sanitizeSecrets,
  stringValue,
  truthy,
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
// truthy
// ---------------------------------------------------------------------------
describe("truthy", () => {
  it("accepts the strict truthy values used by VBA sync params", () => {
    expect(truthy(true)).toBe(true);
    expect(truthy("true")).toBe(true);
    expect(truthy(1)).toBe(true);
    expect(truthy("1")).toBe(true);
  });

  it("rejects non-truthy values without coercing arbitrary strings", () => {
    expect(truthy(false)).toBe(false);
    expect(truthy("false")).toBe(false);
    expect(truthy(0)).toBe(false);
    expect(truthy("yes")).toBe(false);
    expect(truthy(undefined)).toBe(false);
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
// sanitizeConnectStrings
// ---------------------------------------------------------------------------
describe("sanitizeConnectStrings", () => {
  it("strips ;PWD=value from a DAO connect string", () => {
    expect(sanitizeConnectStrings(";DATABASE=C:\\db.accdb;PWD=secret")).toBe(
      ";DATABASE=C:\\db.accdb",
    );
  });

  it("strips ;PWD= when followed by another segment", () => {
    expect(sanitizeConnectStrings(";DATABASE=C:\\db.accdb;PWD=secret;OPTION=32")).toBe(
      ";DATABASE=C:\\db.accdb;OPTION=32",
    );
  });

  it("is case-insensitive", () => {
    expect(sanitizeConnectStrings(";DATABASE=C:\\db.accdb;pwd=secret")).toBe(
      ";DATABASE=C:\\db.accdb",
    );
    expect(sanitizeConnectStrings(";DATABASE=C:\\db.accdb;Pwd=Secret")).toBe(
      ";DATABASE=C:\\db.accdb",
    );
  });

  it("strips all PWD occurrences in the string", () => {
    expect(sanitizeConnectStrings(";PWD=a;DATABASE=x;PWD=b")).toBe(";DATABASE=x");
  });

  it("leaves strings without PWD unchanged", () => {
    expect(sanitizeConnectStrings(";DATABASE=C:\\db.accdb")).toBe(";DATABASE=C:\\db.accdb");
  });

  it("returns empty string unchanged", () => {
    expect(sanitizeConnectStrings("")).toBe("");
  });

  it("strips PWD from a DAO connect string embedded in a PowerShell error (;-bounded format)", () => {
    const psError = "Could not open ;DATABASE=C:\\db.accdb;PWD=mysecret;OPTION=32 — check path";
    const sanitized = sanitizeConnectStrings(psError);
    expect(sanitized).toBe("Could not open ;DATABASE=C:\\db.accdb;OPTION=32 — check path");
    expect(sanitized).not.toContain("mysecret");
    expect(sanitized).not.toContain(";PWD=");
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

// ---------------------------------------------------------------------------
// looksLikeReadOnlySql and detectWriteSqlKeyword
// ---------------------------------------------------------------------------
describe("looksLikeReadOnlySql and detectWriteSqlKeyword", () => {
  it("allows read-only queries", () => {
    expect(looksLikeReadOnlySql("SELECT * FROM People")).toBe(true);
    expect(looksLikeReadOnlySql("  select id from T")).toBe(true);
    expect(looksLikeReadOnlySql("SELECT COUNT(*) FROM T WHERE x=1")).toBe(true);
  });

  it("allows SELECT containing WITH (CTE) when it reads", () => {
    expect(looksLikeReadOnlySql("WITH cte AS (SELECT * FROM People) SELECT * FROM cte")).toBe(true);
    expect(looksLikeReadOnlySql("  with cte as (select id from T) select * from cte")).toBe(true);
  });

  it("blocks CTE queries containing writes", () => {
    expect(looksLikeReadOnlySql("WITH cte AS (DELETE FROM People) SELECT * FROM cte")).toBe(false);
    expect(
      looksLikeReadOnlySql("WITH cte AS (INSERT INTO People VALUES(1)) SELECT * FROM cte"),
    ).toBe(false);
  });

  it("blocks DDL/DML statements", () => {
    const ddlDmlList = [
      "insert into T values (1)",
      "UPDATE T SET x=1",
      "DELETE FROM T",
      "CREATE TABLE T (a int)",
      "DROP TABLE T",
      "ALTER TABLE T ADD COLUMN c text",
      "TRUNCATE TABLE T",
      "EXEC proc",
      "EXECUTE proc",
      "GRANT select on T to public",
      "REVOKE select on T from public",
    ];
    for (const sql of ddlDmlList) {
      expect(looksLikeReadOnlySql(sql), `should reject: ${sql}`).toBe(false);
    }
  });

  it("blocks writes case-insensitively", () => {
    expect(looksLikeReadOnlySql("delete from T")).toBe(false);
    expect(looksLikeReadOnlySql("Drop Table T")).toBe(false);
    expect(looksLikeReadOnlySql("INSERT into T values(1)")).toBe(false);
  });

  it("extracts the forbidden keyword in uppercase", () => {
    const result = detectWriteSqlKeyword("DROP TABLE People");
    expect(result).toBe("DROP");
  });
});
