import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { VbaFormsLintAdapter } from "../../../src/adapters/vba-sync/vba-forms-lint-adapter";
import type { FormFileSystemPort } from "../../../src/core/services/vba-form-service";

type SuccessData = {
  ok: boolean;
  summary: {
    formsScanned: number;
    diagnosticsCount: number;
    errorsCount: number;
    warningsCount: number;
    infoCount: number;
  };
  diagnostics: {
    severity: string;
    rule: string;
    file: string;
    line: number;
    column: number;
    message: string;
    suggestedFix?: string;
  }[];
};

// Helper to create mocked filesystem ports
function mockFs(overrides: Partial<FormFileSystemPort> = {}): FormFileSystemPort {
  return {
    mkdir: vi.fn(),
    readdir: vi.fn().mockResolvedValue([]),
    readFile: vi.fn().mockResolvedValue(""),
    readJson: vi.fn(),
    writeFile: vi.fn(),
    ...overrides,
  };
}

const VALID_FORM_TXT = `Version =21
VersionRequired =20
Begin Form
    Caption ="Test Form"
    Begin
        Begin Label
            Name ="lblTitle"
            Caption ="Title"
        End
    End
End
CodeBehindForm
Option Compare Database
Option Explicit
`;

const VALID_CLS = `Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = True
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
Option Compare Database
Option Explicit
`;

const FORM_WITH_COMBO = `Version =21
VersionRequired =20
Begin Form
    Caption ="Test Form"
    Begin
        Begin ComboBox
            Name ="MyCombo"
        End
    End
End
`;

const CLS_WITH_LIST_CALL = `Option Explicit
Sub Test()
    Dim año As Integer
End Sub
`;

describe("VbaFormsLintAdapter", () => {
  it("returns failure when formName and moduleNames are both passed", async () => {
    const fs = mockFs();
    const adapter = new VbaFormsLintAdapter(fs);

    const result = await adapter.lintFormCode({
      destinationRoot: "C:/repo",
      formName: "Form_frmMain",
      moduleNames: ["Form_frmOther"],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MCP_INPUT_INVALID");
      expect(result.error.message).toContain("mutually exclusive");
    }
  });

  it("returns failure when neither destinationRoot nor sourceRoot are passed", async () => {
    const fs = mockFs();
    const adapter = new VbaFormsLintAdapter(fs);

    const result = await adapter.lintFormCode({
      formName: "Form_frmMain",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MCP_INPUT_INVALID");
      expect(result.error.message).toContain("required");
    }
  });

  it("successfully lints a single form and sibling cls", async () => {
    const fs = mockFs({
      readFile: vi.fn().mockImplementation(async (path: string) => {
        if (path.endsWith(".form.txt")) return VALID_FORM_TXT;
        if (path.endsWith(".cls")) return VALID_CLS;
        throw new Error("ENOENT");
      }),
    });
    const adapter = new VbaFormsLintAdapter(fs);

    const result = await adapter.lintFormCode({
      destinationRoot: "C:/repo",
      formName: "Form_frmMain",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as SuccessData;
      expect(data.ok).toBe(true);
      expect(data.summary.formsScanned).toBe(1);
      expect(data.summary.errorsCount).toBe(0);
      expect(data.diagnostics).toEqual([]);
    }
  });

  it("handles forms without sibling cls file (no code-behind) cleanly", async () => {
    const fs = mockFs({
      readFile: vi.fn().mockImplementation(async (path: string) => {
        if (path.endsWith(".form.txt")) return VALID_FORM_TXT;
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      }),
    });
    const adapter = new VbaFormsLintAdapter(fs);

    const result = await adapter.lintFormCode({
      destinationRoot: "C:/repo",
      formName: "Form_frmMain",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as SuccessData;
      expect(data.ok).toBe(true);
      expect(data.summary.formsScanned).toBe(1);
      expect(data.summary.warningsCount).toBe(0);
      expect(data.diagnostics).toEqual([]);
    }
  });

  it("reports a warning if sibling cls exists but fails to read in the loop", async () => {
    const readCounts: Record<string, number> = {};
    const fs = mockFs({
      readFile: vi.fn().mockImplementation(async (path: string) => {
        readCounts[path] = (readCounts[path] || 0) + 1;
        if (path.endsWith(".form.txt")) return VALID_FORM_TXT;
        if (path.endsWith(".cls")) {
          if (readCounts[path] === 1) return VALID_CLS;
          throw new Error("Disk Read Error");
        }
        throw new Error("ENOENT");
      }),
    });
    const adapter = new VbaFormsLintAdapter(fs);

    const result = await adapter.lintFormCode({
      destinationRoot: "C:/repo",
      formName: "Form_frmMain",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as SuccessData;
      expect(data.ok).toBe(false); // Has a warning, so data.ok is false
      expect(data.summary.formsScanned).toBe(1);
      expect(data.summary.warningsCount).toBe(1);
      expect(data.diagnostics[0]?.severity).toBe("warning");
      expect(data.diagnostics[0]?.message).toContain("Disk Read Error");
    }
  });

  it("handles strict mode elevating rule warnings to errors", async () => {
    const fs = mockFs({
      readFile: vi.fn().mockImplementation(async (path: string) => {
        if (path.endsWith(".form.txt")) return FORM_WITH_COMBO;
        if (path.endsWith(".cls")) return CLS_WITH_LIST_CALL;
        throw new Error("ENOENT");
      }),
    });
    const adapter = new VbaFormsLintAdapter(fs);

    // Non-strict: should have 1 warning, 0 errors
    const resultNonStrict = await adapter.lintFormCode({
      destinationRoot: "C:/repo",
      formName: "Form_frmMain",
      strict: false,
    });
    expect(resultNonStrict.ok).toBe(true);
    if (resultNonStrict.ok) {
      const data = resultNonStrict.data as SuccessData;
      expect(data.ok).toBe(false); // warning present -> not ok
      expect(data.summary.warningsCount).toBe(1);
      expect(data.summary.errorsCount).toBe(0);
    }

    // Strict: should elevate warnings to errors
    const resultStrict = await adapter.lintFormCode({
      destinationRoot: "C:/repo",
      formName: "Form_frmMain",
      strict: true,
    });
    expect(resultStrict.ok).toBe(true);
    if (resultStrict.ok) {
      const data = resultStrict.data as SuccessData;
      expect(data.ok).toBe(false);
      expect(data.summary.warningsCount).toBe(0);
      expect(data.summary.errorsCount).toBe(1);
    }
  });

  it("returns FORM_NOT_FOUND if the form file does not exist", async () => {
    const fs = mockFs({
      readFile: vi.fn().mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" })),
    });
    const adapter = new VbaFormsLintAdapter(fs);

    const result = await adapter.lintFormCode({
      destinationRoot: "C:/repo",
      formName: "Form_frmMain",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORM_NOT_FOUND");
    }
  });

  it("fails when formName is invalid prefix", async () => {
    const fs = mockFs();
    const adapter = new VbaFormsLintAdapter(fs);

    const result = await adapter.lintFormCode({
      destinationRoot: "C:/repo",
      formName: "InvalidName",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MCP_INPUT_INVALID");
    }
  });

  it("fails when any entry in moduleNames is invalid prefix", async () => {
    const fs = mockFs();
    const adapter = new VbaFormsLintAdapter(fs);

    const result = await adapter.lintFormCode({
      destinationRoot: "C:/repo",
      moduleNames: ["Form_frmMain", "InvalidName"],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("MCP_INPUT_INVALID");
    }
  });

  it("successfully lints multiple explicitly passed modules", async () => {
    const fs = mockFs({
      readFile: vi.fn().mockImplementation(async (path: string) => {
        if (path.endsWith(".form.txt") || path.endsWith(".report.txt")) return VALID_FORM_TXT;
        if (path.endsWith(".cls")) return VALID_CLS;
        throw new Error("ENOENT");
      }),
    });
    const adapter = new VbaFormsLintAdapter(fs);

    const result = await adapter.lintFormCode({
      destinationRoot: "C:/repo",
      moduleNames: ["Form_frmMain", "Report_rptMain"],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as SuccessData;
      expect(data.summary.formsScanned).toBe(2);
    }
  });

  it("scans directories and lints all forms/reports when no filter is provided", async () => {
    const fs = mockFs({
      readdir: vi.fn().mockImplementation(async (dir: string) => {
        if (dir.endsWith("forms"))
          return ["Form_frm1.form.txt", "Form_frm2.form.txt", "some_other.txt"];
        if (dir.endsWith("reports")) return ["Report_rpt1.report.txt"];
        return [];
      }),
      readFile: vi.fn().mockImplementation(async (path: string) => {
        if (path.endsWith(".form.txt") || path.endsWith(".report.txt")) return VALID_FORM_TXT;
        if (path.endsWith(".cls")) return VALID_CLS;
        throw new Error("ENOENT");
      }),
    });
    const adapter = new VbaFormsLintAdapter(fs);

    const result = await adapter.lintFormCode({
      destinationRoot: "C:/repo",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as SuccessData;
      expect(data.summary.formsScanned).toBe(3); // Form_frm1, Form_frm2, Report_rpt1
    }
  });

  it("handles directory absent gracefully", async () => {
    const fs = mockFs({
      readdir: vi.fn().mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" })),
    });
    const adapter = new VbaFormsLintAdapter(fs);

    const result = await adapter.lintFormCode({
      destinationRoot: "C:/repo",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as SuccessData;
      expect(data.summary.formsScanned).toBe(0);
    }
  });

  it("captures read errors of formTxt as errors in diagnostics", async () => {
    const readCounts: Record<string, number> = {};
    const fs = mockFs({
      readdir: vi.fn().mockResolvedValue(["Form_frm1.form.txt"]),
      readFile: vi.fn().mockImplementation(async (path: string) => {
        readCounts[path] = (readCounts[path] || 0) + 1;
        if (path.endsWith(".form.txt")) {
          if (readCounts[path] === 1) return VALID_FORM_TXT;
          throw new Error("Permission Denied");
        }
        throw new Error("ENOENT");
      }),
    });
    const adapter = new VbaFormsLintAdapter(fs);

    const result = await adapter.lintFormCode({
      destinationRoot: "C:/repo",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as SuccessData;
      expect(data.summary.formsScanned).toBe(1);
      expect(data.summary.errorsCount).toBe(1);
      expect(data.diagnostics[0]?.severity).toBe("error");
      expect(data.diagnostics[0]?.message).toContain("Permission Denied");
    }
  });

  it("captures parse errors of formTxt as errors in diagnostics", async () => {
    const fs = mockFs({
      readFile: vi.fn().mockImplementation(async (path: string) => {
        if (path.endsWith(".form.txt")) return "CORRUPT CONTENT";
        throw new Error("ENOENT");
      }),
    });
    const adapter = new VbaFormsLintAdapter(fs);

    const result = await adapter.lintFormCode({
      destinationRoot: "C:/repo",
      formName: "Form_frmMain",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as SuccessData;
      expect(data.summary.errorsCount).toBe(1);
      expect(data.diagnostics[0]?.severity).toBe("error");
      expect(data.diagnostics[0]?.message).toContain("Failed to parse");
    }
  });

  it("allows setting specific rule subsets", async () => {
    const fs = mockFs({
      readFile: vi.fn().mockImplementation(async (path: string) => {
        if (path.endsWith(".form.txt")) return VALID_FORM_TXT;
        if (path.endsWith(".cls")) return VALID_CLS;
        throw new Error("ENOENT");
      }),
    });
    const adapter = new VbaFormsLintAdapter(fs);

    const result = await adapter.lintFormCode({
      destinationRoot: "C:/repo",
      formName: "Form_frmMain",
      rules: ["form-control-binding"],
    });

    expect(result.ok).toBe(true);
  });

  describe("nodeLintFileSystem production port", () => {
    it("exercises production filesystem methods using a temp directory", async () => {
      const adapter = new VbaFormsLintAdapter();
      const fsPort = (adapter as unknown as { fileSystem: FormFileSystemPort }).fileSystem;
      expect(fsPort).toBeDefined();

      const tempDir = join(__dirname, `temp_port_test_${Date.now()}`);

      try {
        // mkdir
        await fsPort.mkdir(tempDir, { recursive: true });

        // writeFile
        const testFile = join(tempDir, "test.txt");
        await fsPort.writeFile(testFile, "Hello World", "utf8");

        // readFile
        const content = await fsPort.readFile(testFile);
        expect(content).toBe("Hello World");

        // write & readJson
        const jsonFile = join(tempDir, "test.json");
        await fsPort.writeFile(jsonFile, JSON.stringify({ a: 123 }), "utf8");
        const json = (await fsPort.readJson(jsonFile)) as { a: number };
        expect(json.a).toBe(123);

        // readJson invalid format
        await fsPort.writeFile(jsonFile, "invalid json", "utf8");
        await expect(fsPort.readJson(jsonFile)).rejects.toThrow("Invalid JSON file");

        // readdir
        const entries = await fsPort.readdir(tempDir);
        expect(entries).toContain("test.txt");
        expect(entries).toContain("test.json");
      } finally {
        const { rmSync } = await import("node:fs");
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
