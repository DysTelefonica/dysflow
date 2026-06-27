/**
 * DELTA-012 doc-fix (mcp-reliability-fix) — SizeLimitTransform JSDoc must NOT
 * claim "Processing continues after an oversized line — the transform does
 * NOT close" because emitSizeError() in stdio-size-guard.ts:121 calls
 * this.destroy(). This test pins the JSDoc by reading the source file and
 * asserting the offending phrase is absent and a destroy/close clause is
 * present.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SIZE_GUARD_PATH = resolve(REPO_ROOT, "src", "adapters", "mcp", "stdio-size-guard.ts");

describe("DELTA-012 — SizeLimitTransform JSDoc reflects destroy() on size violation", () => {
  it("JSDoc no longer claims 'Processing continues after an oversized line — the transform does NOT close'", async () => {
    const source = await readFile(SIZE_GUARD_PATH, "utf8");

    // Extract the class JSDoc — the comment block immediately preceding
    // `export class SizeLimitTransform`.
    const jsdocMatch = source.match(/\/\*\*\s*([\s\S]*?)\s*\*\/\s*\nexport class SizeLimitTransform/);
    expect(jsdocMatch, "SizeLimitTransform class JSDoc must exist").not.toBeNull();
    const jsdoc = jsdocMatch?.[1] ?? "";

    expect(jsdoc).not.toContain("Processing continues after an oversized line");
    expect(jsdoc).not.toContain("does NOT close");
  });

  it("JSDoc describes the destroy/close behavior on size violation", async () => {
    const source = await readFile(SIZE_GUARD_PATH, "utf8");
    const jsdocMatch = source.match(/\/\*\*\s*([\s\S]*?)\s*\*\/\s*\nexport class SizeLimitTransform/);
    const jsdoc = jsdocMatch?.[1] ?? "";

    // The JSDoc must describe that the transform is destroyed when a line
    // exceeds maxBytes — coherent with emitSizeError() calling this.destroy().
    expect(jsdoc.toLowerCase()).toMatch(/destroy|close/);
  });
});