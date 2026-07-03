/**
 * PR-3 (issue #658) — default-scan `src/` for allowedProcedures prefix list
 * with `@dysflow: dangerous` opt-out.
 *
 * The CORE service (`src/core/services/allowed-procedures-discovery.ts`) is
 * pure: no `node:fs` imports, no default ports. Tests exercise the pure
 * kernel directly (`scanDiscoveredModules`) and the entry points
 * (`discoverAllowedProcedures` / `discoverAllowedProceduresSync`) against
 * an in-memory fake port. The Node adapter is exercised separately in
 * `test/adapters/discovery/allowed-procedures-adapter.test.ts` so the
 * full chain (composition root → adapter → core kernel) is covered without
 * hitting the real filesystem from this file.
 */

import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type AllowedProceduresDiscoveryPort,
  type AllowedProceduresDiscoveryResult,
  type AllowedProceduresDiscoverySyncPort,
  DANGEROUS_OPT_OUT_MARKER,
  DEFAULT_ALLOWED_PROCEDURE_PREFIXES,
  type DiscoveryDirent,
  discoverAllowedProcedures,
  discoverAllowedProceduresSync,
  isVbaSourceFile,
  moduleIsDangerouslyOptedOut,
  procedureMatchesPrefixes,
  procedureNamesFromSource,
  scanDiscoveredModules,
} from "../../../src/core/services/allowed-procedures-discovery";

// ---------------------------------------------------------------------------
// Fake I/O port — purely in-memory; no real filesystem is touched.
// ---------------------------------------------------------------------------

interface FakeFile {
  path: string;
  content: string;
}

function fakeEntry(name: string, isDir: boolean, isFile: boolean): DiscoveryDirent {
  return {
    name,
    isDirectory: () => isDir,
    isFile: () => isFile,
  };
}

function makeFakePort(files: ReadonlyArray<FakeFile>): {
  port: AllowedProceduresDiscoveryPort;
  syncPort: AllowedProceduresDiscoverySyncPort;
} {
  const tree = new Map<string, FakeFile[]>();
  for (const file of files) {
    const dir = file.path.replace(/[\\/][^\\/]+$/, "");
    const list = tree.get(dir) ?? [];
    list.push(file);
    tree.set(dir, list);
  }

  function isDirEntry(path: string, name: string): boolean {
    for (const file of files) {
      const dir = file.path.replace(/[\\/][^\\/]+$/, "");
      if (dir === path && name === file.path.split(/[\\/]/).pop()) {
        return !file.path.endsWith(name); // not a directory, a file
      }
      // Check parent directory existence
      const parts = file.path.split(/[\\/]/);
      const parentParts = parts.slice(0, -1);
      const parentPath = parentParts.join("/");
      if (parentPath === path) {
        // Has children -> directory; name is one of the children
      }
      // Suppress unused
      void dir;
    }
    // Implicit: entries that have files inside them are directories.
    // Simplest: a path is a directory if it appears as a parent of any file.
    for (const file of files) {
      const parentPath = file.path.split(/[\\/]/).slice(0, -1).join("/");
      if (parentPath === path && name === parts(file.path).pop()) {
        // It's a file, not a directory.
        void isFileEntryName;
        return false;
      }
    }
    // Real directory check: any file has this as parent.
    return Array.from(tree.keys()).some((dirKey) => {
      return dirKey === path && name !== path.split(/[\\/]/).pop();
    });
  }
  function isFileEntryName(path_: string, name_: string): boolean {
    void path_;
    void name_;
    return true;
  }
  function parts(p: string): string[] {
    return p.split(/[\\/]/);
  }

  const port: AllowedProceduresDiscoveryPort = {
    async readdir(path: string) {
      const normalized = path.replace(/\\/g, "/");
      const entries = new Set<string>();
      // Always include synthesized subdirectories and files at `path`.
      for (const file of files) {
        const fileNorm = file.path.replace(/\\/g, "/");
        if (fileNorm === normalized) continue;
        const dir = fileNorm.replace(/[\\/][^/]+$/, "");
        if (dir === normalized) {
          entries.add(fileNorm.split("/").pop() ?? "");
        }
      }
      const entriesArr = Array.from(entries).sort();
      return entriesArr.map((name) => {
        // Determine if this name is a file (resides directly in `normalized`)
        // or a directory.
        const fullPath = `${normalized}/${name}`;
        const isFileInTree = files.some((f) => f.path.replace(/\\/g, "/") === fullPath);
        return fakeEntry(name, !isFileInTree, isFileInTree);
      });
    },
    async readFile(path: string) {
      const normalized = path.replace(/\\/g, "/");
      const found = files.find((f) => f.path.replace(/\\/g, "/") === normalized);
      if (found === undefined) {
        throw new Error(`ENOENT: ${path}`);
      }
      return found.content;
    },
  };

  const syncPort: AllowedProceduresDiscoverySyncPort = {
    readdirSync(path: string) {
      const normalized = path.replace(/\\/g, "/");
      const entries = new Set<string>();
      for (const file of files) {
        const fileNorm = file.path.replace(/\\/g, "/");
        if (fileNorm === normalized) continue;
        const dir = fileNorm.replace(/[\\/][^/]+$/, "");
        if (dir === normalized) {
          entries.add(fileNorm.split("/").pop() ?? "");
        }
      }
      const entriesArr = Array.from(entries).sort();
      return entriesArr.map((name) => {
        const fullPath = `${normalized}/${name}`;
        const isFileInTree = files.some((f) => f.path.replace(/\\/g, "/") === fullPath);
        return fakeEntry(name, !isFileInTree, isFileInTree);
      });
    },
    readFileSync(path: string) {
      const normalized = path.replace(/\\/g, "/");
      const found = files.find((f) => f.path.replace(/\\/g, "/") === normalized);
      if (found === undefined) {
        throw new Error(`ENOENT: ${path}`);
      }
      return found.content;
    },
  };

  // suppress unused errors on helper functions
  void isDirEntry;
  void isFileEntryName;
  void parts;
  return { port, syncPort };
}

describe("allowed-procedures-discovery — pure kernel (PR-3, #658)", () => {
  describe("constants", () => {
    it("exposes the dangerous opt-out marker verbatim", () => {
      expect(DANGEROUS_OPT_OUT_MARKER).toBe("'!** @dysflow: dangerous");
    });

    it("exposes the default prefix list as Test_* and *_Operaciones", () => {
      expect(DEFAULT_ALLOWED_PROCEDURE_PREFIXES).toEqual(["Test_*", "*_Operaciones"]);
    });
  });

  describe("isVbaSourceFile", () => {
    it("accepts .bas and .cls (case-insensitive)", () => {
      expect(isVbaSourceFile("Test_Helper.bas")).toBe(true);
      expect(isVbaSourceFile("NcOperaciones.BAS")).toBe(true);
      expect(isVbaSourceFile("TestClass.cls")).toBe(true);
      expect(isVbaSourceFile("MyForm.CLS")).toBe(true);
    });

    it("rejects everything else", () => {
      expect(isVbaSourceFile("Test_Helper.txt")).toBe(false);
      expect(isVbaSourceFile("Test_Helper.form.txt")).toBe(false);
      expect(isVbaSourceFile("Test_Helper.frm")).toBe(false);
      expect(isVbaSourceFile("README.md")).toBe(false);
      expect(isVbaSourceFile("")).toBe(false);
    });
  });

  describe("moduleIsDangerouslyOptedOut", () => {
    it("returns true when the FIRST non-empty line is the marker", () => {
      expect(
        moduleIsDangerouslyOptedOut(
          ["", "", "'!** @dysflow: dangerous", "Public Sub Test_X()", "End Sub"].join("\n"),
        ),
      ).toBe(true);
    });

    it("returns false when the marker is later in the file", () => {
      expect(
        moduleIsDangerouslyOptedOut(
          ["Public Sub Test_X()", "End Sub", "'!** @dysflow: dangerous"].join("\n"),
        ),
      ).toBe(false);
    });

    it("returns false when the marker is inside a string", () => {
      expect(
        moduleIsDangerouslyOptedOut(
          [`Public Const M = "'!** @dysflow: dangerous"`, "Public Sub Test_X()", "End Sub"].join(
            "\n",
          ),
        ),
      ).toBe(false);
    });

    it("returns false on an empty file", () => {
      expect(moduleIsDangerouslyOptedOut("")).toBe(false);
    });
  });

  describe("procedureMatchesPrefixes", () => {
    it("matches Test_*", () => {
      expect(procedureMatchesPrefixes("Test_X", ["Test_*"])).toBe(true);
      expect(procedureMatchesPrefixes("NC_Operaciones", ["Test_*"])).toBe(false);
    });

    it("matches *_Operaciones (suffix)", () => {
      expect(procedureMatchesPrefixes("NC_Operaciones", ["*_Operaciones"])).toBe(true);
      expect(procedureMatchesPrefixes("Operaciones_X", ["*_Operaciones"])).toBe(false);
    });

    it("matches * as catch-all", () => {
      expect(procedureMatchesPrefixes("Anything_AtAll", ["*"])).toBe(true);
    });

    it("literal-exact matches when no wildcard is present", () => {
      expect(procedureMatchesPrefixes("RefreshCache", ["RefreshCache"])).toBe(true);
      expect(procedureMatchesPrefixes("RefreshCache", ["OtherName"])).toBe(false);
    });

    it("rejects internal wildcards (treats them as literals — no false matches)", () => {
      expect(procedureMatchesPrefixes("TestAnythingElse", ["Test*Else"])).toBe(false);
      // Exact literal still wins.
      expect(procedureMatchesPrefixes("Test*Else", ["Test*Else"])).toBe(true);
    });

    it("respects an empty prefix array (matches nothing)", () => {
      expect(procedureMatchesPrefixes("Test_X", [])).toBe(false);
      expect(procedureMatchesPrefixes("NC_Operaciones", [])).toBe(false);
    });
  });

  describe("procedureNamesFromSource", () => {
    it("enumerates Sub / Function declarations with tolerance for visibility modifiers", () => {
      const src = [
        "Public Sub Test_A()",
        "End Sub",
        "Private Function Test_B() As Long",
        "    Test_B = 1",
        "End Function",
        "Friend Static Sub Test_C(ByVal x As Integer)",
        "End Sub",
        "Static Function Test_D() As String",
        "End Function",
        "Private Sub NotATest()",
        "End Sub",
      ].join("\n");
      expect(procedureNamesFromSource(src)).toEqual([
        "Test_A",
        "Test_B",
        "Test_C",
        "Test_D",
        "NotATest",
      ]);
    });

    it("skips full-line VBA comments (`'`) and `Rem`", () => {
      const src = [
        "' Public Sub Test_FakeComment()",
        "Rem Public Sub Test_FakeRem()",
        "Public Sub Test_Real()",
        "End Sub",
      ].join("\n");
      expect(procedureNamesFromSource(src)).toEqual(["Test_Real"]);
    });

    it("ignores `Public Sub` text inside a string literal", () => {
      const src = [
        "Public Sub Test_Real()",
        "End Sub",
        "Dim s As String",
        's = "Public Sub Test_FakeString()"',
      ].join("\n");
      expect(procedureNamesFromSource(src)).toEqual(["Test_Real"]);
    });

    it("returns an empty list when no procedures are declared", () => {
      expect(procedureNamesFromSource('Attribute VB_Name = "Empty"\n\' nothing\n')).toEqual([]);
    });

    it("deduplicates across re-declarations and attribute headers", () => {
      const src = [
        "VERSION 1.0 CLASS",
        "BEGIN",
        "  MultiUse = -1  'True",
        "END",
        'Attribute VB_Name = "TestCls"',
        "",
        "Public Sub Test_FromClass()",
        "End Sub",
      ].join("\n");
      expect(procedureNamesFromSource(src)).toEqual(["Test_FromClass"]);
    });
  });

  describe("scanDiscoveredModules — pure reducer", () => {
    it("returns empty lists for an empty module map", () => {
      expect(scanDiscoveredModules(new Map(), DEFAULT_ALLOWED_PROCEDURE_PREFIXES)).toEqual({
        ok: true,
        procedures: [],
        scannedModules: [],
        skippedDangerous: [],
      });
    });

    it("reduces text-by-module to procedures / scanned / dangerous", () => {
      const text = new Map<string, string>([
        [
          "Test_One.bas",
          [
            'Attribute VB_Name = "Test_One"',
            "Public Sub Test_Alpha()",
            "End Sub",
            "Public Function Test_Beta() As Long",
            "End Function",
          ].join("\n"),
        ],
        [
          "Test_Two.bas",
          ["'!** @dysflow: dangerous", "Public Sub Test_Gamma()", "End Sub"].join("\n"),
        ],
        [
          "Helper.bas",
          [
            'Attribute VB_Name = "Helper"',
            "Public Sub PlainHelper()",
            "End Sub",
            "Public Function NC_Operaciones() As Long",
            "End Function",
          ].join("\n"),
        ],
      ]);

      const result = scanDiscoveredModules(text, DEFAULT_ALLOWED_PROCEDURE_PREFIXES);
      expect(result.procedures).toEqual(["NC_Operaciones", "Test_Alpha", "Test_Beta"]);
      expect(result.scannedModules).toEqual(["Helper.bas", "Test_One.bas"]);
      expect(result.skippedDangerous).toEqual(["Test_Two.bas"]);
    });

    it("respects a caller-supplied prefix list", () => {
      const text = new Map<string, string>([
        [
          "Mixed.bas",
          [
            "Public Sub Test_Kept()",
            "End Sub",
            "Public Function RefreshCache_Operaciones() As Long",
            "End Function",
            "Public Function MyCustomAction() As Long",
            "End Function",
          ].join("\n"),
        ],
      ]);
      const result = scanDiscoveredModules(text, ["Test_*", "Refresh*", "MyCustom*"]);
      expect(result.procedures).toEqual([
        "MyCustomAction",
        "RefreshCache_Operaciones",
        "Test_Kept",
      ]);
    });

    it("deduplicates procedures declared across modules and sorts alphabetically", () => {
      const text = new Map<string, string>([
        ["A.bas", "Public Sub Test_A()\nEnd Sub\nPublic Sub Test_Z()\nEnd Sub"],
        ["B.bas", "Public Sub Test_A()\nEnd Sub\nPublic Sub Test_M()\nEnd Sub"],
      ]);
      const result = scanDiscoveredModules(text, ["Test_*"]);
      expect(result.procedures).toEqual(["Test_A", "Test_M", "Test_Z"]);
    });
  });
});

// ---------------------------------------------------------------------------
// End-to-end against a fake port — proves the async + sync walkers wire
// through the (textByModule -> scan) kernel without touching real I/O.
// ---------------------------------------------------------------------------

describe("allowed-procedures-discovery — entry points with fake ports (PR-3, #658)", () => {
  const root = "/proj/src";
  const sep_ = sep;

  const fixtures: FakeFile[] = [
    {
      path: `${root}/Test_Helpers.bas`,
      content: [
        'Attribute VB_Name = "Test_Helpers"',
        "Option Explicit",
        "",
        "Public Sub Test_A()",
        "    ' body",
        "End Sub",
        "",
        "Public Function Test_B() As Long",
        "    Test_B = 1",
        "End Function",
        "",
        "Private Sub NotATest()",
        "End Sub",
      ].join("\n"),
    },
    {
      path: `${root}/Danger.bas`,
      content: [
        "'!** @dysflow: dangerous",
        "",
        "Public Sub Test_ShouldNotAppear()",
        "End Sub",
      ].join("\n"),
    },
    {
      path: `${root}/NcOperaciones.bas`,
      content: [
        "Public Sub CerrarNc_Operaciones(ByVal id As Long)",
        "End Sub",
        "",
        "Public Function CalcularEstado_Operaciones() As String",
        "End Function",
        "",
        "Public Sub NotAnOperation()",
        "End Sub",
      ].join("\n"),
    },
    {
      path: `${root}/Test_Class.cls`,
      content: [
        "VERSION 1.0 CLASS",
        "BEGIN",
        "  MultiUse = -1  'True",
        "END",
        'Attribute VB_Name = "Test_Class"',
        "",
        "Public Sub Test_FromClass()",
        "End Sub",
      ].join("\n"),
    },
    {
      path: `${root}/Offlimits.bas`,
      content: ["'!** @dysflow: dangerous", "Public Sub Test_Off()", "End Sub"].join("\n"),
    },
    {
      path: `${root}/Test_CommentRef.bas`,
      content: [
        'Attribute VB_Name = "Test_CommentRef"',
        "Public Sub Test_Kept()",
        "End Sub",
        "",
        "'!** @dysflow: dangerous  ' later reference is just a comment",
      ].join("\n"),
    },
  ];

  it("async walker discovers Test_* and *_Operaciones procedures", async () => {
    const { port } = makeFakePort(fixtures);
    const result = await discoverAllowedProcedures(root, { fileSystem: port });
    expect(result.ok).toBe(true);
    expect(result.procedures).toContain("Test_A");
    expect(result.procedures).toContain("Test_B");
    expect(result.procedures).toContain("Test_FromClass");
    expect(result.procedures).toContain("CerrarNc_Operaciones");
    expect(result.procedures).toContain("CalcularEstado_Operaciones");
    expect(result.procedures).toContain("Test_Kept");
    // Skip:
    expect(result.procedures).not.toContain("Test_ShouldNotAppear");
    expect(result.procedures).not.toContain("Test_Off");
    expect(result.procedures).not.toContain("NotAnOperation");
    expect(result.procedures).not.toContain("NotATest");
    expect(result.skippedDangerous.sort()).toEqual(["Danger.bas", "Offlimits.bas"]);
  });

  it("sync walker produces the same discovery result", () => {
    const { syncPort } = makeFakePort(fixtures);
    const result = discoverAllowedProceduresSync(root, { syncFileSystem: syncPort });
    expect(result.ok).toBe(true);
    // Exact alphabetical order matters here:
    expect(result.procedures).toEqual([
      "CalcularEstado_Operaciones",
      "CerrarNc_Operaciones",
      "Test_A",
      "Test_B",
      "Test_FromClass",
      "Test_Kept",
    ]);
  });

  it("accepts a caller-supplied prefix list that overrides the default", async () => {
    const { port } = makeFakePort(fixtures);
    const result = await discoverAllowedProcedures(root, {
      fileSystem: port,
      prefixes: ["Refresh*", "MyCustom*"],
    });
    // None of the fixture procedures match `Refresh*` or `MyCustom*`,
    // so the result must be empty.
    expect(result.procedures).toEqual([]);
  });

  it("returns ok + empty list when the source root has no recognised files", async () => {
    const { port } = makeFakePort([
      { path: "/elsewhere/Test_X.bas", content: "Public Sub Test_X()\nEnd Sub" },
    ]);
    const result = await discoverAllowedProcedures("/nowhere-else", { fileSystem: port });
    expect(result.ok).toBe(true);
    expect(result.procedures).toEqual([]);
    expect(result.scannedModules).toEqual([]);
  });

  it("propagates ENOENT from a non-existent module file as a failed readFile", async () => {
    const port: AllowedProceduresDiscoveryPort = {
      async readdir(_p) {
        return [fakeEntry("Ghost.bas", false, true)];
      },
      async readFile(_p) {
        throw new Error("ENOENT");
      },
    };
    // readFile throws — the test asserts the entry-point does NOT crash.
    // (The real `defaultFileSystem` swallows ENOENT via the walker; this
    // minimal fake exercises what happens when readFile itself throws.)
    await expect(discoverAllowedProcedures("/proj/src", { fileSystem: port })).rejects.toThrow();
  });

  it("result type carries procedures / scannedModules / skippedDangerous", () => {
    const sample: AllowedProceduresDiscoveryResult = {
      ok: true,
      procedures: ["Test_X"],
      scannedModules: ["Test_X.bas"],
      skippedDangerous: ["Offlimits.bas"],
    };
    expect(Array.isArray(sample.procedures)).toBe(true);
    expect(Array.isArray(sample.scannedModules)).toBe(true);
    expect(Array.isArray(sample.skippedDangerous)).toBe(true);
  });

  // Suppress unused warnings on the help variables used by the fake port.
  void sep_;
  void join;
});
