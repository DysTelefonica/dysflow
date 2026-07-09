import { describe, expect, it } from "vitest";

import {
  indexManagedSourceFiles,
  mapTypeFilterToVbComponentType,
  type VbaModuleInfo,
  type VbaTypeFilterName,
} from "../../../src/core/models/vba-module-info";
import {
  type ListVbaModulesRunnerResult,
  runListVbaModules,
} from "../../../src/core/services/list-vba-modules-service";
import type { ComparisonFileSystemPort } from "../../../src/core/services/vba-source-comparison";

class FakeFileSystem implements Pick<ComparisonFileSystemPort, "readdir"> {
  constructor(
    private readonly filesByDir: Map<string, FakeEntry[]>,
    private readonly emptyDirs: string[] = [],
  ) {}
  async readdir(
    dir: string,
  ): Promise<readonly { name: string; isDirectory(): boolean; isFile(): boolean }[]> {
    const lower = dir.toLowerCase();
    if (this.emptyDirs.includes(lower)) return [];
    const entries = this.filesByDir.get(lower);
    if (entries === undefined) return [];
    return entries.map((entry) => ({
      name: entry.name,
      isDirectory: () => entry.kind === "dir",
      isFile: () => entry.kind === "file",
    }));
  }
}

interface FakeEntry {
  name: string;
  kind: "file" | "dir";
}

interface CapturedRunnerCall {
  action: string;
  typeFilter: string | null;
  namePattern: string | null;
  applyTypeFilter: boolean;
  applyNamePattern: boolean;
}

function buildServiceHarness(input: {
  binaryRows: readonly {
    name: string;
    type: 1 | 2 | 3 | 100;
    fileType: "bas" | "cls" | "frm" | "form.txt";
  }[];
  sourceFiles?: FakeEntry[];
  emptyDirs?: string[];
  /** Optional hook to assert the runner was called with specific args. */
  captureRunnerCall?: (call: CapturedRunnerCall) => void;
  /** Reject resolveExecutionTarget to test failure paths. */
  resolveExecutionTargetFails?: boolean;
  /** Inject timeout envelope from the runner. */
  injectTimeout?: boolean;
}) {
  const calls: CapturedRunnerCall[] = [];
  const ctx = {
    scriptPath: "scripts/dysflow-vba-manager.ps1",
    resolveExecutionTarget: async (_p: Record<string, unknown>) => {
      if (input.resolveExecutionTargetFails) {
        return {
          ok: false as const,
          error: {
            code: "CONFIG_MISSING_ACCESS_PATH" as const,
            message: "no path",
            retryable: false,
          },
          diagnostics: [],
          durationMs: 0,
        };
      }
      return {
        ok: true as const,
        data: { destinationRoot: "C:/src", timeoutMs: 1000 },
        diagnostics: [],
        durationMs: 0,
      };
    },
    validateStrictContext: () => ({
      ok: true as const,
      data: undefined,
      diagnostics: [],
      durationMs: 0,
    }),
    runPreflightCleanup: async () => ({
      cleaned: [],
      killed: [],
      orphanedKilled: [],
      errors: [],
    }),
    runVbaManager: async (request: {
      action: string;
      extra: Record<string, string | boolean | number | undefined>;
    }) => {
      const callEntry: CapturedRunnerCall = {
        action: request.action,
        typeFilter: (request.extra.typeFilter as string | undefined) ?? null,
        namePattern: (request.extra.namePattern as string | undefined) ?? null,
        applyTypeFilter: Boolean(request.extra.applyTypeFilter),
        applyNamePattern: Boolean(request.extra.applyNamePattern),
      };
      calls.push(callEntry);
      if (input.injectTimeout) {
        return {
          exitCode: null,
          stdout: "",
          stderr: "",
          durationMs: 10_000,
          timedOut: true,
        };
      }
      const runnerPayload: ListVbaModulesRunnerResult = {
        ok: true,
        components: input.binaryRows.map((row) => ({
          name: row.name,
          type: row.type,
          fileType: row.fileType,
        })),
        appliedFilters: {
          typeFilter: callEntry.applyTypeFilter
            ? (callEntry.typeFilter as VbaTypeFilterName)
            : null,
          namePattern: callEntry.applyNamePattern ? callEntry.namePattern : null,
        },
      };
      return {
        exitCode: 0,
        stdout: `DYSFLOW_RESULT ${JSON.stringify(runnerPayload)}`,
        stderr: "",
        durationMs: 1,
        timedOut: false,
      };
    },
  };
  const fs = new FakeFileSystem(
    new Map([
      [
        "c:/src",
        input.sourceFiles ??
          ([
            { name: "ModuleA", kind: "file" },
            { name: "ModuleA.bas", kind: "file" },
            { name: "FormB", kind: "file" },
            { name: "FormB.form.txt", kind: "file" },
            { name: "ClassC.cls", kind: "file" },
            { name: "OrphanOnly.bas", kind: "file" },
          ] as FakeEntry[]),
      ],
    ]),
    input.emptyDirs,
  );

  return { ctx, fs, calls };
}

describe("runListVbaModules (#807 Feature 1)", () => {
  it("empty VBProject → empty modules + summary { total: 0 }", async () => {
    const { ctx, fs } = buildServiceHarness({
      binaryRows: [],
      // Treat destinationRoot as missing so source-walk does not emit
      // source-only rows. The cross-reference pass ONLY runs when the
      // binary side has at least one row OR the source walk produces
      // entries; this test focuses on the binary-side emptiness.
      emptyDirs: ["c:/src"],
    });
    const result = await runListVbaModules({}, ctx, fs);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(result.data.modules).toEqual([]);
    expect(result.data.summary).toEqual({
      total: 0,
      inBinaryOnly: 0,
      inSourceOnly: 0,
      inBoth: 0,
    });
  });

  it("mixed project surfaces standards + classes + forms with correct types", async () => {
    const { ctx, fs } = buildServiceHarness({
      binaryRows: [
        { name: "ModuleA", type: 1, fileType: "bas" },
        { name: "FormB", type: 3, fileType: "form.txt" },
        { name: "ClassC", type: 2, fileType: "cls" },
      ],
      sourceFiles: [
        { name: "ModuleA.bas", kind: "file" },
        { name: "FormB.form.txt", kind: "file" },
        { name: "ClassC.cls", kind: "file" },
      ],
    });
    const result = await runListVbaModules({}, ctx, fs);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(result.data.modules).toHaveLength(3);
    const byName: Record<string, VbaModuleInfo> = {};
    for (const m of result.data.modules) byName[m.name] = m;
    expect(byName.ModuleA?.type).toBe(1);
    expect(byName.ModuleA?.sourceExists).toBe(true);
    expect(byName.ModuleA?.binaryExists).toBe(true);
    expect(byName.FormB?.type).toBe(3);
    expect(byName.ClassC?.type).toBe(2);
    expect(result.data.summary).toEqual({
      total: 3,
      inBinaryOnly: 0,
      inSourceOnly: 0,
      inBoth: 3,
    });
  });

  it("typeFilter applied → only matching types returned in the binary rows", async () => {
    const { ctx, fs, calls } = buildServiceHarness({
      binaryRows: [{ name: "ModuleA", type: 1, fileType: "bas" }],
      sourceFiles: [{ name: "ModuleA.bas", kind: "file" }],
    });
    const result = await runListVbaModules({ typeFilter: "standard" }, ctx, fs);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(calls[0]?.applyTypeFilter).toBe(true);
    expect(calls[0]?.typeFilter).toBe("standard");
    const row = result.data.modules[0];
    expect(row?.name).toBe("ModuleA");
    expect(row?.type).toBe(1);
  });

  it("namePattern applied → only matching names returned (glob wildcards stripped)", async () => {
    const { ctx, fs, calls } = buildServiceHarness({
      binaryRows: [{ name: "Test_One", type: 1, fileType: "bas" }],
      sourceFiles: [{ name: "Test_One.bas", kind: "file" }],
    });
    const result = await runListVbaModules({ namePattern: "Test_*" }, ctx, fs);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(calls[0]?.applyNamePattern).toBe(true);
    // The TS service strips the trailing `*` and forwards `Test_` so the
    // PowerShell-side substring check is the one doing the work. The
    // wildcard semantics are documented at the TS seam.
    expect(calls[0]?.namePattern).toBe("Test_");
    expect(result.data.modules[0]?.name).toBe("Test_One");
  });

  it("Source cross-reference: sourceExists computed from filesystem walk, no Access call", async () => {
    const { ctx, fs } = buildServiceHarness({
      binaryRows: [
        { name: "ModuleA", type: 1, fileType: "bas" },
        { name: "GhostModule", type: 1, fileType: "bas" },
      ],
      sourceFiles: [{ name: "ModuleA.bas", kind: "file" }],
    });
    const result = await runListVbaModules({}, ctx, fs);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    const byName: Record<string, VbaModuleInfo> = {};
    for (const m of result.data.modules) byName[m.name] = m;
    expect(byName.ModuleA?.sourceExists).toBe(true);
    expect(byName.ModuleA?.binaryExists).toBe(true);
    expect(byName.GhostModule?.sourceExists).toBe(false);
    expect(byName.GhostModule?.binaryExists).toBe(true);
    // Source-only: a disk-side file with no binary counterpart.
    // The walker reports it because the harness doesn't carry it, but the
    // cross-reference still pairs the binary side correctly.
  });

  it("runner times out → surfaces VBA_MANAGER_TIMEOUT", async () => {
    const { ctx, fs } = buildServiceHarness({
      binaryRows: [],
      injectTimeout: true,
    });
    const result = await runListVbaModules({}, ctx, fs);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("VBA_MANAGER_TIMEOUT");
  });

  it("resolveExecutionTarget fails → surfaces CONFIG_MISSING_ACCESS_PATH", async () => {
    const { ctx, fs } = buildServiceHarness({
      binaryRows: [],
      resolveExecutionTargetFails: true,
    });
    const result = await runListVbaModules({}, ctx, fs);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("CONFIG_MISSING_ACCESS_PATH");
  });
});

describe("indexManagedSourceFiles (#807 Feature 1)", () => {
  it("returns module names keyed by extension (bas / cls / form.txt)", async () => {
    const fs = new FakeFileSystem(
      new Map([
        [
          "c:/src",
          [
            { name: "ModA.bas", kind: "file" },
            { name: "ModA", kind: "file" },
            { name: "FormA.cls", kind: "file" },
            { name: "FormA.form.txt", kind: "file" },
            { name: "ReportA.report.txt", kind: "file" },
            { name: "ClassB.cls", kind: "file" },
            { name: "ignore.txt", kind: "file" },
          ],
        ],
      ]),
    );
    const entries = await indexManagedSourceFiles("C:/src", fs);
    expect(entries).toHaveLength(5);
    const names = entries.map((e) => e.moduleName);
    expect(names).toContain("ModA");
    expect(names).toContain("FormA");
    expect(names).toContain("ReportA");
    expect(names).toContain("ClassB");
    expect(names).not.toContain("ignore");
  });
});

describe("mapTypeFilterToVbComponentType (#807 Feature 1)", () => {
  it("maps standard/class to single-component types", () => {
    expect(mapTypeFilterToVbComponentType("standard")).toEqual([1]);
    expect(mapTypeFilterToVbComponentType("class")).toEqual([2]);
    expect(mapTypeFilterToVbComponentType("document")).toEqual([100]);
  });
  it("maps form/report to type 3", () => {
    expect(mapTypeFilterToVbComponentType("form")).toEqual([3]);
    expect(mapTypeFilterToVbComponentType("report")).toEqual([3]);
  });
});
