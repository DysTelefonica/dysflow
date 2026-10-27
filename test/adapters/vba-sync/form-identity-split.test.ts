// A form is exported as two files: `forms/frmX.form.txt` (layout) and
// `forms/frmX.cls` (code-behind) whose `Attribute VB_Name` is `Form_frmX`.
// verify_code, its bulk lists and sync_binary must treat both files as ONE
// module, so a conflict in the `.cls` blocks an import that the `.form.txt`
// alone would plan: importing `frmX` also loads `frmX.cls` and would overwrite
// the code edited in Access.
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

const codeBehind = (value: number) =>
  `Attribute VB_Name = "Form_frmX"\nOption Compare Database\nOption Explicit\nPublic Function Value() As Long\nValue = ${value}\nEnd Function\n`;

const layout = (extraControl: boolean) =>
  [
    "Version =21",
    "Begin Form",
    "    AutoResize = NotDefault",
    "    Begin Section",
    "        Begin TextBox",
    '            Name ="txtProbe"',
    "            Width =1500",
    "        End",
    ...(extraControl
      ? [
          "        Begin TextBox",
          '            Name ="txtNew"',
          "            Width =900",
          "        End",
        ]
      : []),
    "    End",
    "End",
    "",
  ].join("\r\n");

const moduleText = (value: number) =>
  `Attribute VB_Name = "Probe"\nOption Compare Database\nOption Explicit\nPublic Function Value() As Long\nValue = ${value}\nEnd Function\n`;

/** Access names a form `frmX`, `Form_frmX` or `Report_frmX`; the runner resolves all three. */
const fold = (name: string) => name.replace(/^(Form_|Report_)/i, "").toLowerCase();
const moduleOf = (file: string) => fold(file.replace(/\.(bas|cls|form\.txt|report\.txt)$/, ""));

function filesUnder(dir: string, prefix = ""): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? filesUnder(join(dir, entry.name), join(prefix, entry.name))
      : [join(prefix, entry.name)],
  );
}

function copySelected(from: string, to: string, names: readonly string[]) {
  const wanted = new Set(names.map(fold));
  for (const file of filesUnder(from)) {
    const base = file.split(/[\\/]/).pop() ?? file;
    if (wanted.size > 0 && !wanted.has(moduleOf(base))) continue;
    mkdirSync(join(to, file, ".."), { recursive: true });
    cpSync(join(from, file), join(to, file));
  }
}

function fixture() {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "form-identity-")));
  roots.push(root);
  mkdirSync(join(root, ".dysflow"), { recursive: true });
  const source = join(root, "source", "modules");
  const binary = join(root, "binary", "modules");
  for (const side of [source, binary]) mkdirSync(join(side, "forms"), { recursive: true });
  const accessPath = join(root, "Frontend.accdb");
  writeFileSync(accessPath, "Access fixture");
  const calls: { action: string; moduleNames: readonly string[] }[] = [];
  const adapter = new VbaSyncAdapter({
    cwd: root,
    accessPath,
    destinationRoot: join(root, "source"),
    env: {},
    scriptPath: join(root, "external-stub.ps1"),
    preflightCleanup: noopPreflightCleanup(),
    executor: async (request) => {
      const names = request.moduleNames ?? [];
      calls.push({ action: request.action, moduleNames: names });
      let payload: unknown;
      if (request.action === "Export") {
        copySelected(binary, join(String(request.destinationRoot), "modules"), names);
        payload = { ok: true, exported: names.length > 0 ? names : ["frmX"], warnings: [] };
      } else if (request.action === "Import") {
        // Like the real runner: importing a form loads its layout AND its code-behind.
        copySelected(source, binary, names);
        payload = { ok: true, modules: names.map((module) => ({ module, status: "ok" })) };
      } else throw new Error(`Unexpected action: ${request.action}`);
      return {
        exitCode: 0,
        stdout: `DYSFLOW_RESULT ${JSON.stringify(payload)}`,
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    },
  });
  const paths = {
    sourceCls: join(source, "forms", "frmX.cls"),
    binaryCls: join(binary, "forms", "frmX.cls"),
    sourceLayout: join(source, "forms", "frmX.form.txt"),
    binaryLayout: join(binary, "forms", "frmX.form.txt"),
    sourceProbe: join(source, "Probe.bas"),
    binaryProbe: join(binary, "Probe.bas"),
  };
  return { root, adapter, calls, ...paths };
}

type Entry = { moduleName: string; fileType: string; classification: string; resolvedBy?: string };
type VerifyData = {
  actionableDifferent: Entry[];
  recommendedAction: string;
  bulkImportable: string[];
  bulkExportable: string[];
  baseResolved: string[];
};

async function verify(adapter: VbaSyncAdapter, moduleNames?: string[]): Promise<VerifyData> {
  const result = await adapter.execute(
    "verify_code",
    moduleNames === undefined ? {} : { moduleNames },
  );
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.data as VerifyData;
}

describe("a form's layout and code-behind are one module identity", () => {
  function conflictedForm() {
    const fx = fixture();
    // Access-side code edit (x = 9) and a source-side layout change (new control).
    writeFileSync(fx.sourceCls, codeBehind(1));
    writeFileSync(fx.binaryCls, codeBehind(9));
    writeFileSync(fx.sourceLayout, layout(true));
    writeFileSync(fx.binaryLayout, layout(false));
    return fx;
  }

  it("verify_code reports the .cls and the .form.txt under the same module name", async () => {
    const { adapter } = conflictedForm();

    const data = await verify(adapter);

    expect(data.actionableDifferent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleName: "frmX",
          fileType: "cls",
          classification: "bothChanged",
        }),
        expect.objectContaining({
          moduleName: "frmX",
          fileType: "form.txt",
          classification: "sourceNewer",
        }),
      ]),
    );
    expect(data.actionableDifferent).toHaveLength(2);
    // The .cls conflict blocks the whole form.
    expect(data.bulkImportable).toEqual([]);
    expect(data.recommendedAction).toBe("manual_merge");
  });

  it("a focused verify by either name sees both files", async () => {
    const { adapter } = conflictedForm();
    for (const name of ["frmX", "Form_frmX"]) {
      const data = await verify(adapter, [name]);
      expect(data.actionableDifferent.map((entry) => entry.fileType).sort()).toEqual([
        "cls",
        "form.txt",
      ]);
    }
  });

  it("sync_binary({apply:true}) does not import the form, so the Access-side code survives", async () => {
    const { adapter, calls, sourceCls, binaryCls } = conflictedForm();

    const result = await adapter.execute("sync_binary", { apply: true });
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    const data = result.data as { plan: { toImport: string[] } };

    expect(data.plan.toImport).toEqual([]);
    expect(calls.filter((call) => call.action === "Import")).toEqual([]);
    expect(readFileSync(binaryCls, "utf8")).toBe(codeBehind(9));
    expect(readFileSync(sourceCls, "utf8")).toBe(codeBehind(1));
  });

  it("a form without a conflict is still imported as one module", async () => {
    const { adapter, calls, sourceCls, binaryCls, sourceLayout, binaryLayout } = fixture();
    writeFileSync(sourceCls, codeBehind(1));
    writeFileSync(binaryCls, codeBehind(1));
    writeFileSync(sourceLayout, layout(true));
    writeFileSync(binaryLayout, layout(false));

    const data = await verify(adapter);
    expect(data.bulkImportable).toEqual(["frmX"]);

    const result = await adapter.execute("sync_binary", { apply: true });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(calls.filter((call) => call.action === "Import")).toEqual([
      expect.objectContaining({ moduleNames: ["frmX"] }),
    ]);
  });

  it("a report's layout and code-behind are one module too", async () => {
    const { root, adapter } = fixture();
    for (const side of ["source", "binary"] as const) {
      const dir = join(root, side, "modules", "reports");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "rptX.cls"),
        codeBehind(side === "source" ? 1 : 9).replace("Form_frmX", "Report_rptX"),
      );
      writeFileSync(
        join(dir, "rptX.report.txt"),
        layout(side === "source").replace("Begin Form", "Begin Report"),
      );
    }

    const data = await verify(adapter);

    expect(data.actionableDifferent.map((entry) => entry.moduleName)).toEqual(["rptX", "rptX"]);
    expect(data.bulkImportable).toEqual([]);
  });

  it("a standard module whose real name starts with Form_ keeps its own name", async () => {
    const { adapter, sourceProbe, binaryProbe } = fixture();
    const text = (value: number) => moduleText(value).replace('"Probe"', '"Form_Helper"');
    writeFileSync(sourceProbe, `${text(1)}Public Sub Added()\nEnd Sub\n`);
    writeFileSync(binaryProbe, text(1));

    const data = await verify(adapter);

    expect(data.actionableDifferent).toEqual([
      expect.objectContaining({ moduleName: "Form_Helper", classification: "sourceNewer" }),
    ]);
    expect(data.bulkImportable).toEqual(["Form_Helper"]);
  });
});

describe("a form is one module whatever its files are named", () => {
  type SyncData = { plan: { toImport: string[]; toExport: string[] }; recommendation: string };
  const formsDir = (root: string, side: string) => join(root, side, "modules", "forms");
  const clientes = (value: number) => codeBehind(value).replace("Form_frmX", "Form_Clientes");

  async function sync(adapter: VbaSyncAdapter, input: Record<string, unknown>): Promise<SyncData> {
    const result = await adapter.execute("sync_binary", input);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    return result.data as SyncData;
  }

  it("B1: sync_binary moduleNames by bare name scopes an export_all-layout form", async () => {
    const { root, adapter } = fixture();
    for (const side of ["source", "binary"]) {
      writeFileSync(join(formsDir(root, side), "Form_Clientes.cls"), clientes(1));
    }
    writeFileSync(join(formsDir(root, "source"), "Form_Clientes.form.txt"), layout(true));
    writeFileSync(join(formsDir(root, "binary"), "Form_Clientes.form.txt"), layout(false));

    for (const name of ["Clientes", "Form_Clientes"]) {
      const data = await sync(adapter, {
        moduleNames: [name],
        scope: { moduleNamesOnly: true },
      });
      // Reported under the source layout file's name, which export rewrites in place.
      expect(data.plan.toImport).toEqual(["Form_Clientes"]);
      expect(data.recommendation).toBe("import_to_binary");
    }
  });

  it.each(["Form_Clientes.cls", "FORM_CLIENTES.cls"])(
    "B2: a conflicted %s blocks a sourceNewer Clientes.form.txt",
    async (clsName) => {
      const { root, adapter } = fixture();
      writeFileSync(join(formsDir(root, "source"), clsName), clientes(1));
      writeFileSync(join(formsDir(root, "binary"), "Form_Clientes.cls"), clientes(9));
      writeFileSync(join(formsDir(root, "source"), "Clientes.form.txt"), layout(true));
      writeFileSync(join(formsDir(root, "binary"), "Form_Clientes.form.txt"), layout(false));

      const data = await verify(adapter);
      expect(new Set(data.actionableDifferent.map((entry) => entry.moduleName))).toEqual(
        new Set(["Clientes"]),
      );
      expect(data.bulkImportable).toEqual([]);
      expect(data.recommendedAction).toBe("manual_merge");

      const synced = await sync(adapter, { apply: true });
      expect(synced.plan.toImport).toEqual([]);
      expect(readFileSync(join(formsDir(root, "binary"), "Form_Clientes.cls"), "utf8")).toBe(
        clientes(9),
      );
    },
  );

  it("B3: opposite directions on one form's files are not auto-synced", async () => {
    const fx = fixture();
    const accessSide = `${codeBehind(1)}Public Sub AccessSide()\nEnd Sub\n`;
    writeFileSync(fx.sourceCls, codeBehind(1));
    writeFileSync(fx.binaryCls, accessSide);
    writeFileSync(fx.sourceLayout, layout(true));
    writeFileSync(fx.binaryLayout, layout(false));

    const data = await verify(fx.adapter);
    expect(data.bulkImportable).toEqual([]);
    expect(data.bulkExportable).toEqual([]);
    expect(data.recommendedAction).toBe("manual_merge");

    const synced = await sync(fx.adapter, { apply: true });
    expect(synced.plan).toMatchObject({ toImport: [], toExport: [] });
    expect(fx.calls.filter((call) => call.action === "Import")).toEqual([]);
    expect(readFileSync(fx.binaryCls, "utf8")).toBe(accessSide);
    expect(readFileSync(fx.sourceCls, "utf8")).toBe(codeBehind(1));

    // A one-way direction the caller accepted is still applied.
    const accepted = await sync(fx.adapter, {
      dryRun: true,
      direction: "binary-to-src",
      acceptBothChanged: true,
    });
    expect(accepted.plan.toExport).toEqual(["frmX"]);
  });

  it("a class module and a form's code-behind with the same file name stay apart", async () => {
    const { root, adapter } = fixture();
    const classText = (value: number) => moduleText(value).replace('"Probe"', '"Clientes"');
    for (const side of ["source", "binary"]) {
      mkdirSync(join(root, side, "modules", "classes"), { recursive: true });
      writeFileSync(join(root, side, "modules", "classes", "Clientes.cls"), classText(1));
      writeFileSync(
        join(formsDir(root, side), "Clientes.cls"),
        clientes(side === "source" ? 1 : 9),
      );
    }

    const result = await adapter.execute("verify_code", { diagnostic: true });
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    const data = result.data as VerifyData & { warnings?: { error?: string }[] };

    expect(data.actionableDifferent).toEqual([
      expect.objectContaining({
        moduleName: "Clientes",
        fileType: "cls",
        classification: "bothChanged",
      }),
    ]);
    expect(data.warnings ?? []).not.toContainEqual(
      expect.objectContaining({ error: "DUPLICATE_IDENTITY_KEY" }),
    );
  });

  it("A1: two forms literally named X and Form_X are compared separately", async () => {
    const { root, adapter } = fixture();
    for (const side of ["source", "binary"]) {
      // Access form "Clientes" changed binary-side; form "Form_Clientes" did not.
      writeFileSync(
        join(formsDir(root, side), "Clientes.cls"),
        clientes(side === "source" ? 1 : 9),
      );
      writeFileSync(
        join(formsDir(root, side), "Form_Clientes.cls"),
        clientes(1).replace("Form_Clientes", "Form_Form_Clientes"),
      );
    }

    const result = await adapter.execute("verify_code", { diagnostic: true });
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    const data = result.data as VerifyData & { warnings?: { error?: string }[] };

    expect(data.actionableDifferent).toEqual([
      expect.objectContaining({ moduleName: "Clientes", classification: "bothChanged" }),
    ]);
    expect(data.recommendedAction).toBe("manual_merge");
    // The ambiguity stays visible.
    expect(data.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ error: "DUPLICATE_IDENTITY_KEY" })]),
    );
  });
});

describe("two files of one kind for one form block the whole form", () => {
  type SyncData = { plan: { toImport: string[]; toExport: string[] } };
  const formsDir = (root: string, side: string) => join(root, side, "modules", "forms");
  const clientes = (value: number) => codeBehind(value).replace("Form_frmX", "Form_Clientes");

  async function plan(adapter: VbaSyncAdapter): Promise<SyncData["plan"]> {
    const result = await adapter.execute("sync_binary", { apply: false });
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    return (result.data as SyncData).plan;
  }

  async function verifyWithWarnings(adapter: VbaSyncAdapter) {
    const result = await adapter.execute("verify_code", { diagnostic: true });
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    return result.data as VerifyData & { warnings?: { error?: string; message?: string }[] };
  }

  it.each(["Form_Clientes", "Clientes"])(
    "a stale Form_Clientes.cls next to Clientes.cls never imports over an Access edit (binary %s.*)",
    async (binaryName) => {
      const { root, adapter, calls } = fixture();
      const src = formsDir(root, "source");
      const bin = formsDir(root, "binary");
      writeFileSync(join(src, "Clientes.form.txt"), layout(false));
      writeFileSync(join(src, "Clientes.cls"), clientes(9));
      writeFileSync(join(src, "Form_Clientes.cls"), clientes(1));
      writeFileSync(join(bin, `${binaryName}.form.txt`), layout(false));
      writeFileSync(join(bin, `${binaryName}.cls`), clientes(10));

      const data = await verifyWithWarnings(adapter);
      expect(data.bulkImportable).toEqual([]);
      expect(data.bulkExportable).toEqual([]);
      const duplicate = (data.warnings ?? []).find((w) => w.error === "DUPLICATE_IDENTITY_KEY");
      expect(duplicate?.message).toContain("forms/Clientes.cls");
      expect(duplicate?.message).toContain("forms/Form_Clientes.cls");

      expect(await plan(adapter)).toMatchObject({ toImport: [], toExport: [] });
      const synced = await adapter.execute("sync_binary", { apply: true });
      expect(synced.ok, JSON.stringify(synced)).toBe(true);
      expect(calls.filter((call) => call.action === "Import")).toEqual([]);
      expect(readFileSync(join(bin, `${binaryName}.cls`), "utf8")).toBe(clientes(10));
    },
  );

  it("P7: a stale Form_frmX.cls next to frmX.cls is not imported", async () => {
    const fx = fixture();
    writeFileSync(fx.sourceCls, codeBehind(1));
    writeFileSync(fx.binaryCls, codeBehind(9));
    writeFileSync(join(formsDir(fx.root, "source"), "Form_frmX.cls"), codeBehind(2));
    writeFileSync(fx.sourceLayout, layout(false));
    writeFileSync(fx.binaryLayout, layout(false));

    expect(await plan(fx.adapter)).toMatchObject({ toImport: [], toExport: [] });

    // An accepted one-way direction still applies the group, like any conflict.
    const accepted = await fx.adapter.execute("sync_binary", {
      dryRun: true,
      direction: "src-to-binary",
      acceptBothChanged: true,
    });
    if (!accepted.ok) throw new Error(JSON.stringify(accepted.error));
    expect((accepted.data as SyncData).plan.toImport).toEqual(["Form_frmX", "frmX"]);
  });

  it.each([
    ["source", "toImport"],
    ["binary", "toExport"],
  ] as const)("a single-.cls form changed only on the %s side still syncs", async (side, list) => {
    const fx = fixture();
    const added = `${codeBehind(1)}Public Sub Added()\nEnd Sub\n`;
    writeFileSync(fx.sourceCls, side === "source" ? added : codeBehind(1));
    writeFileSync(fx.binaryCls, side === "binary" ? added : codeBehind(1));
    writeFileSync(fx.sourceLayout, layout(false));
    writeFileSync(fx.binaryLayout, layout(false));

    expect((await plan(fx.adapter))[list]).toEqual(["frmX"]);
  });
});

describe("a write invalidates the base of a form under either of its names", () => {
  it.each(["frmX", "Form_frmX"])(
    "import_modules([%s]) voids the base of the form's code-behind",
    async (name) => {
      const { adapter, sourceCls, binaryCls, sourceLayout, binaryLayout } = fixture();
      writeFileSync(sourceCls, codeBehind(1));
      writeFileSync(binaryCls, codeBehind(1));
      writeFileSync(sourceLayout, layout(false));
      writeFileSync(binaryLayout, layout(false));
      await verify(adapter); // both sides agree: base records value 1
      writeFileSync(sourceCls, codeBehind(2));
      const imported = await adapter.execute("import_modules", {
        moduleNames: [name],
        apply: true,
      });
      expect(imported.ok, JSON.stringify(imported)).toBe(true);
      expect(readFileSync(binaryCls, "utf8")).toBe(codeBehind(2));
      writeFileSync(sourceCls, codeBehind(1)); // source reverted

      const data = await verify(adapter);

      const cls = data.actionableDifferent.find((entry) => entry.fileType === "cls");
      expect(cls).toMatchObject({ classification: "bothChanged" });
      expect(data.actionableDifferent.filter((entry) => entry.resolvedBy === "base")).toEqual([]);
    },
  );
});

describe("recommendedAction treats a base-resolved direction as needing confirmation", () => {
  it.each([
    ["source", "sourceNewer"],
    ["binary", "binaryNewer"],
  ] as const)(
    "only a %s-side change inferred from the base is manual_merge",
    async (side, expected) => {
      const { adapter, sourceProbe, binaryProbe } = fixture();
      writeFileSync(sourceProbe, moduleText(1));
      writeFileSync(binaryProbe, moduleText(1));
      await verify(adapter);
      writeFileSync(side === "source" ? sourceProbe : binaryProbe, moduleText(2));

      const data = await verify(adapter);

      expect(data.actionableDifferent).toEqual([
        expect.objectContaining({ classification: expected, resolvedBy: "base" }),
      ]);
      expect(data.bulkImportable).toEqual([]);
      expect(data.bulkExportable).toEqual([]);
      expect(data.recommendedAction).toBe("manual_merge");
    },
  );
});

// Issue #1962 — a form whose files sit in a nested folder under forms/ is still
// one document: a conflict on its .cls blocks the layout, whose embedded
// CodeBehindForm would otherwise overwrite the binary's code-behind.
describe("a form in a nested forms/ folder is one module identity", () => {
  const nested = (root: string, side: string) => join(root, side, "modules", "forms", "sub");
  const frmY = (value: number) => codeBehind(value).replace("Form_frmX", "Form_frmY");

  function nestedConflict() {
    const fx = fixture();
    for (const side of ["source", "binary"]) mkdirSync(nested(fx.root, side), { recursive: true });
    writeFileSync(join(nested(fx.root, "source"), "Form_frmY.cls"), frmY(1));
    writeFileSync(join(nested(fx.root, "binary"), "Form_frmY.cls"), frmY(9));
    writeFileSync(join(nested(fx.root, "source"), "frmY.form.txt"), layout(true));
    writeFileSync(join(nested(fx.root, "binary"), "frmY.form.txt"), layout(false));
    return fx;
  }

  it("P8: a bothChanged .cls blocks a sourceNewer layout in forms/sub/", async () => {
    const { root, adapter, calls } = nestedConflict();

    const data = await verify(adapter);
    expect(new Set(data.actionableDifferent.map((entry) => entry.moduleName))).toEqual(
      new Set(["frmY"]),
    );
    expect(data.bulkImportable).toEqual([]);
    expect(data.recommendedAction).toBe("manual_merge");

    const result = await adapter.execute("sync_binary", { apply: true });
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect((result.data as { plan: { toImport: string[] } }).plan.toImport).toEqual([]);
    expect(calls.filter((call) => call.action === "Import")).toEqual([]);
    expect(readFileSync(join(nested(root, "binary"), "Form_frmY.cls"), "utf8")).toBe(frmY(9));

    const accepted = await adapter.execute("sync_binary", {
      dryRun: true,
      direction: "src-to-binary",
      acceptBothChanged: true,
    });
    if (!accepted.ok) throw new Error(JSON.stringify(accepted.error));
    expect((accepted.data as { plan: { toImport: string[] } }).plan.toImport).toEqual(["frmY"]);
  });

  it("a class in a nested folder outside forms/ keeps its own name", async () => {
    const { root, adapter } = fixture();
    const text = (value: number) => moduleText(value).replace('"Probe"', '"Form_Helper"');
    for (const side of ["source", "binary"]) {
      const dir = join(root, side, "modules", "classes", "sub");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "Form_Helper.cls"),
        side === "source" ? `${text(1)}Public Sub Added()\nEnd Sub\n` : text(1),
      );
    }

    const data = await verify(adapter);

    expect(data.actionableDifferent).toEqual([
      expect.objectContaining({ moduleName: "Form_Helper", classification: "sourceNewer" }),
    ]);
    expect(data.bulkImportable).toEqual(["Form_Helper"]);
  });
});
