import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(__dirname, "..", "..");
const SCRIPTS_ROOT = join(REPO_ROOT, "scripts");

async function discoverDysflowResultScripts(): Promise<string[]> {
  const discovered: string[] = [];

  async function visit(relativeDir: string): Promise<void> {
    const entries = await readdir(join(SCRIPTS_ROOT, relativeDir), { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = join(relativeDir, entry.name);
      if (entry.isDirectory()) {
        await visit(relativePath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".ps1")) continue;

      const repoRelativePath = join("scripts", relativePath).replace(/\\/g, "/");
      const source = await readFile(join(REPO_ROOT, repoRelativePath), "utf8");
      if (source.includes("function Write-DysflowResult")) discovered.push(repoRelativePath);
    }
  }

  await visit("");
  return discovered.sort((a, b) => a.localeCompare(b));
}

function extractWriteDysflowResultFunction(source: string): string {
  const match = source.match(/function\s+Write-DysflowResult\s*\{[\s\S]*?\n\}/);
  if (match === null) throw new Error("Write-DysflowResult function was not found");
  return match[0];
}

describe("PowerShell DYSFLOW_RESULT writer contract", () => {
  it("covers every PowerShell script that defines Write-DysflowResult", async () => {
    await expect(discoverDysflowResultScripts()).resolves.toEqual([
      "scripts/dysflow-access-runner.ps1",
      "scripts/dysflow-vba-manager.ps1",
    ]);
  });

  it("writes protocol output directly to process stdout in every result-writer script", async () => {
    const resultScripts = await discoverDysflowResultScripts();

    for (const relativePath of resultScripts) {
      const source = await readFile(join(REPO_ROOT, relativePath), "utf8");
      const writer = extractWriteDysflowResultFunction(source);

      expect(writer, `${relativePath} writer must bypass PowerShell pipeline capture`).toContain(
        "[Console]::Out.WriteLine",
      );
      expect(writer, `${relativePath} writer must not use pipeline output`).not.toContain(
        "Write-Output",
      );
      expect(source, `${relativePath} must not emit sentinel through Write-Output`).not.toContain(
        'Write-Output ("DYSFLOW_RESULT',
      );
      expect(source, `${relativePath} must not emit sentinel through Write-Output`).not.toContain(
        "Write-Output ('DYSFLOW_RESULT",
      );
    }
  });
});
