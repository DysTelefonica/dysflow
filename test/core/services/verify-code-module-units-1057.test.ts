/**
 * Issue #1057 (Round-15 F3) — verify_code / list_vba_modules count units.
 *
 * Round-14 post-mortem: the consumer reported "source↔binary parity
 * reconciled" from `list_vba_modules.summary` counts (all 0) while
 * `verify_code.summary` held 118 modules of content drift — the two
 * surfaces use the same bare labels for counts measured in different
 * units. Fix is ADDITIVE:
 *
 *   - verify_code gains `moduleCounts` (explicit *Modules names) and
 *     `summaryUnits` (per category: { modulesCount, linesCount }).
 *   - list_vba_modules.summary gains `totalModules` /
 *     `modulesInBinaryOnly` / `modulesInSourceOnly` / `modulesInBoth`
 *     aliases so the unit is in the field name.
 *
 * Pre-existing fields keep their exact values (backward compat).
 */

import { resolve as pathResolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type ComparisonFileSystemPort,
  compareVbaSourceTrees,
} from "../../../src/core/services/vba-source-comparison";

function makeSemanticFs(files: Record<string, string>): ComparisonFileSystemPort {
  const resolvedFiles = new Map<string, string>();
  const dirIndex = new Map<string, string[]>();
  for (const [relPath, content] of Object.entries(files)) {
    const parts = relPath.replace(/\\/g, "/").split("/");
    const name = parts[parts.length - 1] ?? relPath;
    const dirParts = parts.slice(0, -1);
    const resolvedDir = dirParts.length > 0 ? pathResolve(dirParts.join("/")) : pathResolve(".");
    resolvedFiles.set(pathResolve(relPath), content);
    const list = dirIndex.get(resolvedDir) ?? [];
    list.push(name ?? "");
    dirIndex.set(resolvedDir, list);
  }
  return {
    mkdtemp: async () => "temp",
    readdir: async (path: string) => {
      const names = dirIndex.get(pathResolve(path)) ?? [];
      return names.map((entryName) => ({
        name: entryName,
        isDirectory: () => false,
        isFile: () => true,
      }));
    },
    readFile: async (path: string) => resolvedFiles.get(pathResolve(path)) ?? "",
    rm: async () => {},
    tmpdir: () => "tmp",
  };
}

describe("verify_code — explicit module-count units (#1057 F3)", () => {
  async function run() {
    const files: Record<string, string> = {
      // 2 sourceNewer
      "src/A.bas": "Sub A()\n  Dim x As Long\n  x = 1\nEnd Sub",
      "bin/A.bas": "Sub A()\n  Dim x As Long\nEnd Sub",
      "src/B.bas": "Sub B()\n  Dim y As Long\n  y = 2\n  y = 3\nEnd Sub",
      "bin/B.bas": "Sub B()\n  Dim y As Long\nEnd Sub",
      // 1 matched
      "src/M.bas": "Sub M()\nEnd Sub",
      "bin/M.bas": "Sub M()\nEnd Sub",
      // 1 missingInBinary
      "src/OnlySrc.bas": "Sub O()\nEnd Sub",
    };
    return compareVbaSourceTrees("src", "bin", [], false, makeSemanticFs(files));
  }

  it("exposes moduleCounts with explicit *Modules field names", async () => {
    const result = (await run()) as Record<string, unknown>;
    const counts = result.moduleCounts as Record<string, number> | undefined;
    expect(counts).toBeDefined();
    expect(counts?.matchedModules).toBe(1);
    expect(counts?.sourceNewerModules).toBe(2);
    expect(counts?.missingInBinaryModules).toBe(1);
    expect(counts?.missingInSourceModules).toBe(0);
    expect(counts?.bothChangedModules).toBe(0);
  });

  it("exposes summaryUnits separating modulesCount from linesCount per category", async () => {
    const result = (await run()) as Record<string, unknown>;
    const units = result.summaryUnits as
      | Record<string, { modulesCount: number; linesCount: number }>
      | undefined;
    expect(units).toBeDefined();
    expect(units?.sourceNewer?.modulesCount).toBe(2);
    // A has 1 unique functional line, B has 2 → 3 lines total.
    expect(units?.sourceNewer?.linesCount).toBe(3);
  });

  it("actionableOk agrees with the module-count surface", async () => {
    const result = (await run()) as Record<string, unknown>;
    const counts = result.moduleCounts as Record<string, number>;
    const actionableModules =
      counts.sourceNewerModules +
      counts.binaryNewerModules +
      counts.bothChangedModules +
      counts.missingInSourceModules +
      counts.missingInBinaryModules;
    expect(result.actionableOk).toBe(actionableModules === 0);
  });

  it("keeps the flat summary and summaryStructured untouched (backward compat)", async () => {
    const result = (await run()) as Record<string, unknown>;
    const summary = result.summary as Record<string, number>;
    expect(summary.sourceNewer).toBe(2);
    const structured = result.summaryStructured as { actionable: { sourceNewer: number } };
    expect(structured.actionable.sourceNewer).toBe(2);
  });
});
