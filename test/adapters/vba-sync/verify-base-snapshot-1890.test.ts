// Issue #1890 — a single changed value is one unique line on each side, so the
// two-text rule calls it `bothChanged`. A base snapshot (the state both sides
// last agreed on, recorded at each successful import/export) resolves the
// direction: the side that still matches the base did not change.
//
// Exercised at the external port: only the PowerShell executor is faked. The
// source tree, the "binary" export tree and the base store are real folders.
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { VbaSyncAdapter } from "../../../src/adapters/vba-sync/vba-sync-adapter.js";
import { noopPreflightCleanup } from "../../_helpers/noop-preflight-cleanup.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const moduleText = (value: number, extra = "") =>
  `Attribute VB_Name = "Probe"\nOption Compare Database\nOption Explicit\n${extra}Public Function Value() As Long\nValue = ${value}\nEnd Function\n`;

const moduleOf = (file: string) => file.replace(/\.(bas|cls|form\.txt)$/, "");

type ImportReply = (moduleNames: readonly string[]) => unknown;

const okImportReply: ImportReply = (moduleNames) => ({
  ok: true,
  modules: moduleNames.map((module) => ({ module, status: "ok" })),
});

function fixture(
  options: { projectDir?: boolean; accessName?: string; importReply?: ImportReply } = {},
) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "issue-1890-port-")));
  roots.push(root);
  if (options.projectDir !== false) mkdirSync(join(root, ".dysflow"), { recursive: true });
  const source = join(root, "source", "modules");
  const binary = join(root, "binary", "modules");
  mkdirSync(source, { recursive: true });
  mkdirSync(binary, { recursive: true });
  const accessPath = join(root, options.accessName ?? "Frontend.accdb");
  writeFileSync(accessPath, "Access fixture");
  const sourceFile = join(source, "Probe.bas");
  const binaryFile = join(binary, "Probe.bas");
  writeFileSync(sourceFile, moduleText(1));
  writeFileSync(binaryFile, moduleText(1));
  const importReply = options.importReply ?? okImportReply;
  const adapter = new VbaSyncAdapter({
    cwd: root,
    accessPath,
    destinationRoot: join(root, "source"),
    env: {},
    scriptPath: join(root, "external-stub.ps1"),
    preflightCleanup: noopPreflightCleanup(),
    executor: async (request) => {
      let payload: unknown;
      if (request.action === "Export") {
        const target = join(String(request.destinationRoot), "modules");
        mkdirSync(target, { recursive: true });
        const names = request.moduleNames ?? [];
        for (const file of readdirSync(binary)) {
          if (names.length > 0 && !names.includes(moduleOf(file))) continue;
          cpSync(join(binary, file), join(target, file));
        }
        payload = { ok: true, exported: names.length > 0 ? names : ["Probe"], warnings: [] };
      } else if (request.action === "Import") {
        const names = request.moduleNames ?? [];
        payload = importReply(names);
        if ((payload as { ok?: unknown }).ok !== false) {
          for (const file of readdirSync(source)) {
            if (names.includes(moduleOf(file))) cpSync(join(source, file), join(binary, file));
          }
        }
      } else throw new Error(`Unexpected action: ${request.action}`);
      return {
        exitCode: (payload as { ok?: unknown }).ok === false ? 1 : 0,
        stdout: `DYSFLOW_RESULT ${JSON.stringify(payload)}`,
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    },
  });
  return { root, adapter, sourceFile, binaryFile, accessPath };
}

type VerifyData = {
  actionableDifferent: { moduleName: string; classification: string; reason: string }[];
  recommendedAction: string;
  bulkImportable: string[];
  bulkExportable: string[];
  summaryStructured: { actionable: Record<string, number> };
};

async function verify(adapter: VbaSyncAdapter): Promise<VerifyData> {
  const result = await adapter.execute("verify_code", { moduleNames: ["Probe"] });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.data as VerifyData;
}

async function importProbe(adapter: VbaSyncAdapter) {
  const result = await adapter.execute("import_modules", { moduleNames: ["Probe"], apply: true });
  expect(result.ok, JSON.stringify(result)).toBe(true);
  return result;
}

async function exportProbe(adapter: VbaSyncAdapter) {
  const result = await adapter.execute("export_modules", { moduleNames: ["Probe"], apply: true });
  expect(result.ok, JSON.stringify(result)).toBe(true);
  return result;
}

function classificationOf(data: VerifyData): string | undefined {
  return data.actionableDifferent.find((entry) => entry.moduleName === "Probe")?.classification;
}

describe("issue 1890 — verify_code direction from the last-synced base snapshot", () => {
  it("a value changed only in the source on a module with a base is sourceNewer (import_to_binary)", async () => {
    const { adapter, sourceFile } = fixture();
    await importProbe(adapter);
    writeFileSync(sourceFile, moduleText(2));

    const data = await verify(adapter);

    expect(classificationOf(data)).toBe("sourceNewer");
    expect(data.recommendedAction).toBe("import_to_binary");
    expect(data.bulkImportable).toEqual(["Probe"]);
    expect(data.bulkExportable).toEqual([]);
    expect(data.summaryStructured.actionable).toMatchObject({ sourceNewer: 1, bothChanged: 0 });
  });

  it("the mirror case is binaryNewer (export_to_src)", async () => {
    const { adapter, binaryFile } = fixture();
    await exportProbe(adapter);
    writeFileSync(binaryFile, moduleText(2));

    const data = await verify(adapter);

    expect(classificationOf(data)).toBe("binaryNewer");
    expect(data.recommendedAction).toBe("export_to_src");
    expect(data.bulkExportable).toEqual(["Probe"]);
    expect(data.bulkImportable).toEqual([]);
  });

  it("both sides changed from the base is bothChanged", async () => {
    const { adapter, sourceFile, binaryFile } = fixture();
    await importProbe(adapter);
    writeFileSync(sourceFile, moduleText(2));
    writeFileSync(binaryFile, moduleText(3));

    const data = await verify(adapter);

    expect(classificationOf(data)).toBe("bothChanged");
    expect(data.recommendedAction).toBe("manual_merge");
    expect(data.bulkImportable).toEqual([]);
    expect(data.bulkExportable).toEqual([]);
  });

  it("without a base the result is unchanged from today", async () => {
    const { adapter, sourceFile } = fixture();
    writeFileSync(sourceFile, moduleText(2));

    const data = await verify(adapter);

    expect(classificationOf(data)).toBe("bothChanged");
    expect(data.recommendedAction).toBe("manual_merge");
  });

  it("serialization noise on the unchanged side never fakes a direction away from it", async () => {
    // The binary side carries only non-functional drift from the base
    // (keyword casing, a cosmetic attribute). It still matches the base under
    // the classifier's normalization, so the source is the side that changed.
    const { adapter, sourceFile, binaryFile } = fixture();
    await importProbe(adapter);
    writeFileSync(
      binaryFile,
      moduleText(1, "Attribute VB_Exposed = False\n").replace("Option Explicit", "OPTION EXPLICIT"),
    );
    writeFileSync(sourceFile, moduleText(2));

    const data = await verify(adapter);

    expect(classificationOf(data)).toBe("sourceNewer");
  });

  it("a .form.txt value changed only in the source is sourceNewer despite binary serialization noise", async () => {
    // The #1866 item 7 case: one `Width` line differs on each side.
    const form = (width: number, checksum: number) =>
      [
        "Version =21",
        "Begin Form",
        "    AutoResize = NotDefault",
        `    Checksum =${checksum}`,
        "    Begin Section",
        "        Begin TextBox",
        '            Name ="txtProbe"',
        `            Width =${width}`,
        "        End",
        "    End",
        "End",
        "",
      ].join("\r\n");
    const { root, adapter } = fixture();
    const sourceForm = join(root, "source", "modules", "frmProbe.form.txt");
    const binaryForm = join(root, "binary", "modules", "frmProbe.form.txt");
    writeFileSync(sourceForm, form(1500, 1));
    writeFileSync(binaryForm, form(1500, 1));
    const imported = await adapter.execute("import_modules", {
      moduleNames: ["frmProbe"],
      apply: true,
    });
    expect(imported.ok, JSON.stringify(imported)).toBe(true);
    writeFileSync(sourceForm, form(2000, 1));
    writeFileSync(binaryForm, form(1500, 987654));

    const result = await adapter.execute("verify_code", { moduleNames: ["frmProbe"] });
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    const data = result.data as VerifyData;

    expect(data.actionableDifferent).toEqual([
      expect.objectContaining({ moduleName: "frmProbe", classification: "sourceNewer" }),
    ]);
    expect(data.recommendedAction).toBe("import_to_binary");
  });

  it("accepts a single-module import result that PowerShell collapsed to an object", async () => {
    const { adapter, sourceFile } = fixture({
      importReply: ([module]) => ({ ok: true, modules: { module, status: "ok" } }),
    });
    await importProbe(adapter);
    writeFileSync(sourceFile, moduleText(2));

    expect(classificationOf(await verify(adapter))).toBe("sourceNewer");
  });

  it("records no base when the import batch failed", async () => {
    const { adapter, sourceFile } = fixture({
      importReply: ([module]) => ({
        ok: false,
        error: { code: "VBA_IMPORT_FAILED", message: "boom" },
        modules: [{ module, status: "error", error: { code: "X", message: "boom" } }],
      }),
    });
    const result = await adapter.execute("import_modules", {
      moduleNames: ["Probe"],
      apply: true,
    });
    expect(result.ok).toBe(false);
    writeFileSync(sourceFile, moduleText(2));

    expect(classificationOf(await verify(adapter))).toBe("bothChanged");
  });

  it("a base recorded for one binary is never reused for another", async () => {
    const first = fixture();
    await importProbe(first.adapter);
    const baseDir = join(first.root, ".dysflow", "runtime", "verify-base");
    expect(readdirSync(baseDir)).toHaveLength(1);

    // Same project folder and source tree, different target binary.
    const other = new VbaSyncAdapter({
      cwd: first.root,
      accessPath: join(first.root, "Other.accdb"),
      destinationRoot: join(first.root, "source"),
      env: {},
      scriptPath: join(first.root, "external-stub.ps1"),
      preflightCleanup: noopPreflightCleanup(),
      executor: async (request) => {
        const target = join(String(request.destinationRoot), "modules");
        mkdirSync(target, { recursive: true });
        cpSync(first.binaryFile, join(target, "Probe.bas"));
        return {
          exitCode: 0,
          stdout: 'DYSFLOW_RESULT {"ok":true,"exported":["Probe"],"warnings":[]}',
          stderr: "",
          durationMs: 1,
          timedOut: false,
        };
      },
    });
    writeFileSync(join(first.root, "Other.accdb"), "other");
    writeFileSync(first.sourceFile, moduleText(2));

    expect(classificationOf(await verify(other))).toBe("bothChanged");
    expect(classificationOf(await verify(first.adapter))).toBe("sourceNewer");
  });

  it("keeps the base as local runtime state under .dysflow/runtime", async () => {
    const { root, adapter } = fixture();
    await importProbe(adapter);
    const baseDir = join(root, ".dysflow", "runtime", "verify-base");
    const [file] = readdirSync(baseDir);
    const stored = readFileSync(join(baseDir, String(file)), "utf8");
    // A hash of the normalized text, never the module source itself.
    expect(stored).not.toContain("Public Function Value");
    expect(stored).toMatch(/[0-9a-f]{64}/);
  });

  it("writes nothing when the project has no .dysflow folder", async () => {
    const { root, adapter, sourceFile } = fixture({ projectDir: false });
    await importProbe(adapter);
    expect(existsSync(join(root, ".dysflow", "runtime", "verify-base"))).toBe(false);
    writeFileSync(sourceFile, moduleText(2));

    expect(classificationOf(await verify(adapter))).toBe("bothChanged");
  });

  it("a base write failure never fails the import and is surfaced as a warning", async () => {
    const { root, adapter } = fixture();
    // A file where the store expects its folder makes every write fail.
    mkdirSync(join(root, ".dysflow", "runtime"), { recursive: true });
    writeFileSync(join(root, ".dysflow", "runtime", "verify-base"), "not a folder");

    const result = await importProbe(adapter);

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: "warning", source: "verify-base" }),
      ]),
    );
  });
});
