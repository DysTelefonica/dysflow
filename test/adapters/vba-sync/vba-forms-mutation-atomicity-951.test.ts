import { describe, expect, it, vi } from "vitest";
import {
  VbaFormsAdapter,
  type VbaFormsOrchestrator,
} from "../../../src/adapters/vba-sync/vba-forms-adapter";
import { successResult } from "../../../src/core/contracts/index";
import type { FormFileSystemPort } from "../../../src/core/services/vba-form-service";

/**
 * issue #951 — `form_set_properties` apply must be ATOMIC and CONSISTENT.
 *
 * Consumer evidence (v2.14.0/v2.14.1): the first `apply:true` call returned a
 * `mode:"apply"` success whose import payload carried a `remove-existing`
 * per-module failure, the `.form.txt` stayed mutated on disk (no rollback),
 * and the second identical call returned a top-level FORM_IMPORT_GATE_FAILED.
 * The seam must treat a gate result whose payload reports per-module errors
 * as a gate failure: restore the source and return the same envelope on
 * every call.
 */
const SIMPLE_FORM = `Version =21
Checksum =123456789
Begin Form
    Begin
        Begin TextBox
            Name ="txtName"
            Left =100
            Top =200
        End
    End
End
`;

/** Gate payload shape: successResult wrapping {result: <parsedOutput>} exactly
 * as `executeMappedTool` produces for an exit-0 import (silent-success gate). */
const SILENT_FAILURE_GATE_DATA = {
  result: {
    ok: false,
    error: { code: "VBA_IMPORT_FAILED", message: "Import no pudo completar algunos modulos" },
    modules: [
      {
        module: "Form_X",
        status: "error",
        phase: "remove-existing",
        error: { code: "VBA_IMPORT_PHASE_FAILED", message: "SaveAsText failed" },
        rollbackApplied: false,
      },
    ],
  },
};

function makeOrchestrator(
  gateResult: unknown = successResult(SILENT_FAILURE_GATE_DATA),
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
    executeMappedTool: vi.fn().mockResolvedValue(gateResult),
  };
}

function normalizeKey(path: string): string {
  return path.replace(/\\/g, "/").toLowerCase();
}

/** In-memory filesystem port so the tests can observe the post-call bytes. */
function memoryFs(initial: Record<string, string>): {
  fs: FormFileSystemPort;
  read: (path: string) => string | undefined;
} {
  const files = new Map<string, string>(
    Object.entries(initial).map(([key, value]) => [normalizeKey(key), value]),
  );
  const fs: FormFileSystemPort = {
    mkdir: vi.fn(),
    readdir: vi.fn(),
    readJson: vi.fn(),
    readFile: vi.fn(async (path: string) => {
      const content = files.get(normalizeKey(path));
      if (content === undefined) throw new Error(`ENOENT: ${path}`);
      return content;
    }),
    writeFile: vi.fn(async (path: string, content: string) => {
      files.set(normalizeKey(path), content);
    }),
  };
  return { fs, read: (path: string) => files.get(normalizeKey(path)) };
}

const SOURCE_PATH = "C:/repo/forms/Form_Customer.form.txt";

const SET_PROPERTIES_PARAMS = {
  sourcePath: SOURCE_PATH,
  controlName: "txtName",
  properties: { Left: 555 },
  apply: true,
};

describe("form_set_properties atomicity and consistency (#951)", () => {
  it("form_set_properties_apply_is_atomic_on_gate_failure", async () => {
    const orchestrator = makeOrchestrator();
    const { fs, read } = memoryFs({ [SOURCE_PATH]: SIMPLE_FORM });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_set_properties", { ...SET_PROPERTIES_PARAMS });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("FORM_IMPORT_GATE_FAILED");
    const details = result.error.details as {
      rollback?: { applied?: boolean };
      rollbackApplied?: boolean;
    };
    expect(details.rollback?.applied).toBe(true);
    expect(details.rollbackApplied).toBe(true);
    // Atomicity: the source on disk is byte-identical to the pre-call content.
    expect(read(SOURCE_PATH)).toBe(SIMPLE_FORM);
  });

  it("form_set_properties_returns_consistent_shape_on_repeat_call", async () => {
    const orchestrator = makeOrchestrator();
    const { fs, read } = memoryFs({ [SOURCE_PATH]: SIMPLE_FORM });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const first = await adapter.execute("form_set_properties", { ...SET_PROPERTIES_PARAMS });
    const second = await adapter.execute("form_set_properties", { ...SET_PROPERTIES_PARAMS });

    expect(first.ok).toBe(false);
    expect(second.ok).toBe(false);
    if (first.ok || second.ok) return;
    expect(first.error.code).toBe("FORM_IMPORT_GATE_FAILED");
    expect(second.error.code).toBe(first.error.code);
    // One import operation per apply call — no retries, no skipped gates.
    expect(orchestrator.executeMappedTool).toHaveBeenCalledTimes(2);
    expect(read(SOURCE_PATH)).toBe(SIMPLE_FORM);
  });

  it("fails with FORM_NAME_RESOLUTION_FAILED before writing when the resolved Access object name is empty", async () => {
    const orchestrator = makeOrchestrator();
    const emptyNamePath = "C:/repo/forms/Form_.form.txt";
    const { fs, read } = memoryFs({ [emptyNamePath]: SIMPLE_FORM });
    const adapter = new VbaFormsAdapter(orchestrator, fs);

    const result = await adapter.execute("form_set_properties", {
      sourcePath: emptyNamePath,
      controlName: "txtName",
      properties: { Left: 555 },
      apply: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("FORM_NAME_RESOLUTION_FAILED");
    expect(result.error.message).toContain("Form_.form.txt");
    // The filesystem write port is never invoked; the source stays untouched.
    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(orchestrator.executeMappedTool).not.toHaveBeenCalled();
    expect(read(emptyNamePath)).toBe(SIMPLE_FORM);
  });
});
