import { describe, expect, it, vi } from "vitest";
import { resultContractForDispatchTool } from "../../../src/adapters/mcp/contracts/dispatch-result-contracts";
import { validateToolResult } from "../../../src/adapters/mcp/contracts/result-validation";
import {
  VbaFormsAdapter,
  type VbaFormsOrchestrator,
} from "../../../src/adapters/vba-sync/vba-forms-adapter";
import { successResult } from "../../../src/core/contracts/index";
import type { FormFileSystemPort } from "../../../src/core/services/vba-form-service";

const FORM_SOURCE = `Version =21
Begin Form
    Begin Section
        Name ="Detail"
        Begin TextBox
            Name ="txtProbe"
            Left =100
            Top =100
            Width =100
            Height =100
            Caption ="Probe"
        End
        Begin TextBox
            Name ="txtRename"
            Left =200
            Top =200
            Width =100
            Height =100
        End
        Begin TextBox
            Name ="txtDelete"
            Left =300
            Top =300
            Width =100
            Height =100
        End
    End
End
`;

const affectedTools = [
  ["form_set_property", { controlName: "txtProbe", propertyName: "Caption", value: "Plan" }],
  [
    "form_add_control",
    {
      targetSectionName: "Detail",
      controlName: "txtPlanContract",
      controlType: "TextBox",
      properties: {},
    },
  ],
  ["form_move_control", { controlName: "txtProbe", left: 100, top: 100 }],
  ["form_rename_control", { controlName: "txtRename", newName: "txtRenamePlan" }],
  ["form_delete_control", { controlName: "txtDelete" }],
  ["form_set_properties", { controlName: "txtProbe", properties: { Caption: "Plan" } }],
  ["form_duplicate_control", { sourceControlName: "txtProbe", newName: "txtProbePlan" }],
  ["form_align_controls", { controlNames: ["txtProbe", "txtRename"], edge: "left" }],
  [
    "form_distribute_controls",
    { controlNames: ["txtProbe", "txtRename", "txtDelete"], axis: "horizontal" },
  ],
] as const;

function makeAdapter(): VbaFormsAdapter {
  const orchestrator: VbaFormsOrchestrator = {
    executor: vi.fn(),
    env: { DYSFLOW_HOME: "C:/runtime/dysflow" },
    cwd: "C:/repo",
    resolveExecutionTarget: vi.fn().mockResolvedValue(
      successResult({
        accessPath: "C:/repo/App.accdb",
        destinationRoot: "C:/repo",
        projectRoot: "C:/repo",
        timeoutMs: 30_000,
        configSource: "explicit-request",
      }),
    ),
    validateStrictContext: vi.fn(() => successResult(undefined)),
    executeMappedTool: vi.fn().mockResolvedValue(successResult({ imported: true })),
  };
  const fileSystem: FormFileSystemPort = {
    mkdir: vi.fn(),
    readdir: vi.fn(),
    readFile: vi.fn().mockImplementation(async (path: string) => {
      if (path.includes("Form_CustomerPlan")) throw new Error("ENOENT");
      return FORM_SOURCE;
    }),
    readJson: vi.fn(),
    writeFile: vi.fn(),
  };
  return new VbaFormsAdapter(orchestrator, fileSystem, { benchCacheRoot: "C:/repo/forms" });
}

function expectContractValid(
  toolName: (typeof affectedTools)[number][0] | "create_form_from_template",
  payload: unknown,
) {
  expect(payload).toMatchObject({ dryRun: true });
  expect(
    validateToolResult({
      toolName,
      contract: resultContractForDispatchTool(toolName),
      payload,
      policy: "enforce",
    }),
  ).toEqual({ ok: true });
}

describe("form write tools comply with their published plan-mode contract", () => {
  it.each(affectedTools)("%s returns a contract-valid runtime plan", async (toolName, args) => {
    const result = await makeAdapter().execute(toolName, {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      ...args,
      apply: false,
    });

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (result.ok) expectContractValid(toolName, result.data);
  });

  it("create_form_from_template returns a contract-valid runtime plan", async () => {
    const result = await makeAdapter().execute("create_form_from_template", {
      projectId: "plan-contract",
      sourceForm: "Form_Customer",
      targetForm: "Form_CustomerPlan",
      tokenMap: {},
      apply: false,
    });

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (result.ok) expectContractValid("create_form_from_template", result.data);
  });
});
