/**
 * Issue #1866 item 3 — `import_modules` with `apply:false` must say what would
 * change per module, with the same classification verify_code uses, so an
 * import over a binary-newer module is visible before `apply:true`.
 */

import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { VbaSyncAdapter } from "../../../src/adapters/vba-sync/vba-sync-adapter";
import { noopPreflightCleanup } from "../../_helpers/noop-preflight-cleanup.js";

const SOURCE = "Public Sub Calcular()\n    x = 2\nEnd Sub\n";
const SOURCE_WITH_EXTRA_LINE = "Public Sub Calcular()\n    x = 2\n    ' nota en fuente\nEnd Sub\n";
const BINARY_WITH_EXTRA_LINE = "Public Sub Calcular()\n    x = 2\n    ' nota en binario\nEnd Sub\n";

async function setup(sourceText: string, binaryText: string) {
  const root = await mkdtemp(join(tmpdir(), "dysflow-1866-import-plan-"));
  const sourceRoot = join(root, "src");
  await mkdir(join(sourceRoot, "modules"), { recursive: true });
  await writeFile(join(sourceRoot, "modules", "Calculo.bas"), sourceText, "utf8");
  const service = new VbaSyncAdapter({
    preflightCleanup: noopPreflightCleanup(),
    executor: async (request) => {
      await mkdir(join(request.destinationRoot, "modules"), { recursive: true });
      await writeFile(join(request.destinationRoot, "modules", "Calculo.bas"), binaryText, "utf8");
      return { exitCode: 0, stdout: "", stderr: "", durationMs: 2, timedOut: false };
    },
    scriptPath: "scripts/dysflow-vba-manager.ps1",
    accessPath: "C:/db/front.accdb",
    destinationRoot: sourceRoot,
    env: {},
  });
  return { service };
}

describe("import_modules preview classifies each module (#1866 item 3)", () => {
  it("reports sourceNewer when the source has a functional change the binary lacks", async () => {
    const { service } = await setup(SOURCE_WITH_EXTRA_LINE, SOURCE);

    const result = await service.execute("import_modules", {
      dryRun: true,
      moduleNames: ["Calculo"],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected plan success");
    const plan = result.data as {
      moduleClassifications?: { module: string; classification: string }[];
      warnings: string[];
    };
    expect(plan.moduleClassifications).toEqual([
      expect.objectContaining({ module: "Calculo", classification: "sourceNewer" }),
    ]);
  });

  it("warns when the binary is newer, so an import would overwrite binary changes", async () => {
    const { service } = await setup(SOURCE, BINARY_WITH_EXTRA_LINE);

    const result = await service.execute("import_modules", {
      dryRun: true,
      moduleNames: ["Calculo"],
    });

    if (!result.ok) throw new Error("expected plan success");
    const plan = result.data as {
      moduleClassifications?: { module: string; classification: string }[];
      warnings: string[];
    };
    expect(plan.moduleClassifications).toEqual([
      expect.objectContaining({ module: "Calculo", classification: "binaryNewer" }),
    ]);
    expect(plan.warnings.some((w) => w.includes("Calculo") && w.includes("binary"))).toBe(true);
  });
});
