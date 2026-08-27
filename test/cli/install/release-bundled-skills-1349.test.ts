import { execFile } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertReleaseArchiveManifest,
  createReleaseArchive,
  RELEASE_SKILL_NAMES,
  tarForceLocalArgs,
} from "../../../.github/scripts/create-release-archive.mjs";
import { DYSSKILL_NAMES } from "../../../src/cli/commands/install/skills-installer.js";

const execFileAsync = promisify(execFile);
const roots: string[] = [];
const repoRoot = process.cwd();
let root: string;
let archivePath: string;

async function listFiles(root: string, relativeRoot = ""): Promise<string[]> {
  const directory = path.join(root, ...relativeRoot.split("/").filter(Boolean));
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relativePath = relativeRoot ? `${relativeRoot}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...(await listFiles(root, relativePath)));
    else if (entry.isFile()) files.push(relativePath);
  }
  return files.sort();
}

// Every path this suite hands to tar is absolute, so on Windows it must carry
// the same GNU tar guard the release helper uses (#1377).
async function tar(args: string[], cwd = repoRoot): Promise<string> {
  const result = await execFileAsync("tar", [...tarForceLocalArgs(cwd), ...args], {
    cwd,
    maxBuffer: 10 * 1024 * 1024,
  });
  return result.stdout;
}

beforeAll(async () => {
  await access(path.join(repoRoot, "dist", "cli", "index.js"));
  root = await mkdtemp(path.join(tmpdir(), "dysflow-release-skills-1349-"));
  roots.push(root);
  archivePath = path.join(root, "dysflow-test.tar.gz");
  await createReleaseArchive({ packageRoot: repoRoot, outputPath: archivePath });
}, 120_000);

afterAll(async () => {
  await Promise.all(
    roots.splice(0).map((candidate) => rm(candidate, { recursive: true, force: true })),
  );
});

describe("release bundled skills (#1349)", () => {
  it("keeps the release script and runtime installer on the same skill manifest", () => {
    expect([...RELEASE_SKILL_NAMES].sort()).toEqual([...DYSSKILL_NAMES].sort());
  });

  it("includes every canonical SKILL.md in the real produced tar archive", async () => {
    const listing = await tar(["-tzf", archivePath]);
    expect(() => assertReleaseArchiveManifest(listing)).not.toThrow();
    expect(listing.replaceAll("\\", "/")).toContain(
      "scripts/lib/dysflow-vba-import-transport.psm1",
    );
    expect(listing.replaceAll("\\", "/")).toContain("dist/cli/vba-import-orchestration.js");
    for (const name of DYSSKILL_NAMES) {
      expect(listing.replaceAll("\\", "/")).toContain(`skills/${name}/SKILL.md`);
    }
    for (const nestedPath of [
      "skills/dysflow-codegraph-update/assets/scripts/Invoke-DysflowJsonRpc.ps1",
      "skills/dysflow-codegraph-update/assets/scripts/Invoke-DysflowSemanticAudit.ps1",
      "skills/dysflow-codegraph-update/references/procedure.md",
      "skills/dysflow-usage/assets/examples/bootstrap.md",
      "skills/dysflow-usage/assets/scripts/verify-examples-vs-runtime.ps1",
    ]) {
      expect(listing.replaceAll("\\", "/")).toContain(nestedPath);
    }
  });

  it("rejects a real tar manifest missing any canonical skill", async () => {
    const fixture = path.join(root, "missing-skill-package");
    const missingArchive = path.join(root, "missing-skill.tar.gz");
    for (const name of DYSSKILL_NAMES.filter((name) => name !== "dysflow-arnes")) {
      const directory = path.join(fixture, "skills", name);
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, "SKILL.md"), `${name}\n`, "utf8");
    }
    await tar(["-czf", missingArchive, "skills"], fixture);
    const listing = await tar(["-tzf", missingArchive]);

    expect(() => assertReleaseArchiveManifest(listing)).toThrow(
      "Release archive is missing required skill: skills/dysflow-arnes/SKILL.md",
    );
  });

  it("installs the real archive byte-exactly and the installed built CLI passes doctor --skills", async () => {
    const extractedRoot = path.join(root, "extracted");
    const runtimeDir = path.join(root, "runtime");
    const home = path.join(root, "home");
    const marker = path.join(root, "runtime.marker");
    await mkdir(extractedRoot, { recursive: true });
    // Extract from the destination itself rather than passing it as a second
    // absolute path: under --force-local GNU tar escapes the drive colon in a
    // `-C` argument too, which turns the directory into an unopenable literal.
    await tar(["-xzf", archivePath], extractedRoot);
    // Release archives intentionally exclude node_modules; the updater restores
    // the frozen dependency graph before launching the extracted CLI. Reuse the
    // test checkout's already-frozen install so this boundary test stays offline.
    await symlink(
      path.join(repoRoot, "node_modules"),
      path.join(extractedRoot, "node_modules"),
      "junction",
    );

    const env = {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      LOCALAPPDATA: path.join(home, "AppData", "Local"),
      DYSFLOW_RUNTIME_MARKER_PATH: marker,
    };
    const releaseCli = path.join(extractedRoot, "dist", "cli", "index.js");
    const install = await execFileAsync(
      process.execPath,
      [releaseCli, "install", "--runtime-dir", runtimeDir, "--only", "codex", "--no-tui"],
      { cwd: extractedRoot, env, maxBuffer: 10 * 1024 * 1024, timeout: 180_000 },
    );
    expect(install.stderr).toBe("");

    for (const name of DYSSKILL_NAMES) {
      const sourceRoot = path.join(extractedRoot, "skills", name);
      const files = await listFiles(sourceRoot);
      expect(files).toContain("SKILL.md");
      for (const relativePath of files) {
        const segments = relativePath.split("/");
        const source = path.join(sourceRoot, ...segments);
        const runtimeCopy = path.join(runtimeDir, "app", "skills", name, ...segments);
        const adapterCopy = path.join(home, ".codex", "skills", name, ...segments);
        expect(await readFile(runtimeCopy)).toEqual(await readFile(source));
        expect(await readFile(adapterCopy)).toEqual(await readFile(source));
      }
    }

    const installedCli = path.join(runtimeDir, "app", "dist", "cli", "index.js");
    await access(
      path.join(runtimeDir, "app", "scripts", "lib", "dysflow-vba-import-transport.psm1"),
    );
    await access(path.join(runtimeDir, "app", "dist", "cli", "vba-import-orchestration.js"));
    const doctor = await execFileAsync(process.execPath, [installedCli, "doctor", "--skills"], {
      cwd: path.join(runtimeDir, "app"),
      env,
      maxBuffer: 10 * 1024 * 1024,
      timeout: 60_000,
    });
    expect(doctor.stderr).toBe("");
    expect(doctor.stdout).toContain("✓ skills-installation[codex]");
  }, 240_000);
});
