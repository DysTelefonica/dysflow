import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { VBA_SYNC_TOOL_SCHEMAS } from "../../../src/adapters/mcp/schemas/vba-sync-schemas";
import {
  VbaFormsAdapter,
  type VbaFormsOrchestrator,
} from "../../../src/adapters/vba-sync/vba-forms-adapter";
import { failureResult, successResult } from "../../../src/core/contracts/index";
import type { FormNode } from "../../../src/core/models/form-ir";
import {
  cloneFormFromTemplate,
  parseFormTxt,
  serializeFormTxt,
} from "../../../src/core/services/form-ir-service";
import type { FormFileSystemPort } from "../../../src/core/services/vba-form-service";

// ---------------------------------------------------------------------------
// Helpers (mirror vba-forms-adapter-mutation.test.ts).
// ---------------------------------------------------------------------------

const FORM_WITH_GRID_AND_BUTTON = `Version =21
Checksum =123456789
Begin Form
    Format =255
    PrtDevMode = Begin
        0x01020304
    End
    OnOpen ="[Event Procedure]"
    Begin
        Begin TextBox
            Name ="txtName"
            Left =100
            Top =200
            Width =3000
            Height =400
            LayoutCachedLeft =100
            LayoutCachedTop =200
            LayoutCachedWidth =3000
            LayoutCachedHeight =400
            OnClick ="[Event Procedure]"
            Format ="@"
        End
        Begin CommandButton
            Name ="cmdSave"
            Caption ="Save"
            Left =3500
            Top =5000
            Width =1500
            Height =500
        End
    End
End
`;

const FORM_WITH_KPI_IMAGE_CONTROL = `Version =21
Checksum =987654321
Begin Form
    Begin
        Begin CommandButton
            Left =4287
            Top =6992
            Width =448
            Height =448
            Name ="cmdTile5Excel"
            Caption ="Calcular"
            FontName ="Aptos"
            FontSize =10
            FontWeight =700
            ForeColor =255
            ControlTipText ="Calculate KPI"
            OnClick ="[Event Procedure]"
            Picture ="Excel_50x50.png"
            TabIndex =8
            TabStop =0
            GUID = Begin
                0x6efe25de7eddc44e992c942cfc8e983f
            End
            ImageData = Begin
                0x89504e470d0a1a0a0000000d4948445200000020000000200806000000737a7a
                0xf40000000467414d410000b18f0bfc6105000000097048597300000ec400000e
                0xc401952b0e1b0000001a4944415478da6364f8cf800da660c409a30c46291865
                0x306a30ca60d400000059f7013f2749be0000000049454e44ae426082
            End
        End
    End
End`;

function findControlNode(source: string, controlName: string): FormNode {
  const ir = parseFormTxt(source, { name: "Customer" });
  const visit = (node: FormNode): FormNode | undefined => {
    const name = node.entries.find((entry) => entry.kind === "scalar" && entry.key === "Name");
    if (name?.kind === "scalar" && name.value.replace(/^"|"$/g, "") === controlName) {
      return node;
    }
    for (const child of node.children) {
      const found = visit(child);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  const found = visit(ir.root);
  if (found === undefined) throw new Error(`Control not found in fixture: ${controlName}`);
  return found;
}

function scalarValue(node: FormNode, key: string): string {
  const entry = node.entries.find(
    (candidate) => candidate.kind === "scalar" && candidate.key === key,
  );
  if (entry?.kind !== "scalar") throw new Error(`Missing scalar ${key}`);
  return entry.value;
}

function blobHex(node: FormNode, key: string): string {
  const entry = node.entries.find(
    (candidate) => candidate.kind === "blob" && candidate.key === key,
  );
  if (entry?.kind !== "blob") throw new Error(`Missing blob ${key}`);
  return entry.lines
    .join("")
    .replace(/0x/gi, "")
    .replace(/[^0-9a-f]/gi, "");
}

function first32ByteHash(node: FormNode): string {
  const first32Bytes = Buffer.from(blobHex(node, "ImageData").slice(0, 64), "hex");
  if (first32Bytes.byteLength !== 32) throw new Error("ImageData fixture has fewer than 32 bytes");
  return createHash("sha256").update(first32Bytes).digest("hex");
}

function makeOrchestrator(importResult = successResult({ imported: true })): VbaFormsOrchestrator {
  return {
    executor: vi.fn(),
    env: { DYSFLOW_HOME: "C:/runtime/dysflow" },
    cwd: "C:/repo",
    resolveExecutionTarget: vi.fn().mockResolvedValue(
      successResult({
        accessPath: "C:/repo/App.accdb",
        destinationRoot: "C:/repo",
        projectRoot: "C:/repo",
        timeoutMs: 30000,
        configSource: "explicit-request",
      }),
    ),
    validateStrictContext: vi.fn(() => successResult(undefined)),
    executeMappedTool: vi.fn().mockResolvedValue(importResult),
  };
}

function mockFs(overrides: Partial<FormFileSystemPort> = {}): FormFileSystemPort {
  return {
    mkdir: vi.fn(),
    readdir: vi.fn(),
    readFile: vi.fn().mockResolvedValue(FORM_WITH_GRID_AND_BUTTON),
    readJson: vi.fn(),
    writeFile: vi.fn(),
    ...overrides,
  };
}

async function duplicateKpiControl(
  overrides: Record<string, string | number | boolean> = {},
): Promise<string> {
  const adapter = new VbaFormsAdapter(
    makeOrchestrator(),
    mockFs({ readFile: vi.fn().mockResolvedValue(FORM_WITH_KPI_IMAGE_CONTROL) }),
  );
  const result = await adapter.execute("form_duplicate_control", {
    sourcePath: "C:/repo/forms/Form_Indicador.form.txt",
    sourceControlName: "cmdTile5Excel",
    newName: "cmdTile6Excel",
    overrides,
    dryRun: true,
  });
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return String((result.data as { source: string }).source);
}

// ---------------------------------------------------------------------------
// F1 — `form_set_properties` (Issue #872) — atomic batch property writes.
// Mirrors form_set_property's applyGuardedFormWrite seam with a richer
// `properties` map and the additional contract that LayoutCached* are
// silently stripped from the request.
// ---------------------------------------------------------------------------

describe("VbaFormsAdapter — form_set_properties (issue #872 F1)", () => {
  it("handles form_set_properties", () => {
    expect(VbaFormsAdapter.handles("form_set_properties")).toBe(true);
  });

  it("dry-run returns the planned source WITHOUT writing the file or invoking import_modules", async () => {
    const orchestrator = makeOrchestrator();
    const writeFile = vi.fn();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_set_properties", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      controlName: "cmdSave",
      properties: { Caption: '"Apply"', Left: 800, Top: 900, Width: 1500, Height: 500 },
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({ mode: "dry-run", changedControlName: "cmdSave" });
      const source = String((result.data as { source: string }).source);
      expect(source).toContain('Caption ="Apply"');
      expect(source).toContain("Left =800");
      expect(source).toContain("Top =900");
    }
    expect(writeFile).not.toHaveBeenCalled();
    expect(orchestrator.executeMappedTool).not.toHaveBeenCalled();
  });

  it("apply writes the file and queues import_modules as the LoadFromText gate", async () => {
    const orchestrator = makeOrchestrator();
    const writeFile = vi.fn();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_set_properties", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      controlName: "txtName",
      properties: { Left: 5000, Top: 6000 },
      apply: true,
    });

    expect(result.ok).toBe(true);
    expect(writeFile).toHaveBeenCalledWith(
      "C:\\repo\\forms\\Form_Customer.form.txt",
      expect.stringContaining("Left =5000"),
      "utf8",
    );
    expect(orchestrator.executeMappedTool).toHaveBeenCalledWith(
      "import_modules",
      expect.objectContaining({ moduleNames: ["Customer"], apply: true, importMode: "Auto" }),
      expect.any(Object),
    );
  });

  it("strips LayoutCached* keys from the response (issue #872 F3)", async () => {
    const orchestrator = makeOrchestrator();
    const writeFile = vi.fn();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    // Caller passes ALL LayoutCached* keys plus one real key (Caption).
    // The real key applies; the LayoutCached* keys must NOT appear in
    // the serialized source AND must NOT bump changedControlName.
    const result = await adapter.execute("form_set_properties", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      controlName: "txtName",
      properties: {
        Caption: '"Renamed"',
        LayoutCachedLeft: 999,
        LayoutCachedTop: 999,
        LayoutCachedWidth: 999,
        LayoutCachedHeight: 999,
      },
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const source = String((result.data as { source: string }).source);
      // Real key applied.
      expect(source).toContain('Caption ="Renamed"');
      // LayoutCached* keys must NOT have been written into the serialized
      // source — they were silently stripped, not stored, not serialized.
      expect(source).not.toContain("LayoutCachedLeft =999");
      expect(source).not.toContain("LayoutCachedTop =999");
      expect(source).not.toContain("LayoutCachedWidth =999");
      expect(source).not.toContain("LayoutCachedHeight =999");
      // The original LayoutCached* on the file (set by parseFormTxt) are
      // also dropped because the control's entries have been replaced with
      // the new upsertScalar walk (the property map is rebuilt from the
      // upserted entries only). The contract is "we never SET LayoutCached*,
      // Access regenerates them on the next save" — so the serialized
      // form should be free of LayoutCached* entirely on this path.
    }
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("aborts the batch when a protected key is present (no IR written, FORM_PROPERTY_PROTECTED envelope)", async () => {
    const orchestrator = makeOrchestrator();
    const writeFile = vi.fn();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_set_properties", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      controlName: "txtName",
      properties: { Left: 100, Name: '"txtOther"' }, // protected key
      apply: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORM_PROPERTY_PROTECTED");
    }
    expect(writeFile).not.toHaveBeenCalled();
    expect(orchestrator.executeMappedTool).not.toHaveBeenCalled();
  });

  it("aborts the batch when the target control is missing (no IR written, FORM_CONTROL_NOT_FOUND envelope)", async () => {
    const orchestrator = makeOrchestrator();
    const writeFile = vi.fn();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_set_properties", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      controlName: "missingControl",
      properties: { Left: 100 },
      apply: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORM_CONTROL_NOT_FOUND");
    }
    expect(writeFile).not.toHaveBeenCalled();
    expect(orchestrator.executeMappedTool).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// F2 — `form_duplicate_control` (Issue #872) — clone an existing control
// under a new name, optionally overriding geometry and into a different
// section.
// ---------------------------------------------------------------------------

describe("VbaFormsAdapter — form_duplicate_control (issue #872 F2)", () => {
  it("handles form_duplicate_control", () => {
    expect(VbaFormsAdapter.handles("form_duplicate_control")).toBe(true);
  });

  it("dry-run previews the cloned source without writing or importing", async () => {
    const orchestrator = makeOrchestrator();
    const writeFile = vi.fn();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_duplicate_control", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      sourceControlName: "txtName",
      newName: "txtCustomerName",
      overrides: { Left: 7777, Top: 8888 },
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({
        mode: "dry-run",
        changedControlName: "txtCustomerName",
      });
      const source = String((result.data as { source: string }).source);
      expect(source).toContain('Name ="txtCustomerName"');
      expect(source).toContain("Left =7777");
      expect(source).toContain("Top =8888");
      // Original is still present.
      expect(source).toContain('Name ="txtName"');
      // A source without a GUID remains without one: #1032 changes only an
      // existing identity block and does not invent unrelated headers.
      expect(
        findControlNode(source, "txtCustomerName").entries.some(
          (entry) => entry.kind === "blob" && entry.key === "GUID",
        ),
      ).toBe(false);
    }
    expect(writeFile).not.toHaveBeenCalled();
    expect(orchestrator.executeMappedTool).not.toHaveBeenCalled();
  });

  it("apply writes the cloned source and queues import_modules", async () => {
    const orchestrator = makeOrchestrator();
    const writeFile = vi.fn();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_duplicate_control", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      sourceControlName: "cmdSave",
      newName: "cmdSave2",
      overrides: { Caption: '"Save 2"' },
      apply: true,
    });

    expect(result.ok).toBe(true);
    expect(writeFile).toHaveBeenCalledWith(
      "C:\\repo\\forms\\Form_Customer.form.txt",
      expect.stringContaining('Name ="cmdSave2"'),
      "utf8",
    );
    expect(orchestrator.executeMappedTool).toHaveBeenCalledWith(
      "import_modules",
      expect.objectContaining({ moduleNames: ["Customer"], apply: true, importMode: "Auto" }),
      expect.any(Object),
    );
  });

  it("preserves the source's OnClick = [Event Procedure] binding verbatim (the duplicated control is pre-wired)", async () => {
    const orchestrator = makeOrchestrator();
    const writeFile = vi.fn();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_duplicate_control", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      sourceControlName: "txtName", // has OnClick = [Event Procedure]
      newName: "txtName2",
      apply: true,
    });

    expect(result.ok).toBe(true);
    expect(writeFile).toHaveBeenCalledWith(
      "C:\\repo\\forms\\Form_Customer.form.txt",
      expect.stringContaining('Name ="txtName2"'),
      "utf8",
    );
    const serializedSource = String(writeFile.mock.calls[0]?.[1] ?? "");
    // The duplicated control carries its event binding verbatim. The
    // [Event Procedure] string must appear TWICE — once on the original
    // txtName, once on the duplicated txtName2.
    const eventBindingMatches = serializedSource.match(/OnClick ="\[Event Procedure\]"/g) ?? [];
    expect(eventBindingMatches.length, "both original + duplicate carry the binding").toBe(2);
  });

  it("rejects with FORM_DUPLICATE_SOURCE_MISSING when source control is unknown (no IR written)", async () => {
    const orchestrator = makeOrchestrator();
    const writeFile = vi.fn();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_duplicate_control", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      sourceControlName: "missingSource",
      newName: "clone1",
      apply: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORM_DUPLICATE_SOURCE_MISSING");
    }
    expect(writeFile).not.toHaveBeenCalled();
    expect(orchestrator.executeMappedTool).not.toHaveBeenCalled();
  });

  it("rejects with FORM_DUPLICATE_CONTROL when newName already exists (no IR written)", async () => {
    const orchestrator = makeOrchestrator();
    const writeFile = vi.fn();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_duplicate_control", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      sourceControlName: "txtName",
      newName: "cmdSave", // already exists in the form
      apply: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORM_DUPLICATE_CONTROL");
    }
    expect(writeFile).not.toHaveBeenCalled();
    expect(orchestrator.executeMappedTool).not.toHaveBeenCalled();
  });

  it("strips LayoutCached* keys from overrides (issue #872 F3)", async () => {
    const orchestrator = makeOrchestrator();
    const writeFile = vi.fn();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_duplicate_control", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      sourceControlName: "cmdSave",
      newName: "cmdSave3",
      overrides: {
        Caption: '"Save 3"',
        LayoutCachedLeft: 999,
        LayoutCachedWidth: 999,
      },
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const source = String((result.data as { source: string }).source);
      // The Caption override applied.
      expect(source).toContain('Name ="cmdSave3"');
      expect(source).toContain('Caption ="Save 3"');
      // LayoutCached* must NOT have been written into the serialized form.
      expect(source).not.toContain("LayoutCachedLeft =999");
      expect(source).not.toContain("LayoutCachedWidth =999");
    }
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("aborts the batch when an override is a protected key (FORM_PROPERTY_PROTECTED envelope)", async () => {
    const orchestrator = makeOrchestrator();
    const writeFile = vi.fn();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_duplicate_control", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      sourceControlName: "cmdSave",
      newName: "cmdSaveProtected",
      overrides: { Format: '"!"' }, // protected metadata key
      apply: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORM_PROPERTY_PROTECTED");
    }
    expect(writeFile).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Issue #1032 — control clone identity regeneration without preservation loss.
// These six regression atoms mirror the consumer parity fixture from #1032.
// ---------------------------------------------------------------------------

describe("VbaFormsAdapter — form_duplicate_control GUID regeneration (#1032)", () => {
  it("regenerates the cloned control GUID by default and publishes that contract in the schema", async () => {
    const clonedSource = await duplicateKpiControl();
    const repeatedCloneSource = await duplicateKpiControl();
    const sourceGuid = blobHex(findControlNode(clonedSource, "cmdTile5Excel"), "GUID");
    const clonedGuid = blobHex(findControlNode(clonedSource, "cmdTile6Excel"), "GUID");
    const repeatedGuid = blobHex(findControlNode(repeatedCloneSource, "cmdTile6Excel"), "GUID");

    expect(clonedGuid).toMatch(/^[0-9a-f]{32}$/i);
    expect(clonedGuid.toLowerCase()).not.toBe(sourceGuid.toLowerCase());
    expect(repeatedGuid).toBe(clonedGuid);
    expect(VBA_SYNC_TOOL_SCHEMAS.form_duplicate_control.properties.newName).toMatchObject({
      description: expect.stringMatching(/fresh GUID|regenerat(?:e|ed|es|ing).*GUID/i),
    });
  });

  it("preserves type, geometry, fonts, copy, events, tab behavior, and ImageData bytes", async () => {
    const clonedSource = await duplicateKpiControl();
    const source = findControlNode(clonedSource, "cmdTile5Excel");
    const clone = findControlNode(clonedSource, "cmdTile6Excel");
    const preservedScalars = [
      "Left",
      "Top",
      "Width",
      "Height",
      "FontSize",
      "FontWeight",
      "ForeColor",
      "FontName",
      "Caption",
      "Picture",
      "ControlTipText",
      "OnClick",
      "TabIndex",
      "TabStop",
    ];

    expect(clone.blockType).toBe(source.blockType);
    expect(
      Object.fromEntries(preservedScalars.map((key) => [key, scalarValue(clone, key)])),
    ).toEqual(Object.fromEntries(preservedScalars.map((key) => [key, scalarValue(source, key)])));
    expect(first32ByteHash(clone)).toBe(first32ByteHash(source));
  });

  it("round-trips the cloned ImageData block byte-equal through form_serialize and compare_form", async () => {
    const clonedSource = await duplicateKpiControl();
    const sourceImageData = blobHex(findControlNode(clonedSource, "cmdTile5Excel"), "ImageData");
    const clonedImageData = blobHex(findControlNode(clonedSource, "cmdTile6Excel"), "ImageData");
    const roundTripped = serializeFormTxt(parseFormTxt(clonedSource, { name: "Indicador" }));
    const readFile = vi.fn().mockResolvedValue(roundTripped);
    const adapter = new VbaFormsAdapter(makeOrchestrator(), mockFs({ readFile }));

    const serialized = await adapter.execute("form_serialize", {
      sourcePath: "C:/repo/forms/Form_Indicador-clone.form.txt",
      outputMode: "full",
    });
    const compared = await adapter.execute("compare_form", {
      sourcePath: "C:/repo/forms/Form_Indicador-clone.form.txt",
      targetPath: "C:/repo/forms/Form_Indicador-roundtrip.form.txt",
    });

    expect(clonedImageData).toBe(sourceImageData);
    expect(roundTripped).toBe(clonedSource);
    expect(serialized.ok).toBe(true);
    if (serialized.ok) expect(serialized.data).toMatchObject({ byteEqual: true, byteDiff: 0 });
    expect(compared.ok).toBe(true);
    if (compared.ok) {
      expect(compared.data).toMatchObject({ matched: true, driftDetected: false, drifts: [] });
    }
  });

  it("applies overrides while every unspecified source property remains equal", async () => {
    const clonedSource = await duplicateKpiControl({
      Left: 9123,
      Top: 7100,
      Caption: '"Recalculate"',
      TabIndex: 9,
    });
    const source = findControlNode(clonedSource, "cmdTile5Excel");
    const clone = findControlNode(clonedSource, "cmdTile6Excel");

    expect(scalarValue(clone, "Left")).toBe("9123");
    expect(scalarValue(clone, "Top")).toBe("7100");
    expect(scalarValue(clone, "Caption")).toBe('"Recalculate"');
    expect(scalarValue(clone, "TabIndex")).toBe("9");
    for (const key of [
      "Width",
      "Height",
      "FontSize",
      "FontWeight",
      "ForeColor",
      "FontName",
      "Picture",
      "ControlTipText",
      "OnClick",
      "TabStop",
    ]) {
      expect(scalarValue(clone, key), key).toBe(scalarValue(source, key));
    }
    expect(blobHex(clone, "ImageData")).toBe(blobHex(source, "ImageData"));
  });

  it("keeps #600 continuity by stripping the form GUID before create_form_from_template import", () => {
    const sourceIr = parseFormTxt(
      `Version =21
Begin Form
    GUID = Begin
        0x00112233445566778899aabbccddeeff
    End
    Caption ="Template"
End`,
      { name: "Template" },
    );

    const cloned = cloneFormFromTemplate(sourceIr, {
      tokenMap: {},
      targetFormName: "TemplateClone",
    });

    expect(cloned.source).not.toContain("GUID = Begin");
    expect(serializeFormTxt(sourceIr)).toContain("0x00112233445566778899aabbccddeeff");
  });

  it("rolls back apply:true byte-equal when the guarded import fails", async () => {
    const sourcePath = "C:\\repo\\forms\\Form_Indicador.form.txt";
    const originalBytes = Buffer.from(FORM_WITH_KPI_IMAGE_CONTROL, "utf8");
    let currentBytes = Buffer.from(originalBytes);
    const writeFile = vi.fn(async (_path: string, value: string) => {
      currentBytes = Buffer.from(value, "utf8");
    });
    const writeBytes = vi.fn(async (_path: string, value: Uint8Array) => {
      currentBytes = Buffer.from(value);
    });
    const fs = mockFs({
      readFile: vi.fn(async () => currentBytes.toString("utf8")),
      readBytes: vi.fn(async () => new Uint8Array(currentBytes)),
      writeFile,
      writeBytes,
    });
    const orchestrator = makeOrchestrator(
      failureResult({
        code: "VBA_IMPORT_FAILED",
        message: "forced #1032 atomic rollback failure",
        retryable: false,
      }),
    );
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_duplicate_control", {
      sourcePath,
      sourceControlName: "cmdTile5Excel",
      newName: "cmdTile6Excel",
      apply: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({
        code: "FORM_IMPORT_GATE_FAILED",
        details: { rollback: { attempted: true, applied: true, targetExisted: true } },
      });
    }
    expect(Buffer.compare(currentBytes, originalBytes)).toBe(0);
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(writeBytes).toHaveBeenCalledTimes(1);
    expect(writeBytes).toHaveBeenCalledWith(sourcePath, expect.any(Uint8Array));
    expect(orchestrator.executeMappedTool).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Negative — loadFromText gate failures surface as FORM_IMPORT_GATE_FAILED.
// ---------------------------------------------------------------------------

describe("VbaFormsAdapter — F1/F2 import-gate failure surfaces as FORM_IMPORT_GATE_FAILED", () => {
  it("form_set_properties surfaces FORM_IMPORT_GATE_FAILED on apply when the loadFromText gate fails", async () => {
    const orchestrator = makeOrchestrator(
      failureResult({
        code: "FORM_IMPORT_GATE_FAILED",
        message: "LoadFromText rejected",
        retryable: false,
      }),
    );
    const writeFile = vi.fn();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_set_properties", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      controlName: "txtName",
      properties: { Left: 1 },
      apply: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORM_IMPORT_GATE_FAILED");
    }
  });

  it("form_duplicate_control surfaces FORM_IMPORT_GATE_FAILED on apply when the loadFromText gate fails", async () => {
    const orchestrator = makeOrchestrator(
      failureResult({
        code: "FORM_IMPORT_GATE_FAILED",
        message: "LoadFromText rejected",
        retryable: false,
      }),
    );
    const writeFile = vi.fn();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_duplicate_control", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      sourceControlName: "txtName",
      newName: "txtNameFailed",
      apply: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORM_IMPORT_GATE_FAILED");
    }
  });
});
