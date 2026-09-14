import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  type ComparisonFileSystemPort,
  compareVbaSourceTrees,
} from "../../../src/core/services/vba-source-comparison";

const realFs: ComparisonFileSystemPort = {
  mkdtemp: (prefix) => mkdtemp(prefix),
  readdir: (path) => readdir(path, { withFileTypes: true }),
  readFile: (path, encoding) => readFile(path, encoding),
  rm: (path, options) => rm(path, options),
  tmpdir: () => tmpdir(),
};

describe("vba-source-comparison — DUPLICATE_IDENTITY_KEY completeness reason (#1724 WU-2)", () => {
  // Refs #1724 WU-2 — the collector must surface a DUPLICATE_IDENTITY_KEY
  // warning whenever two files in the SAME tree produce the same canonical
  // identity key (`${family}\0${casefold(moduleName)}\0${representation}`).
  // The comparison still completes on degraded evidence (last-write-wins), so
  // the missing/duplicate file is reachable through `warnings[]` rather than
  // being silently dropped or throwing the call.
  it("emits a DUPLICATE_IDENTITY_KEY warning when two files share the same canonical identity key", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-dup-identity-key-"));
    const sourceRoot = join(root, "src");
    const binaryRoot = join(root, "bin");
    await mkdir(sourceRoot, { recursive: true });
    await mkdir(binaryRoot, { recursive: true });

    // MyForm.cls (class family) and MyForm.frm (class family) BOTH carry
    // `Attribute VB_Name = "MyForm"`. With the new canonical keying, they
    // collide on `class\0myform\0code` — exactly the duplicate the snapshot
    // module warns about. The collector must emit one
    // DUPLICATE_IDENTITY_KEY warning per colliding entry.
    await writeFile(
      join(sourceRoot, "MyForm.cls"),
      'VERSION 1.0 CLASS\nAttribute VB_Name = "MyForm"\nSub Foo()\nEnd Sub',
      "utf8",
    );
    await writeFile(
      join(sourceRoot, "MyForm.frm"),
      'VERSION 5.00\nAttribute VB_Name = "MyForm"\nBegin\nEnd',
      "utf8",
    );

    const comparison = await compareVbaSourceTrees(sourceRoot, binaryRoot, [], false, realFs);

    expect(comparison.warnings).toBeDefined();
    const dupWarnings = (comparison.warnings ?? []).filter(
      (warning) => warning.error === "DUPLICATE_IDENTITY_KEY",
    );
    expect(dupWarnings).toHaveLength(1);
    expect(dupWarnings[0]?.module).toBe("__collector__");
    expect(dupWarnings[0]?.message).toContain("class\0myform\0code");
  });
});
