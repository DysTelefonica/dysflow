import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("release diagnostics bundle", () => {
  it("ships both canonical diagnostic references in the release tarball", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-release-"));
    const archive = join(root, "release.tar.gz");
    try {
      const workflow = await readFile(".github/workflows/release.yml", "utf8");
      const archiveCommand = workflow.match(
        /tar -czf dysflow-\$\{\{ github\.ref_name \}\}\.tar\.gz ([^\r\n]+)/,
      );
      expect(archiveCommand?.[1]).toBeDefined();
      const bundledPaths = archiveCommand?.[1]?.trim().split(/\s+/) ?? [];

      await execFileAsync("tar", ["-czf", archive, ...bundledPaths]);
      const { stdout } = await execFileAsync("tar", ["-tzf", archive]);
      expect(stdout).toContain("references/error-codes.md");
      expect(stdout).toContain("docs/diagnostics/hresult-guide.md");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
