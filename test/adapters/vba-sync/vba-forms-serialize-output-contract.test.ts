/**
 * Issue #733 RED tests — dysflow_form_serialize output contract.
 *
 * Validates that serializeForm emits byteEqual, metadataReport, and
 * supports the includeSerialized flag per the documented contract.
 *
 * All tests RED against the current code until the implementation is fixed.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { serializeForm } from "../../../src/adapters/vba-sync/vba-forms-serialization-tools";
import type { FormFileSystemPort } from "../../../src/core/services/vba-form-service";

const FIXTURES_DIR = join(process.cwd(), "E2E_testing/src/forms");

/** Minimal FormFileSystemPort that reads real files from disk. */
function fixtureFs(): FormFileSystemPort {
  return {
    async readFile(path: string): Promise<string> {
      return readFileSync(path, "utf8");
    },
    async mkdir(): Promise<string | undefined> {
      return undefined;
    },
    async readdir(): Promise<string[]> {
      return [];
    },
    async readJson<T>(): Promise<T> {
      throw new Error("readJson not stubbed");
    },
    async writeFile(): Promise<void> {
      throw new Error("writeFile not stubbed");
    },
  };
}

// ---------------------------------------------------------------------------
// Default response — must include byteEqual + metadataReport
// ---------------------------------------------------------------------------

describe("serializeForm — output contract (issue #733)", () => {
  it("default response includes byteEqual (boolean)", async () => {
    const result = await serializeForm(fixtureFs(), {
      sourcePath: join(FIXTURES_DIR, "Form_frmBusy.form.txt").replace(/\\/g, "/"),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as Record<string, unknown>;
    expect(typeof data.byteEqual).toBe("boolean");
  });

  it("default response includes metadataReport with preservedKeys, byteDiff, opaqueCount", async () => {
    const result = await serializeForm(fixtureFs(), {
      sourcePath: join(FIXTURES_DIR, "Form_frmBusy.form.txt"),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as Record<string, unknown>;
    const report = data.metadataReport as Record<string, unknown>;
    expect(report).toBeDefined();
    expect(Array.isArray(report.preservedKeys)).toBe(true);
    expect(typeof report.byteDiff).toBe("number");
    expect(typeof report.opaqueCount).toBe("number");
  });

  it("byteEqual is true for a clean round-trip fixture", async () => {
    const result = await serializeForm(fixtureFs(), {
      sourcePath: join(FIXTURES_DIR, "Form_frmBusy.form.txt"),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as Record<string, unknown>;
    expect(data.byteEqual).toBe(true);
    const report = data.metadataReport as Record<string, unknown>;
    expect(report.byteDiff).toBe(0);
  });

  it("byteEqual is false when the source is mutated", async () => {
    // Read the fixture, mutate a non-preserved scalar, write a temp file.
    const { writeFileSync, unlinkSync, mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");

    const original = readFileSync(join(FIXTURES_DIR, "Form_frmBusy.form.txt"), "utf8");
    // Inject a UTF-8 BOM. The serializer normalizes BOMs away, so
    // serialized !== original → byteEqual false, byteDiff > 0.
    const withBom = `\uFEFF${original}`;
    const tmpDir = mkdtempSync(join(tmpdir(), "form-serialize-"));
    const tmpFile = join(tmpDir, "Form_frmBusy_bom.form.txt");
    writeFileSync(tmpFile, withBom, "utf8");

    try {
      const result = await serializeForm(fixtureFs(), {
        sourcePath: tmpFile,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const data = result.data as Record<string, unknown>;
      // byteEqual compares against the RAW original (which has the BOM),
      // so it should be false.
      expect(data.byteEqual).toBe(false);
      const report = data.metadataReport as Record<string, unknown>;
      // byteDiff reflects the byte-length delta (BOM is 3 bytes in UTF-8).
      expect(report.byteDiff).toBeGreaterThan(0);
    } finally {
      unlinkSync(tmpFile);
    }
  });

  it("default response omits serialized field for performance", async () => {
    const result = await serializeForm(fixtureFs(), {
      sourcePath: join(FIXTURES_DIR, "Form_frmBusy.form.txt"),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as Record<string, unknown>;
    // serialized is omitted by default (includeSerialized defaults to false)
    expect(data.serialized).toBeUndefined();
    // but metrics are still present
    expect(typeof data.byteEqual).toBe("boolean");
    expect(typeof data.byteDiff).toBe("number");
  });

  it("includeSerialized: false omits the full serialized text", async () => {
    const result = await serializeForm(fixtureFs(), {
      sourcePath: join(FIXTURES_DIR, "Form_frmBusy.form.txt"),
      includeSerialized: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as Record<string, unknown>;
    // serialized should be undefined (key omitted) when includeSerialized is false
    expect(data.serialized).toBeUndefined();
    // but metrics are still present
    expect(typeof data.byteEqual).toBe("boolean");
    const report = data.metadataReport as Record<string, unknown>;
    expect(report).toBeDefined();
    expect(Array.isArray(report.preservedKeys)).toBe(true);
  });

  it("includeSerialized: true (explicit) includes the full text", async () => {
    const result = await serializeForm(fixtureFs(), {
      sourcePath: join(FIXTURES_DIR, "Form_frmBusy.form.txt"),
      includeSerialized: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as Record<string, unknown>;
    expect(typeof data.serialized).toBe("string");
    expect((data.serialized as string).length).toBeGreaterThan(1000);
  });

  it("metadataReport.preservedKeys includes expected opaque keys", async () => {
    const result = await serializeForm(fixtureFs(), {
      sourcePath: join(FIXTURES_DIR, "Form_frmBusy.form.txt"),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as Record<string, unknown>;
    const report = data.metadataReport as Record<string, unknown>;
    const keys = report.preservedKeys as string[];
    // At minimum these keys should be in the preserved set
    expect(keys).toContain("Checksum");
    expect(keys).toContain("PrtDevMode");
    expect(keys).toContain("Format");
  });

  it("metadataReport.opaqueCount > 0 for a form with blob entries", async () => {
    const result = await serializeForm(fixtureFs(), {
      sourcePath: join(FIXTURES_DIR, "Form_frmBusy.form.txt"),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as Record<string, unknown>;
    const report = data.metadataReport as Record<string, unknown>;
    expect(report.opaqueCount).toBeGreaterThan(0);
  });
});
