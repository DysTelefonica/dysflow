import { exec } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execAsync = promisify(exec);

describe("release diagnostics bundle", () => {
  it("ships both canonical diagnostic references in the release tarball", async () => {
    const root = await mkdtemp(join(process.cwd(), ".dysflow-release-"));
    const archive = join(root, "release.tar.gz");
    try {
      const workflow = await readFile(".github/workflows/release.yml", "utf8");
      const archiveCommand = workflow.match(
        /tar -czf dysflow-\$\{\{ github\.ref_name \}\}\.tar\.gz ([^\r\n]+)/,
      );
      expect(archiveCommand?.[1]).toBeDefined();
      const bundledPaths = archiveCommand?.[1]?.trim().split(/\s+/) ?? [];
      expect(bundledPaths).toEqual(
        expect.arrayContaining([
          "references/error-codes.md",
          "docs/diagnostics/hresult-guide.md",
          "docs/diagnostics/form-import-gate-failures.md",
        ]),
      );

      if (process.platform === "win32") return;

      const archivePath = relative(process.cwd(), archive).replaceAll("\\", "/");
      await execAsync(`tar -czf "${archivePath}" ${bundledPaths.join(" ")}`);
      const { stdout } = await execAsync(`tar -tzf "${archivePath}"`);
      expect(stdout).toContain("references/error-codes.md");
      expect(stdout).toContain("docs/diagnostics/hresult-guide.md");
      expect(stdout).toContain("docs/diagnostics/form-import-gate-failures.md");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
