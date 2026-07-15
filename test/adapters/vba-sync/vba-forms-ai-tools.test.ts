import { describe, expect, it, vi } from "vitest";
import type { CodeGraphVbaInvoker } from "../../../src/adapters/codegraph-vba/index";
import {
  VbaFormsAdapter,
  type VbaFormsOrchestrator,
} from "../../../src/adapters/vba-sync/vba-forms-adapter";
import { successResult } from "../../../src/core/contracts/index";
import type { CodeGraphBehaviorEvidence } from "../../../src/core/models/form-ui-builder";
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

  it("applies a note-only plan: dryRun writes nothing; apply writes once + imports once (Phase 5.1)", async () => {
    const writeFile = vi.fn().mockResolvedValue(undefined);
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

    // DryRun: no write, no import. sourcePath is required so the adapter can
    // read+parse the source and return the would-be-written preview without
    // touching the file system.
    const dryRun = await adapter.execute("apply_form_design_plan", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      plan,
    });
    expect(dryRun.ok).toBe(true);
    expect(writeFile).not.toHaveBeenCalled();

    // Apply: a single write + a single import through the guarded seam.
    // Note ops are non-mutating; the IR is unchanged after the fold, but the
    // seam is invoked exactly once so the plan-application contract holds.
    const applied = await adapter.execute("apply_form_design_plan", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      plan,
      apply: true,
    });
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      expect(applied.data).toMatchObject({
        mode: "apply",
        filesystemApplied: true,
        importGate: "passed",
      });
      expect((applied.data as { advisories: string[] }).advisories).toEqual(["Keep save visible"]);
    }
    expect(writeFile).toHaveBeenCalledTimes(1);
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

// Issue #830 — autoFetchCodeGraph opt-in invoker. Three RED-pin behaviors:
//   (a) autoFetchCodeGraph:true + invoker returning data → behavior map enriched.
//   (b) autoFetchCodeGraph:true + invoker failing/returning empty → graceful
//       fallback: caller-supplied evidence (or no evidence) is preserved, no throw.
//   (c) autoFetchCodeGraph:false (default) preserves the current evidence-supplied
//       contract exactly — the orchestrator's invoker is never consulted.
describe("VbaFormsAdapter map_form_behavior autoFetchCodeGraph (#830)", () => {
  function mockInvoker(impl: Partial<CodeGraphVbaInvoker>): CodeGraphVbaInvoker & {
    fetchBehaviorEvidence: ReturnType<typeof vi.fn>;
  } {
    return {
      fetchBehaviorEvidence: vi.fn(
        impl.fetchBehaviorEvidence ?? (async () => ({ evidence: [], codegraphIndexPath: null })),
      ),
    };
  }

  it("autoFetchCodeGraph:true + invoker returning data enriches the behavior map", async () => {
    const orchestrator = makeOrchestrator();
    const invoker = mockInvoker({
      fetchBehaviorEvidence: async () => ({
        codegraphIndexPath: "C:/repo/.codegraph-vba",
        evidence: [
          {
            handler: "cmdSave_Click",
            callPath: ["cmdSave_Click", "SaveCustomer"],
            tables: ["Customers"],
          } satisfies CodeGraphBehaviorEvidence,
        ],
      }),
    });
    const adapter = new VbaFormsAdapter(orchestrator, mockFs(), { codeGraphVbaInvoker: invoker });

    const result = await adapter.execute("map_form_behavior", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      autoFetchCodeGraph: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({
        codegraphIndexPath: "C:/repo/.codegraph-vba",
        controls: [
          expect.objectContaining({
            name: "cmdSave",
            codegraphEvidence: [
              expect.objectContaining({
                handler: "cmdSave_Click",
                callPath: ["cmdSave_Click", "SaveCustomer"],
              }),
            ],
          }),
        ],
      });
    }
    expect(invoker.fetchBehaviorEvidence).toHaveBeenCalledTimes(1);
    // The request must be scoped to the project root + form name + control names.
    const request = invoker.fetchBehaviorEvidence.mock.calls[0]?.[0] as {
      formName: string;
      controlNames: string[];
      projectPath: string;
    };
    expect(request).toEqual({
      formName: "Customer",
      controlNames: ["cmdSave"],
      projectPath: "C:/repo",
    });
  });

  it("autoFetchCodeGraph:true + invoker failing falls back gracefully without throwing", async () => {
    const orchestrator = makeOrchestrator();
    const invoker = mockInvoker({
      fetchBehaviorEvidence: async () => {
        throw new Error("codegraph-vba unavailable");
      },
    });
    const adapter = new VbaFormsAdapter(orchestrator, mockFs(), { codeGraphVbaInvoker: invoker });

    // No caller-supplied evidence either — the .form.txt-only behavior must still
    // produce a valid map (just with the legacy "no evidence" warning). No throw.
    const result = await adapter.execute("map_form_behavior", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      autoFetchCodeGraph: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // The .form.txt-declared OnClick event still surfaces on the control …
      expect(result.data).toMatchObject({
        controls: [
          expect.objectContaining({
            name: "cmdSave",
            events: ["OnClick"],
            codegraphEvidence: [],
          }),
        ],
      });
      // … and the legacy "no evidence supplied" warning is preserved (graceful
      // fallback to the pre-#830 contract).
      expect(result.data).toMatchObject({
        warnings: expect.arrayContaining([expect.stringContaining("CodeGraph-VBA evidence")]),
      });
    }
    // RED-pin: the invoker was consulted (and threw) — graceful fallback is what
    // saved us, not "the flag was ignored entirely".
    expect(invoker.fetchBehaviorEvidence).toHaveBeenCalledTimes(1);
  });

  it("autoFetchCodeGraph:true + invoker returning empty falls back gracefully and merges with caller evidence", async () => {
    const orchestrator = makeOrchestrator();
    const invoker = mockInvoker({
      fetchBehaviorEvidence: async () => ({
        evidence: [],
        warning: "no index",
        codegraphIndexPath: null,
      }),
    });
    const adapter = new VbaFormsAdapter(orchestrator, mockFs(), { codeGraphVbaInvoker: invoker });

    const result = await adapter.execute("map_form_behavior", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      autoFetchCodeGraph: true,
      codegraphEvidence: [
        { handler: "cmdSave_Click", callPath: ["cmdSave_Click", "CallerSupplied"] },
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
    // RED-pin: invoker WAS consulted (returned empty), and the caller-supplied
    // evidence was preserved alongside.
    expect(invoker.fetchBehaviorEvidence).toHaveBeenCalledTimes(1);
  });

  it("autoFetchCodeGraph:false (default) does NOT consult the invoker", async () => {
    const orchestrator = makeOrchestrator();
    const invoker = mockInvoker({
      fetchBehaviorEvidence: async () => ({
        evidence: [{ handler: "cmdSave_Click", callPath: ["cmdSave_Click"] }],
        codegraphIndexPath: null,
      }),
    });
    const adapter = new VbaFormsAdapter(orchestrator, mockFs(), { codeGraphVbaInvoker: invoker });

    // Backward compat — no autoFetchCodeGraph flag, caller supplied nothing either.
    // The legacy "no evidence supplied" warning must appear and the invoker is NEVER called.
    const result = await adapter.execute("map_form_behavior", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({
        codegraphIndexPath: null,
        controls: [expect.objectContaining({ name: "cmdSave", codegraphEvidence: [] })],
        warnings: expect.arrayContaining([expect.stringContaining("CodeGraph-VBA evidence")]),
      });
    }
    expect(invoker.fetchBehaviorEvidence).not.toHaveBeenCalled();
  });

  it("autoFetchCodeGraph with explicit evidence still merges fetched evidence and propagates the index path", async () => {
    const invoker = mockInvoker({
      fetchBehaviorEvidence: async () => ({
        evidence: [{ handler: "cmdSave_Click", callPath: ["cmdSave_Click", "Fetched"] }],
        codegraphIndexPath: "C:/repo/.codegraph-vba",
      }),
    });
    const adapter = new VbaFormsAdapter(makeOrchestrator(), mockFs(), {
      codeGraphVbaInvoker: invoker,
    });
    const result = await adapter.execute("map_form_behavior", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      autoFetchCodeGraph: true,
      codegraphEvidence: [{ handler: "cmdSave_Click", callPath: ["cmdSave_Click", "Explicit"] }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as {
        codegraphIndexPath: string | null;
        controls: Array<{ codegraphEvidence: CodeGraphBehaviorEvidence[] }>;
      };
      expect(data.codegraphIndexPath).toBe("C:/repo/.codegraph-vba");
      expect(data.controls[0]?.codegraphEvidence).toHaveLength(2);
    }
    expect(invoker.fetchBehaviorEvidence).toHaveBeenCalledOnce();
  });

  it("autoFetchCodeGraph:true without an orchestrator-bound invoker falls back gracefully", async () => {
    // The orchestrator doesn't expose an invoker — the adapter must not throw,
    // and the legacy "no evidence supplied" warning must surface.
    const orchestrator = makeOrchestrator();
    delete (orchestrator as { codeGraphVbaInvoker?: unknown }).codeGraphVbaInvoker;
    const adapter = new VbaFormsAdapter(orchestrator, mockFs());

    const result = await adapter.execute("map_form_behavior", {
      sourcePath: "C:/repo/forms/Form_Customer.form.txt",
      autoFetchCodeGraph: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({
        controls: [expect.objectContaining({ name: "cmdSave", codegraphEvidence: [] })],
        warnings: expect.arrayContaining([expect.stringContaining("CodeGraph-VBA evidence")]),
      });
    }
  });
});
