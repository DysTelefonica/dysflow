/**
 * Issue #779 — source-overlap detection (`path-overlap.ts`).
 *
 * Locks down the platform-aware overlap primitive consumed by the
 * `export_modules` / `export_all` source-overwrite guard and any future
 * consumer that needs to know "is this destination INSIDE the project's
 * managed source tree?".
 *
 * The test suite covers:
 *
 * - **Equal path** (root === destination) → true.
 * - **Nested managed folder** (destination === sourceRoot/modules) → true.
 * - **Nested under managed folder** (destination deeper than forms/...) → true.
 * - **Sibling project** (no overlap) → false.
 * - **Case-insensitivity on Windows** (drive letter + folder casing) → true.
 * - **Empty / whitespace destination** → false (defensive).
 * - **Custom managedFolders** argument narrows the managed set.
 */

import { describe, expect, it } from "vitest";
import {
  buildOverlapCandidates,
  DEFAULT_MANAGED_SOURCE_FOLDERS,
  pathOverlapsSourceRoot,
} from "../../../src/core/utils/path-overlap";

describe("DEFAULT_MANAGED_SOURCE_FOLDERS — stable taxonomy", () => {
  it("matches the vba-modules-adapter managedFolders set", () => {
    expect([...DEFAULT_MANAGED_SOURCE_FOLDERS]).toEqual(["modules", "classes", "forms", "reports"]);
  });
});

describe("buildOverlapCandidates() — candidate set per source root", () => {
  it("returns the root plus each managed folder under it (lexically normalized)", () => {
    const candidates = buildOverlapCandidates("C:/project/src");
    expect(candidates.length).toBe(1 + DEFAULT_MANAGED_SOURCE_FOLDERS.length);
    expect(candidates[0]).toBe("c:/project/src");
    expect(candidates).toContain("c:/project/src/modules");
    expect(candidates).toContain("c:/project/src/classes");
    expect(candidates).toContain("c:/project/src/forms");
    expect(candidates).toContain("c:/project/src/reports");
  });

  it("returns no candidates when the source root is empty", () => {
    expect(buildOverlapCandidates("")).toEqual([]);
    expect(buildOverlapCandidates("   ")).toEqual([]);
  });

  it("honors a custom managed-folder set", () => {
    const candidates = buildOverlapCandidates("C:/project/src", ["modules", "scripts"]);
    expect(candidates).toEqual([
      "c:/project/src",
      "c:/project/src/modules",
      "c:/project/src/scripts",
    ]);
  });
});

describe("pathOverlapsSourceRoot() — happy paths", () => {
  it("returns true when destination equals the source root", () => {
    expect(pathOverlapsSourceRoot("c:/project/src", "C:/project/src")).toBe(true);
  });

  it("returns true when destination sits inside a managed folder", () => {
    expect(pathOverlapsSourceRoot("C:/PROJECT/SRC/forms", "c:/project/src")).toBe(true);
    expect(pathOverlapsSourceRoot("c:/project/src/modules", "C:/project/src")).toBe(true);
  });

  it("returns true when destination is nested deeper than a managed folder", () => {
    expect(pathOverlapsSourceRoot("C:/project/src/forms/Form_Customer.frm", "c:/project/src")).toBe(
      true,
    );
  });

  it("treats trailing separators as equivalent (normalized away)", () => {
    expect(pathOverlapsSourceRoot("C:/project/src/", "c:/project/src")).toBe(true);
    expect(pathOverlapsSourceRoot("c:/project/src\\", "C:/project/src")).toBe(true);
  });

  it("uses backslashes and forward slashes interchangeably", () => {
    expect(pathOverlapsSourceRoot("c:\\project\\src\\forms", "c:/project/src")).toBe(true);
  });
});

describe("pathOverlapsSourceRoot() — false cases", () => {
  it("returns false for a sibling project", () => {
    expect(pathOverlapsSourceRoot("c:/otherproject/forms", "c:/project/src")).toBe(false);
  });

  it("returns false for a destination that shares a prefix but is not nested", () => {
    // Lexical prefix but not nested: c:/project/src2 is a sibling, not a child.
    expect(pathOverlapsSourceRoot("c:/project/src2", "c:/project/src")).toBe(false);
  });

  it("returns false for an unrelated absolute path", () => {
    expect(pathOverlapsSourceRoot("d:/elsewhere/forms", "c:/project/src")).toBe(false);
  });

  it("returns false when the destination is empty", () => {
    expect(pathOverlapsSourceRoot("", "c:/project/src")).toBe(false);
    expect(pathOverlapsSourceRoot("   ", "c:/project/src")).toBe(false);
  });

  it("returns false when the source root is empty", () => {
    expect(pathOverlapsSourceRoot("c:/project/src", "")).toBe(false);
    expect(pathOverlapsSourceRoot("c:/project/src", "   ")).toBe(false);
  });

  it("does not mix POSIX and Windows paths (different layout)", () => {
    // POSIX-style source root + Windows-style destination are unrelated
    // even when the strings look similar. We compare lexically, so this is
    // an explicit non-overlap.
    expect(pathOverlapsSourceRoot("C:/project/src/forms", "/project/src")).toBe(false);
  });
});

describe("pathOverlapsSourceRoot() — custom managed folders", () => {
  it("ignores managed folders the caller filtered out", () => {
    // `forms` is no longer in the custom set, so destination inside forms/
    // is treated as an unrecognized nested path — still true because it's
    // nested under the source root.
    expect(
      pathOverlapsSourceRoot("C:/project/src/forms", "c:/project/src", ["modules", "scripts"]),
    ).toBe(true);
  });

  it("treats a filtered-in folder as part of the managed set", () => {
    expect(
      pathOverlapsSourceRoot("C:/project/src/scripts/main.ps1", "c:/project/src", [
        "modules",
        "scripts",
      ]),
    ).toBe(true);
  });
});
