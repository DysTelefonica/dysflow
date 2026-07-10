/**
 * Issue #733 RED tests — form_serialize output contract.
 *
 * Validates that serializeForm emits byteEqual, metadataReport, and
 * supports the includeSerialized flag per the documented contract.
 *
 * All tests RED against the current code until the implementation is fixed.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  deserializeForm,
  serializeForm,
} from "../../../src/adapters/vba-sync/vba-forms-serialization-tools";
import type { VbaFormsOrchestrator } from "../../../src/adapters/vba-sync/vba-forms-types";
import { successResult } from "../../../src/core/contracts/index";
import type { FormFileSystemPort } from "../../../src/core/services/vba-form-service";

const FIXTURES_DIR = join(process.cwd(), "E2E_testing/src/forms");

/** Minimal FormFileSystemPort that reads real files from disk. */
function fixtureFs(): FormFileSystemPort {
  return {
    async readFile(path: string): Promise<string> {
      // The managed-source resolver win32-normalizes paths (correct for the
      // Windows-only production target). On the Linux CI unit-test job that
      // yields backslash separators the POSIX fs cannot resolve, so normalize
      // to forward slashes before this real read. Windows accepts both.
      return readFileSync(path.replace(/\\/g, "/"), "utf8");
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

describe("serializeForm — outputMode filtering (feat-forms-output-modes)", () => {
  it("summary mode: omits serialized, includes metadata fields", async () => {
    const result = await serializeForm(fixtureFs(), {
      sourcePath: join(FIXTURES_DIR, "Form_frmBusy.form.txt"),
      outputMode: "summary",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as Record<string, unknown>;
    expect(data.serialized).toBeUndefined();
    expect(data.name).toBe("frmBusy");
    expect(data.kind).toBe("Form");
    expect(typeof data.byteEqual).toBe("boolean");
    expect(typeof data.byteDiff).toBe("number");
    expect(data.metadataReport).toBeDefined();
  });

  it("file mode: includes serialized, omits metadata fields/reports", async () => {
    const result = await serializeForm(fixtureFs(), {
      sourcePath: join(FIXTURES_DIR, "Form_frmBusy.form.txt"),
      outputMode: "file",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as Record<string, unknown>;
    expect(typeof data.serialized).toBe("string");
    expect(data.name).toBe("frmBusy");
    expect(data.kind).toBe("Form");
    expect(data.byteEqual).toBeUndefined();
    expect(data.byteDiff).toBeUndefined();
    expect(data.metadataReport).toBeUndefined();
  });

  it("full mode: includes serialized, metadata fields and reports", async () => {
    const result = await serializeForm(fixtureFs(), {
      sourcePath: join(FIXTURES_DIR, "Form_frmBusy.form.txt"),
      outputMode: "full",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as Record<string, unknown>;
    expect(typeof data.serialized).toBe("string");
    expect(data.name).toBe("frmBusy");
    expect(data.kind).toBe("Form");
    expect(typeof data.byteEqual).toBe("boolean");
    expect(typeof data.byteDiff).toBe("number");
    expect(data.metadataReport).toBeDefined();
  });

  it("default: falls back to full when outputMode is omitted but includeSerialized is true", async () => {
    const result = await serializeForm(fixtureFs(), {
      sourcePath: join(FIXTURES_DIR, "Form_frmBusy.form.txt"),
      includeSerialized: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as Record<string, unknown>;
    expect(typeof data.serialized).toBe("string");
    expect(typeof data.byteEqual).toBe("boolean");
    expect(data.metadataReport).toBeDefined();
  });

  it("default: falls back to summary when outputMode and includeSerialized are omitted", async () => {
    const result = await serializeForm(fixtureFs(), {
      sourcePath: join(FIXTURES_DIR, "Form_frmBusy.form.txt"),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as Record<string, unknown>;
    expect(data.serialized).toBeUndefined();
    expect(typeof data.byteEqual).toBe("boolean");
    expect(data.metadataReport).toBeDefined();
  });
});

describe("deserializeForm — dry-run outputMode filtering (feat-forms-output-modes)", () => {
  const minimalIr = {
    name: "frmBusy",
    kind: "Form" as const,
    preamble: [],
    root: {
      blockType: "Form",
      entries: [],
      children: [],
    },
    codeBehind: null,
  };

  function mockOrchestrator(): VbaFormsOrchestrator {
    const cwd = process.cwd().replace(/\\/g, "/");
    return {
      executor: vi.fn(),
      env: {},
      cwd,
      resolveExecutionTarget: vi.fn().mockResolvedValue(
        successResult({
          accessPath: `${cwd}/App.accdb`,
          destinationRoot: cwd,
          projectRoot: cwd,
          timeoutMs: 30000,
          configSource: "explicit-request",
        }),
      ),
      validateStrictContext: vi.fn(() => successResult(undefined)),
      executeMappedTool: vi.fn().mockResolvedValue(successResult({ imported: true })),
    };
  }

  it("summary mode: omits preview, includes gate status", async () => {
    const orchestrator = mockOrchestrator();
    const result = await deserializeForm({
      orchestrator,
      fileSystem: fixtureFs(),
      params: {
        sourcePath: join(FIXTURES_DIR, "Form_frmBusy.form.txt"),
        ir: minimalIr,
        dryRun: true,
        outputMode: "summary",
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as Record<string, unknown>;
    expect(data.preview).toBeUndefined();
    expect(data.mode).toBe("dry-run");
    expect(data.loadFromTextGate).toBe("skipped");
    expect(data.sourcePath).toBeDefined();
  });

  it("file mode: includes preview, omits gate status details", async () => {
    const orchestrator = mockOrchestrator();
    const result = await deserializeForm({
      orchestrator,
      fileSystem: fixtureFs(),
      params: {
        sourcePath: join(FIXTURES_DIR, "Form_frmBusy.form.txt"),
        ir: minimalIr,
        dryRun: true,
        outputMode: "file",
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as Record<string, unknown>;
    expect(typeof data.preview).toBe("string");
    expect(data.sourcePath).toBeDefined();
    // Omit gate details
    expect(data.mode).toBeUndefined();
    expect(data.written).toBeUndefined();
    expect(data.appliedChecksumBefore).toBeUndefined();
    expect(data.appliedChecksumAfter).toBeUndefined();
    expect(data.loadFromTextGate).toBeUndefined();
  });

  it("full mode: includes both preview and gate status details", async () => {
    const orchestrator = mockOrchestrator();
    const result = await deserializeForm({
      orchestrator,
      fileSystem: fixtureFs(),
      params: {
        sourcePath: join(FIXTURES_DIR, "Form_frmBusy.form.txt"),
        ir: minimalIr,
        dryRun: true,
        outputMode: "full",
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as Record<string, unknown>;
    expect(typeof data.preview).toBe("string");
    expect(data.mode).toBe("dry-run");
    expect(data.loadFromTextGate).toBe("skipped");
    expect(data.sourcePath).toBeDefined();
  });

  it("default: falls back to full when outputMode is omitted", async () => {
    const orchestrator = mockOrchestrator();
    const result = await deserializeForm({
      orchestrator,
      fileSystem: fixtureFs(),
      params: {
        sourcePath: join(FIXTURES_DIR, "Form_frmBusy.form.txt"),
        ir: minimalIr,
        dryRun: true,
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as Record<string, unknown>;
    expect(typeof data.preview).toBe("string");
    expect(data.mode).toBe("dry-run");
    expect(data.loadFromTextGate).toBe("skipped");
    expect(data.sourcePath).toBeDefined();
  });
});

describe("serializeForm — projectId resolution (Phase 3)", () => {
  it("resolves sourcePath via shared resolver when projectId and formName are supplied", async () => {
    const fs = {
      readFile: vi.fn().mockImplementation(async (path: string) => {
        if (path.replace(/\\/g, "/").endsWith("E2E_testing/src/forms/Form_frmBusy.form.txt")) {
          return `Version =21
Begin Form
End
`;
        }
        throw new Error("ENOENT");
      }),
      mkdir: vi.fn(),
      readdir: vi.fn().mockResolvedValue([]),
      readJson: vi.fn(),
      writeFile: vi.fn(),
    };
    const orchestrator = {
      executor: vi.fn(),
      env: {},
      cwd: "C:/repo",
      resolveExecutionTarget: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          destinationRoot: "C:/repo/E2E_testing/src",
          projectRoot: "C:/repo",
        },
      }),
      validateStrictContext: vi.fn(() => ({ ok: true, data: undefined })),
      executeMappedTool: vi.fn(),
    };

    const result = await serializeForm(
      fs,
      {
        projectId: "test-project",
        formName: "frmBusy",
      },
      orchestrator as unknown as VbaFormsOrchestrator,
    );

    expect(result.ok).toBe(true);
    expect(orchestrator.resolveExecutionTarget).toHaveBeenCalledWith({
      projectId: "test-project",
      formName: "frmBusy",
    });
  });

  it("keeps literal sourcePath passthrough when projectId/formName are not supplied", async () => {
    const fs = {
      readFile: vi.fn().mockImplementation(async (path: string) => {
        if (path === "D:/somewhere/custom.form.txt") {
          return `Version =21
Begin Form
End
`;
        }
        throw new Error("ENOENT");
      }),
      mkdir: vi.fn(),
      readdir: vi.fn().mockResolvedValue([]),
      readJson: vi.fn(),
      writeFile: vi.fn(),
    };
    const orchestrator = {
      executor: vi.fn(),
      env: {},
      cwd: "C:/repo",
      resolveExecutionTarget: vi.fn(),
      validateStrictContext: vi.fn(),
      executeMappedTool: vi.fn(),
    };

    const result = await serializeForm(
      fs,
      {
        sourcePath: "D:/somewhere/custom.form.txt",
      },
      orchestrator as unknown as VbaFormsOrchestrator,
    );

    expect(result.ok).toBe(true);
    expect(orchestrator.resolveExecutionTarget).not.toHaveBeenCalled();
  });
});
