/**
 * Issue #1866 item 4 — the diff snippet must show the first line that counts as
 * a functional difference, not the first raw line that differs by case only.
 */

import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  type ComparisonFileSystemPort,
  compareVbaSourceTrees,
} from "../../../src/core/services/vba-source-comparison";

const fileSystem: ComparisonFileSystemPort = {
  mkdtemp: (prefix) => mkdtemp(prefix),
  readdir: (path) => readdir(path, { withFileTypes: true }),
  readFile: (path, encoding) => readFile(path, encoding),
  rm: (path, options) => rm(path, options),
  tmpdir: () => tmpdir(),
};

describe("verify_code snippet shows the functional line (#1866 item 4)", () => {
  let root: string | undefined;
  afterEach(async () => {
    if (root !== undefined) await rm(root, { recursive: true, force: true });
    root = undefined;
  });

  it("source snippet is the added functional line, not the case-only line", async () => {
    root = await mkdtemp(join(tmpdir(), "dysflow-snippet-1866-"));
    const src = join(root, "src");
    const bin = join(root, "bin");
    await mkdir(src, { recursive: true });
    await mkdir(bin, { recursive: true });
    await writeFile(
      join(src, "Mod.bas"),
      "Public Sub Calcular()\n    riesgo = 2\n    ' nota nueva\nEnd Sub\n",
      "utf8",
    );
    await writeFile(
      join(bin, "Mod.bas"),
      "Public Sub Calcular()\n    Riesgo = 2\nEnd Sub\n",
      "utf8",
    );

    const comparison = await compareVbaSourceTrees(src, bin, [], true, fileSystem);

    const snippet = comparison.diffs?.[0]?.sourceSnippet ?? "";
    expect(snippet).toContain("nota nueva");
    expect(snippet).not.toContain("riesgo");
  });
});
