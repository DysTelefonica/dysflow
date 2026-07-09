import { describe, expect, it, vi } from "vitest";
import {
  VbaFormsAdapter,
  type VbaFormsOrchestrator,
} from "../../../src/adapters/vba-sync/vba-forms-adapter";
import type { FormFileSystemPort } from "../../../src/core/services/vba-form-service";

const SIMPLE_FORM = `Version =21
Begin Form
    OnOpen ="[Event Procedure]"
    Begin
        Begin CommandButton
            Name ="cmdSave"
            Caption ="Save"
            OnClick ="[Event Procedure]"
        End
    End
End
`;

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
    readFile: vi.fn().mockResolvedValue(SIMPLE_FORM),
    readJson: vi.fn(),
    writeFile: vi.fn(),
    ...overrides,
  };
}

describe("VbaFormsAdapter AI form UI tools", () => {
  it("handles the six AI form UI builder tools", () => {
    for (const name of [
      "analyze_form_ui",
      "map_form_behavior",
      "generate_form_design_plan",
      "apply_form_design_plan",
      "copy_form_ui_pattern",
      "verify_form_ui",
    ]) {
      expect(VbaFormsAdapter.handles(name)).toBe(true);
    }
  });

  it("analyzes a form from sourcePath without writing files", async () => {
    const writeFile = vi.fn();
    const adapter = new VbaFormsAdapter(makeOrchestrator(), mockFs({ writeFile }));

    const result = await adapter.execute("analyze_form_ui", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({
        formName: "Customer",
        controls: [expect.objectContaining({ name: "cmdSave", role: "action" })],
      });
    }
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("maps behavior from caller-supplied CodeGraph evidence and does not invoke MCP discovery", async () => {
    const orchestrator = makeOrchestrator();
    const adapter = new VbaFormsAdapter(orchestrator, mockFs());

    const result = await adapter.execute("map_form_behavior", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      codegraphEvidence: [
        { handler: "cmdSave_Click", callPath: ["cmdSave_Click", "SaveCustomer"] },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({
        controls: [
          expect.objectContaining({
            name: "cmdSave",
            codegraphEvidence: [expect.objectContaining({ handler: "cmdSave_Click" })],
          }),
        ],
      });
    }
    expect(orchestrator.executeMappedTool).not.toHaveBeenCalled();
  });

  it("applies design plans in memory without writing form source files", async () => {
    const writeFile = vi.fn();
    const adapter = new VbaFormsAdapter(makeOrchestrator(), mockFs({ writeFile }));
    const sourceContract = {
      formName: "Customer",
      formEvents: [],
      unmappedEvidence: [],
      warnings: [],
      controls: [
        {
          name: "cmdSave",
          type: "CommandButton",
          role: "action",
          events: ["OnClick"],
          bindings: [],
          codegraphEvidence: [],
        },
      ],
    };
    const plan = {
      formName: "Customer",
      sourceContract,
      operations: [
        {
          kind: "note",
          target: "cmdSave",
          intent: "Keep save visible",
          params: {},
          preserves: ["OnClick"],
        },
      ],
      warnings: [],
    };

    const dryRun = await adapter.execute("apply_form_design_plan", { plan });
    expect(dryRun.ok).toBe(true);
    expect(writeFile).not.toHaveBeenCalled();

    const applied = await adapter.execute("apply_form_design_plan", {
      targetPath: "C:/repo/forms/Form_Customer.form.txt",
      plan,
      apply: true,
    });
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      expect(applied.data).toMatchObject({
        mode: "apply",
        filesystemApplied: false,
        importGate: "not-run",
      });
    }
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("ignores malformed CodeGraph evidence instead of throwing", async () => {
    const adapter = new VbaFormsAdapter(makeOrchestrator(), mockFs());

    const result = await adapter.execute("map_form_behavior", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      codegraphEvidence: [{}, { handler: "cmdSave_Click", callPath: ["cmdSave_Click"] }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({
        controls: [
          expect.objectContaining({
            name: "cmdSave",
            codegraphEvidence: [expect.objectContaining({ handler: "cmdSave_Click" })],
          }),
        ],
      });
    }
  });
});
it("ignores malformed CodeGraph evidence instead of throwing", async () => {
  const adapter = new VbaFormsAdapter(makeOrchestrator(), mockFs());

  const result = await adapter.execute("map_form_behavior", {
    sourcePath: "C:/repo/forms/Form_Customer.form.txt",
    codegraphEvidence: [{}, { handler: "cmdSave_Click", callPath: ["cmdSave_Click"] }],
  });

  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.data).toMatchObject({
      controls: [
        expect.objectContaining({
          name: "cmdSave",
          codegraphEvidence: [expect.objectContaining({ handler: "cmdSave_Click" })],
        }),
      ],
    });
  }
});
