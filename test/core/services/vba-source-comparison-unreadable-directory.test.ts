import { describe, expect, it } from "vitest";

import {
  type ComparisonFileSystemPort,
  collectVbaSourceFiles,
} from "../../../src/core/services/vba-source-comparison";

describe("vba-source-comparison — SOURCE_DIRECTORY_UNREADABLE propagation (#1724 WU-2)", () => {
  // Refs #1724 WU-2 — the collector must NOT swallow non-ENOENT readdir
  // failures. ENOENT is a normal "directory does not exist yet" state and
  // remains treated as an empty result; every other error code (EACCES,
  // EPERM, EBUSY, EMFILE, …) is an operator-visible defect and must surface
  // as a typed DysflowError with code `SOURCE_DIRECTORY_UNREADABLE`. The
  // caller (compareVbaSourceTrees / compareSourceAgainstBinary) routes that
  // error up the call chain rather than completing a comparison on
  // silently-incomplete evidence.
  it("throws SOURCE_DIRECTORY_UNREADABLE when readdir fails with a non-ENOENT error", async () => {
    const eaccessFs: ComparisonFileSystemPort = {
      mkdtemp: async () => "",
      readdir: async () => {
        const err = new Error("Permission denied") as Error & { code?: string };
        err.code = "EACCES";
        throw err;
      },
      readFile: async () => "",
      rm: async () => {},
      tmpdir: () => "",
    };

    // A non-empty moduleFilter is part of the test surface per the parent
    // contract: when the user has narrowed the compare to a focused set,
    // hitting an unreadable directory must NOT silently fall back to a
    // whole-project compare — the typed error preserves the user's intent.
    const moduleFilter = new Set(["someModule"]);

    await expect(
      collectVbaSourceFiles("/restricted/source/root", moduleFilter, eaccessFs),
    ).rejects.toMatchObject({
      code: "SOURCE_DIRECTORY_UNREADABLE",
      retryable: false,
    });
  });
});
