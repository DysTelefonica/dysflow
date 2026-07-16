import { describe, expect, it, vi } from "vitest";
import {
  VbaFormsAdapter,
  type VbaFormsOrchestrator,
} from "../../../src/adapters/vba-sync/vba-forms-adapter";
import { successResult } from "../../../src/core/contracts/index";
import type { FormFileSystemPort } from "../../../src/core/services/vba-form-service";

// ---------------------------------------------------------------------------
// Helpers (mirrors vba-forms-adapter-render.test.ts)
// ---------------------------------------------------------------------------

function makeOrchestrator(): VbaFormsOrchestrator {
  return {
    executor: vi.fn(),
    env: {},
    cwd: "C:/repo",
    resolveExecutionTarget: vi.fn(),
    validateStrictContext: vi.fn(),
    executeMappedTool: vi.fn(),
  };
}

function mockFs(overrides: Partial<FormFileSystemPort> = {}): FormFileSystemPort {
  return {
    mkdir: vi.fn(),
    readdir: vi.fn(),
    readFile: vi.fn().mockResolvedValue(""),
    readJson: vi.fn(),
    writeFile: vi.fn(),
    ...overrides,
  };
}

// A small but representative .form.txt — one Detail section, four controls
// that share a Top (alignment), and one pair that overlaps. The fixture is
// tight enough to assert both findings in a single result envelope.
const SAMPLE_FORM = `Version =21
VersionRequired =20
Begin Form
    Caption ="Test"
    Width =20000
    Begin
        Begin Detail
            Begin Label
                Name ="lblA"
                Caption ="A"
                Left =1000
                Top =500
                Width =2000
                Height =400
            End
            Begin CommandButton
                Name ="cmdB"
                Caption ="B"
                Left =3500
                Top =500
                Width =1500
                Height =500
            End
            Begin CommandButton
                Name ="cmdC"
                Caption ="C"
                Left =4000
                Top =2000
                Width =1500
                Height =500
            End
            Begin CommandButton
                Name ="cmdD"
                Caption ="D"
                Left =4200
                Top =2200
                Width =1500
                Height =500
            End
        End
    End
End
`;

// ---------------------------------------------------------------------------
// Tests (#815 — analyze_form_layout adapter wiring)
// ---------------------------------------------------------------------------

describe("VbaFormsAdapter — analyze_form_layout (issue #815)", () => {
  it("handles analyze_form_layout", () => {
    expect(VbaFormsAdapter.handles("analyze_form_layout")).toBe(true);
    // Sibling read-only tools stay handled.
    expect(VbaFormsAdapter.handles("render_form_preview")).toBe(true);
    expect(VbaFormsAdapter.handles("inspect_form")).toBe(true);
    // Unrelated tool not handled.
    expect(VbaFormsAdapter.handles("export_modules")).toBe(false);
  });

  it("returns FORM_SPEC_MISSING when sourcePath is not provided", async () => {
    const fs = mockFs({ readFile: vi.fn() });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("analyze_form_layout", {});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORM_SPEC_MISSING");
    }
  });

  it("returns FORM_NOT_FOUND when the file does not exist", async () => {
    const fs = mockFs({
      readFile: vi.fn().mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" })),
    });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("analyze_form_layout", {
      sourcePath: "C:/repo/forms/Form_Missing.form.txt",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORM_NOT_FOUND");
    }
  });

  it("returns FORM_PARSE_ERROR on malformed input", async () => {
    const fs = mockFs({
      readFile: vi.fn().mockResolvedValue("not a valid form"),
    });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("analyze_form_layout", {
      sourcePath: "C:/repo/forms/Form_Bad.form.txt",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORM_PARSE_ERROR");
    }
  });

  it("returns the geometry findings + control count + section count envelope", async () => {
    const fs = mockFs({ readFile: vi.fn().mockResolvedValue(SAMPLE_FORM) });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("analyze_form_layout", {
      sourcePath: "C:/repo/forms/Form_Test.form.txt",
    });

    expect(result.ok).toBe(true);
    const data = result.ok ? (result.data as Record<string, unknown>) : null;
    expect(data).not.toBeNull();
    if (data === null) throw new Error("data missing");

    expect(data.formName).toBe("Test");
    expect(data.controls).toBe(4);
    expect(data.sections).toBe(1); // Detail
    const findings = data.findings as Array<{ code: string; severity: string }>;
    expect(Array.isArray(findings)).toBe(true);

    // Every finding carries severity "warning" — non-blocking.
    for (const finding of findings) {
      expect(finding.severity).toBe("warning");
    }

    // The fixture has two controls sharing Top=500 → one alignment row.
    const alignment = findings.filter((finding) => finding.code === "FORM_LAYOUT_ALIGNMENT");
    expect(alignment.length).toBeGreaterThanOrEqual(1);

    // The fixture has cmdC/cmdD with overlapping boxes → one overlap finding.
    const overlap = findings.filter((finding) => finding.code === "FORM_LAYOUT_OVERLAP");
    expect(overlap.length).toBeGreaterThanOrEqual(1);
  });

  it("honors alignmentThresholdTwips override", async () => {
    const fs = mockFs({ readFile: vi.fn().mockResolvedValue(SAMPLE_FORM) });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    // lblA (top=500) and cmdB (top=500) — identical Top, alignment fires
    // even with the strictest threshold.
    const strictResult = await adapter.execute("analyze_form_layout", {
      sourcePath: "C:/repo/forms/Form_Test.form.txt",
      alignmentThresholdTwips: 1,
    });
    expect(strictResult.ok).toBe(true);
    if (!strictResult.ok) throw new Error("expected ok");
    const strictFindings = (strictResult.data as { findings: Array<{ code: string }> }).findings;
    const strictAlignment = strictFindings.filter(
      (finding) => finding.code === "FORM_LAYOUT_ALIGNMENT",
    );
    expect(strictAlignment.length).toBeGreaterThanOrEqual(1);

    // Sanity: a generous threshold also flags alignment (lblA / cmdB share
    // Top exactly). The point of this assertion is that the override
    // reaches the lint — the count will not decrease between 1 and 100 for
    // this fixture because the controls share an identical Top.
    const looseResult = await adapter.execute("analyze_form_layout", {
      sourcePath: "C:/repo/forms/Form_Test.form.txt",
      alignmentThresholdTwips: 100,
    });
    expect(looseResult.ok).toBe(true);
    if (!looseResult.ok) throw new Error("expected ok");
    const looseFindings = (looseResult.data as { findings: Array<{ code: string }> }).findings;
    const looseAlignment = looseFindings.filter(
      (finding) => finding.code === "FORM_LAYOUT_ALIGNMENT",
    );
    expect(looseAlignment.length).toBeGreaterThanOrEqual(1);
  });

  it("emits a FORM_LAYOUT_OFF_SECTION finding when sectionBounds + controlSection are supplied", async () => {
    // Place cmdB (default position) far past its declared FormHeader bounds.
    const fs = mockFs({ readFile: vi.fn().mockResolvedValue(SAMPLE_FORM) });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);

    const result = await adapter.execute("analyze_form_layout", {
      sourcePath: "C:/repo/forms/Form_Test.form.txt",
      sectionBounds: {
        Detail: { width: 20000, height: 10000 },
        // Tiny FormHeader — none of the controls fit.
        FormHeader: { width: 500, height: 200 },
      },
      controlSection: {
        lblA: "FormHeader",
        cmdB: "FormHeader",
        cmdC: "Detail",
        cmdD: "Detail",
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    const findings = (result.data as { findings: Array<{ code: string; controlName?: string }> })
      .findings;
    const offSection = findings.filter((finding) => finding.code === "FORM_LAYOUT_OFF_SECTION");
    // lblA and cmdB sit at Left=1000/3500, far past FormHeader width=500.
    expect(offSection.map((f) => f.controlName).sort()).toEqual(["cmdB", "lblA"]);
  });

  it("analyzes the exact successful project candidate snapshot", async () => {
    const reads = new Map<string, number>();
    const fs = mockFs({
      readFile: vi.fn().mockImplementation(async (path: string) => {
        const normalized = path.replace(/\\/g, "/");
        if (normalized !== "C:/repo/src/forms/Form_Test.form.txt") throw new Error("ENOENT");
        const count = (reads.get(normalized) ?? 0) + 1;
        reads.set(normalized, count);
        return count === 1 ? SAMPLE_FORM : "malformed on second read";
      }),
    });
    const orchestrator = makeOrchestrator();
    orchestrator.resolveExecutionTarget = vi.fn().mockResolvedValue({
      ok: true,
      data: { destinationRoot: "C:/repo/src", projectRoot: "C:/repo" },
    });

    const result = await new VbaFormsAdapter(orchestrator, fs).execute("analyze_form_layout", {
      projectId: "test-project",
      formName: "Test",
    });

    expect(result.ok).toBe(true);
    expect(reads.get("C:/repo/src/forms/Form_Test.form.txt")).toBe(1);
    if (result.ok) expect((result.data as { formName: string }).formName).toBe("Test");
  });
});

// Also covers the successResult envelope shape end-to-end (defensive — we
// previously had a regression where the adapter returned `{data: undefined}`
// instead of `{ok: true, data: {...}}` for a missing source path).
describe("VbaFormsAdapter — analyze_form_layout envelope contract", () => {
  it("failure envelope uses the failureResult helper", async () => {
    const fs = mockFs({ readFile: vi.fn() });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), fs);
    const result = await adapter.execute("analyze_form_layout", {});
    expect(result).not.toEqual(successResult({}));
    expect(result.ok).toBe(false);
  });
});
