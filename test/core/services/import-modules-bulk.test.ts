import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  type BulkImportInputs,
  buildBulkImportPlan,
  chunkArray,
  collectModuleNamesFromDirectory,
  globToRegex,
  runBulkImportByDirectory,
} from "../../../src/core/services/import-modules-bulk";
import type { ComparisonFileSystemPort } from "../../../src/core/services/vba-source-comparison";

const noopFs = (() => {
  const inner: Pick<ComparisonFileSystemPort, "readdir" | "mkdtemp" | "tmpdir" | "exists"> = {
    readdir: async () => [],
    mkdtemp: async () => "",
    tmpdir: () => "",
    exists: async () => false,
  };
  return inner;
})();

// Real-filesystem-backed port for the directory walk tests.
// The bulk walker relies on readdir returning entries with isDirectory/
// isFile discriminators, which the standard node fs/promises readdir
// produces when `withFileTypes:true`.
const realFs: Pick<ComparisonFileSystemPort, "readdir" | "mkdtemp" | "tmpdir" | "exists"> = {
  readdir: async (path) => (await readdir(path, { withFileTypes: true })) as never,
  mkdtemp: async (prefix) => await mkdtemp(prefix),
  tmpdir: () => tmpdir(),
  exists: async (path) =>
    await stat(path)
      .then(() => true)
      .catch(() => false),
};

describe("globToRegex (#807 Feature 2)", () => {
  it("Test_* becomes anchored prefix-match", () => {
    const re = globToRegex("Test_*");
    expect(re.test("Test_One")).toBe(true);
    expect(re.test("Test_Two")).toBe(true);
    expect(re.test("Production")).toBe(false);
  });
  it("*Issue* becomes anchored substring match", () => {
    const re = globToRegex("*Issue*");
    expect(re.test("GenericIssue42")).toBe(true);
    expect(re.test("IssueTracker")).toBe(true);
    expect(re.test("Production")).toBe(false);
  });
  it("* matches everything", () => {
    const re = globToRegex("*");
    expect(re.test("Anything")).toBe(true);
    expect(re.test("")).toBe(true);
  });
});

describe("chunkArray (#807 Feature 2)", () => {
  it("chunks an array preserving order", () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it("size 0 returns the whole list as one chunk", () => {
    expect(chunkArray([1, 2, 3], 0)).toEqual([[1, 2, 3]]);
  });
  it("size larger than array yields one chunk", () => {
    expect(chunkArray([1, 2], 10)).toEqual([[1, 2]]);
  });
});

describe("collectModuleNamesFromDirectory (#807 Feature 2)", () => {
  let tmpRoot: string;
  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), "dysflow-bulk-"));
  });
  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("collects .bas, .cls, .form.txt, .report.txt module names", async () => {
    await writeFile(join(tmpRoot, "ModA.bas"), 'Attribute VB_Name = "ModA"\n');
    await writeFile(join(tmpRoot, "ClassB.cls"), 'Attribute VB_Name = "ClassB"\n');
    await writeFile(join(tmpRoot, "FormC.cls"), 'Attribute VB_Name = "FormC"\n');
    await writeFile(join(tmpRoot, "FormC.form.txt"), "version=1\n");
    await writeFile(join(tmpRoot, "ReportD.cls"), 'Attribute VB_Name = "ReportD"\n');
    await writeFile(join(tmpRoot, "ReportD.report.txt"), "version=1\n");
    await writeFile(join(tmpRoot, "ignored.txt"), "noise\n");
    const result = await collectModuleNamesFromDirectory({
      root: tmpRoot,
      recursive: false,
      filePattern: null,
      includeTests: true,
      includeForms: true,
      fileSystem: realFs,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect([...result.names].sort()).toEqual(["ClassB", "FormC", "ModA", "ReportD"]);
  });

  it("recursive: false excludes files in subdirectories", async () => {
    await writeFile(join(tmpRoot, "TopMod.bas"), "");
    await writeFile(join(tmpRoot, "modules", "NestedMod.bas"), "").catch(() => undefined);
    // Create the modules dir if mkdir was not in scope; use mkdir import.
    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(tmpRoot, "modules"), { recursive: true });
    await writeFile(join(tmpRoot, "modules", "NestedMod.bas"), "");
    const result = await collectModuleNamesFromDirectory({
      root: tmpRoot,
      recursive: false,
      filePattern: null,
      includeTests: true,
      includeForms: true,
      fileSystem: realFs,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(result.names).toEqual(["TopMod"]);
  });

  it("filePattern restricts the walk (Test_*)", async () => {
    await writeFile(join(tmpRoot, "Test_One.bas"), "");
    await writeFile(join(tmpRoot, "Test_Two.bas"), "");
    await writeFile(join(tmpRoot, "Production.bas"), "");
    const result = await collectModuleNamesFromDirectory({
      root: tmpRoot,
      recursive: false,
      filePattern: "Test_*",
      includeTests: true,
      includeForms: true,
      fileSystem: realFs,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect([...result.names].sort()).toEqual(["Test_One", "Test_Two"]);
  });

  it("includeTests: false excludes Test_*.bas files", async () => {
    await writeFile(join(tmpRoot, "Test_One.bas"), "");
    await writeFile(join(tmpRoot, "Production.bas"), "");
    const result = await collectModuleNamesFromDirectory({
      root: tmpRoot,
      recursive: false,
      filePattern: null,
      includeTests: false,
      includeForms: true,
      fileSystem: realFs,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(result.names).toEqual(["Production"]);
  });

  it("includeForms: false excludes Form_*/Report_* files", async () => {
    await writeFile(join(tmpRoot, "Production.bas"), "");
    await writeFile(join(tmpRoot, "Form_Main.cls"), "");
    await writeFile(join(tmpRoot, "Form_Main.form.txt"), "");
    await writeFile(join(tmpRoot, "Report_Run.cls"), "");
    const result = await collectModuleNamesFromDirectory({
      root: tmpRoot,
      recursive: false,
      filePattern: null,
      includeTests: true,
      includeForms: false,
      fileSystem: realFs,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(result.names).toEqual(["Production"]);
  });

  it("missing sourceDir returns BULK_IMPORT_SOURCE_MISSING", async () => {
    const result = await collectModuleNamesFromDirectory({
      root: join(tmpdir(), "dysflow-bulk-this-path-does-not-exist-anywhere"),
      recursive: false,
      filePattern: null,
      includeTests: true,
      includeForms: true,
      fileSystem: realFs,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("BULK_IMPORT_SOURCE_MISSING");
  });
});

describe("runBulkImportByDirectory (#807 Feature 2)", () => {
  it("moduleNames provided is rejected with BULK_IMPORT_SOURCE_MISSING when sourceDir does not exist", async () => {
    // The adapter routes the bulk path only when moduleNames is empty AND
    // sourceDir is set. The adapter layer does NOT pass a populated
    // moduleNames into the bulk path — when a caller wants to import a
    // specific list, the legacy single-call path is used. Here we assert
    // that the service-level path stays strict about sourceDir existence:
    // a missing root returns the typed error instead of silently failing.
    const result = await runBulkImportByDirectory(
      {
        sourceDir: join(tmpdir(), "dysflow-bulk-this-path-does-not-exist-anywhere-zzz"),
        recursive: true,
        filePattern: null,
        includeTests: true,
        includeForms: true,
        chunkSize: 10,
        onChunkError: "continue",
        dryRun: true,
        apply: false,
        target: { accessPath: "C:/db.accdb", destinationRoot: "C:/src" },
        mapping: {} as never,
        runImportModules: (async () => ({ ok: true, data: undefined })) as never,
      },
      noopFs,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("BULK_IMPORT_SOURCE_MISSING");
  });

  it("dryRun: returns plan without dispatching chunks", async () => {
    let called = 0;
    await runBulkImportByDirectory(
      {
        sourceDir: "C:/not-found-anywhere-but-service-uses-no-IO-here-12345",
        recursive: true,
        filePattern: null,
        includeTests: true,
        includeForms: true,
        chunkSize: 10,
        onChunkError: "continue",
        dryRun: true,
        apply: false,
        target: { accessPath: "C:/db.accdb", destinationRoot: "C:/src" },
        mapping: {} as never,
        runImportModules: (async () => {
          called += 1;
          return { ok: true, data: { result: [] } } as never;
        }) as never,
      },
      noopFs,
    );
    expect(called).toBe(0);
  });

  it("chunkSize: 5 → chunks of 5", async () => {
    // Build a tmp dir with 12 .bas files so we exercise a real chunked plan
    // (the runImportModules stub records the chunk sizes it receives).
    const root = await mkdtemp(join(tmpdir(), "dysflow-bulk-chunk-"));
    try {
      for (let i = 0; i < 12; i += 1) {
        await writeFile(join(root, `Mod${i}.bas`), "");
      }
      const sizes: number[] = [];
      const result = await runBulkImportByDirectory(
        {
          sourceDir: root,
          recursive: true,
          filePattern: null,
          includeTests: true,
          includeForms: true,
          chunkSize: 5,
          onChunkError: "continue",
          dryRun: false,
          apply: true,
          target: { accessPath: "C:/db.accdb", destinationRoot: root },
          mapping: {} as never,
          runImportModules: (async (params: Record<string, unknown>) => {
            const names = Array.isArray(params.moduleNames)
              ? (params.moduleNames as string[]).length
              : 0;
            sizes.push(names);
            return {
              ok: true,
              data: { result: [] },
            } as never;
          }) as never,
        },
        realFs,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      expect(sizes).toEqual([5, 5, 2]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("onChunkError: continue → first chunk failure keeps going", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-bulk-continue-"));
    try {
      for (let i = 0; i < 6; i += 1) {
        await writeFile(join(root, `Mod${i}.bas`), "");
      }
      let chunkIndex = 0;
      const result = await runBulkImportByDirectory(
        {
          sourceDir: root,
          recursive: true,
          filePattern: null,
          includeTests: true,
          includeForms: true,
          chunkSize: 3,
          onChunkError: "continue",
          dryRun: false,
          apply: true,
          target: { accessPath: "C:/db.accdb", destinationRoot: root },
          mapping: {} as never,
          runImportModules: (async (_params: Record<string, unknown>) => {
            const ci = chunkIndex;
            chunkIndex += 1;
            if (ci === 0) {
              return {
                ok: false,
                error: {
                  code: "VBA_MODULE_NOT_FOUND",
                  message: "synthetic",
                },
                diagnostics: [],
                durationMs: 0,
              } as never;
            }
            return {
              ok: true,
              data: { result: [] },
            } as never;
          }) as never,
        },
        realFs,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      expect(result.data.summary.chunks.failed).toBe(1);
      expect(result.data.summary.chunks.applied).toBeGreaterThanOrEqual(1);
      expect(result.data.chunkFailures.length).toBeGreaterThanOrEqual(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("buildBulkImportPlan (#807 Feature 2)", () => {
  it("mirrors the import plan shape with sourceDir / chunkSize / filters", () => {
    const inputs: BulkImportInputs = {
      sourceDir: "C:/src",
      recursive: true,
      filePattern: "Test_*",
      includeTests: true,
      includeForms: true,
      chunkSize: 10,
      onChunkError: "continue",
    };
    const plan = buildBulkImportPlan({
      sourceDir: "C:/src",
      chunkSize: 10,
      appliedFilters: {
        filePattern: "Test_*",
        includeTests: true,
        includeForms: true,
        recursive: true,
      },
      onChunkError: "continue",
      modulesPlanned: ["Test_One", "Test_Two"],
      warnings: [],
      errors: [],
    });
    expect(plan.dryRun).toBe(true);
    expect(plan.modulesPlanned).toEqual(["Test_One", "Test_Two"]);
    // The plan-builder mirror is not exported; we keep `inputs` here only to
    // satisfy the type pinning, not to reuse it.
    void inputs;
  });
});
