import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tarForceLocalArgs } from "../../.github/scripts/create-release-archive.mjs";
import { createGitHubReleaseUpdateProvider } from "../../src/cli/commands/install/downloader.js";

// This suite deliberately shells out to the REAL tar on PATH. #1377 shipped
// half-fixed precisely because its regression test mocked node:child_process:
// that proves the helper passes --force-local, but cannot prove a second caller
// is guarded. The update path is the only update mechanism dysflow has, so it
// gets coverage against the actual binary.

const execFileAsync = promisify(execFile);
const roots: string[] = [];
const cleanups: Array<(() => Promise<void>) | undefined> = [];

async function makeReleaseArchive(): Promise<{ archive: Buffer; entryPath: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "dysflow-1390-fixture-"));
  roots.push(root);
  const payloadRoot = path.join(root, "payload");
  await mkdir(path.join(payloadRoot, "dist", "cli"), { recursive: true });
  await writeFile(path.join(payloadRoot, "dist", "cli", "index.js"), "// release\n", "utf8");

  const archivePath = path.join(root, "dysflow-v9.9.9.tar.gz");
  await execFileAsync("tar", [...tarForceLocalArgs(payloadRoot), "-czf", archivePath, "dist"], {
    cwd: payloadRoot,
  });
  return { archive: await readFile(archivePath), entryPath: path.join("dist", "cli", "index.js") };
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup?.()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("installer GNU tar portability (#1390)", () => {
  it("extracts a release archive from an absolute path with whatever tar is on PATH", async () => {
    const { archive, entryPath } = await makeReleaseArchive();

    vi.stubGlobal("fetch", async (url: string) => {
      if (url.endsWith("dysflow-v9.9.9.tar.gz")) {
        return new Response(new Uint8Array(archive), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const provider = createGitHubReleaseUpdateProvider({ signingPublicKeyPem: "" });
    const prepared = await provider.preparePackage(
      { tagName: "v9.9.9", version: "9.9.9" },
      { skipChecksum: true },
    );
    cleanups.push(prepared.cleanup);

    // The observable outcome: the archive landed, decompressed, under packageRoot.
    // packageRoot is an absolute drive-letter path on Windows, which is exactly
    // what GNU tar misreads as remote `host:path` syntax without the guard.
    expect(path.isAbsolute(prepared.packageRoot)).toBe(true);
    await expect(readFile(path.join(prepared.packageRoot, entryPath), "utf8")).resolves.toBe(
      "// release\n",
    );
  });

  it("keeps the traversal guard ahead of extraction", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "dysflow-1390-unsafe-"));
    roots.push(root);
    const payloadRoot = path.join(root, "payload");
    await mkdir(payloadRoot, { recursive: true });
    await writeFile(path.join(payloadRoot, "escape.js"), "// nope\n", "utf8");

    // `-P` keeps the traversal segment in the manifest instead of stripping it.
    const archivePath = path.join(root, "dysflow-v9.9.9.tar.gz");
    await execFileAsync(
      "tar",
      [...tarForceLocalArgs(payloadRoot), "-czf", archivePath, "-P", "../payload/escape.js"],
      { cwd: payloadRoot },
    );
    const archive = await readFile(archivePath);

    vi.stubGlobal("fetch", async () => new Response(new Uint8Array(archive), { status: 200 }));

    const provider = createGitHubReleaseUpdateProvider({ signingPublicKeyPem: "" });
    await expect(
      provider.preparePackage({ tagName: "v9.9.9", version: "9.9.9" }, { skipChecksum: true }),
    ).rejects.toThrow(/Refusing to extract release archive/);
  });
});
