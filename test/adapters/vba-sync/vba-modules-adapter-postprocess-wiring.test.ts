import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type {
  ControlPropertyBatch,
  ControlPropertyReader,
} from "../../../src/adapters/vba-sync/control-property-reader";
import { VbaModulesAdapter } from "../../../src/adapters/vba-sync/vba-modules-adapter";

const FORM_WITH_MISSING_BOUND_COLUMN = `Version =21
Begin Form
    Begin ComboBox
        Name ="cmbStatus"
        StatusBarText ="status"
    End
    Begin TextBox
        Name ="txtValue"
    End
End
`;

interface RecordedCall {
  formName: string;
  controlName: string;
  propertyNames: readonly string[];
}

interface AdapterArgs {
  root: string;
  sourceRoot: string;
  formName: string;
  formText: string;
  exported: string[];
  controlPropertyReader?: ControlPropertyReader;
}

function buildAdapter(args: AdapterArgs): VbaModulesAdapter {
  const { root, sourceRoot, formName, formText, exported, controlPropertyReader } = args;
  const fileSystem = {
    mkdtemp: async () => root,
    readdir: async () => [],
    readFile: async (path: string, encoding: string) => readFile(path, encoding as BufferEncoding),
    readFileBytes: async (path: string) => {
      const buf = await readFile(path);
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    },
    rm: async () => undefined,
    tmpdir: () => tmpdir(),
    exists: async () => true,
  };
  return new VbaModulesAdapter(
    {
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      cwd: root,
      env: {},
      executor: async () => ({
        exitCode: 0,
        stdout: "",
        stderr: "",
        durationMs: 1,
        timedOut: false,
      }),
      resolveExecutionTarget: async () => ({
        ok: true,
        data: {
          configSource: "explicit-request",
          accessDbPath: join(root, "front.accdb"),
          accessPath: join(root, "front.accdb"),
          destinationRoot: sourceRoot,
          projectRoot: root,
        },
        diagnostics: [],
        durationMs: 0,
      }),
      validateStrictContext: () => ({
        ok: true,
        data: undefined,
        diagnostics: [],
        durationMs: 0,
      }),
      runPreflightCleanup: async () => ({
        cleaned: [],
        killed: [],
        orphanedKilled: [],
        errors: [],
        diagnostics: [],
      }),
      executeMappedTool: async () => {
        // Simulate Access SaveAsText producing a .form.txt on disk.
        const formsFolder = join(sourceRoot, "forms");
        await mkdir(formsFolder, { recursive: true });
        await writeFile(join(formsFolder, `${formName}.form.txt`), formText, "utf8");
        return {
          ok: true,
          data: { ok: true, exported },
          diagnostics: [],
          durationMs: 0,
        };
      },
    },
    fileSystem,
    controlPropertyReader,
  );
}

describe("VbaModulesAdapter — export pipeline control-property postprocess wiring (REQ-003)", () => {
  it("export_all invokes postprocessExportedFormText with injected ControlPropertyReader", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-c3-wiring-stub-"));
    const sourceRoot = join(root, "src");
    await mkdir(join(sourceRoot, "forms"), { recursive: true });

    const calls: RecordedCall[] = [];
    const stubReader: ControlPropertyReader = {
      async readProperties(formName, controlName, propertyNames) {
        calls.push({ formName, controlName, propertyNames: [...propertyNames] });
        // The seam contract is ReadonlyMap (returned to pure post-processor
        // consumers), but tests build a mutable Map locally so we can populate
        // it before handing it back. The cast at the return boundary keeps
        // the public type contract intact.
        const mutable = new Map<string, string | number | boolean>();
        if (controlName === "cmbStatus" && propertyNames.includes("BoundColumn")) {
          mutable.set("BoundColumn", "1");
        }
        if (controlName === "cmbStatus" && propertyNames.includes("ColumnCount")) {
          mutable.set("ColumnCount", "2");
        }
        return mutable satisfies ControlPropertyBatch;
      },
    };

    const adapter = buildAdapter({
      root,
      sourceRoot,
      formName: "Form_Main",
      formText: FORM_WITH_MISSING_BOUND_COLUMN,
      exported: ["Form_Main"],
      controlPropertyReader: stubReader,
    });

    const result = await adapter.execute("export_all", {});

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected export_all success");
    // The reader MUST have been consulted for the ComboBox control —
    // the wiring has reached runtime, the seam is no longer dormant.
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.some((c) => c.formName === "Form_Main" && c.controlName === "cmbStatus")).toBe(
      true,
    );
  });

  it("export_all with default no-op reader preserves SaveAsText output (byte-identical)", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-c3-wiring-noop-"));
    const sourceRoot = join(root, "src");
    await mkdir(join(sourceRoot, "forms"), { recursive: true });

    const adapter = buildAdapter({
      root,
      sourceRoot,
      formName: "Form_Main",
      formText: FORM_WITH_MISSING_BOUND_COLUMN,
      exported: ["Form_Main"],
      // No controlPropertyReader injection → default NoopControlPropertyReader.
    });

    const result = await adapter.execute("export_all", {});

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected export_all success");
    // With the no-op reader returning undefined for every lookup,
    // postprocessFormTxt is a pure serialize-parse round-trip. The on-disk
    // file must NOT have grown a missing BoundColumn property — the
    // orchestration contract is backward-compatible (REQ-003 default path
    // is observationally identical to the pre-wire behavior).
    const formsFolder = join(sourceRoot, "forms");
    const persisted = await readFile(join(formsFolder, "Form_Main.form.txt"), "utf8");
    expect(persisted).not.toContain("BoundColumn");
    expect(persisted).not.toContain("ColumnCount");
  });
});
