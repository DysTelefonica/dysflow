import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const SCRIPT = ".github/scripts/set-release-package-version.mjs";

describe("release package version", () => {
  it("stamps the release tag version into the package bundled by the workflow", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-release-version-"));
    const packagePath = join(root, "package.json");
    try {
      await writeFile(packagePath, '{"name":"dysflow","version":"0.0.0"}\n');

      await execFileAsync(process.execPath, [SCRIPT, "v9.8.7", packagePath]);

      const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as {
        version: string;
      };
      expect(packageJson.version).toBe("9.8.7");

      const workflow = await readFile(".github/workflows/release.yml", "utf8");
      const releasePrepare = await readFile("scripts/release-prepare.ps1", "utf8");
      const stampIndex = workflow.indexOf("set-release-package-version.mjs");
      const buildIndex = workflow.indexOf("- name: Build\n");
      expect(stampIndex).toBeGreaterThan(-1);
      expect(stampIndex).toBeLessThan(buildIndex);

      const rootManifest = JSON.parse(await readFile("package.json", "utf8")) as {
        version: string;
      };
      const piManifest = JSON.parse(await readFile("plugin/pi/package.json", "utf8")) as {
        name: string;
        version: string;
      };
      expect(piManifest).toMatchObject({
        name: "@aroman22/dysflow-pi",
        version: rootManifest.version,
      });
      expect(releasePrepare).toContain('"plugin/pi/package.json"');
      expect(releasePrepare).toContain("WriteAllBytes($piPackagePath, $piPackageBefore)");
      expect(workflow).toContain("registry-url: https://registry.npmjs.org");
      expect(workflow).toContain("secrets.NPM_TOKEN");
      // #1754 — npm is optional: no hard gate on the secret.
      expect(workflow).not.toContain("Require NPM_TOKEN");
      expect(workflow).not.toContain("id-token: write");
      expect(workflow).not.toContain("Verify npm trusted-publishing client");
      expect(workflow).toContain("working-directory: plugin/pi");
      expect(workflow).toContain("npm pack --dry-run --json");
      expect(workflow).toContain("id: pi-package");
      expect(workflow).toContain('npm pack --json --pack-destination "$RUNNER_TEMP"');
      expect(workflow).toContain('npm view "${PACKAGE}" dist.integrity');
      expect(workflow).toContain('npm publish "${{ steps.pi-package.outputs.tarball }}"');
      expect(workflow).toContain('test "${PUBLISHED_INTEGRITY}" = "${EXPECTED_INTEGRITY}"');
      expect(workflow).toContain('npm view "${PACKAGE}" version');
      const packIndex = workflow.indexOf("- name: Pack exact Pi package artifact");
      const publishIndex = workflow.indexOf("- name: Publish Pi package to npmjs");
      const verifyIndex = workflow.indexOf("- name: Verify Pi package publication");
      const releaseIndex = workflow.indexOf("- name: Create GitHub Release");
      expect(packIndex).toBeGreaterThan(stampIndex);
      expect(publishIndex).toBeGreaterThan(packIndex);
      expect(verifyIndex).toBeGreaterThan(publishIndex);
      // #1754 — the GitHub Release never waits on npm: every npm step runs
      // after it, only with the secret, and cannot fail the job.
      expect(packIndex).toBeGreaterThan(releaseIndex);
      for (const step of [
        "Verify Pi package contents without publishing",
        "Pack exact Pi package artifact",
        "Publish Pi package to npmjs",
        "Verify Pi package publication",
      ]) {
        const index = workflow.indexOf(`- name: ${step}\n`);
        expect(index).toBeGreaterThan(releaseIndex);
        expect(workflow.slice(index).split("\n").slice(1, 3)).toEqual([
          "        if: env.HAS_NPM_TOKEN == 'true'",
          "        continue-on-error: true",
        ]);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
