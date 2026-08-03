import { exec } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  createReleaseArchive,
  RELEASE_ARCHIVE_ENTRIES,
} from "../../.github/scripts/create-release-archive.mjs";

const execAsync = promisify(exec);

describe("release diagnostics bundle", () => {
  it("ships both canonical diagnostic references in the release tarball", async () => {
    const root = await mkdtemp(join(process.cwd(), ".dysflow-release-"));
    const archive = join(root, "release.tar.gz");
    try {
      expect(RELEASE_ARCHIVE_ENTRIES).toEqual(
        expect.arrayContaining([
          "plugin",
          "references/error-codes.md",
          "docs/diagnostics/hresult-guide.md",
          "docs/diagnostics/form-import-gate-failures.md",
        ]),
      );

      if (process.platform === "win32") return;

      await createReleaseArchive({ packageRoot: process.cwd(), outputPath: archive });
      const archivePath = relative(process.cwd(), archive).replaceAll("\\", "/");
      const { stdout } = await execAsync(`tar -tzf "${archivePath}"`);
      expect(stdout).toContain("references/error-codes.md");
      expect(stdout).toContain("docs/diagnostics/hresult-guide.md");
      expect(stdout).toContain("docs/diagnostics/form-import-gate-failures.md");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
