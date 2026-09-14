import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  type ComparisonFileSystemPort,
  collectVbaSourceFiles,
} from "../../../src/core/services/vba-source-comparison";

const realFs: ComparisonFileSystemPort = {
  mkdtemp: (prefix) => mkdtemp(prefix),
  readdir: (path) => readdir(path, { withFileTypes: true }),
  readFile: (path, encoding) => readFile(path, encoding),
  rm: (path, options) => rm(path, options),
  tmpdir: () => tmpdir(),
};

describe("vba-source-comparison — VB_Name wins over filename (#1724 WU-2)", () => {
  // Refs #1724 WU-2 — the canonical module name comes from the
  // `Attribute VB_Name = "…"` header that Access emits on export, NOT from
  // the on-disk filename. The filename is a fallback when the attribute is
  // absent or unparseable (e.g. ad-hoc test fixtures), but whenever both
  // are present the VB_Name wins so the canonical key stays stable across
  // renames that Access has already accepted.
  it("returns the Attribute VB_Name value when it differs from the filename", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-vbname-conflict-"));
    const sourceRoot = join(root, "src");
    await mkdir(sourceRoot, { recursive: true });

    // Filename says "DifferentName" but the in-file `Attribute VB_Name`
    // declares the module as "RealName". The collector must prefer the
    // in-file declaration so the identity key matches what Access sees.
    await writeFile(
      join(sourceRoot, "DifferentName.bas"),
      'Attribute VB_Name = "RealName"\nSub Foo()\nEnd Sub',
      "utf8",
    );

    const files = await collectVbaSourceFiles(sourceRoot, new Set(), realFs);

    expect(files).toHaveLength(1);
    expect(files[0]?.moduleName).toBe("RealName");
    expect(files[0]?.fileType).toBe("bas");
    // The identity key is computed off the canonical (VB_Name) module name,
    // NOT the filename — `RealName` becomes `realname` after casefold.
    expect(files[0]?.identityKey).toBe("standard\0realname\0code");
  });
});
