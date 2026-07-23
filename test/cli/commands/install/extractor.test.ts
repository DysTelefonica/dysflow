/**
 * #666 — supply-chain guard: pnpm-lock.yaml must ride along with the tarball
 * and the extractor must install with `--frozen-lockfile` so the transitive
 * dependency graph matches what the release was signed against.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock node:child_process BEFORE importing the extractor so the runCommand
// call inside copyRuntime goes through the spy instead of spawning pnpm.
const execFileMock = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

import { resolveRuntimePaths } from "../../../../src/cli/commands/install/extractor";

type RuntimePaths = ReturnType<typeof resolveRuntimePaths>;

async function seedPackageRoot(packageRoot: string): Promise<void> {
  await mkdir(join(packageRoot, "dist"), { recursive: true });
  await writeFile(join(packageRoot, "dist", "index.js"), "// stub", "utf8");
  await mkdir(join(packageRoot, "scripts"), { recursive: true });
  await writeFile(join(packageRoot, "scripts", "noop.mjs"), "// stub", "utf8");
  await writeFile(
    join(packageRoot, "package.json"),
    JSON.stringify({ name: "dysflow", version: "0.0.0" }),
    "utf8",
  );
}

async function seedLockfile(packageRoot: string, body: string): Promise<void> {
  await writeFile(join(packageRoot, "pnpm-lock.yaml"), body, "utf8");
}

let root: string;
let runtimeDir: string;
let runtimePaths: RuntimePaths;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "dysflow-extractor-supply-"));
  runtimeDir = join(root, "runtime");
  const packageRoot = join(root, "pkg");
  await seedPackageRoot(packageRoot);
  runtimePaths = resolveRuntimePaths(runtimeDir, packageRoot);
  execFileMock.mockReset();
  execFileMock.mockImplementation(
    (_file: unknown, _args: unknown, options: unknown, callback: (...args: unknown[]) => void) => {
      const cb = typeof options === "function" ? options : callback;
      if (cb) queueMicrotask(() => cb(null, { stdout: "", stderr: "" }));
    },
  );
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function importExtractor(): Promise<
  typeof import("../../../../src/cli/commands/install/extractor")
> {
  return import("../../../../src/cli/commands/install/extractor");
}

// command-runner wraps the underlying pnpm call — on Windows it may shell out
// via `pnpm.cmd` or a shell wrapper. Match by arg signature (the second tuple
// element MUST contain `--ignore-scripts` + `--prod`) instead of by exact
// command name.
function pnpmInvocations(): unknown[][] {
  return execFileMock.mock.calls.filter((call) => {
    const args = call[1] as readonly string[] | undefined;
    return Array.isArray(args) && args.includes("--ignore-scripts") && args.includes("--prod");
  });
}

describe("extractor — supply-chain guard (#666)", () => {
  it("copies pnpm-lock.yaml from packageRoot into appDir when present", async () => {
    const packageRoot = join(root, "pkg");
    const lockfile = "lockfileVersion: '9.0'\nsettings:\n  autoInstallPeers: true\n";
    await seedLockfile(packageRoot, lockfile);

    const { installRuntime } = await importExtractor();
    await installRuntime(runtimePaths, packageRoot);

    const copied = await import("node:fs/promises").then((m) =>
      m.readFile(join(runtimePaths.appDir, "pnpm-lock.yaml"), "utf8"),
    );
    expect(copied).toBe(lockfile);
  });

  it("invokes pnpm install with --frozen-lockfile when the lockfile is present", async () => {
    const packageRoot = join(root, "pkg");
    await seedLockfile(packageRoot, "lockfileVersion: '9.0'\n");

    const { installRuntime } = await importExtractor();
    await installRuntime(runtimePaths, packageRoot);

    const pnpmCalls = pnpmInvocations();
    expect(pnpmCalls).toHaveLength(1);
    const args = pnpmCalls[0]?.[1] as readonly string[] | undefined;
    expect(args).toContain("--prod");
    expect(args).toContain("--frozen-lockfile");
  });

  it("forces dependency relinking when refreshing an existing runtime", async () => {
    const packageRoot = join(root, "pkg");
    await seedLockfile(packageRoot, "lockfileVersion: '9.0'\n");

    const { installRuntime } = await importExtractor();
    await installRuntime(runtimePaths, packageRoot);

    const args = pnpmInvocations()[0]?.[1] as readonly string[] | undefined;
    expect(args).toContain("--force");
  });

  it("falls back to non-frozen install when the lockfile is missing (no crash)", async () => {
    const packageRoot = join(root, "pkg");
    // Intentionally do NOT seed pnpm-lock.yaml.

    const { installRuntime } = await importExtractor();
    await installRuntime(runtimePaths, packageRoot);

    const pnpmCalls = pnpmInvocations();
    expect(pnpmCalls).toHaveLength(1);
    const args = pnpmCalls[0]?.[1] as readonly string[] | undefined;
    expect(args).toContain("--prod");
    expect(args).not.toContain("--frozen-lockfile");
  });

  it("does NOT copy pnpm-lock.yaml into appDir when the source is absent", async () => {
    const packageRoot = join(root, "pkg");
    // No lockfile seeded.

    const { installRuntime } = await importExtractor();
    await installRuntime(runtimePaths, packageRoot);

    const exists = await import("node:fs/promises").then(async (m) => {
      try {
        await m.stat(join(runtimePaths.appDir, "pnpm-lock.yaml"));
        return true;
      } catch {
        return false;
      }
    });
    expect(exists).toBe(false);
  });
});
