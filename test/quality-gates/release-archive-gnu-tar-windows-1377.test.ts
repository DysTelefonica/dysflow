import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const spawnSync = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({ spawnSync }));

import {
  createReleaseArchive,
  RELEASE_SKILL_NAMES,
} from "../../.github/scripts/create-release-archive.mjs";

const roots: string[] = [];

async function createPackageFixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "dysflow-release-1377-"));
  roots.push(root);
  for (const skillName of RELEASE_SKILL_NAMES) {
    const skillDirectory = path.join(root, "skills", skillName);
    await mkdir(skillDirectory, { recursive: true });
    await writeFile(path.join(skillDirectory, "SKILL.md"), `${skillName}\n`, "utf8");
  }
  return root;
}

afterEach(async () => {
  spawnSync.mockReset();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("release archive GNU tar portability (#1377)", () => {
  it("creates and verifies an archive at a Windows drive-letter path with GNU tar", async () => {
    const packageRoot = await createPackageFixture();
    const outputPath = path.join(packageRoot, "release", "dysflow.tar.gz");
    const listing = RELEASE_SKILL_NAMES.map((name) => `skills/${name}/SKILL.md`).join("\n");

    spawnSync.mockImplementation((_command, args: string[]) => {
      if (args.includes("--version")) {
        return { status: 0, stderr: "", stdout: "tar (GNU tar) 1.35" };
      }
      if (!args.includes("--force-local")) {
        return {
          status: 2,
          stderr: "tar (child): Cannot connect to C: resolve failed",
          stdout: "",
        };
      }
      return { status: 0, stderr: "", stdout: args.includes("-tzf") ? listing : "" };
    });

    await expect(createReleaseArchive({ packageRoot, outputPath })).resolves.toBeUndefined();
  });

  it("keeps archive creation compatible with bsdtar", async () => {
    const packageRoot = await createPackageFixture();
    const outputPath = path.join(packageRoot, "release", "dysflow.tar.gz");
    const listing = RELEASE_SKILL_NAMES.map((name) => `skills/${name}/SKILL.md`).join("\n");

    spawnSync.mockImplementation((_command, args: string[]) => {
      if (args.includes("--version")) {
        return { status: 0, stderr: "", stdout: "bsdtar 3.8.4 - libarchive 3.8.4" };
      }
      if (args.includes("--force-local")) {
        return { status: 1, stderr: "Option --force-local is not supported", stdout: "" };
      }
      return { status: 0, stderr: "", stdout: args.includes("-tzf") ? listing : "" };
    });

    await expect(createReleaseArchive({ packageRoot, outputPath })).resolves.toBeUndefined();
  });
});
