import { describe, expect, it, vi } from "vitest";
import {
  VbaFormsAdapter,
  type VbaFormsOrchestrator,
} from "../../../src/adapters/vba-sync/vba-forms-adapter";
import { successResult } from "../../../src/core/contracts/index";
import type { FormFileSystemPort } from "../../../src/core/services/vba-form-service";

// apply_form_design_plan must write values through the same typed serializer
// as form_set_properties: MCP `properties` maps only carry strings, so a
// numeric string for a numeric property ("7500") is written unquoted, and a
// value that does not fit the property type is refused with
// FORM_PROPERTY_VALUE_INVALID.
const FORM = `Version =21
Checksum =123456789
Begin Form
    Begin
        Begin TextBox
            Name ="txtName"
            Left =300
            Top =400
            Width =1000
        End
    End
End
`;

const sourceContract = {
  formName: "Customer",
  formEvents: [],
  unmappedEvidence: [],
  warnings: [],
  controls: [
    {
      name: "txtName",
      type: "TextBox",
      role: "input" as const,
      events: [],
      bindings: [],
      codegraphEvidence: [],
    },
  ],
};

type Kind = "add-control" | "move-control" | "set-property";

const plan = (kind: Kind, target: string, params: Record<string, unknown>) => ({
  formName: "Customer",
  sourceContract,
  operations: [{ kind, target, intent: kind, params, preserves: [] }],
  warnings: [],
});

function makeAdapter() {
  const writeFile = vi.fn().mockResolvedValue(undefined);
  const orchestrator: VbaFormsOrchestrator = {
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
    executeMappedTool: vi.fn().mockResolvedValue(successResult({ imported: true })),
  };
  const fs: FormFileSystemPort = {
    mkdir: vi.fn(),
    readdir: vi.fn(),
    readFile: vi.fn().mockResolvedValue(FORM),
    readJson: vi.fn(),
    writeFile,
  };
  return { adapter: new VbaFormsAdapter(orchestrator, fs), writeFile };
}

async function dryRun(kind: Kind, target: string, params: Record<string, unknown>) {
  const { adapter, writeFile } = makeAdapter();
  const result = await adapter.execute("apply_form_design_plan", {
    sourcePath: "C:/repo/forms/Form_Customer.form.txt",
    plan: plan(kind, target, params),
    dryRun: true,
  });
  expect(writeFile).not.toHaveBeenCalled();
  return result;
}

function sourceOf(result: Awaited<ReturnType<typeof dryRun>>): string {
  expect(result.ok).toBe(true);
  return result.ok ? String((result.data as { source: string }).source) : "";
}

describe("apply_form_design_plan — typed property values", () => {
  it("set-property writes a numeric string for a twip property unquoted", async () => {
    const source = sourceOf(
      await dryRun("set-property", "txtName", { property: "Width", value: "7500" }),
    );
    expect(source).toContain("Width =7500");
    expect(source).not.toContain('Width ="7500"');
  });

  it("set-property still accepts a JS number for a twip property", async () => {
    const source = sourceOf(
      await dryRun("set-property", "txtName", { property: "Width", value: 7500 }),
    );
    expect(source).toContain("Width =7500");
  });

  it("set-property refuses a value that does not fit the property type", async () => {
    const result = await dryRun("set-property", "txtName", { property: "Width", value: "abc" });
    expect(result).toMatchObject({
      ok: false,
      error: expect.objectContaining({
        code: "FORM_PROPERTY_VALUE_INVALID",
        details: expect.objectContaining({
          controlName: "txtName",
          property: "Width",
          expectedType: "twip",
          actualType: "string",
        }),
      }),
    });
  });

  it("move-control writes numeric-string coordinates unquoted", async () => {
    const source = sourceOf(await dryRun("move-control", "txtName", { left: "800", top: "900" }));
    expect(source).toContain("Left =800");
    expect(source).toContain("Top =900");
  });

  it("move-control still accepts JS number coordinates", async () => {
    const source = sourceOf(await dryRun("move-control", "txtName", { left: 800, top: 900 }));
    expect(source).toContain("Left =800");
    expect(source).toContain("Top =900");
  });

  it("move-control refuses a coordinate that is not a whole number", async () => {
    const result = await dryRun("move-control", "txtName", { left: "abc" });
    expect(result).toMatchObject({
      ok: false,
      error: expect.objectContaining({
        code: "FORM_PROPERTY_VALUE_INVALID",
        details: expect.objectContaining({ property: "Left", expectedType: "twip" }),
      }),
    });
  });

  it("add-control writes numeric-string properties unquoted", async () => {
    const source = sourceOf(
      await dryRun("add-control", "txtNew", {
        type: "TextBox",
        properties: { Left: "100", Width: "1200", Caption: "Total" },
      }),
    );
    expect(source).toContain("Width =1200");
    expect(source).toContain("Left =100");
    expect(source).toContain('Caption ="Total"');
  });

  it("add-control refuses a property value that does not fit its type", async () => {
    const result = await dryRun("add-control", "txtNew", {
      type: "TextBox",
      properties: { Width: "wide" },
    });
    expect(result).toMatchObject({
      ok: false,
      error: expect.objectContaining({ code: "FORM_PROPERTY_VALUE_INVALID" }),
    });
  });
});
