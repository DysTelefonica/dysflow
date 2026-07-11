import { describe, expect, it, vi } from "vitest";
import {
  VbaFormsAdapter,
  type VbaFormsOrchestrator,
} from "../../../src/adapters/vba-sync/vba-forms-adapter";
import { failureResult, successResult } from "../../../src/core/contracts/index";
import type { FormFileSystemPort } from "../../../src/core/services/vba-form-service";

// Two-control form: cmdSave has an [Event Procedure] binding (events=["OnClick"]),
// txtName has a binding. The fixtures below pin each pre-flight guard.
const SIMPLE_FORM = `Version =21
Checksum =123456789
Begin Form
    Caption ="Old Caption"
    Begin
        Begin CommandButton
            Name ="cmdSave"
            Caption ="Save"
            OnClick ="[Event Procedure]"
            Left =100
            Top =200
        End
        Begin TextBox
            Name ="txtName"
            Left =300
            Top =400
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
      name: "cmdSave",
      type: "CommandButton",
      role: "action" as const,
      events: ["OnClick"],
      bindings: [],
      codegraphEvidence: [],
    },
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

type Kind =
  | "add-control"
  | "move-control"
  | "rename-control"
  | "set-property"
  | "delete-control"
  | "note";

const op = (
  kind: Kind,
  target: string,
  params: Record<string, unknown> = {},
  intent: string = kind,
  preserves: string[] = [],
) => ({ kind, target, intent, params, preserves });

const plan = (operations: ReturnType<typeof op>[]) => ({
  formName: "Customer",
  sourceContract,
  operations,
  warnings: [],
});

function makeOrchestrator(
  importResult: ReturnType<typeof successResult> | ReturnType<typeof failureResult> = successResult(
    {
      imported: true,
    },
  ),
): VbaFormsOrchestrator {
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
    readFile: vi.fn().mockResolvedValue(SIMPLE_FORM),
    readJson: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("VbaFormsAdapter — apply_form_design_plan (Phase 5.1 execution internals)", () => {
  // (d) dryRun writes nothing.
  it("dryRun: no writeFile, no import, returns the would-be-written preview (#813 dry-run scenario)", async () => {
    const writeFile = vi.fn();
    const orchestrator = makeOrchestrator();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("apply_form_design_plan", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      plan: plan([op("set-property", "cmdSave", { property: "Caption", value: '"Commit"' })]),
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(writeFile).not.toHaveBeenCalled();
    expect(orchestrator.executeMappedTool).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({
      mode: "dry-run",
      filesystemApplied: false,
      importGate: "not-run",
    });
    expect(String((result.data as { source: string }).source)).toContain('Caption ="Commit"');
    expect((result.data as { advisories: string[] }).advisories).toEqual([]);
  });

  // (f) note-only apply: single write + single import + advisories surfaced.
  it("apply:true with a note-only plan: writes once, imports once, importGate 'passed', advisories surfaced (#813 atomicity + advisories)", async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const orchestrator = makeOrchestrator();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("apply_form_design_plan", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      plan: plan([
        op("note", "cmdSave", {}, "Keep save visible", ["OnClick"]),
        op("note", "txtName", {}, "Keep input visible", []),
      ]),
      apply: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      mode: "apply",
      filesystemApplied: true,
      importGate: "passed",
    });
    expect((result.data as { advisories: string[] }).advisories).toEqual([
      "Keep save visible",
      "Keep input visible",
    ]);
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(orchestrator.executeMappedTool).toHaveBeenCalledTimes(1);
    expect(orchestrator.executeMappedTool).toHaveBeenCalledWith(
      "import_modules",
      expect.objectContaining({ moduleNames: ["Customer"], apply: true, importMode: "Auto" }),
      expect.any(Object),
    );
  });

  // (a) multi-op plan: single accumulated write + single import + rollback on failure.
  it("apply:true with a heterogeneous multi-op plan: single write + single import (#813 atomicity)", async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const orchestrator = makeOrchestrator();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("apply_form_design_plan", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      plan: plan([
        op("move-control", "cmdSave", { left: 800, top: 900 }),
        op("set-property", "cmdSave", { property: "Caption", value: '"Commit"' }),
      ]),
      apply: true,
    });

    expect(result.ok).toBe(true);
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(orchestrator.executeMappedTool).toHaveBeenCalledTimes(1);
    // Single accumulated write: the file content reflects BOTH ops applied
    // to ONE in-memory IR, not two separate writes.
    const writtenSource = String((writeFile.mock.calls[0] ?? [])[1]);
    expect(writtenSource).toContain("Left =800");
    expect(writtenSource).toContain("Top =900");
    expect(writtenSource).toContain('Caption ="Commit"');
  });

  // (a-failure) import_modules failure: FORM_IMPORT_GATE_FAILED + restore + rollback outcome.
  it("apply:true with import_modules failure: FORM_IMPORT_GATE_FAILED, source restored (#692)", async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const orchestrator = makeOrchestrator(
      failureResult({ code: "IMPORT_FAILED", message: "import_modules failed", retryable: false }),
    );
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("apply_form_design_plan", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      plan: plan([op("set-property", "cmdSave", { property: "Caption", value: '"Commit"' })]),
      apply: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("FORM_IMPORT_GATE_FAILED");
    expect(result.error.details).toMatchObject({
      cause: expect.objectContaining({ code: "IMPORT_FAILED" }),
      rollback: { attempted: true, applied: true, targetExisted: true },
    });
    // 1 mutation write + 1 rollback write; import_modules invoked exactly once.
    expect(writeFile).toHaveBeenCalledTimes(2);
    expect(writeFile).toHaveBeenLastCalledWith(
      "C:\\repo\\forms\\Form_Customer.form.txt",
      SIMPLE_FORM,
      "utf8",
    );
  });

  // (c) sourcePath guards: missing / non-managed extension / binary file.
  it.each([
    [
      "missing sourcePath",
      { plan: plan([op("note", "cmdSave")]), apply: true },
      "FORM_SPEC_MISSING",
    ],
    [
      "non-managed extension (.cls)",
      {
        sourcePath: "C:/repo/forms/Form_Customer.cls",
        plan: plan([op("note", "cmdSave")]),
        apply: true,
      },
      "INVALID_INPUT",
    ],
    [
      "binary-file extension (.frm)",
      {
        sourcePath: "C:/repo/forms/Form_Customer.frm",
        plan: plan([op("note", "cmdSave")]),
        apply: true,
      },
      "INVALID_INPUT",
    ],
  ] as const)("apply:true with %s is refused before any write", async (_label, params, expectedCode) => {
    const writeFile = vi.fn();
    const orchestrator = makeOrchestrator();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("apply_form_design_plan", params);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(expectedCode);
    expect(writeFile).not.toHaveBeenCalled();
    expect(orchestrator.executeMappedTool).not.toHaveBeenCalled();
  });

  // (e) formName identity: mismatch / case-only / empty.
  it.each([
    ["different formName", "OtherForm", false, "FORM_UI_PLAN_FORM_MISMATCH"],
    ["empty formName", "", false, "FORM_UI_PLAN_FORM_NAME_MISSING"],
    ["case-only formName (accepted)", "CUSTOMER", true, null],
  ] as const)("apply:true with %s: formName identity guard", async (_label, planFormName, expectOk, expectedCode) => {
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const orchestrator = makeOrchestrator();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("apply_form_design_plan", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      plan: { ...plan([op("note", "cmdSave")]), formName: planFormName },
      apply: true,
    });

    expect(result.ok).toBe(expectOk);
    if (expectOk) {
      expect(writeFile).toHaveBeenCalledTimes(1);
    } else {
      if (!result.ok) expect(result.error.code).toBe(expectedCode);
      expect(writeFile).not.toHaveBeenCalled();
      expect(orchestrator.executeMappedTool).not.toHaveBeenCalled();
    }
  });

  // (b) operation fails mid-plan: target not in contract / preserves dropped.
  it.each([
    [
      "target not in source contract",
      [op("move-control", "ghostControl", { left: 10 })],
      "FORM_UI_PLAN_TARGET_MISSING",
    ],
    [
      "delete-control on control with events",
      [op("delete-control", "cmdSave")],
      "FORM_UI_PLAN_PRESERVES_DROPPED",
    ],
  ] as [
    string,
    ReturnType<typeof op>[],
    string,
  ][])("apply:true with %s: whole-plan abort, ZERO writes", async (_label, operations, expectedCode) => {
    const writeFile = vi.fn();
    const orchestrator = makeOrchestrator();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("apply_form_design_plan", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      plan: plan(operations),
      apply: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(expectedCode);
    expect(writeFile).not.toHaveBeenCalled();
    expect(orchestrator.executeMappedTool).not.toHaveBeenCalled();
  });

  // set-property on Caption for a control with events is allowed (Caption is not event-bound).
  it("set-property on Caption for a control with events is allowed", async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined);
    const orchestrator = makeOrchestrator();
    const fs = mockFs({ writeFile });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("apply_form_design_plan", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      plan: plan([op("set-property", "cmdSave", { property: "Caption", value: '"Commit"' })]),
      apply: true,
    });

    expect(result.ok).toBe(true);
    expect(writeFile).toHaveBeenCalledTimes(1);
  });
});
